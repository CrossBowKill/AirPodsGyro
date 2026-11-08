"""OpenTrack "FreePIE UDP receiver" output.

Wire format (50 bytes): uint8 pad, uint8 flags = 0x02 (orientation), float32[12]; yaw/pitch/roll in
fl[0..2] in radians. OpenTrack converts back to degrees. Written from the format description, so the
app does not depend on GPL code.
"""

import math
import socket
import struct

FLAG_ORIENTATION = 0x02


def freepie_packet(yaw, pitch, roll):
    fl = [0.0] * 12
    fl[0], fl[1], fl[2] = math.radians(yaw), math.radians(pitch), math.radians(roll)
    return struct.pack("<BB12f", 0, FLAG_ORIENTATION, *fl)


class UdpOutput:
    name = "OpenTrack UDP"

    def __init__(self, host="127.0.0.1", port=4242):
        try:
            host = socket.getaddrinfo(host, port, socket.AF_INET, socket.SOCK_DGRAM)[0][4][0]
        except OSError:
            pass
        self.dest = (host, port)
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.errors = 0

    def send(self, yaw, pitch, roll):
        try:
            self.sock.sendto(freepie_packet(yaw, pitch, roll), self.dest)
        except OSError:
            self.errors += 1

    def close(self):
        self.sock.close()
