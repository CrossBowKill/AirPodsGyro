/*
 * AirPodsL2cap.sys: KMDF Bluetooth profile driver that gives one user-mode app one L2CAP channel to AirPods.
 *
 * Binds to the BTHENUM device node Windows creates for Apple's service {74ec2172-...} on paired AirPods
 * (no inbox driver uses it), so the A2DP / hands-free audio stack is never touched. Pattern follows
 * Microsoft's Windows-driver-samples/bluetooth/bthecho client (MS-PL), reduced to what we need:
 *
 *   IOCTL_APL2_CONNECT     BRB_L2CA_OPEN_CHANNEL to PSM 0x1001, encrypted + authenticated link (fixed)
 *   ReadFile / WriteFile   the request is forwarded as one BRB_L2CA_ACL_TRANSFER
 *   IOCTL_APL2_DISCONNECT  BRB_L2CA_CLOSE_CHANNEL (also when the owning handle closes, and on removal)
 *
 * Safety rules (red-team review 2026-11-08):
 *   - One owner: the file handle that connected owns the channel. Other handles may only GET_INFO; they can
 *     neither transfer nor close it, and their CONNECT fails with STATUS_DEVICE_BUSY.
 *   - No transfer ever reaches bthport with a closed channel handle: every transfer is tracked from before
 *     it is sent until it completes; closing first stops new transfers, cancels the tracked ones and waits
 *     for them, and only then sends BRB_L2CA_CLOSE_CHANNEL.
 *   - PSM and link security are fixed in the driver; user mode cannot choose them.
 *   - A disconnect indication only affects the channel it belongs to.
 */

#include <ntddk.h>
#include <wdf.h>
#include <initguid.h>
#include <bthdef.h>
#include <bthguid.h>
#include <bthioctl.h>
#include <bthddi.h>

#include "public.h"

#define APL2_TAG 'L2PA'
#define APL2_LOG(fmt, ...) DbgPrintEx(DPFLTR_IHVDRIVER_ID, DPFLTR_INFO_LEVEL, "AirPodsL2cap: " fmt "\n", __VA_ARGS__)
#define APL2_MIN_MTU 672
#define APL2_MAX_MTU 4096
#define APL2_CHANNEL_FLAGS (CF_ROLE_EITHER | CF_LINK_AUTHENTICATED | CF_LINK_ENCRYPTED)
#define APL2_MAX_CANCEL 64
#define APL2_DRAIN_TIMEOUT_MS 5000

typedef struct _DEVICE_CONTEXT {
    WDFDEVICE Device;
    WDFIOTARGET IoTarget;
    BTH_PROFILE_DRIVER_INTERFACE Bth;
    BOOLEAN HaveBth;
    BTH_ADDR Remote;
    WDFWAITLOCK ConnectLock;        /* serialises connect / close (PASSIVE_LEVEL) */
    WDFSPINLOCK Lock;               /* protects everything below */
    L2CAP_CHANNEL_HANDLE Channel;
    LONG State;
    BOOLEAN Closing;                /* no new transfers while a close drains */
    WDFFILEOBJECT Owner;            /* handle that owns the channel, or NULL */
    WDFCOLLECTION InFlight;         /* transfers handed to bthport and not yet completed */
    KEVENT NoTransfers;             /* signalled while InFlight is empty */
    USHORT Psm;
    USHORT InMtu;
    USHORT OutMtu;
    LONG LastStatus;
    LONG Reads;
    LONG Writes;
} DEVICE_CONTEXT, *PDEVICE_CONTEXT;
WDF_DECLARE_CONTEXT_TYPE_WITH_NAME(DEVICE_CONTEXT, GetCtx)

typedef struct _REQUEST_CONTEXT {
    struct _BRB_L2CA_ACL_TRANSFER Brb;
} REQUEST_CONTEXT, *PREQUEST_CONTEXT;
WDF_DECLARE_CONTEXT_TYPE_WITH_NAME(REQUEST_CONTEXT, GetReqCtx)

