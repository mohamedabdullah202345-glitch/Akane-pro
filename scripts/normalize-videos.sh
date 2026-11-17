#!/usr/bin/env bash
set -euo pipefail

VIDEO_DIR="${1:-public/videos}"
REF_CLIP="$VIDEO_DIR/idle_1.mp4"

if [ ! -f "$REF_CLIP" ]; then
  echo "Reference clip not found: $REF_CLIP" >&2
  exit 1
fi

measure_clip() {
  local file="$1"
  ffmpeg -v error -i "$file" -vf "signalstats,metadata=print:file=-" -f null - 2>/dev/null | python3 -c "
import sys
yavg, yspan, sat = [], [], []
ymin = ymax = None
for line in sys.stdin:
    line = line.strip()
    if line.startswith('lavfi.signalstats.YAVG='):
        yavg.append(float(line.split('=', 1)[1]))
    elif line.startswith('lavfi.signalstats.YMIN='):
        ymin = float(line.split('=', 1)[1])
    elif line.startswith('lavfi.signalstats.YMAX='):
        ymax = float(line.split('=', 1)[1])
        if ymin is not None:
            yspan.append(max(1.0, ymax - ymin))
            ymin = None
    elif line.startswith('lavfi.signalstats.SATAVG='):
        sat.append(float(line.split('=', 1)[1]))
avg_y = sum(yavg)/len(yavg) if yavg else 128.0
avg_span = sum(yspan)/len(yspan) if yspan else 200.0
avg_sat = sum(sat)/len(sat) if sat else 80.0
print(f'{avg_y:.3f} {avg_span:.3f} {avg_sat:.3f}')
"
}

read -r REF_YAVG REF_YSPAN REF_SAT <<< "$(measure_clip "$REF_CLIP")"
echo "Reference idle_1.mp4 -> YAVG=$REF_YAVG YSPAN=$REF_YSPAN SATAVG=$REF_SAT"
echo ""
printf "| %-16s | %-11s | %-11s | %-11s | %-11s | %-38s |\n" "Clip" "Before YAVG" "After YAVG" "Before SAT" "After SAT" "Applied eq"
printf "| %-16s | %-11s | %-11s | %-11s | %-11s | %-38s |\n" "----------------" "-----------" "-----------" "-----------" "-----------" "--------------------------------------"

for clip in "$VIDEO_DIR"/*.mp4; do
  name="$(basename "$clip")"
  read -r B_YAVG B_SPAN B_SAT <<< "$(measure_clip "$clip")"

  if [ "$name" = "idle_1.mp4" ]; then
    BRIGHT="0.000"
    CONTRAST="1.000"
    SAT="1.000"
  else
    read -r BRIGHT CONTRAST SAT <<< "$(python3 -c "
ref_y, ref_span, ref_sat = float('$REF_YAVG'), float('$REF_YSPAN'), float('$REF_SAT')
b_y, b_span, b_sat = float('$B_YAVG'), float('$B_SPAN'), float('$B_SAT')
contrast = max(0.92, min(1.08, ref_span / max(1.0, b_span)))
# Match average luma after contrast pivot at 128
bright = max(-0.12, min(0.12, (ref_y - (128.0 + contrast * (b_y - 128.0))) / 255.0))
sat = max(0.88, min(1.12, ref_sat / max(1.0, b_sat)))
print(f'{bright:.4f} {contrast:.4f} {sat:.4f}')
")"
  fi

  eq_str="brightness=${BRIGHT}:contrast=${CONTRAST}:saturation=${SAT}"
  tmp_file="${clip%.mp4}.norm.tmp.mp4"

  ffmpeg -y -v error -i "$clip" \
    -vf "scale=720:-2,fps=30,eq=${eq_str},format=yuv420p" \
    -color_primaries bt709 \
    -color_trc bt709 \
    -colorspace bt709 \
    -color_range tv \
    -c:v libx264 \
    -preset fast \
    -crf 18 \
    -an \
    -movflags +faststart \
    "$tmp_file"

  if [ -s "$tmp_file" ]; then
    mv -f "$tmp_file" "$clip"
  else
    rm -f "$tmp_file"
    echo "Failed to normalize $name" >&2
    exit 1
  fi

  read -r A_YAVG _A_SPAN A_SAT <<< "$(measure_clip "$clip")"
  printf "| %-16s | %-11s | %-11s | %-11s | %-11s | %-38s |\n" "$name" "$B_YAVG" "$A_YAVG" "$B_SAT" "$A_SAT" "$eq_str"
done
