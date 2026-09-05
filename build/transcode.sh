#!/usr/bin/env bash
# Chuyen ma video feedback goc (4K doc) sang dinh dang web 720x1280 + anh poster.
# Dung: bash build/transcode.sh <thu-muc-chua-video> [thu-muc-khac ...]
set -eu
OUT="$(cd "$(dirname "$0")/.." && pwd)/public/videos"
mkdir -p "$OUT"
[ $# -eq 0 ] && { echo "Dung: bash build/transcode.sh <thu-muc-video> [...]"; exit 1; }

i=0
find "$@" -type f -iname "*.mp4" | sort | while IFS= read -r f; do
  i=$((i+1)); n=$(printf "fb-%02d" "$i")
  echo "[$i] $n <- $(basename "$f")"
  ffmpeg -y -loglevel error -i "$f" \
    -vf "scale=720:1280:flags=lanczos" \
    -c:v libx264 -preset medium -crf 26 -profile:v high -level 4.0 -pix_fmt yuv420p \
    -movflags +faststart -g 60 -c:a aac -b:a 96k -ac 1 "$OUT/$n.mp4"
  ffmpeg -y -loglevel error -ss 1.5 -i "$f" -frames:v 1 \
    -vf "scale=540:960:flags=lanczos" -q:v 5 "$OUT/$n.jpg"
done
echo "Xong. Chay tiep: npm run build"
