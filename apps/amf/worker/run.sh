#!/usr/bin/env bash
# AMF producing pipeline (worker) — script text → voiced, captioned MP4.
# L4 (VoxCPM voice + whisperx align) → L5 (HyperFrames render).
#
# Usage:
#   ./run.sh "Your script text here"            [device defaults to mps on Mac]
#   DEVICE=cpu ./run.sh --text-file script.txt
#
# Runs entirely on owned hardware (M1 Mac / Linux). No cloud GPU, no paid API.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="${OUT:-$HERE/out/$(date +%Y%m%d-%H%M%S)}"
DEVICE="${DEVICE:-mps}"
mkdir -p "$OUT"

# L4 — voice + word timestamps → payload.json
if [ "${1:-}" = "--text-file" ]; then
  PAYLOAD=$(python3 "$HERE/voice_pipeline.py" --text-file "$2" --out "$OUT" --device "$DEVICE")
else
  PAYLOAD=$(python3 "$HERE/voice_pipeline.py" --text "${1:?script text required}" --out "$OUT" --device "$DEVICE")
fi

# L5 — render MP4 from the payload
node "$HERE/render.mjs" "$PAYLOAD" "$OUT/render"

echo "✓ MP4 in: $OUT/render/renders/"
