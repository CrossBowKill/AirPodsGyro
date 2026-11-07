#!/usr/bin/env bash
# ubuntu-pro3-check.sh - Does AirPods Pro 3 head tracking work on Linux/BlueZ?
#
# Runs on an Ubuntu live session. Uses the two upstream repos UNMODIFIED:
#   1. system + Bluetooth controller check (onboard Realtek 0bda:8922)
#   2. finds the paired AirPods Pro 3 (Apple product id 0x2027)
#   3. MTU test (mousepods captures/mtu_test.py) at 2582 and 672
#   4. head-tracking probe (pods-head-tracker airpods_ht_probe.py): still/yaw/pitch/roll CSVs
#   5. mousepods --diag for 20 s (raw gyro path)
#   6. verdict + everything packed into one .tar.gz to bring back to Windows
#
# Usage:  bash tools/ubuntu-pro3-check.sh [AIRPODS_MAC]
# Logs:   tools/pro3-logs-<timestamp>/ (or ~/pro3-logs-<timestamp> if the folder is read-only)

set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
PHT="$ROOT/pods-head-tracker-main"
MP="$ROOT/mousepods-main"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$HERE/pro3-logs-$STAMP"
if ! mkdir -p "$OUT" 2>/dev/null || ! touch "$OUT/.w" 2>/dev/null; then
    OUT="$HOME/pro3-logs-$STAMP"; mkdir -p "$OUT"
fi
rm -f "$OUT/.w"
exec > >(tee -a "$OUT/summary.log") 2>&1

step()  { echo; echo "=================== $* ==================="; }
pause() { read -r -p ">>> $* - press Enter when ready " _ </dev/tty; }
verdict() { echo "VERDICT: $*" | tee -a "$OUT/verdict.txt"; }
pack() {
    tar -czf "$OUT.tar.gz" -C "$(dirname "$OUT")" "$(basename "$OUT")"
    echo; echo "All logs packed into: $OUT.tar.gz"
    echo "Copy that file to your USB stick and bring it back to Windows."
}

for f in "$PHT/airpods_ht_probe.py" "$MP/captures/mtu_test.py" "$MP/airpods_mouse_controller.py"; do
    [ -f "$f" ] || { echo "missing $f - run this from the AirPodsGyro folder copy"; exit 1; }
done
echo "Logs: $OUT"
sudo -v || exit 1

# ------------------------------------------------------------------ 1. system
step "1/6 System and Bluetooth controller"
{ uname -a; grep -E '^(PRETTY_NAME|VERSION)=' /etc/os-release; python3 --version; } | tee "$OUT/system.txt"
lsusb > "$OUT/lsusb.txt" 2>&1
if grep -qi '0bda:8922' "$OUT/lsusb.txt"; then echo "Realtek BT USB 0bda:8922: present"
else echo "WARNING: Realtek 0bda:8922 not in lsusb (see lsusb.txt)"; fi
sudo dmesg | grep -iE 'bluetooth|btrtl|btusb|rtl8922|hci0' > "$OUT/dmesg-bt.txt"
tail -25 "$OUT/dmesg-bt.txt"
ls /lib/firmware/rtl_bt/ 2>/dev/null | grep -i 8922 > "$OUT/firmware.txt"; echo "firmware files: $(tr '\n' ' ' < "$OUT/firmware.txt")"
bluetoothctl show > "$OUT/controller.txt" 2>&1
cat "$OUT/controller.txt"
if ! grep -q 'Controller' "$OUT/controller.txt"; then
    verdict "STOP at step 1: Linux sees no Bluetooth controller. Kernel/firmware for the Realtek chip is missing. Try a newer Ubuntu release, or note this result."
    pack; exit 2
fi
grep -q 'Powered: yes' "$OUT/controller.txt" || bluetoothctl power on

# ------------------------------------------------------------------ 2. AirPods
step "2/6 Find the AirPods Pro 3"
MAC="${1:-}"
if [ -z "$MAC" ]; then
    while read -r _ addr _; do
        if bluetoothctl info "$addr" 2>/dev/null | grep -qi 'Modalias: bluetooth:v004Cp2027'; then MAC="$addr"; break; fi
    done < <(bluetoothctl devices Paired 2>/dev/null)
fi
if [ -z "$MAC" ]; then
    cat <<'EOT'
