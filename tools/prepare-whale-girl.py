#!/usr/bin/env python3
"""Slice the whale-girl sprite sheets into the plugin states.

Source: https://github.com/vlln/whale-girl (MIT, character by ZipZipPipe).
The sheets are horizontal strips of 256x256 frames. Every frame of every state is
cropped with one shared box, so the character never changes scale between states.

Run from the repository root:

    python tools/prepare-whale-girl.py
    python tools/prepare-whale-girl.py --colors 128 --report-quality

Writes assets/sprites/<state>-<n>.png and assets/sprites/manifest.json.
Downloads (and caches) the pinned upstream commit, so the result is reproducible.
"""

import argparse
import json
import os
import sys
import urllib.request

from PIL import Image

COMMIT = "4fe5792c6f873c6b3a29dd12198ba47a397e17f3"
BASE = "https://raw.githubusercontent.com/vlln/whale-girl/%s/lib/assets/characters/whale-girl" % COMMIT
FRAME = 256
PAD = 1
ALPHA_FLOOR = 8

# state -> (upstream sheet, frames, fps, playback) taken from the upstream manifest
STATES = {
    "resting": ("idle", 3, 2, "blink"),
    "working": ("working", 3, 3, "loop"),
    "waiting": ("wait", 1, 2, "loop"),
    "celebrate": ("celebrate", 3, 4, "loop"),
    "error": ("error", 2, 8, "once"),
    "sleeping": ("sleep", 2, 1, "loop"),
    "drag": ("drag", 1, 2, "loop"),
}
ORDER = ["resting", "working", "waiting", "celebrate", "sleeping", "error", "drag"]

CREDIT = {
    "name": "鲸鱼娘",
    "credit": "ZipZipPipe",
    "creditUrl": "https://space.bilibili.com/4168597",
    "project": "vlln/whale-girl",
    "projectUrl": "https://github.com/vlln/whale-girl",
    "license": "MIT",
    "copyright": "Copyright (c) 2026 Sam Gao (vlln)",
    "commit": COMMIT,
    "modified": "统一裁切并压缩为插件用的单帧 PNG；状态映射见 states",
}


def fetch(url, path):
    if os.path.exists(path) and os.path.getsize(path) > 1000:
        return path
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with urllib.request.urlopen(url, timeout=60) as response:
        data = response.read()
    if len(data) < 1000:
        raise SystemExit("download too small: %s" % url)
    with open(path, "wb") as handle:
        handle.write(data)
    return path


def frames_of(image, count):
    return [image.crop((i * FRAME, 0, (i + 1) * FRAME, FRAME)) for i in range(count)]


def shared_box(sheets):
    """One crop box covering the visible character in every used frame."""
    boxes = []
    for frames in sheets.values():
        for frame in frames:
            boxes.append(frame.getchannel("A").point(lambda v: 255 if v > ALPHA_FLOOR else 0).getbbox())
    left = max(0, min(box[0] for box in boxes) - PAD)
    top = max(0, min(box[1] for box in boxes) - PAD)
    right = min(FRAME, max(box[2] for box in boxes) + PAD)
    bottom = min(FRAME, max(box[3] for box in boxes) + PAD)
    return (left, top, right, bottom)


def bulb_box(frames):
    """Where the session counter belongs: the light bulb the working pose draws.

    The count is drawn above that bulb, so its box is measured from the art instead of guessed:
    design units are the frame size halved, matching the counter's SVG viewBox. Isolated glow
    pixels are dropped so the box is the bulb itself and not its faint halo.
    """
    boxes = []
    for frame in frames:
        yellow = set()
        for y in range(frame.height):
            for x in range(frame.width):
                r, g, b, a = frame.getpixel((x, y))
                if a > 180 and r > 200 and g > 160 and b < 150 and (r + g) / 2 - b > 60:
                    yellow.add((x, y))
        solid = {p for p in yellow if sum(((p[0] + dx, p[1] + dy) in yellow)
                                          for dx in (-1, 0, 1) for dy in (-1, 0, 1)) >= 3}
        if not solid:
            raise SystemExit("no light bulb found in the working frames: the counter anchor needs re-tuning by hand")
        xs = [p[0] for p in solid]
        ys = [p[1] for p in solid]
        boxes.append((min(xs) / 2, min(ys) / 2, (max(xs) + 1) / 2, (max(ys) + 1) / 2))
    box = [round(sum(b[index] for b in boxes) / len(boxes), 1) for index in range(4)]
    print("light bulb boxes (frame px): %s" % ", ".join(
        "(%.0f, %.0f)-(%.0f, %.0f)" % tuple(v * 2 for v in b) for b in boxes))
    return box