DRIVER_INITIALIZE DriverEntry;
EVT_WDF_DRIVER_DEVICE_ADD Apl2EvtDeviceAdd;
EVT_WDF_DEVICE_SELF_MANAGED_IO_INIT Apl2EvtSelfManagedIoInit;
EVT_WDF_DEVICE_SELF_MANAGED_IO_CLEANUP Apl2EvtSelfManagedIoCleanup;
EVT_WDF_FILE_CLEANUP Apl2EvtFileCleanup;
EVT_WDF_IO_QUEUE_IO_READ Apl2EvtIoRead;
EVT_WDF_IO_QUEUE_IO_WRITE Apl2EvtIoWrite;
EVT_WDF_IO_QUEUE_IO_DEVICE_CONTROL Apl2EvtIoDeviceControl;
EVT_WDF_REQUEST_COMPLETION_ROUTINE Apl2TransferComplete;

/* ------------------------------------------------------------------------------------------ helpers */

/* No WDF timeout: a timed-out OPEN could leave bthport with an open channel we never learn about. bthport
 * applies its own L2CAP timeouts; user mode can still give up and close its handle. */
static NTSTATUS
Apl2SendBrbSync(_In_ PDEVICE_CONTEXT Ctx, _In_ PBRB Brb, _In_ ULONG Size)
{
    WDF_MEMORY_DESCRIPTOR desc;
    WDF_MEMORY_DESCRIPTOR_INIT_BUFFER(&desc, Brb, Size);
    return WdfIoTargetSendInternalIoctlOthersSynchronously(
        Ctx->IoTarget, NULL, IOCTL_INTERNAL_BTH_SUBMIT_BRB, &desc, NULL, NULL, NULL, NULL);
}

static void
Apl2Indication(_In_opt_ PVOID Context, _In_ INDICATION_CODE Indication, _In_ PINDICATION_PARAMETERS Parameters)
{
    PDEVICE_CONTEXT ctx = (PDEVICE_CONTEXT)Context;
    if (ctx == NULL || Parameters == NULL || Indication != IndicationRemoteDisconnect) {
        return;
    }
    WdfSpinLockAcquire(ctx->Lock);
    /* only the channel this indication belongs to; a late one for an old channel is ignored */
    if (ctx->Channel != NULL && Parameters->ConnectionHandle == ctx->Channel &&
        ctx->State == APL2_STATE_CONNECTED) {
        ctx->State = APL2_STATE_REMOTE_DISCONNECTED;
        APL2_LOG("remote disconnect");
    }
    WdfSpinLockRelease(ctx->Lock);
}

/* Remove a finished transfer from the in-flight set. Caller does not hold Lock. */
static VOID
Apl2Untrack(_In_ PDEVICE_CONTEXT Ctx, _In_ WDFREQUEST Request)
{
    WdfSpinLockAcquire(Ctx->Lock);
    WdfCollectionRemove(Ctx->InFlight, Request);
    if (WdfCollectionGetCount(Ctx->InFlight) == 0) {
        KeSetEvent(&Ctx->NoTransfers, IO_NO_INCREMENT, FALSE);
    }
    WdfSpinLockRelease(Ctx->Lock);
}

