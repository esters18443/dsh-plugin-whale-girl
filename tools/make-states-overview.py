#!/usr/bin/env python3
"""Draw docs/images/whale-states.png from the sliced frames actually shipped.

One row per state: every frame from left to right, with the state, its source sheet
and its timing. Run from the repository root after tools/prepare-whale-girl.py:

    python tools/make-states-overview.py
"""

import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont

ROW = 150
LABEL = 260
GAP = 12
PAD = 22
SCALE = 0.5
BACKDROP = (246, 248, 251, 255)
INK = (52, 60, 72, 255)
MUTED = (128, 138, 152, 255)

LABELS = {
    "resting": "resting 休息",
    "working": "working 工作",
    "waiting": "waiting 等待",
    "celebrate": "celebrating 庆祝",
    "sleeping": "sleeping 睡觉",
    "error": "error 出错",
}


def font(size, bold=False):
    for name in (("msyhbd.ttc" if bold else "msyh.ttc"), "simhei.ttf", "segoeui.ttf"):
        path = os.path.join(os.environ.get("WINDIR", r"C:\Windows"), "Fonts", name)
        if os.path.exists(path):
            return ImageFont.truetype(path, size, index=0)
    return ImageFont.load_default()


def main():
    repo = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    with open(os.path.join(repo, "assets", "sprites", "manifest.json"), encoding="utf-8") as handle:
        manifest = json.load(handle)

    order = [state for state in manifest["order"] if state in manifest["states"]]
    frames = {}
    for state in order:
        sheet = []
        for name in manifest["states"][state]["frames"]:
            image = Image.open(os.path.join(repo, "assets", "sprites", name)).convert("RGBA")
            sheet.append(image.resize((round(image.width * SCALE), round(image.height * SCALE)), Image.LANCZOS))
        frames[state] = sheet

    widest = max(len(sheet) for sheet in frames.values())
    cell = frames[order[0]][0]
    width = PAD * 2 + LABEL + widest * (cell.width + GAP)
    height = PAD * 2 + len(order) * ROW
    canvas = Image.new("RGBA", (width, height), BACKDROP)
    draw = ImageDraw.Draw(canvas)
    title, subtitle, small = font(24, True), font(17), font(15)

    draw.text((PAD, PAD - 6), "whale-girl · 14 frames · 6 states", font=title, fill=INK)
    draw.text((PAD, PAD + 24), "鲸鱼娘 by ZipZipPipe · sprites from vlln/whale-girl (MIT)", font=subtitle, fill=MUTED)

    top = PAD + 56
    for index, state in enumerate(order):
        sprite = manifest["states"][state]
        y = top + index * ROW
        draw.text((PAD, y + 30), LABELS.get(state, state), font=subtitle, fill=INK)
        draw.text((PAD, y + 58), "%s.png · %d frame%s · %s fps · %s" % (
            sprite["source"], sprite["count"], "" if sprite["count"] == 1 else "s", sprite["fps"], sprite["playback"]), font=small, fill=MUTED)
        for column, frame in enumerate(frames[state]):
            x = PAD + LABEL + column * (frame.width + GAP)
            canvas.alpha_composite(frame, (x, y + (ROW - frame.height) // 2))

    out = os.path.join(repo, "docs", "images", "whale-states.png")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    canvas.convert("RGB").save(out, optimize=True)
    print("wrote %s (%dx%d, %d bytes)" % (out, width, height, os.path.getsize(out)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
