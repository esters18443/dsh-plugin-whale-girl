/**
 * Best-effort "land the left Workspace tree on the jump" assist.
 *
 * Picking a row in the whale's switcher calls the public uiWorkspace
 * openSession navigation: the conversation switches and the tree re-highlights
 * the row it already renders. What DSH never exposes is the browser's own
 * search-reveal treatment — unfold a Workspace group the user folded and
 * scroll the row into view — so a jump into a folded or far-away group reads
 * as the left tree ignoring the switch. That treatment is browser-internal
 * state with no public navigation API, so this assist reads the tree's own
 * stable row markers and degrades to a no-op whenever they are missing: a
 * reshaped tree never breaks the whale, and the switch itself has already
 * happened through the public contract before the assist runs.
 *
 * Boundaries, by design:
 * - one unfold per jump (the Session's direct Workspace group); ancestors
 *   folded in the opt-in Workspace-tree grouping stay out of reach, and the
 *   browser's own current-session auto-expansion still covers untouched ones;
 * - a collapsed sidebar rail stays collapsed;
 * - rows are located through the browser's `data-row-key` markers and a
 *   header's `aria-expanded` state; nothing else is read or clicked.
 */

/** The Workspace browser stamps `session:<id>` on Session rows. */
const sessionRowKey = sessionId => `session:${sessionId}`;
/** Group headers carry `workspace:<id>`; the Ungrouped bucket's key is empty. */
const workspaceRowKey = workspaceId => `workspace:${workspaceId ?? ''}`;

/** Attribute values stay literal: quotes and backslashes are the only selector hazards. */
const selectorFor = key => `[data-row-key="${key.replace(/["\\]/g, '\\$&')}"]`;

/**
 * The Workspace a Session belongs to, from the pure Workspace snapshot the
 * shell's useWorkspaces hook already hands the switcher. First match wins —
 * the same rule sessionRows applies to Workspace titles.
 */
export function workspaceIdOfSession(workspaces, sessionId) {
  for (const workspace of workspaces?.items || []) {
    if (workspace?.sessionIds?.includes(sessionId)) return workspace.workspaceId;
  }
  return undefined;
}

/**
 * One bounded reveal loop per jump. The scheduler drives the next frame, so
 * tests step the loop by hand and the real client uses animation frames; a
 * stale loop stops on the next step the moment a newer jump starts or the
 * plugin cancels the assist.
 * @param options.document - the document to search; absent disables the assist.
 * @param options.requestFrame - frame scheduler; defaults to animation frames.
 * @param options.maxFrames - steps before giving up on a slow tree render.
 */
export function createWorkspaceReveal({ document: doc, requestFrame, maxFrames = 8 } = {}) {
  const view = doc ?? (typeof document === 'undefined' ? null : document);
  const schedule = requestFrame ?? (typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame
    : callback => { setTimeout(callback, 16); });
  let active = 0;
  const find = key => {
    try { return view?.querySelector(selectorFor(key)) ?? null; } catch { return null; }
  };
  return {
    /**
     * Reveal one Session's row after the public switch: unfold its folded
     * Workspace group first, then centre the row in the tree viewport when
     * space allows. Superseded jumps win; a refused or reshaped tree simply
     * times out without any effect.
     */
    reveal(sessionId, workspaceId) {
      if (!view || typeof sessionId !== 'string' || sessionId === '') return;
      const token = ++active;
      let unfolded = false;
      let framesLeft = Math.max(1, maxFrames);
      const step = () => {
        if (token !== active) return;
        const row = find(sessionRowKey(sessionId));
        if (row) {
          // The row lands in the middle of the tree viewport when space allows
          // (scrollIntoView clamps at the list ends, so a row near the top or
          // bottom never drags the list past its own content) — one step beyond
          // the browser's own minimal search reveal, which only guarantees
          // visibility. Horizontal position is untouched (inline stays nearest).
          try { row.scrollIntoView?.({ block: 'center' }); } catch { /* unknown engine */ }
          return;
        }
        if (!unfolded && workspaceId !== undefined) {
          const header = find(workspaceRowKey(workspaceId));
          // `false` means the user folded the group: the browser leaves such a
          // group folded around a new current Session, so the row stays hidden
          // until the header is clicked — the same thing a tap on it does.
          if (header?.getAttribute?.('aria-expanded') === 'false') {
            unfolded = true;
            try { header.click(); } catch { return; }
          }
        }
        if (--framesLeft > 0) schedule(step);
      };
      step();
    },
    /** Stop any in-flight loop; later jumps start fresh. */
    cancel() { active += 1; },
  };
}