_IRQL_requires_(PASSIVE_LEVEL)
static NTSTATUS
Apl2CloseChannel(_In_ PDEVICE_CONTEXT Ctx)
{
    L2CAP_CHANNEL_HANDLE h;
    WDFREQUEST pending[APL2_MAX_CANCEL];
    ULONG n = 0, i, count;
    LARGE_INTEGER timeout;
    struct _BRB_L2CA_CLOSE_CHANNEL *brb;
    NTSTATUS status = STATUS_SUCCESS;

    /* 1. stop new transfers and take the handle away from the I/O path */
    WdfSpinLockAcquire(Ctx->Lock);
    Ctx->Closing = TRUE;
    h = Ctx->Channel;
    Ctx->Channel = NULL;
    Ctx->State = APL2_STATE_DISCONNECTED;
    Ctx->Owner = NULL;
    count = WdfCollectionGetCount(Ctx->InFlight);
    for (i = 0; i < count && n < APL2_MAX_CANCEL; i++) {
        WDFREQUEST r = (WDFREQUEST)WdfCollectionGetItem(Ctx->InFlight, i);
        WdfObjectReference(r);          /* keeps it valid after the lock is dropped */
        pending[n++] = r;
    }
    WdfSpinLockRelease(Ctx->Lock);

    /* 2. cancel what bthport still holds and wait until every tracked transfer has completed */
    for (i = 0; i < n; i++) {
        (void)WdfRequestCancelSentRequest(pending[i]);
        WdfObjectDereference(pending[i]);
    }
    timeout.QuadPart = -10000LL * APL2_DRAIN_TIMEOUT_MS;
    if (KeWaitForSingleObject(&Ctx->NoTransfers, Executive, KernelMode, FALSE, &timeout) == STATUS_TIMEOUT) {
        APL2_LOG("close: transfers still pending after %d ms", APL2_DRAIN_TIMEOUT_MS);
    }

    /* 3. now nothing can use the handle any more: close it */
    if (h != NULL && Ctx->HaveBth) {
        brb = (struct _BRB_L2CA_CLOSE_CHANNEL *)Ctx->Bth.BthAllocateBrb(BRB_L2CA_CLOSE_CHANNEL, APL2_TAG);
        if (brb == NULL) {
            status = STATUS_INSUFFICIENT_RESOURCES;
        } else {
            brb->BtAddress = Ctx->Remote;
            brb->ChannelHandle = h;
            status = Apl2SendBrbSync(Ctx, (PBRB)brb, sizeof(*brb));
            Ctx->Bth.BthFreeBrb((PBRB)brb);
        }
        APL2_LOG("close channel: 0x%08X", status);
    }

    WdfSpinLockAcquire(Ctx->Lock);
    Ctx->Closing = FALSE;
    WdfSpinLockRelease(Ctx->Lock);
    return status;
}

_IRQL_requires_(PASSIVE_LEVEL)
static NTSTATUS
Apl2OpenChannel(_In_ PDEVICE_CONTEXT Ctx, _In_ WDFFILEOBJECT File, _In_ const APL2_CONNECT_IN *In)
{
    struct _BRB_L2CA_OPEN_CHANNEL *brb;
    NTSTATUS status;
    USHORT mtu = In->InMtu ? In->InMtu : APL2_DEFAULT_IN_MTU;
    WDFFILEOBJECT owner;

    if (!Ctx->HaveBth || Ctx->Remote == 0) {
        return STATUS_DEVICE_NOT_READY;
    }
    /* fixed channel and security: user mode cannot pick another PSM or drop encryption */
    if ((In->Psm != 0 && In->Psm != APL2_DEFAULT_PSM) || In->ChannelFlags != 0 ||
        mtu < APL2_MIN_MTU || mtu > APL2_MAX_MTU) {
        return STATUS_INVALID_PARAMETER;
    }
    WdfSpinLockAcquire(Ctx->Lock);
    owner = Ctx->Owner;
    WdfSpinLockRelease(Ctx->Lock);
    if (owner != NULL && owner != File) {
        return STATUS_DEVICE_BUSY;      /* another app is using the AirPods channel */
    }
    (void)Apl2CloseChannel(Ctx);        /* our own previous channel (e.g. after a remote disconnect) */

    brb = (struct _BRB_L2CA_OPEN_CHANNEL *)Ctx->Bth.BthAllocateBrb(BRB_L2CA_OPEN_CHANNEL, APL2_TAG);
    if (brb == NULL) {
        return STATUS_INSUFFICIENT_RESOURCES;
    }
    brb->BtAddress = Ctx->Remote;
    brb->Psm = APL2_DEFAULT_PSM;
    brb->ChannelFlags = APL2_CHANNEL_FLAGS;
    brb->ConfigOut.Flags = 0;
    brb->ConfigIn.Flags = CFG_MTU;
    brb->ConfigIn.Mtu.Min = APL2_MIN_MTU;
    brb->ConfigIn.Mtu.Preferred = mtu;
    brb->ConfigIn.Mtu.Max = mtu;
    brb->IncomingQueueDepth = 100;
    brb->ReferenceObject = (PVOID)WdfDeviceWdmGetDeviceObject(Ctx->Device);
    brb->CallbackFlags = CALLBACK_DISCONNECT;
    brb->Callback = Apl2Indication;
    brb->CallbackContext = Ctx;

    status = Apl2SendBrbSync(Ctx, (PBRB)brb, sizeof(*brb));
    Ctx->LastStatus = status;
    if (NT_SUCCESS(status)) {
        WdfSpinLockAcquire(Ctx->Lock);
        Ctx->Channel = brb->ChannelHandle;
        Ctx->State = APL2_STATE_CONNECTED;
        Ctx->Owner = File;
        Ctx->Psm = APL2_DEFAULT_PSM;
        Ctx->InMtu = brb->InResults.Params.Mtu;
        Ctx->OutMtu = brb->OutResults.Params.Mtu;
        WdfSpinLockRelease(Ctx->Lock);
    }
    APL2_LOG("open channel: 0x%08X (in %u out %u)", status, brb->InResults.Params.Mtu, brb->OutResults.Params.Mtu);
    Ctx->Bth.BthFreeBrb((PBRB)brb);
    return status;
}

