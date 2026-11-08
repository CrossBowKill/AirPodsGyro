# Memory

## Now
- Building the single Windows GUI app per plan C:/Users/cross/.claude/plans/analyise-the-project-and-streamed-salamander.md (phases: 1 core+replay, 2 drift, 3 FreeTrack/NPClient output, 4 PySide6 GUI, 5 signing gate + KMDF driver, 6 packaging).
- 2026-11-08 Phases 1-4 DONE (except driver transport): core/ + drift.py (still residual 0.03-0.16 deg/min on both recordings) + pipeline.py + outputs/freetrack.py (verified via opentrack NPClient64.dll incl. scrambled games) + PySide6 GUI (app.py, gui/; .venv has PySide6 6.11.3). 37 unit tests OK + tests/gui_smoke.py PASS.
- 2026-11-08 Phase 6 DONE (packaging): airpodsgyro/packaging/build.py -> dist/AirPodsGyro/AirPodsGyro.exe (71 MB, zip 29 MB, pruned Qt), exe --selftest 6/6 PASS incl. main window streaming. Next: Phase 5 KMDF driver, needs user OK for test-signing (Secure Boot off); in-game check of roll sign in iRacing/MSFS still open.

## Open Threads
- 2026-11-07: GATE PASSED on Ubuntu live USB (onboard Realtek BT). Unmodified mousepods streams Pro 3 SensorDataWX svc 16 at ~100 Hz (interval 10000 us), gyro tracks head motion. pods-head-tracker probe gets 0 packets on Pro 3 (Pro 2 format, ignore it). Pro 3 sometimes needs a clean stop (svc 16/14 -> 0) and reconnect after the probe. Built airpodsgyro/ (bridge.py calibrate|run|soak, headtrack.py, 7 unit tests): uses the on-board attitude quaternion (body->world, verified vs gyro), FreePIE UDP to OpenTrack verified at ~100 Hz. tools/pro3-capture-soak.sh = btmon capture (PSM 0x1001, MTU 2582, encryption visible) + soak. Check-script verdict fixed. 10-min soak DONE (tools/capture-20261107-224116): 100.2 Hz, 2 gaps >50 ms (max 55), 0 restarts/reconnects; still-phase yaw +5.6 deg in 2 min but decelerating (settling?), pitch 1.6, roll 0.7 deg/min. 2nd soak (tools/soak-20261107-225643, head resting on table 5.4 min): AirPods heading drift steady -1.8 deg/min (not settling; measured as twist about world vertical, Euler angles useless near pitch -86). Raw gyro bias about vertical = -1.3 deg/min, so the on-board fusion does NOT remove gyro bias -> Windows app needs own yaw-drift compensation (still-detector + heading-rate estimate, capped). Can be developed offline by replaying that soak.csv. Reconnect untested. All live-USB data merged into root 2026-11-07 (raw hci.btsnoop + tar.gz kept local, gitignored). OpenTrack not in Ubuntu apt; in-game test waits for Windows.

- 2026-11-08: Secure Boot disabled by user (BitLocker off, Memory integrity/HVCI on). AirPods (34:0E:22:54:5B:C4, PID 2027, name "AirPods Pro - Find My") now paired on Windows. Driver binding point found: BTHENUM node for Apple service {74ec2172-0bad-4d01-8f77-997b2be0722a} (compat ID BTHENUM\{74ec2172-...}) has NO driver -> our KMDF function driver binds there (bthecho-client style), opens L2CAP PSM 0x1001. Second Apple svc {4715650b-...} also driverless. VS 2022 Community present; WDK km headers missing -> user must install WDK + enable testsigning (admin). WDK installer (winget 26100.6584) fails exit 2008 "MSI replacement servicing is not supported" because newer SDK 26100.8249 is installed -> use NuGet WDK instead (Microsoft.Windows.WDK.x64 + SDK.CPP + SDK.CPP.x64 all 10.0.26100.6584, per project); VS still needs NativeDesktop workload + Spectre libs + Component.Microsoft.Windows.DriverKit.

- 2026-11-08: Test mode ON. Driver written + builds: driver/AirPodsL2cap (driver.c KMDF, public.h IOCTLs, .inx bound to BTHENUM\{74ec2172-...}), driver/build.ps1 (nuget WDK, msbuild, infverif OK, inf2cat, self-signed "CN=AirPodsGyro Test Signing"), driver/install.ps1 (admin; -Uninstall). App side: core/transport/windriver.py (WinDriverTransport), tools/apl2_probe.py, bridge.py uses windriver on Windows. 2026-11-08 LIVE SUCCESS: installed; apl2_probe 100.0 Hz/20 s, 2 gaps >50ms (max 76), PSM 4097, MTU 2582/2582, audio (YouTube) kept playing without dropouts. Next: live test in the GUI app + in-game (iRacing/MSFS, roll sign), reconnect behaviour.

## Recent Decisions
- 2026-11-05: Check Pro 3 on Linux (Ubuntu live USB) before any Windows work. End goal is a native Windows driver plus an app with OpenTrack-style output built in. Use onboard BT, no dongle.

## Blockers
- 2026-11-08: GUI app tracks live with music playing, BUT user's games all use EasyAntiCheat, which won't run without Secure Boot / with test mode. Test-signed driver only loads with Secure Boot off + testsigning on -> unusable in those games. Real fix = Microsoft attestation signing (EV code-signing cert + Partner Center hardware account). Awaiting user decision.

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