def bulb_top(frames, bulb):
    """The topmost pixel the bulb draws in its own column band, rays and halo included.

    The counter is drawn above this line, so nothing of the bulb ever sits under the digits.
    """
    left = max(0, int(bulb[0] * 2) - 4)
    right = int(bulb[2] * 2) + 4
    rows = []
    for frame in frames:
        for y in range(frame.height):
            if any(frame.getpixel((x, y))[3] > 40 for x in range(left, min(frame.width, right))):
                rows.append(y)
                break
    return round(sum(rows) / len(rows) / 2, 1)


def error_against(original, quantized):
    """Mean and max per-channel RGB error over visible pixels, alpha error included."""
    a = original.convert("RGBA")
    b = quantized.convert("RGBA")
    box = a.getchannel("A").point(lambda v: 255 if v > ALPHA_FLOOR else 0).getbbox()
    a = a.crop(box)
    b = b.crop(box)
    aw, ah = a.getdata(), b.getdata()
    total = maximum = 0
    count = 0
    for (r1, g1, b1, a1), (r2, g2, b2, a2) in zip(aw, ah):
        for x, y in ((r1, r2), (g1, g2), (b1, b2), (a1, a2)):
            delta = abs(x - y)
            total += delta
            maximum = max(maximum, delta)
            count += 1
    return total / count, maximum


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", default=os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    parser.add_argument("--cache", default=None, help="download cache (default <repo>/.cache/whale-girl)")
    parser.add_argument("--colors", type=int, default=0, help="palette size; 0 keeps truecolor")
    parser.add_argument("--report-quality", action="store_true")
    args = parser.parse_args()

    repo = args.repo
    cache = args.cache or os.path.join(repo, ".cache", "whale-girl")
    out = os.path.join(repo, "assets", "sprites")
    frames_dir = os.path.join(out, "whale-girl")

    sheets = {}
    for state, (sheet, count, _fps, _playback) in STATES.items():
        path = fetch("%s/%s.png" % (BASE, sheet), os.path.join(cache, "%s.png" % sheet))
        image = Image.open(path).convert("RGBA")
        if image.size != (FRAME * count, FRAME):
            raise SystemExit("%s is %sx%s, expected %sx%s" % (sheet, image.size[0], image.size[1], FRAME * count, FRAME))
        sheets[state] = frames_of(image, count)

    box = shared_box(sheets)
    if args.report_quality:
        print("shared crop box %s -> frame %dx%d" % (box, box[2] - box[0], box[3] - box[1]))

    os.makedirs(frames_dir, exist_ok=True)
    for stale in os.listdir(frames_dir):
        if stale.endswith(".png"):
            os.remove(os.path.join(frames_dir, stale))

    states, cropped_frames, total, worst = {}, {}, 0, (0.0, 0)
    for state in ORDER:
        _sheet, count, fps, playback = STATES[state]
        names = []
        for index, frame in enumerate(sheets[state]):
            cropped = frame.crop(box)
            cropped_frames.setdefault(state, []).append(cropped)
            saved = cropped
            if args.colors > 0:
                saved = cropped.quantize(colors=args.colors, method=Image.FASTOCTREE)
            name = "whale-girl/%s-%d.png" % (state, index)
            path = os.path.join(out, "whale-girl", "%s-%d.png" % (state, index))
            saved.save(path, optimize=True)
            size = os.path.getsize(path)
            total += size
            names.append(name)
            if args.report_quality and args.colors > 0:
                mean, maximum = error_against(cropped, saved)
                worst = (max(worst[0], mean), max(worst[1], maximum))
            print("  %-18s %6d bytes" % (name, size))
        states[state] = {"frames": names, "count": count, "fps": fps, "playback": playback, "source": _sheet}

    bulb = bulb_box(cropped_frames["working"])
    manifest = {"character": dict(CREDIT), "states": states, "order": ORDER,
                "counter": {"viewBox": [(box[2] - box[0]) / 2, (box[3] - box[1]) / 2],
                            "bulb": bulb,
                            "bulbTop": bulb_top(cropped_frames["working"], bulb),
                            "anchor": [round((bulb[0] + bulb[2]) / 2, 1), round((bulb[1] + bulb[3]) / 2, 1)],
                            "source": "light bulb in the working frames; the counter is drawn above bulbTop"}}
    with open(os.path.join(out, "manifest.json"), "w", encoding="utf-8") as handle:
        json.dump(manifest, handle, ensure_ascii=False, indent=2)
        handle.write("\n")

    print("\nframe %dx%d, %d files, %d bytes total (%.1f KiB)" % (
        box[2] - box[0], box[3] - box[1], sum(len(s["frames"]) for s in states.values()), total, total / 1024))
    if args.report_quality and args.colors > 0:
        print("palette %d colors: mean channel error %.3f, max %d" % (args.colors, worst[0], worst[1]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