/* ------------------------------------------------------------------------------------------ driver */

NTSTATUS
DriverEntry(_In_ PDRIVER_OBJECT DriverObject, _In_ PUNICODE_STRING RegistryPath)
{
    WDF_DRIVER_CONFIG config;
    WDF_DRIVER_CONFIG_INIT(&config, Apl2EvtDeviceAdd);
    return WdfDriverCreate(DriverObject, RegistryPath, WDF_NO_OBJECT_ATTRIBUTES, &config, WDF_NO_HANDLE);
}

NTSTATUS
Apl2EvtDeviceAdd(_In_ WDFDRIVER Driver, _Inout_ PWDFDEVICE_INIT DeviceInit)
{
    NTSTATUS status;
    WDFDEVICE device;
    PDEVICE_CONTEXT ctx;
    WDF_PNPPOWER_EVENT_CALLBACKS pnp;
    WDF_FILEOBJECT_CONFIG fileConfig;
    WDF_OBJECT_ATTRIBUTES attrs;
    WDF_IO_QUEUE_CONFIG qc;
    WDFQUEUE queue;

    UNREFERENCED_PARAMETER(Driver);

    WdfDeviceInitSetIoType(DeviceInit, WdfDeviceIoDirect);

    WDF_PNPPOWER_EVENT_CALLBACKS_INIT(&pnp);
    pnp.EvtDeviceSelfManagedIoInit = Apl2EvtSelfManagedIoInit;
    pnp.EvtDeviceSelfManagedIoCleanup = Apl2EvtSelfManagedIoCleanup;
    WdfDeviceInitSetPnpPowerEventCallbacks(DeviceInit, &pnp);

    WDF_FILEOBJECT_CONFIG_INIT(&fileConfig, WDF_NO_EVENT_CALLBACK, WDF_NO_EVENT_CALLBACK, Apl2EvtFileCleanup);
    WdfDeviceInitSetFileObjectConfig(DeviceInit, &fileConfig, WDF_NO_OBJECT_ATTRIBUTES);

    WDF_OBJECT_ATTRIBUTES_INIT_CONTEXT_TYPE(&attrs, REQUEST_CONTEXT);
    WdfDeviceInitSetRequestAttributes(DeviceInit, &attrs);

    WDF_OBJECT_ATTRIBUTES_INIT_CONTEXT_TYPE(&attrs, DEVICE_CONTEXT);
    status = WdfDeviceCreate(&DeviceInit, &attrs, &device);
    if (!NT_SUCCESS(status)) {
        return status;
    }
    ctx = GetCtx(device);
    RtlZeroMemory(ctx, sizeof(*ctx));
    ctx->Device = device;
    ctx->IoTarget = WdfDeviceGetIoTarget(device);
    KeInitializeEvent(&ctx->NoTransfers, NotificationEvent, TRUE);

    WDF_OBJECT_ATTRIBUTES_INIT(&attrs);
    attrs.ParentObject = device;
    status = WdfSpinLockCreate(&attrs, &ctx->Lock);
    if (!NT_SUCCESS(status)) {
        return status;
    }
    status = WdfWaitLockCreate(&attrs, &ctx->ConnectLock);
    if (!NT_SUCCESS(status)) {
        return status;
    }
    status = WdfCollectionCreate(&attrs, &ctx->InFlight);
    if (!NT_SUCCESS(status)) {
        return status;
    }

    status = WdfFdoQueryForInterface(device, &GUID_BTHDDI_PROFILE_DRIVER_INTERFACE, (PINTERFACE)&ctx->Bth,
                                     sizeof(ctx->Bth), BTHDDI_PROFILE_DRIVER_INTERFACE_VERSION_FOR_QI, NULL);
    if (!NT_SUCCESS(status)) {
        APL2_LOG("profile driver interface query failed: 0x%08X", status);
        return status;
    }
    ctx->HaveBth = TRUE;

    /* reads and writes: forwarded as they come, in parallel */
    WDF_IO_QUEUE_CONFIG_INIT_DEFAULT_QUEUE(&qc, WdfIoQueueDispatchParallel);
    qc.EvtIoRead = Apl2EvtIoRead;
    qc.EvtIoWrite = Apl2EvtIoWrite;
    status = WdfIoQueueCreate(device, &qc, WDF_NO_OBJECT_ATTRIBUTES, &queue);
    if (!NT_SUCCESS(status)) {
        return status;
    }

    /* control requests: one at a time, at PASSIVE_LEVEL (they send BRBs synchronously) */
    WDF_IO_QUEUE_CONFIG_INIT(&qc, WdfIoQueueDispatchSequential);
    qc.EvtIoDeviceControl = Apl2EvtIoDeviceControl;
    WDF_OBJECT_ATTRIBUTES_INIT(&attrs);
    attrs.ExecutionLevel = WdfExecutionLevelPassive;
    status = WdfIoQueueCreate(device, &qc, &attrs, &queue);
    if (!NT_SUCCESS(status)) {
        return status;
    }
    status = WdfDeviceConfigureRequestDispatching(device, queue, WdfRequestTypeDeviceControl);
    if (!NT_SUCCESS(status)) {
        return status;
    }

    return WdfDeviceCreateDeviceInterface(device, &GUID_DEVINTERFACE_AIRPODS_L2CAP, NULL);
}

