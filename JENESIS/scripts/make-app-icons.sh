#!/usr/bin/env bash
#
# make-app-icons.sh — build the icon set for one JENESIS application colour.
#
# Every application carries the SAME J mark in its own colour. The shapes are
# never redrawn per application: the master blue artwork is re-hued in HSL,
# keeping saturation and lightness exactly as the artist set them, so the four
# icons are unmistakably one family. That is also how the existing red and
# green icons were produced from the blue master, so a fifth colour generated
# this way matches them automatically.
#
#   ./scripts/make-app-icons.sh <slug> <hue-degrees>
#
#   ./scripts/make-app-icons.sh settings 38
#
# produces build/icon-settings.png (512), build/logo-settings.png (1024),
# public/favicon-settings.png (64) and build/icon-settings.ico (8 sizes),
# each in the same structure as the other three applications.
set -euo pipefail

SLUG="${1:?usage: make-app-icons.sh <slug> <hue-degrees>}"
HUE="${2:?usage: make-app-icons.sh <slug> <hue-degrees>}"

cd "$(dirname "$0")/.."

# ImageMagick expects the hue channel in HSL as a percentage of the quantum
# range; degrees/360 is that fraction.
PCT="$(python3 -c "print(f'{${HUE}/360*100:.4f}')")"

recolour() {
  convert "$1" -colorspace HSL -channel R -evaluate set "${PCT}%" +channel \
          -colorspace sRGB "$2"
}

echo "building the ${SLUG} icon set at hue ${HUE}deg (${PCT}% of the HSL ring)"

recolour build/icon.png            "build/icon-${SLUG}.png"
recolour build/logo.png            "build/logo-${SLUG}.png"
recolour public/favicon.png        "public/favicon-${SLUG}.png"

# The .ico keeps the eight sizes Windows asks for, and the largest entry is
# stored as a PNG inside the .ico exactly as the other three are.
convert "build/icon-${SLUG}.png" -define icon:auto-resize=256,128,96,64,48,32,24,16 \
        "build/icon-${SLUG}.ico"

for f in "build/icon-${SLUG}.png" "build/logo-${SLUG}.png" \
         "public/favicon-${SLUG}.png" "build/icon-${SLUG}.ico"; do
  printf '  %-34s %s bytes\n' "$f" "$(wc -c < "$f" | tr -d ' ')"
done
