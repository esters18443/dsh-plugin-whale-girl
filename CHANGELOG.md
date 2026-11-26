# Changelog

## 0.1.1 — 2026-11-26

### Added

- The left Workspace tree follows a switcher jump. After the whale opens a Session, its Workspace group unfolds when the user had folded it and the row moves to the middle of the tree viewport when space allows (clamped at the list ends) — the browser's own search-reveal treatment plus centring, which DSH does not yet expose as a public navigation API. The assist reads the Workspace browser's stable row markers, clicks only a header that reports `aria-expanded="false"`, and quietly does nothing when the markers are absent: a collapsed sidebar rail stays collapsed, ancestors folded in the Workspace-tree grouping are out of reach (untouched groups still auto-expand), and the conversation switch itself never depends on the assist.

### Removed

- The offline preview page (`src/preview.html`, generated `preview/`) and its two real-browser check tools (`tools/ui-browser-check.mjs`, `tools/release-browser-check.mjs`). Changes are verified by the portable Node test suite and by installing the built package into DSH directly, which is how this plugin is accepted in practice.

## 0.1.0 — 2026-11-25

Initial release of the reinitialized repository. The plugin ships as **`dsh-plugin-whale-girl`** with entry ID **`whale-girl`** and the English card "Whale Girl".

### Added

- The whale-girl buddy in the DSH window: seven animated states (working, waiting, celebration, error, resting, sleeping and the drag pose) sliced from the [vlln/whale-girl](https://github.com/vlln/whale-girl) sprite sheets (MIT, character by ZipZipPipe), all frames sharing one crop box so the character never shifts or rescales between states.
- Click the whale to open the session switcher (drag either edge to resize it, clamped and persisted); drag her anywhere in the window; right-click her for scope, size and nap-timing settings.
- A working-session counter drawn above the character frame as bare digits, and brief end-of-stretch notices, both kept clear of the art by measured geometry in `tools/prepare-whale-girl.py`.
- A plugin-owned read-only host bridge projecting live turn boundaries through the existing authenticated DSH connection: no model calls, no approval handling, no external listening port, no telemetry; preferences stay in local storage.
- An offline browser preview (`preview/index.html`) generated from the same UI and state machine, plus the release browser check.

### Provenance

This line re-initializes the repository at 0.1.0 and supersedes the earlier public 0.2.x releases and the intermediate private lines; their notes live in the previous repository history. Upgrading from any earlier install still requires the entry-ID steps in [UPGRADE.md](UPGRADE.md).