NTSTATUS
Apl2EvtSelfManagedIoInit(_In_ WDFDEVICE Device)
{
    PDEVICE_CONTEXT ctx = GetCtx(Device);
    BTH_DEVICE_INFO info;
    WDF_MEMORY_DESCRIPTOR out;
    NTSTATUS status;

    RtlZeroMemory(&info, sizeof(info));
    WDF_MEMORY_DESCRIPTOR_INIT_BUFFER(&out, &info, sizeof(info));
    status = WdfIoTargetSendInternalIoctlSynchronously(ctx->IoTarget, NULL, IOCTL_INTERNAL_BTHENUM_GET_DEVINFO,
                                                       NULL, &out, NULL, NULL);
    if (NT_SUCCESS(status)) {
        ctx->Remote = info.address;
    }
    APL2_LOG("remote %012llX (0x%08X)", (unsigned long long)ctx->Remote, status);
    return STATUS_SUCCESS;   /* still start; GET_INFO shows RemoteAddr 0 if this failed */
}

VOID
Apl2EvtSelfManagedIoCleanup(_In_ WDFDEVICE Device)
{
    PDEVICE_CONTEXT ctx = GetCtx(Device);
    WdfWaitLockAcquire(ctx->ConnectLock, NULL);
    (void)Apl2CloseChannel(ctx);
    WdfWaitLockRelease(ctx->ConnectLock);
}

VOID
Apl2EvtFileCleanup(_In_ WDFFILEOBJECT FileObject)
{
    PDEVICE_CONTEXT ctx = GetCtx(WdfFileObjectGetDevice(FileObject));
    BOOLEAN mine;

    WdfWaitLockAcquire(ctx->ConnectLock, NULL);
    WdfSpinLockAcquire(ctx->Lock);
    mine = (ctx->Owner == FileObject);
    WdfSpinLockRelease(ctx->Lock);
    if (mine) {                         /* other handles (e.g. an info-only probe) never close the channel */
        (void)Apl2CloseChannel(ctx);
    }
    WdfWaitLockRelease(ctx->ConnectLock);
}

/* ------------------------------------------------------------------------------------------ I/O */

