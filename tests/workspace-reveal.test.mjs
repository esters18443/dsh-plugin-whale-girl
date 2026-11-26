import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkspaceReveal, workspaceIdOfSession } from '../src/workspace-reveal.js';

// Minimal tree fixture: row keys map to state objects, elements are cached per
// key so tests can inspect the clicks and scrolls the assist performed, and
// every selector the assist looks up is recorded.
function treeFixture(entries = {}) {
  const rows = new Map(Object.entries(entries));
  const nodes = new Map();
  const queried = [];
  const unescape = value => value.replace(/\\(.)/g, '$1');
  const element = key => {
    if (!rows.has(key)) return null;
    if (!nodes.has(key)) {
      const state = rows.get(key);
      const node = {
        key,
        scrolled: null,
        clicks: 0,
        getAttribute(name) { return name === 'aria-expanded' ? state.expanded ?? null : null; },
        scrollIntoView(options) { node.scrolled = options ?? null; state.onScroll?.(); },
        click() { node.clicks += 1; state.onClick?.(); },
      };
      nodes.set(key, node);
    }
    return nodes.get(key);
  };
  const document = {
    querySelector(selector) {
      queried.push(selector);
      const match = selector.match(/^\[data-row-key="(.*)"\]$/);
      return match ? element(unescape(match[1])) : null;
    },
  };
  return { document, rows, queried, element };
}

// Hand-stepped frame scheduler: reveal loops advance only through flush().
function scheduler() {
  const pending = [];
  const requestFrame = callback => { pending.push(callback); return pending.length; };
  const flush = () => { while (pending.length > 0) pending.shift()(); };
  return { requestFrame, flush, get size() { return pending.length; } };
}

test('workspace resolver reads the pure Workspace snapshot the switcher already holds', () => {
  const workspaces = { items: [
    { workspaceId: 'w1', sessionIds: ['a', 'b'] },
    { workspaceId: 'w2', sessionIds: ['c'] },
  ] };
  assert.equal(workspaceIdOfSession(workspaces, 'b'), 'w1');
  assert.equal(workspaceIdOfSession(workspaces, 'c'), 'w2');
  assert.equal(workspaceIdOfSession(workspaces, 'missing'), undefined);
  assert.equal(workspaceIdOfSession(undefined, 'a'), undefined);
  assert.equal(workspaceIdOfSession({}, 'a'), undefined);
});

test('a rendered row is centred in the tree viewport and the loop stops without extra frames', () => {
  const frames = scheduler();
  const fixture = treeFixture({ 'session:a': {} });
  const reveal = createWorkspaceReveal({ document: fixture.document, requestFrame: frames.requestFrame });
  reveal.reveal('a', 'w1');
  assert.deepEqual(fixture.queried, ['[data-row-key="session:a"]']);
  frames.flush();
  assert.deepEqual(fixture.element('session:a').scrolled, { block: 'center' }, 'the row is centred when space allows, clamped at the list ends');
  assert.equal(frames.size, 0, 'no further frames are scheduled after the row lands');
});

test('a folded Workspace group is unfolded once and the row then scrolls into view', () => {
  const frames = scheduler();
  // The row does not exist until the unfold click re-renders the group.
  const fixture = treeFixture({
    'workspace:w1': { expanded: 'false', onClick: () => fixture.rows.set('session:s1', {}) },
  });
  const reveal = createWorkspaceReveal({ document: fixture.document, requestFrame: frames.requestFrame });
  reveal.reveal('s1', 'w1');
  frames.flush();
  assert.equal(fixture.element('workspace:w1').clicks, 1, 'the folded header is clicked exactly once');
  assert.deepEqual(fixture.element('session:s1').scrolled, { block: 'center' }, 'the row appears after the unfold and lands centred');
  assert.deepEqual(fixture.queried, [
    '[data-row-key="session:s1"]',
    '[data-row-key="workspace:w1"]',
    '[data-row-key="session:s1"]',
  ], 'one miss, the header lookup, then the row again after the unfold');
  assert.equal(frames.size, 0);
});

