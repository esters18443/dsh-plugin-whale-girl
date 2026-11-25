#!/usr/bin/env python3
"""Subset the speech-bubble fonts to exactly the glyphs the bubble phrases need.

Bubble text is served by tiny per-language WOFF2 subsets recorded in
assets/fonts/manifest.json (see FONT-LICENSES.md for sources and licensing).
When a bubble string changes, rebuild a subset from its pinned upstream font:

    python tools/subset-bubble-fonts.py --lang zh \
        --source /path/to/zcool-kuaile-chinese-simplified-400-normal.woff \
        --family "Whale Bubble Han" --ps "WhaleBubbleHan-Regular" \
        --unique-id "WhaleBubbleHan-ZCOOLKuaiLe-Subset-1"

The tool parses src/i18n.js for the bubble keys (state.* / working.* /
celebrate.* / error.* / pet.greeting), assigns each required character to the
language font that already covers it (characters outside the English font's
coverage fall to the Chinese font), subsets the source, renames the family for
the modified-font OFL requirement, writes assets/fonts/bubble-<lang>.woff2 and
refreshes manifest.json (bytes, sha256, codepoints). Requires fonttools+brotli.
"""

import argparse
import hashlib
import json
import re
import sys

from fontTools import subset
from fontTools.ttLib import TTFont

I18N_PATH = "src/i18n.js"
MANIFEST_PATH = "assets/fonts/manifest.json"
BUBBLE_KEY = re.compile(r"'((?:state|working|celebrate|error)\.[A-Za-z]+|pet\.greeting)':\s*'((?:[^'\\]|\\.)*)'")


def required_characters():
    """Every character used by a bubble phrase, in either language."""
    with open(I18N_PATH, encoding="utf-8") as handle:
        source = handle.read()
    characters = set()
    for _, value in BUBBLE_KEY.findall(source):
        characters.update(value.replace("\\'", "'").replace("\\\\", "\\"))
    if not characters:
        raise SystemExit("no bubble phrases found in %s" % I18N_PATH)
    return characters


def set_name(font, name_id, value):
    font["name"].setName(value, name_id, 3, 1, 0x409)


def rebuild(language, source_path, family, ps, unique_id, manifest):
    entry = next(font for font in manifest["fonts"] if font["language"] == language)
    other = next(font for font in manifest["fonts"] if font["language"] != language)
    other_coverage = set(other["codepoints"])

    needed = {character for character in required_characters() if ord(character) not in other_coverage}
    unicodes = sorted({ord(character) for character in needed} | set(entry["codepoints"]))

    font = TTFont(source_path)
    options = subset.Options()
    options.flavor = "woff2"
    options.name_IDs = ["*"]
    options.notdef_outline = True
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=unicodes)
    subsetter.subset(font)

    set_name(font, 1, family)
    set_name(font, 2, "Regular")
    set_name(font, 3, unique_id)
    set_name(font, 4, "%s Regular" % family)
    set_name(font, 6, ps)
    set_name(font, 16, family)
    set_name(font, 17, "Regular")

    font.flavor = "woff2"
    output = "assets/fonts/%s" % entry["file"]
    font.save(output)

    with open(output, "rb") as handle:
        data = handle.read()
    cmap = TTFont(output).getBestCmap()
    missing = [character for character in needed if ord(character) not in cmap]
    if missing:
        raise SystemExit("%s subset is missing %r" % (output, missing))

    entry["family"] = family
    entry["postScriptName"] = ps
    entry["bytes"] = len(data)
    entry["sha256"] = hashlib.sha256(data).hexdigest()
    entry["codepoints"] = sorted(unicodes)
    manifest["bubbleCodepoints"] = sorted(
        {codepoint for font_entry in manifest["fonts"] for codepoint in font_entry["codepoints"]})
    return output, len(data), len(unicodes)


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--lang", required=True, help="language entry in assets/fonts/manifest.json (zh or en)")
    parser.add_argument("--source", required=True, help="pinned upstream font file for that language")
    parser.add_argument("--family", default=None, help="internal family name (omit to keep the source family)")
    parser.add_argument("--ps", default=None, help="PostScript name (omit to keep the source name)")
    parser.add_argument("--unique-id", default=None, help="name ID 3 override, e.g. WhaleBubbleHan-ZCOOLKuaiLe-Subset-1")
    args = parser.parse_args()

    with open(MANIFEST_PATH, encoding="utf-8") as handle:
        manifest = json.load(handle)
    entry = next(font for font in manifest["fonts"] if font["language"] == args.lang)
    family = args.family or entry["family"]
    ps = args.ps or entry["postScriptName"]
    unique_id = args.unique_id or "%s-Subset-1" % ps

    output, size, count = rebuild(args.lang, args.source, family, ps, unique_id, manifest)
    with open(MANIFEST_PATH, "w", encoding="utf-8") as handle:
        json.dump(manifest, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    print("%s: %d glyphs, %d bytes (sha256 refreshed in %s)" % (output, count, size, MANIFEST_PATH))
    return 0


if __name__ == "__main__":
    sys.exit(main())
