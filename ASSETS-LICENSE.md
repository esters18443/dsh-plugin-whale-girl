# Character Asset Licensing

## Source and Ownership

The character art in this plugin comes from the open-source project [vlln/whale-girl](https://github.com/vlln/whale-girl) (MIT license, Copyright (c) 2026 Sam Gao (vlln)). The character **鲸鱼娘** (whale-girl) was created by **ZipZipPipe** (<https://space.bilibili.com/4168597>), and the sprite set in that project is drawn from that character.

The copies in this repository are slices of that project's sprite strips, pinned to commit `4fe5792c6f873c6b3a29dd12198ba47a397e17f3`, with these changes:

- split into single-frame PNGs per state (the originals are horizontal strips);
- every frame cropped to one shared visible box, so the character does not jump when the state changes;
- re-compressed losslessly;
- `assets/icon.png`, the plugin-manager icon, is the waiting frame (`assets/sprites/whale-girl/waiting-0.png`) scaled onto a rounded light plate; no pixels are redrawn, so it carries the same attribution as the frames.

The whole pipeline is reproducible:

```bash
python tools/prepare-whale-girl.py                # lossless true colour, about 1.0 MB for 14 frames
python tools/prepare-whale-girl.py --colors 256   # optional: 256-colour palette, about 0.2 MB
```

## Permission for Use and Distribution in This Project

The upstream project is MIT-licensed, and those terms cover the character art in this repository: keep the attribution above and the upstream MIT notice when you redistribute this plugin or the art embedded in it.

### Upstream license text, quoted from the pinned commit

The notice that must travel with any copy or substantial portion of the art (verbatim from upstream `LICENSE` at commit `4fe5792c6f873c6b3a29dd12198ba47a397e17f3`):

```text
MIT License

Copyright (c) 2026 Sam Gao (vlln)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

This notice grants no trademark or exclusive rights to the character design. For use beyond the scope of this project, obtain separate permission from the relevant rights holder.

## Separate from the Code License

This project's code is released under the MIT license, and the character art likewise comes from an MIT-licensed upstream project. The rights to the 鲸鱼娘 character design itself remain with its author, ZipZipPipe.

Fonts are governed by their own licenses, separately from the character art (see [FONT-LICENSES.md](FONT-LICENSES.md)).

## Unofficial Project

This is a personal, independently developed project, not an official DeepSeek product. It does not represent DeepSeek's official position or imply endorsement by DeepSeek, and it is not an official plugin of the whale-girl project.
