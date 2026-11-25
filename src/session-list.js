/**
 * Pure session projection shared by the live plugin, the offline preview and the tests.
 * No DOM, no storage, no navigation: the widget renders whatever this returns.
 */

/**
 * Main-session rows for the switcher: waiting and running work leads, then newest first.
 * Subagent sessions, blank drafts and archived history are never switch targets.
 */
export function sessionRows(catalog, statuses, workspaces, currentSessionId) {
  const archived = new Set(workspaces?.archivedSessionIds || []);
  const workspaceTitles = new Map();
  for (const workspace of workspaces?.items || []) {
    for (const id of workspace?.sessionIds || []) {
      if (!workspaceTitles.has(id)) workspaceTitles.set(id, typeof workspace.title === 'string' ? workspace.title : '');
    }
  }
  const rows = [];
  for (const [id, row] of Object.entries(catalog?.byId || {})) {
    if (!row || row.origin === 'subagent' || row.blank === true || archived.has(id)) continue;
    const status = statuses?.get?.(id);
    const waiting = status?.pendingInteraction != null;
    const running = status?.running === true || row.running === true;
    rows.push({
      id,
      title: typeof row.title === 'string' ? row.title.trim() : '',
      workspace: workspaceTitles.get(id) || '',
      running, waiting,
      unread: status?.completionUnread === true,
      current: id === currentSessionId,
      updatedAt: Number.isFinite(row.updatedAt) ? row.updatedAt : 0,
    });
  }
  const rank = row => (row.waiting ? 0 : row.running ? 1 : 2);
  rows.sort((a, b) => (rank(a) - rank(b)) || (b.updatedAt - a.updatedAt) || (a.id < b.id ? -1 : 1));
  return rows;
}
