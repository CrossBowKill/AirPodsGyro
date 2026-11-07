# Memory

## Now
- Testing AirPods Pro 3 head tracking on Ubuntu live USB

## Open Threads
- 2026-11-05: Ubuntu live-USB test of Pro 3 on Linux pending (tools/ubuntu-pro3-check.sh). Gate: no Windows driver work until it passes.

## Recent Decisions
- 2026-11-05: Check Pro 3 on Linux (Ubuntu live USB) before any Windows work. End goal is a native Windows driver plus an app with OpenTrack-style output built in. Use onboard BT, no dongle.

## Blockers
- (none)

## Project Profile (added 2026-11-05, Claudify install)
- **Goal:** one Windows-friendly AirPods head tracker for racing/flight sims, merging mousepods (sensor/protocol work, MotionEngine, OneEuro filter, web UI) with pods-head-tracker (OpenTrack bridge, calibration, FreePIE UDP + Hatire serial). No Raspberry Pi.
- **Wish:** OpenTrack "built in": app talks to games itself (FreeTrack/TrackIR-style output) so standalone OpenTrack becomes optional.
- **Hardware:** AirPods Pro 3 (A3063, BT product ID 0x2027) -> SensorDataWX path (RTBuddy 0x100000), NOT the AirPods 3 RemoteHID path.
- **Workflow:** prototype in Python, test with real AirPods, validate in-game via OpenTrack.
- **Most time / automate:** Bluetooth + protocol debugging, hardware-in-the-loop testing.
- **Tools:** Python 3.14 (Windows 11), OpenTrack, BlueZ, sims (iRacing, MSFS).

## Key Facts (verified 2026-11-05)
- Windows Python: socket.BTPROTO_L2CAP missing (RFCOMM only). AirPods head tracking needs L2CAP PSM 0x1001 + encrypted link -> no user-mode native path on Windows. Options: WSL2 + usbipd USB BT dongle, Linux host, or kernel driver.
- Baseline tests on Windows: pods-head-tracker 102 OK (2 skipped), mousepods 37 OK, via `python -m unittest discover -s tests` (pytest not installed).
- mousepods needs L2CAP MTU 2582 (IOS_MTU) or sensors are not announced.

## Useful Claudify capabilities here
- /verify, /prove, /test, /mutation-gate (prove protocol/engine changes), /red-team before risky merges, /unstick + error-whisperer for BT errors, /onboard for repo maps, Session Handoff in Daily Notes.
- PC: Gigabyte X870 AORUS ELITE WIFI7 ICE; onboard BT = Realtek USB\VID_0BDA&PID_8922 (internally USB, so usbipd-attachable, but Windows loses BT while attached). AirPods not paired with PC as of 2026-11-05.
- Native Windows route = KMDF Bluetooth profile driver using BRB_L2CA_OPEN_CHANNEL (MagicPods ships such a driver). User prefers onboard BT, no dongle.