VOID
Apl2TransferComplete(_In_ WDFREQUEST Request, _In_ WDFIOTARGET Target,
                     _In_ PWDF_REQUEST_COMPLETION_PARAMS Params, _In_ WDFCONTEXT Context)
{
    PDEVICE_CONTEXT ctx = (PDEVICE_CONTEXT)Context;
    PREQUEST_CONTEXT rc = GetReqCtx(Request);
    NTSTATUS status = Params->IoStatus.Status;
    ULONG_PTR info = 0;

    UNREFERENCED_PARAMETER(Target);
    if (NT_SUCCESS(status)) {
        info = rc->Brb.BufferSize;   /* bytes actually transferred */
        if (rc->Brb.TransferFlags & ACL_TRANSFER_DIRECTION_IN) {
            InterlockedIncrement(&ctx->Reads);
        } else {
            InterlockedIncrement(&ctx->Writes);
        }
    }
    Apl2Untrack(ctx, Request);
    WdfRequestCompleteWithInformation(Request, status, info);
}

static VOID
Apl2SubmitTransfer(_In_ WDFQUEUE Queue, _In_ WDFREQUEST Request, _In_ size_t Length, _In_ BOOLEAN In)
{
    PDEVICE_CONTEXT ctx = GetCtx(WdfIoQueueGetDevice(Queue));
    PREQUEST_CONTEXT rc = GetReqCtx(Request);
    WDFFILEOBJECT file = WdfRequestGetFileObject(Request);
    L2CAP_CHANNEL_HANDLE h = NULL;
    WDF_OBJECT_ATTRIBUTES attrs;
    WDFMEMORY mem;
    PMDL mdl = NULL;
    NTSTATUS status;
    BOOLEAN closing;

    if (Length == 0 || Length > MAXULONG) {
        WdfRequestComplete(Request, STATUS_INVALID_BUFFER_SIZE);
        return;
    }
    status = In ? WdfRequestRetrieveOutputWdmMdl(Request, &mdl) : WdfRequestRetrieveInputWdmMdl(Request, &mdl);
    if (!NT_SUCCESS(status)) {
        WdfRequestComplete(Request, status);
        return;
    }

    /* take the handle and register the transfer in one step, so a close cannot slip in between */
    WdfSpinLockAcquire(ctx->Lock);
    if (ctx->Owner != NULL && ctx->Owner != file) {
        status = STATUS_ACCESS_DENIED;
    } else if (ctx->State != APL2_STATE_CONNECTED || ctx->Closing || ctx->Channel == NULL) {
        status = STATUS_DEVICE_NOT_CONNECTED;
    } else {
        status = WdfCollectionAdd(ctx->InFlight, Request);
        if (NT_SUCCESS(status)) {
            h = ctx->Channel;
            KeClearEvent(&ctx->NoTransfers);
        }
    }
    WdfSpinLockRelease(ctx->Lock);
    if (!NT_SUCCESS(status)) {
        WdfRequestComplete(Request, status);
        return;
    }

    ctx->Bth.BthInitializeBrb((PBRB)&rc->Brb, BRB_L2CA_ACL_TRANSFER);
    rc->Brb.BtAddress = ctx->Remote;
    rc->Brb.ChannelHandle = h;
    rc->Brb.TransferFlags = In ? (ACL_TRANSFER_DIRECTION_IN | ACL_SHORT_TRANSFER_OK) : ACL_TRANSFER_DIRECTION_OUT;
    rc->Brb.BufferSize = (ULONG)Length;
    rc->Brb.Buffer = NULL;
    rc->Brb.BufferMDL = mdl;

    WDF_OBJECT_ATTRIBUTES_INIT(&attrs);
    attrs.ParentObject = Request;
    status = WdfMemoryCreatePreallocated(&attrs, &rc->Brb, sizeof(rc->Brb), &mem);
    if (NT_SUCCESS(status)) {
        status = WdfIoTargetFormatRequestForInternalIoctlOthers(ctx->IoTarget, Request, IOCTL_INTERNAL_BTH_SUBMIT_BRB,
                                                                mem, NULL, NULL, NULL, NULL, NULL);
    }
    if (!NT_SUCCESS(status)) {
        Apl2Untrack(ctx, Request);
        WdfRequestComplete(Request, status);
        return;
    }
    WdfRequestSetCompletionRoutine(Request, Apl2TransferComplete, ctx);

    WdfObjectReference(Request);        /* still valid for the closing check below, even if it completes */
    if (!WdfRequestSend(Request, ctx->IoTarget, WDF_NO_SEND_OPTIONS)) {
        status = WdfRequestGetStatus(Request);
        Apl2Untrack(ctx, Request);
        WdfRequestComplete(Request, status);
    } else {
        /* a close that started while we were sending may have missed this request: cancel it ourselves */
        WdfSpinLockAcquire(ctx->Lock);
        closing = ctx->Closing;
        WdfSpinLockRelease(ctx->Lock);
        if (closing) {
            (void)WdfRequestCancelSentRequest(Request);
        }
    }
    WdfObjectDereference(Request);
}

