import test from 'node:test';
import assert from 'node:assert/strict';
import { sessionRows } from '../src/session-list.js';

const catalog = byId => ({ phase: 'ready', byId });
const statuses = entries => new Map(entries);

test('switcher rows lead with waiting and running work, then newest first', () => {
  const rows = sessionRows(
    catalog({
      idle_new: { id: 'idle_new', title: 'New idle', updatedAt: 500 },
      idle_old: { id: 'idle_old', title: 'Old idle', updatedAt: 100 },
      run: { id: 'run', title: 'Running', updatedAt: 200 },
      wait: { id: 'wait', title: 'Waiting', updatedAt: 300 },
    }),
    statuses([['run', { running: true }], ['wait', { running: true, pendingInteraction: { id: 'ask' } }]]),
    { items: [], archivedSessionIds: [] },
    'idle_new',
  );
  assert.deepEqual(rows.map(row => row.id), ['wait', 'run', 'idle_new', 'idle_old']);
  assert.deepEqual(rows.map(row => [row.waiting, row.running, row.current]), [
    [true, true, false], [false, true, false], [false, false, true], [false, false, false],
  ]);
});

test('subagent, blank and archived sessions never become switch targets', () => {
  const rows = sessionRows(
    catalog({
      main: { id: 'main', title: 'Main', updatedAt: 1 },
      child: { id: 'child', title: 'Child', origin: 'subagent', updatedAt: 9 },
      draft: { id: 'draft', blank: true, updatedAt: 9 },
      archived: { id: 'archived', title: 'Archived', updatedAt: 9 },
    }),
    new Map(),
    { items: [], archivedSessionIds: ['archived'] },
    undefined,
  );
  assert.deepEqual(rows.map(row => row.id), ['main']);
});

test('workspace titles annotate rows and unread completions are flagged', () => {
  const rows = sessionRows(
    catalog({ a: { id: 'a', title: '  Spaced title  ', updatedAt: 5 }, b: { id: 'b', updatedAt: 5 } }),
    statuses([['b', { running: false, completionUnread: true }]]),
    { items: [{ title: 'proj', sessionIds: ['a', 'b'] }, { title: 'other', sessionIds: ['a'] }], archivedSessionIds: [] },
    'b',
  );
  assert.deepEqual(rows.map(row => ({ id: row.id, title: row.title, workspace: row.workspace, unread: row.unread, current: row.current })), [
    { id: 'a', title: 'Spaced title', workspace: 'proj', unread: false, current: false },
    { id: 'b', title: '', workspace: 'proj', unread: true, current: true },
  ]);
});

test('a missing workspace snapshot still lists sessions without annotations', () => {
  const rows = sessionRows(catalog({ a: { id: 'a', title: 'Solo', updatedAt: 7 } }), undefined, undefined, 'a');
  assert.deepEqual(rows, [{ id: 'a', title: 'Solo', workspace: '', running: false, waiting: false, unread: false, current: true, updatedAt: 7 }]);
});