test('an expanded group whose row is missing only waits and never clicks', () => {
  const frames = scheduler();
  const fixture = treeFixture({ 'workspace:w1': { expanded: 'true' } });
  const reveal = createWorkspaceReveal({ document: fixture.document, requestFrame: frames.requestFrame });
  reveal.reveal('missing', 'w1');
  frames.flush();
  assert.equal(fixture.element('workspace:w1').clicks, 0);
  assert.equal(frames.size, 0, 'the loop gives up after its bounded frames');
});

test('the loop is bounded even when nothing is found', () => {
  const frames = scheduler();
  const fixture = treeFixture({});
  const reveal = createWorkspaceReveal({ document: fixture.document, requestFrame: frames.requestFrame, maxFrames: 3 });
  reveal.reveal('s');
  frames.flush();
  assert.equal(fixture.queried.length, 3, 'exactly maxFrames lookups of the session row');
  assert.equal(frames.size, 0);
});

test('a missing header or document is a silent no-op', () => {
  const frames = scheduler();
  const fixture = treeFixture({});
  const reveal = createWorkspaceReveal({ document: fixture.document, requestFrame: frames.requestFrame });
  reveal.reveal('s', 'nowhere');
  frames.flush();
  assert.equal(fixture.element('workspace:nowhere'), null, 'a missing header is looked up, never conjured or clicked');
  const disabled = createWorkspaceReveal({ requestFrame: frames.requestFrame });
  disabled.reveal('s', 'w');
  disabled.reveal('', 'w');
  disabled.reveal(null);
  assert.equal(frames.size, 0);
});

test('a newer jump supersedes the loop of an older one', () => {
  const frames = scheduler();
  const fixture = treeFixture({ 'session:b': {} });
  const reveal = createWorkspaceReveal({ document: fixture.document, requestFrame: frames.requestFrame });
  reveal.reveal('a');
  assert.equal(frames.size, 1, 'the first miss schedules one follow-up frame');
  reveal.reveal('b');
  assert.deepEqual(fixture.element('session:b').scrolled, { block: 'center' }, 'the newer jump lands immediately');
  const afterNewJump = fixture.queried.length;
  frames.flush();
  assert.equal(fixture.queried.length, afterNewJump, 'the superseded loop never touches the tree again');
  assert.equal(frames.size, 0);
});

test('cancel stops an in-flight loop', () => {
  const frames = scheduler();
  const fixture = treeFixture({});
  const reveal = createWorkspaceReveal({ document: fixture.document, requestFrame: frames.requestFrame });
  reveal.reveal('s');
  assert.equal(frames.size, 1);
  reveal.cancel();
  const before = fixture.queried.length;
  frames.flush();
  assert.equal(fixture.queried.length, before);
});

test('selector hazards in session ids stay literal', () => {
  const frames = scheduler();
  const fixture = treeFixture({ 'session:a"b': {} });
  const reveal = createWorkspaceReveal({ document: fixture.document, requestFrame: frames.requestFrame });
  reveal.reveal('a"b');
  frames.flush();
  assert.deepEqual(fixture.element('session:a"b').scrolled, { block: 'center' });
});

test('rows without the expected geometry and throwing clicks never escape the loop', () => {
  const frames = scheduler();
  const document = {
    querySelector: selector => (selector === '[data-row-key="session:a"]' ? { getAttribute: () => null, click() {} } : null),
  };
  const reveal = createWorkspaceReveal({ document, requestFrame: frames.requestFrame });
  assert.doesNotThrow(() => { reveal.reveal('a'); frames.flush(); });
  const hostile = treeFixture({ 'workspace:w': { expanded: 'false', onClick: () => { throw new Error('PRIVATE'); } } });
  const hostileReveal = createWorkspaceReveal({ document: hostile.document, requestFrame: frames.requestFrame });
  assert.doesNotThrow(() => { hostileReveal.reveal('s', 'w'); frames.flush(); });
  assert.equal(hostile.element('workspace:w').clicks, 1, 'the click happened once, its failure only ends the loop');
});

test('an unassigned Workspace id skips the header lookup entirely', () => {
  const frames = scheduler();
  const fixture = treeFixture({ 'workspace:': { expanded: 'false' } });
  const reveal = createWorkspaceReveal({ document: fixture.document, requestFrame: frames.requestFrame });
  reveal.reveal('s', undefined);
  frames.flush();
  assert.deepEqual(fixture.queried.filter(selector => selector.startsWith('[data-row-key="workspace:"]')), [], 'no Workspace membership means no header click');
});