No paired AirPods Pro 3 found. Pair them now (this does NOT need the script):
  1. AirPods in the case, lid open, hold the case button until the light flashes white
  2. bluetoothctl            (then inside it:)
       scan on               wait for "AirPods Pro" and note its MAC
       pair  XX:XX:XX:XX:XX:XX
       trust XX:XX:XX:XX:XX:XX
       connect XX:XX:XX:XX:XX:XX
       quit
  3. run this script again:  bash tools/ubuntu-pro3-check.sh XX:XX:XX:XX:XX:XX
EOT
    verdict "STOP at step 2: AirPods not paired under Linux yet."
    pack; exit 3
fi
bluetoothctl info "$MAC" > "$OUT/airpods-info.txt" 2>&1
grep -E 'Name|Modalias|Paired|Connected' "$OUT/airpods-info.txt"
if ! grep -q 'Connected: yes' "$OUT/airpods-info.txt"; then
    echo "connecting..."; bluetoothctl connect "$MAC"; sleep 3
fi
pause "Put BOTH AirPods in your ears and sit still facing your monitor"

# ------------------------------------------------------------------ 3. MTU test
step "3/6 Raw SensorDataWX at MTU 2582 and 672 (mousepods mtu_test.py)"
for mtu in 2582 672; do
    echo "--- MTU $mtu ---"
    sudo timeout 40 python3 "$MP/captures/mtu_test.py" "$MAC" "$mtu" > "$OUT/mtu$mtu.txt" 2>&1
    cat "$OUT/mtu$mtu.txt"
    sleep 2
done

# ------------------------------------------------------------------ 4. probe
step "4/6 Head-tracking stream (pods-head-tracker probe)"
declare -A HINT=([still]="Keep your head completely still"
                 [yaw]="Turn your head slowly LEFT and RIGHT (like saying no)"
                 [pitch]="Nod slowly UP and DOWN (like saying yes)"
                 [roll]="Tilt your head ear-to-shoulder LEFT and RIGHT")
for lbl in still yaw pitch roll; do
    pause "${HINT[$lbl]} for 10 s once it starts"
    sudo python3 "$PHT/airpods_ht_probe.py" "$MAC" --seconds 10 \
        --csv "$OUT/ht-$lbl.csv" --label "$lbl" 2>&1 | tee "$OUT/probe-$lbl.txt"
    sleep 2
done
echo "--- extra: DEF start variant, full burst ---"
sudo python3 "$PHT/airpods_ht_probe.py" "$MAC" --variant def --burst full --seconds 6 > "$OUT/probe-def-full.txt" 2>&1
tail -3 "$OUT/probe-def-full.txt"

# ------------------------------------------------------------------ 5. mousepods
step "5/6 mousepods raw gyro path (--diag, 20 s)"
if ! python3 -c 'import evdev' 2>/dev/null; then
    echo "installing python3-evdev (needs internet)"; sudo apt-get install -y python3-evdev > "$OUT/apt.txt" 2>&1
fi
echo "NOTE: mousepods may move the mouse cursor while it runs - that is fine."
pause "Move your head around gently during the next 20 s"
sudo timeout 20 python3 "$MP/airpods_mouse_controller.py" --diag --no-web -v \
    -c "$OUT/mousepods-config.json" > "$OUT/mousepods-diag.txt" 2>&1
tail -30 "$OUT/mousepods-diag.txt"

# ------------------------------------------------------------------ 6. verdict
step "6/6 Verdict"
total=0
for lbl in still yaw pitch roll; do
    rows=0
    [ -f "$OUT/ht-$lbl.csv" ] && rows=$(( $(wc -l < "$OUT/ht-$lbl.csv") - 1 ))
    [ "$rows" -lt 0 ] && rows=0
    echo "probe $lbl: $rows packets in 10 s (~$(( rows / 10 )) Hz)"
    total=$(( total + rows ))
done
d2582=$(grep -o 'data=[0-9]*' "$OUT/mtu2582.txt" | cut -d= -f2 | sort -n | tail -1); d2582=${d2582:-0}
d672=$(grep -o 'data=[0-9]*' "$OUT/mtu672.txt" | cut -d= -f2 | sort -n | tail -1); d672=${d672:-0}
echo "raw SensorDataWX data packets: MTU2582=$d2582  MTU672=$d672"
if [ "$total" -gt 0 ] || [ "$d2582" -gt 0 ]; then
    verdict "SUCCESS: AirPods Pro 3 stream head-tracking data over BlueZ (probe packets=$total, raw@2582=$d2582, raw@672=$d672). The protocol works; the Windows driver route is worth building."
else
    verdict "NO STREAM: channel/data did not come up. Logs needed for analysis before any Windows work."
fi
pack
