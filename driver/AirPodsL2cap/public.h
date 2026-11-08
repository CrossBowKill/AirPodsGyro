/*
 * AirPodsL2cap: interface between the driver and user mode (airpodsgyro/core/transport/windriver.py).
 * Keep the two in sync: IOCTL codes, struct layouts, the interface GUID.
 */
#pragma once

/* {6F3A2C41-8D7E-4B8A-9C51-2E7D14A9630B} device interface for user-mode apps */
DEFINE_GUID(GUID_DEVINTERFACE_AIRPODS_L2CAP,
    0x6f3a2c41, 0x8d7e, 0x4b8a, 0x9c, 0x51, 0x2e, 0x7d, 0x14, 0xa9, 0x63, 0x0b);

#define APL2_IOCTL(n) CTL_CODE(FILE_DEVICE_UNKNOWN, 0x800 + (n), METHOD_BUFFERED, FILE_ANY_ACCESS)

/* out: APL2_INFO */
#define IOCTL_APL2_GET_INFO     APL2_IOCTL(0)   /* 0x222000 */
/* in (optional): APL2_CONNECT_IN. Opens the L2CAP channel to the AirPods. */
#define IOCTL_APL2_CONNECT      APL2_IOCTL(1)   /* 0x222004 */
/* closes the channel (also done when the handle is closed) */
#define IOCTL_APL2_DISCONNECT   APL2_IOCTL(2)   /* 0x222008 */

/* ReadFile  = one incoming L2CAP packet (buffer >= in MTU, 4096 is plenty)
 * WriteFile = one outgoing L2CAP packet */

#define APL2_VERSION 1
#define APL2_DEFAULT_PSM 0x1001
#define APL2_DEFAULT_IN_MTU 2582   /* the AirPods only announce their sensors with this MTU */

enum {
    APL2_STATE_DISCONNECTED = 0,
    APL2_STATE_CONNECTED = 1,
    APL2_STATE_REMOTE_DISCONNECTED = 2,
};

#pragma pack(push, 8)
typedef struct _APL2_CONNECT_IN {
    USHORT Psm;            /* 0 = APL2_DEFAULT_PSM */
    USHORT InMtu;          /* 0 = APL2_DEFAULT_IN_MTU */
    ULONG  ChannelFlags;   /* 0 = CF_ROLE_EITHER | CF_LINK_AUTHENTICATED | CF_LINK_ENCRYPTED */
} APL2_CONNECT_IN;          /* 8 bytes */

typedef struct _APL2_INFO {
    ULONG     Version;
    ULONG     State;
    ULONGLONG RemoteAddr;   /* BTH_ADDR of the AirPods this device node belongs to */
    USHORT    Psm;
    USHORT    InMtu;
    USHORT    OutMtu;
    USHORT    Reserved;
    LONG      LastStatus;   /* NTSTATUS of the last connect */
    ULONG     ReadsCompleted;
    ULONG     WritesCompleted;
    ULONG     Reserved2;
} APL2_INFO;                /* 40 bytes (Python: struct "<IIQHHHHiIII") */
#pragma pack(pop)
