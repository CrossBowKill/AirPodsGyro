#!/usr/bin/env bash
# pro3-capture-soak.sh - HCI capture of a fresh, working AirPods Pro 3 session + long stability test.
#
#   1. starts btmon BEFORE the AirPods connect, so the capture holds the whole setup the Windows
#      driver must reproduce: ACL connect, encryption, L2CAP PSM 0x1001 config (MTU), AAP start packets
#   2. reconnects the AirPods, then runs  airpodsgyro/bridge.py soak  (rate, dropouts, drift, raw CSV)
#   3. packs everything into one .tar.gz to copy off the live USB
#
# Usage:  bash tools/pro3-capture-soak.sh [MINUTES] [AIRPODS_MAC]      (default 10 min, auto-detect MAC)
#         INTERVAL_US=5000 bash tools/pro3-capture-soak.sh 5            (200 Hz variant)

set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
MIN="${1:-10}"
MAC="${2:-}"
IV="${INTERVAL_US:-10000}"
OUT="$HERE/capture-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$OUT"
exec > >(tee -a "$OUT/run.log") 2>&1
sudo -v || exit 1

if [ -z "$MAC" ]; then
    while read -r _ addr _; do
        if bluetoothctl info "$addr" 2>/dev/null | grep -qi 'Modalias: bluetooth:v004Cp2027'; then MAC="$addr"; break; fi
    done < <(bluetoothctl devices Paired 2>/dev/null)
fi
[ -n "$MAC" ] || { echo "no paired AirPods Pro 3 found - pair first (see tools/ubuntu-pro3-check.sh)"; exit 3; }
echo "AirPods $MAC, $MIN min, interval $IV us, output $OUT"

echo "== disconnecting so the capture starts from a clean link"
bluetoothctl disconnect "$MAC" >/dev/null 2>&1; sleep 3

sudo btmon -w "$OUT/hci.btsnoop" >/dev/null 2>&1 &
BTMON=$!
sleep 1
cleanup() {
    sudo kill -INT "$BTMON" 2>/dev/null; sleep 1
    if [ -s "$OUT/hci.btsnoop" ]; then
        # readable decode of the setup phase only (full decode of a long soak is tens of MB)
        btmon -r "$OUT/hci.btsnoop" 2>/dev/null | head -n 30000 > "$OUT/hci-setup.txt"
    fi
    [ -f "$ROOT/airpodsgyro/calibration.json" ] && cp "$ROOT/airpodsgyro/calibration.json" "$OUT/"
    sudo chown -R "$(id -u):$(id -g)" "$OUT"
    tar -czf "$OUT.tar.gz" -C "$HERE" "$(basename "$OUT")"
    echo; echo "Packed: $OUT.tar.gz  - copy it off the live USB before rebooting."
}
trap cleanup EXIT

echo "== connecting (captured)"
bluetoothctl connect "$MAC"; sleep 3
bluetoothctl info "$MAC" > "$OUT/airpods-info.txt" 2>&1

cat <<EOT

== soak test: AirPods in BOTH ears.
   First 2 minutes: keep your head STILL, looking at one point on the monitor (measures drift).
   After that: use it normally, look around, and leave the room once for ~30 s if you can
   (tests reconnect). Ctrl+C ends early and still writes the summary.
EOT
read -r -p ">>> press Enter to start " _ </dev/tty
sudo python3 "$ROOT/airpodsgyro/bridge.py" --addr "$MAC" --interval-us "$IV" \
    soak --minutes "$MIN" --still-minutes 2 --out "$OUT"
