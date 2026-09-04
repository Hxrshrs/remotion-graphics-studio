#!/opt/homebrew/opt/python@3.13/bin/python3.13
"""
Build public/fonts/apple-emoji.ttf from the local macOS system emoji font.

Why this exists: the studio renders on whatever machine runs the dev server,
and a documentary cut must look identical whether that is a Mac or a Windows
PC. Emoji are plain text in a scene, so without a font of our own they resolve
to the host's emoji font — Segoe UI Emoji on Windows, Noto on Linux — and the
same shot ships with different artwork depending on who rendered it. Shipping
Apple's artwork as a webfont pins it.

What it does:
  * pulls font 0 ("Apple Color Emoji") out of the system .ttc, which is a
    collection and cannot be used as a webfont directly;
  * keeps a single sbix strike. The system font carries nine (20…160px) and is
    188MB; one 96px strike is 37MB and still oversamples the 48–120px range
    the prompt asks scenes to draw emoji at.
  * leaves the glyph set and the `morx` table alone. Apple composes ZWJ
    sequences, skin tones, and flags in AAT rather than in `cmap`, and
    subsetting by codepoint would quietly break every one of them. HarfBuzz
    reads `morx` on every platform, so the sequences survive as they are.

Run it on a Mac (it is the only place the source font exists):

    python3 scripts/build-emoji-font.py

The output is a system font reprocessed for local use — Apple's license does
not cover redistributing it, so keep the built file out of anything public and
rebuild it on the machine that needs it.
"""

import os
import sys
from fontTools.ttLib import TTFont

SOURCE = '/System/Library/Fonts/Apple Color Emoji.ttc'
STRIKE = 96
OUTPUT = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    'public',
    'fonts',
    'apple-emoji.ttf',
)


def main() -> int:
    if not os.path.exists(SOURCE):
        print(f'{SOURCE} not found. This script only runs on macOS.', file=sys.stderr)
        return 1

    font = TTFont(SOURCE, fontNumber=0)
    strikes = font['sbix'].strikes
    if STRIKE not in strikes:
        print(f'No {STRIKE}px strike in the source font: {sorted(strikes)}', file=sys.stderr)
        return 1
    for size in list(strikes):
        if size != STRIKE:
            del strikes[size]

    os.makedirs(os.path.dirname(OUTPUT), exist_ok=True)
    font.save(OUTPUT)
    print(f'{OUTPUT} · {os.path.getsize(OUTPUT) / 1e6:.1f}MB · {STRIKE}px strike')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
