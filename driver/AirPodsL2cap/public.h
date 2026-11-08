/*
 * AirPodsL2cap: interface between the driver and user mode (airpodsgyro/core/transport/windriver.py).
 * Keep the two in sync: IOCTL codes, struct layouts, the interface GUID.
 */
#pragma once

/* {6F3A2C41-8D7E-4B8A-9C51-2E7D14A9630B} device interface for user-mode apps */
DEFINE_GUID(GUID_DEVINTERFACE_AIRPODS_L2CAP,
    0x6f3a2c41, 0x8d7e, 0x4b8a, 0x9c, 0x51, 0x2e, 0x7d, 0x14, 0xa9, 0x63, 0x0b);

/* The I/O manager checks these access bits against the handle: read for info, read+write to connect. */
#define IOCTL_APL2_GET_INFO     CTL_CODE(FILE_DEVICE_UNKNOWN, 0x800, METHOD_BUFFERED, FILE_READ_ACCESS)
                                                                        /* 0x226000, out: APL2_INFO */
#define IOCTL_APL2_CONNECT      CTL_CODE(FILE_DEVICE_UNKNOWN, 0x801, METHOD_BUFFERED, FILE_READ_ACCESS | FILE_WRITE_ACCESS)
                                                                        /* 0x22E004, in (optional): APL2_CONNECT_IN */
#define IOCTL_APL2_DISCONNECT   CTL_CODE(FILE_DEVICE_UNKNOWN, 0x802, METHOD_BUFFERED, FILE_READ_ACCESS | FILE_WRITE_ACCESS)
                                                                        /* 0x22E008 */

/* The handle that connected owns the channel until it disconnects or closes:
 *   ReadFile  = one incoming L2CAP packet (buffer >= in MTU, 4096 is plenty)
 *   WriteFile = one outgoing L2CAP packet
 * Other handles: GET_INFO only; CONNECT fails with STATUS_DEVICE_BUSY (Win32 ERROR_BUSY),
 * transfers and DISCONNECT with STATUS_ACCESS_DENIED. */

#define APL2_VERSION 2
#define APL2_DEFAULT_PSM 0x1001       /* fixed: CONNECT rejects any other PSM */
#define APL2_DEFAULT_IN_MTU 2582      /* the AirPods only announce their sensors with this MTU; 672..4096 accepted */

enum {
    APL2_STATE_DISCONNECTED = 0,
    APL2_STATE_CONNECTED = 1,
    APL2_STATE_REMOTE_DISCONNECTED = 2,
};

#define APL2_INFO_IN_USE  0x0001      /* some handle owns the channel */
#define APL2_INFO_MINE    0x0002      /* ...and it is the handle that asked */

#pragma pack(push, 8)
typedef struct _APL2_CONNECT_IN {
    USHORT Psm;            /* 0 or APL2_DEFAULT_PSM */
    USHORT InMtu;          /* 0 = APL2_DEFAULT_IN_MTU */
    ULONG  ChannelFlags;   /* must be 0: the link is always authenticated and encrypted */
} APL2_CONNECT_IN;          /* 8 bytes */

typedef struct _APL2_INFO {
    ULONG     Version;
    ULONG     State;
    ULONGLONG RemoteAddr;   /* BTH_ADDR of the AirPods this device node belongs to */
    USHORT    Psm;
    USHORT    InMtu;
    USHORT    OutMtu;
    USHORT    Flags;        /* APL2_INFO_* */
    LONG      LastStatus;   /* NTSTATUS of the last connect */
    ULONG     ReadsCompleted;
    ULONG     WritesCompleted;
    ULONG     Reserved;
} APL2_INFO;                /* 40 bytes (Python: struct "<IIQHHHHiIII") */
#pragma pack(pop)