VOID
Apl2EvtIoRead(_In_ WDFQUEUE Queue, _In_ WDFREQUEST Request, _In_ size_t Length)
{
    Apl2SubmitTransfer(Queue, Request, Length, TRUE);
}

VOID
Apl2EvtIoWrite(_In_ WDFQUEUE Queue, _In_ WDFREQUEST Request, _In_ size_t Length)
{
    Apl2SubmitTransfer(Queue, Request, Length, FALSE);
}

VOID
Apl2EvtIoDeviceControl(_In_ WDFQUEUE Queue, _In_ WDFREQUEST Request, _In_ size_t OutputBufferLength,
                       _In_ size_t InputBufferLength, _In_ ULONG IoControlCode)
{
    PDEVICE_CONTEXT ctx = GetCtx(WdfIoQueueGetDevice(Queue));
    WDFFILEOBJECT file = WdfRequestGetFileObject(Request);
    NTSTATUS status = STATUS_INVALID_DEVICE_REQUEST;
    ULONG_PTR info = 0;

    UNREFERENCED_PARAMETER(OutputBufferLength);

    switch (IoControlCode) {
    case IOCTL_APL2_GET_INFO: {
        APL2_INFO *out;
        status = WdfRequestRetrieveOutputBuffer(Request, sizeof(APL2_INFO), (PVOID *)&out, NULL);
        if (NT_SUCCESS(status)) {
            RtlZeroMemory(out, sizeof(*out));
            out->Version = APL2_VERSION;
            WdfSpinLockAcquire(ctx->Lock);
            out->State = (ULONG)ctx->State;
            out->Psm = ctx->Psm;
            out->InMtu = ctx->InMtu;
            out->OutMtu = ctx->OutMtu;
            out->Flags = (ctx->Owner != NULL ? APL2_INFO_IN_USE : 0) |
                         (ctx->Owner != NULL && ctx->Owner == file ? APL2_INFO_MINE : 0);
            WdfSpinLockRelease(ctx->Lock);
            out->RemoteAddr = ctx->Remote;
            out->LastStatus = ctx->LastStatus;
            out->ReadsCompleted = (ULONG)ctx->Reads;
            out->WritesCompleted = (ULONG)ctx->Writes;
            info = sizeof(APL2_INFO);
        }
        break;
    }
    case IOCTL_APL2_CONNECT: {
        APL2_CONNECT_IN in = {0};
        if (InputBufferLength >= sizeof(APL2_CONNECT_IN)) {
            APL2_CONNECT_IN *p;
            status = WdfRequestRetrieveInputBuffer(Request, sizeof(APL2_CONNECT_IN), (PVOID *)&p, NULL);
            if (!NT_SUCCESS(status)) {
                break;
            }
            in = *p;
        }
        WdfWaitLockAcquire(ctx->ConnectLock, NULL);
        status = Apl2OpenChannel(ctx, file, &in);
        WdfWaitLockRelease(ctx->ConnectLock);
        break;
    }
    case IOCTL_APL2_DISCONNECT: {
        WDFFILEOBJECT owner;
        WdfWaitLockAcquire(ctx->ConnectLock, NULL);
        WdfSpinLockAcquire(ctx->Lock);
        owner = ctx->Owner;
        WdfSpinLockRelease(ctx->Lock);
        if (owner != NULL && owner != file) {
            status = STATUS_ACCESS_DENIED;      /* only the owner may close the channel */
        } else {
            status = Apl2CloseChannel(ctx);
        }
        WdfWaitLockRelease(ctx->ConnectLock);
        break;
    }
    default:
        break;
    }
    WdfRequestCompleteWithInformation(Request, status, info);
}
