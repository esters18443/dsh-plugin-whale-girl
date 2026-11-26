import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WhaleWidget } from '../src/widget.js';
import { MESSAGES, translate } from '../src/i18n.js';

const source = readFileSync(new URL('../src/widget.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/pet.css', import.meta.url), 'utf8');

// Minimal DOM fixture exercises the actual constructor/event handlers without a browser.
// Changes are verified by this suite plus direct installation into DSH.
function fixture(t, language = 'en', session = {}, clock = { value: 1000 }, timers = null) {
  let document;
  class Element {
    constructor(tag = 'div') {
      this.tagName = tag; this.attributes = {}; this.dataset = {}; this.children = [];
      this.hidden = false; this.value = ''; this.textContent = ''; this.checked = false;
      this.ownerDocument = document; this.listeners = new Map(); this.captures = new Set();
      this.style = { setProperty(key, value) { this[key] = value; } };
      this.offsetWidth = 156; this.offsetHeight = 156;
    }
    setAttribute(key, value) {
      this.attributes[key] = String(value);
      if (key.startsWith('data-')) this.dataset[key.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = String(value);
      if (key === 'hidden') this.hidden = true;
      if (['min', 'max', 'value'].includes(key)) this[key] = value;
    }
    getAttribute(key) { return this.attributes[key] ?? null; }
    removeAttribute(key) { delete this.attributes[key]; }
    toggleAttribute(key, force) { if (force) this.setAttribute(key, ''); else { this.removeAttribute(key); if (key === 'hidden') this.hidden = false; } }
    append(...nodes) { this.children.push(...nodes); }
    prepend(node) { this.children.unshift(node); }
    remove() {}
    replaceChildren() { this.children = []; }
    cloneNode() { return this; }
    focus() { document.activeElement = this; }
    setPointerCapture(id) { this.captures.add(id); }
    hasPointerCapture(id) { return this.captures.has(id); }
    releasePointerCapture(id) { this.captures.delete(id); }
    addEventListener(type, callback) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(callback); }
    removeEventListener(type, callback) { this.listeners.get(type)?.delete(callback); }
    dispatch(type, details = {}) {
      const event = { detail: 0, preventDefault() {}, stopPropagation() {}, ...details };
      for (const callback of this.listeners.get(type) || []) callback(event);
    }
    querySelectorAll(selector) {
      const matches = node => selector.startsWith('.') ? (node.attributes.class || '').split(' ').includes(selector.slice(1))
        : selector.startsWith('#') ? node.attributes.id === selector.slice(1)
        : selector.startsWith('[') ? Object.hasOwn(node.attributes, selector.slice(1, -1)) : node.tagName === selector;
      return this.children.flatMap(child => [...(matches(child) ? [child] : []), ...child.querySelectorAll(selector)]);
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
    set innerHTML(html) {
      this.content = new Element('fragment');
      for (const [, tag, attributes] of html.matchAll(/<([a-z][\w-]*)\b([^>]*)>/gi)) {
        const node = new Element(tag);
        for (const [, key, value] of attributes.matchAll(/([\w-]+)(?:="([^"]*)")?/g)) node.setAttribute(key, value ?? '');
        this.content.append(node);
      }
    }
  }
  document = new Element('document');
  document.documentElement = new Element('html');
  document.createElement = tag => new Element(tag);
  document.createElementNS = (_namespace, tag) => new Element(tag);
  document.hidden = false;
  const window = new Element('window');
  window.innerWidth = 1100; window.innerHeight = 850;
  document.defaultView = window;
  const globals = { document, window, getComputedStyle: () => ({ getPropertyValue: () => '', paddingBottom: '17', paddingLeft: '9', paddingRight: '9', paddingTop: '20' }), ...(timers || {}) };
  for (const [key, value] of Object.entries(globals)) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; });
  }
  // Any accidental clipboard access fails, even if the implementation catches it.
  let clipboardReads = 0;
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { get clipboard() { clipboardReads++; throw Error('No clipboard access in formal UI'); } } });
  t.after(() => { if (navigatorDescriptor) Object.defineProperty(globalThis, 'navigator', navigatorDescriptor); else delete globalThis.navigator; });
  const saved = [], scopes = [], selections = [];
  const host = new Element(); host.ownerDocument = document;
  host.attachShadow = () => (host.shadowRoot = new Element('shadow'));
  const widget = new WhaleWidget(host, { language, sprites: { name: '鲸鱼娘', credit: 'ZipZipPipe', license: 'MIT' },
    assets: Object.fromEntries(['resting', 'working', 'waiting', 'celebrate', 'sleeping', 'error', 'drag'].map(state => [state, { frames: [`${state}-0.png`, `${state}-1.png`], fps: 2, playback: 'loop' }])), css,
    random: () => 0.5,
    storage: { getItem: () => null, setItem: (_key, value) => saved.push(JSON.parse(value)) }, now: () => clock.value, onScopeChange: scope => scopes.push(scope),
    canOpenSessions: session.list === true, onSelectSession: id => selections.push(id) });
  t.after(() => { widget.dispose(); assert.equal(clipboardReads, 0); });
  return { widget, document, window, saved, scopes, selections, clock };
}

test('formal widget has no diagnostic/test controls, collectors, clipboard or telemetry paths', () => {
  assert.doesNotMatch(source, /diagnostic|clipboard|execCommand|permissions\.query|telemetry|data-action|test-button|<textarea/i);
  assert.doesNotMatch(css, /diagnostic|textarea/i);
  assert.doesNotMatch(Object.getOwnPropertyNames(WhaleWidget.prototype).join(' '), /diagnostic|copy|refresh/i);
  assert.match(css, /\.panel\{[^}]*max-width:calc\(100vw - 24px\);[^}]*max-height:calc\(100vh - 80px\);overflow:auto/);
  assert.match(css, /\.setting option::checkmark\{order:1;margin-left:auto/);
  assert.match(css, /\.panel button:focus-visible,\.panel input:focus-visible,\.panel select:focus-visible\{/);
});

test('the character player steps frames, rests on frame 0 and reports its credit', t => {
  const pending = new Map(); let next = 0;
  const setTimeout = (fn, delay) => { pending.set(++next, { fn, delay }); return next; };
  const clearTimeout = key => { pending.delete(key); };
  const fire = key => { const timer = pending.get(key); pending.delete(key); timer.fn(); };
  const { widget: w } = fixture(t, 'en', {}, { value: 1000 }, { setTimeout, clearTimeout });
  const frames = w.assets[w.pet.dataset.state].frames;
  assert.equal(frames.length, 2);
  assert.equal(w.image.src, frames[0]);
  const armed = [...pending.entries()];
  assert.equal(armed.length, 1, 'a moving state arms exactly one frame timer');
  assert.equal(armed[0][1].delay, 500, 'fps 2 waits half a second per frame');
  fire(armed[0][0]);
  assert.equal(w.image.src, frames[1]);
  assert.equal(pending.size, 1, 'a looping state keeps animating');
  w.syncFrames();
  assert.equal(pending.size, 1, 'the frame player always animates: the OS motion setting is ignored');
  w.preferences.hidden = true; w.applyPreferences();
  assert.equal(pending.size, 0, 'a hidden pet stops animating');
  assert.equal(w.credit.hidden, false);
  assert.match(w.credit.textContent, /ZipZipPipe/);
});

test('the session counter rides on the painted character, not on the padded art box', t => {
  const { widget: w } = fixture(t);
  // A portrait frame inside this box leaves object-fit gutters on both sides.
  w.art.getBoundingClientRect = () => ({ width: 138, height: 119 });
  w.image.naturalWidth = 204; w.image.naturalHeight = 228;
  w.paintArtBox();
  assert.equal(w.pet.style['--art-width'], '77.155%');
  assert.equal(w.pet.style['--art-height'], '100.000%');
  // A landscape frame keeps its own gutters instead.
  w.image.naturalWidth = 400; w.image.naturalHeight = 100;
  w.paintArtBox();
  assert.equal(w.pet.style['--art-width'], '100.000%');
  assert.equal(w.pet.style['--art-height'], '28.992%');
  // Nothing is anchored before the art is decoded or laid out.
  w.image.naturalWidth = 0; w.paintArtBox();
  assert.equal(w.pet.style['--art-width'], '100.000%');
  // The old 116×89 rule would shrink the working pose inside its own state.
  assert.doesNotMatch(css, /aspect-ratio:116\/89/);
  assert.match(source, /viewBox="0 0 103 114"/);
});

test('the counter sits above the light bulb the working frames actually draw', () => {
  const { counter } = JSON.parse(readFileSync(new URL('../assets/sprites/manifest.json', import.meta.url), 'utf8'));
  const glyph = source.match(/<text class="working-count-text" x="(-?[\d.]+)" y="(-?[\d.]+)"/);
  assert.ok(glyph, 'the counter glyph must be in the template');
  const [x, y] = glyph.slice(1).map(Number);
  const [, , bulbRight] = counter.bulb;
  const bulbCentre = (counter.bulb[0] + bulbRight) / 2;
  const fontSize = Number(css.match(/\.working-count-text\{[^}]*font-size:([\d.]+)px/)[1]);
  // No plate: one used to overlap the bulb, so the digits stand on their own above it.
  assert.doesNotMatch(source, /working-count-plate/);
  assert.doesNotMatch(css, /working-count-plate/);
  // The bulb draws up to bulbTop inside the character's frame, and the bulb has its own rays above
  // its glass, so the digits are drawn above the whole frame: inside it there is no room left.
  assert.ok(y + fontSize / 2 <= 0, `the digits end at ${y + fontSize / 2}, still inside the character's frame`);
  assert.ok(y + fontSize / 2 + 1.2 <= counter.bulbTop,
    `the digits' outline ends at ${(y + fontSize / 2 + 1.2).toFixed(1)}, over the bulb that draws up to ${counter.bulbTop}`);
  assert.ok(counter.bulbTop - (y + fontSize / 2 + 1.2) <= 4,
    `the digits float ${(counter.bulbTop - (y + fontSize / 2 + 1.2)).toFixed(1)} units above the bulb's rays`);
  assert.match(css, /\.working-count\{[^}]*overflow:visible/, 'the digits are drawn outside the frame and must not be clipped');
  assert.ok(Math.abs(x - bulbCentre) <= 1, `the digits are centred at ${x}, the bulb at ${bulbCentre}`);
  // One colour cannot serve an unknown background: a light glyph carries a dark outline.
  assert.match(css, /\.working-count-text\{[^}]*fill:#fff/);
  assert.match(css, /\.working-count-text\{[^}]*stroke:#1b2544/);
  assert.match(css, /\.working-count-text\{[^}]*paint-order:stroke/);
  assert.ok(fontSize >= 9, `a count that small cannot be read: ${fontSize}px`);
});

for (const language of ['en', 'zh']) {
  test(`${language} formal menu exposes only ordinary localized accessible controls`, t => {
    const { widget } = fixture(t, language);
    const buttons = widget.root.querySelectorAll('button');
    assert.deepEqual(buttons.map(button => button.getAttribute('class')), ['pet-button', 'close', 'action reset', 'action hide', 'close', 'restore']);
    assert.deepEqual(widget.root.querySelectorAll('input').map(input => input.getAttribute('id')), ['whale-size', 'whale-filter']);
    assert.deepEqual(widget.root.querySelectorAll('select').map(select => select.getAttribute('id')), ['whale-scope', 'whale-sleep']);
    for (const node of widget.root.querySelectorAll('[data-i18n]')) assert.equal(node.textContent, MESSAGES[language][node.dataset.i18n]);
    for (const node of widget.root.querySelectorAll('[data-i18n-aria]')) assert.equal(node.getAttribute('aria-label'), MESSAGES[language][node.dataset.i18nAria]);
    assert.equal(widget.panel.getAttribute('role'), 'dialog');
    assert.equal(widget.root.querySelector('#whale-motion'), null, 'the gentle-animations switch is gone');
    assert.equal(widget.panel.hidden, true);
    widget.button.dispatch('click');
    assert.equal(widget.panel.hidden, false);
    assert.equal(widget.root.querySelector('.close'), widget.host.ownerDocument.activeElement);
    widget.root.dispatch('keydown', { key: 'Escape' });
    assert.equal(widget.panel.hidden, true);
    assert.equal(widget.button, widget.host.ownerDocument.activeElement);
  });
}

test('English and Chinese dictionaries stay consistent without diagnostic copy', () => {
  assert.deepEqual(Object.keys(MESSAGES.en).sort(), Object.keys(MESSAGES.zh).sort());
  for (const language of ['en', 'zh']) for (const [key, value] of Object.entries(MESSAGES[language])) {
    assert.ok(value.trim()); assert.equal(translate(language, key), value);
    assert.doesNotMatch(key, /diagnostic|test|copy/i);
    assert.deepEqual(value.match(/\{\w+\}/g), MESSAGES.en[key].match(/\{\w+\}/g));
  }
});

test('ordinary settings, reset, hide/restore, context menu and outside dismissal still work', t => {
  const { widget: w, document, saved, scopes } = fixture(t);
  w.button.dispatch('contextmenu'); assert.equal(w.panel.hidden, false);
  w.scope.value = 'current'; w.scope.dispatch('change'); w.scope.dispatch('change');
  assert.deepEqual(scopes, ['current']); assert.equal(w.preferences.scope, 'current');
  w.range.value = '125'; w.range.dispatch('input'); assert.equal(w.preferences.scale, 1.25); assert.equal(w.range.getAttribute('aria-valuetext'), '125%');
  assert.equal('motion' in w.preferences, false, 'the stored motion preference is dropped');
  w.sleep.value = '30000'; w.sleep.dispatch('change'); assert.equal(w.machine.sleepAfterMs, 30000);
  w.preferences.x = 100; w.preferences.y = 100; w.root.querySelector('.reset').dispatch('click');
  assert.equal(w.preferences.x, null); assert.equal(w.preferences.y, null);
  w.root.querySelector('.hide').dispatch('click'); assert.equal(w.preferences.hidden, true); assert.equal(w.panel.hidden, true); assert.equal(w.pet.hidden, true); assert.equal(w.restore.hidden, false); assert.equal(document.activeElement, w.restore);
  w.restore.dispatch('click'); assert.equal(w.preferences.hidden, false); assert.equal(w.pet.hidden, false); assert.equal(w.restore.hidden, true); assert.equal(document.activeElement, w.button);
  w.button.dispatch('click', { detail: 1 }); assert.equal(w.machine.view(1000).greeting, true);
  w.openPanel(); document.dispatch('pointerdown', { composedPath: () => [] }); assert.equal(w.panel.hidden, true);
  assert.equal(saved.at(-1).hidden, false);
});

test('keyboard movement and pointer dragging preserve capture, position and persistence', t => {
  const { widget: w, saved } = fixture(t);
  const x = w.position.x;
  w.button.dispatch('keydown', { key: 'ArrowLeft', shiftKey: true }); assert.equal(w.position.x, x - 20);
  const origin = { ...w.position };
  w.button.dispatch('pointerdown', { button: 0, isPrimary: true, pointerId: 1, clientX: 100, clientY: 100 });
  assert.equal(w.pet.dataset.dragging, 'true', 'grabbing alone already holds the float pose');
  w.button.dispatch('pointermove', { pointerId: 1, clientX: 80, clientY: 70 });
  assert.equal(w.pet.dataset.dragging, 'true'); assert.equal(w.position.x, origin.x - 20); assert.equal(w.position.y, origin.y - 30);
  w.button.dispatch('pointerup', { pointerId: 1 }); assert.equal(w.drag, null); assert.equal(w.button.hasPointerCapture(1), false); assert.equal(saved.at(-1).x, w.position.x);
  w.button.dispatch('click', { detail: 1 }); assert.equal(w.machine.view(1000).greeting, false);
});

test('a real drag swaps the art to the drag pose and release restores the machine art', t => {
  const { widget: w } = fixture(t);
  w.button.dispatch('pointerdown', { button: 0, isPrimary: true, pointerId: 1, clientX: 100, clientY: 100 });
  assert.equal(w.pet.dataset.dragging, 'true');
  assert.equal(w.pet.dataset.state, 'resting', 'a grab alone keeps the machine art');
  w.button.dispatch('pointermove', { pointerId: 1, clientX: 80, clientY: 70 });
  assert.equal(w.pet.dataset.state, 'drag', 'a real drag holds the drag pose');
  assert.equal(w.image.src, w.assets.drag.frames[0], 'the art shows the upstream drag frame');
  assert.equal(w.pet.dataset.facing, 'left', 'dragging leftward mirrors the pose');
  w.button.dispatch('pointermove', { pointerId: 1, clientX: 120, clientY: 70 });
  assert.equal(w.pet.dataset.facing, 'right', 'dragging rightward keeps the sheet as drawn');
  w.button.dispatch('pointerup', { pointerId: 1 });
  assert.equal(w.pet.dataset.state, 'resting', 'release restores the machine art');
  assert.equal(w.pet.dataset.facing, undefined, 'release returns to the baseline facing');
});

test('dragging holds the upstream drag pose instead of a CSS float or tilt', () => {
  assert.doesNotMatch(css, /whale-float/);
  assert.doesNotMatch(css, /\[data-dragging=true\] \.pet-art\{animation/);
  assert.doesNotMatch(css, /\[data-dragging=true\][^}]*rotate:-3deg/);
  assert.doesNotMatch(css, /\.pet\[data-state=drag\] \.pet-art\{animation/);
  // The pose is drawn thin and diagonal: a static scale keeps it as present as the rest,
  // and the mirror applies while dragging leftward so the stretch follows the drag.
  assert.match(css, /\.pet\[data-state=drag\] \.pet-art\{transform:scale\(1\.12\)\}/);
  assert.match(css, /\.pet\[data-state=drag\]\[data-facing=left\] \.pet-art\{transform:scale\(1\.12\) scaleX\(-1\)\}/);
  // The dimmed ground shadow still sells the lift while the art carries itself.
  assert.match(css, /\.pet\[data-dragging=true\] \.ground\{opacity:\.5\}/);
  assert.match(source, /const state = this\.drag && this\.drag\.moved \? 'drag' : view\.state/);
  // The widget's own paused flag still outranks every animation; the OS
  // reduced-motion setting is deliberately ignored since 0.2.1.
  assert.match(css, /:host\(\[data-paused=true\]\) \*\{animation:none!important/);
  assert.doesNotMatch(css, /prefers-reduced-motion/);
});

test('ordinary snapshots retain working count, waiting, celebration and error behavior', t => {
  const { widget: w } = fixture(t);
  const base = { sessionId: 'release', available: true, running: true, pending: false, workingCount: 2 };
  w.update(base); assert.equal(w.pet.dataset.state, 'working'); assert.equal(w.countText.textContent, '2');
  w.update({ ...base, pending: true }); assert.equal(w.pet.dataset.state, 'waiting'); assert.equal(w.countOverlay.hidden, true);
  w.update({ ...base, workingCount: 1, notice: { id: 'completed', reason: 'completed' } }); assert.equal(w.pet.dataset.state, 'celebrate');
  const messageKey = w.machine.view(1000).noticeKey;
  w.setLanguage('zh'); assert.equal(w.bubbleText.textContent, translate('zh', messageKey)); assert.equal(w.pet.dataset.state, 'celebrate');
  w.update({ ...base, notice: { id: 'error', reason: 'error' } }); assert.equal(w.pet.dataset.state, 'error');
  w.update(base); assert.equal(w.pet.dataset.state, 'working');
});

test('disposal cleans ordinary listeners once and ignores late updates', t => {
  const { widget: w } = fixture(t); let cleanups = 0;
  w.cleanups.push(() => cleanups++); w.dispose(); w.dispose();
  assert.equal(cleanups, 1); assert.equal(w.root.children.length, 0);
  assert.equal(w.button.listeners.get('click').size, 0);
  const snapshot = w.machine.snapshot; w.update({ available: true, running: true }); assert.equal(w.machine.snapshot, snapshot);
});

test('clicking the whale opens the session switcher and a row jumps to that session', t => {
  const { widget: w, selections } = fixture(t, 'en', { list: true });
  w.setSessions([
    { id: 'a', title: 'Alpha', workspace: 'project-a', running: true, waiting: false, unread: false, current: false, updatedAt: 5000 },
    { id: 'b', title: 'Beta', workspace: '', running: false, waiting: false, unread: false, current: true, updatedAt: 1000 },
  ]);
  assert.equal(w.sessionsPanel.hidden, true);
  w.button.dispatch('click', { detail: 1 });
  assert.equal(w.sessionsPanel.hidden, false);
  assert.equal(w.panel.hidden, true);
  const rows = w.sessionList.children;
  assert.deepEqual(rows.map(row => row.getAttribute('class')), ['session-row', 'session-row current']);
  assert.equal(rows[0].querySelectorAll('.session-title')[0].textContent, 'Alpha');
  assert.equal(rows[0].querySelectorAll('.session-workspace')[0].textContent, 'project-a');
  assert.equal(rows[0].getAttribute('aria-label'), 'Alpha. Working');
  assert.equal(rows[1].querySelectorAll('.session-time')[0].textContent, 'just now');
  rows[0].dispatch('click');
  assert.deepEqual(selections, ['a']);
  assert.equal(w.sessionsPanel.hidden, true);
});

test('the switcher resizes from its edges and remembers the width', t => {
  const { widget: w, saved } = fixture(t, 'en', { list: true });
  assert.equal(w.preferences.sessionsWidth, 320, 'the default width is 320px');
  assert.equal(w.sessionsPanel.style.width, '320px');
  w.openSessions();
  w.sessionsPanel.offsetWidth = 320; // the generic fixture element would otherwise report 156
  w.sessionsPanel.getBoundingClientRect = () => ({ left: 400, right: 720 });
  const right = w.root.querySelector('.panel-edge-right');
  right.dispatch('pointerdown', { pointerId: 9, button: 0, isPrimary: true, clientX: 718 });
  right.dispatch('pointermove', { pointerId: 9, clientX: 738 });
  assert.equal(w.sessionsPanel.style.width, '340px', 'dragging the right edge widens the panel');
  right.dispatch('pointerup', { pointerId: 9 });
  assert.equal(saved.at(-1).sessionsWidth, 340, 'the resized width persists');
  w.sessionsPanel.getBoundingClientRect = () => ({ left: 100, right: 420 });
  const left = w.root.querySelector('.panel-edge-left');
  left.dispatch('pointerdown', { pointerId: 9, button: 0, isPrimary: true, clientX: 102 });
  left.dispatch('pointermove', { pointerId: 9, clientX: 82 });
  assert.equal(w.sessionsPanel.style.width, '340px', 'dragging the left edge mirrors the delta');
  left.dispatch('pointerup', { pointerId: 9 });
  right.dispatch('pointerdown', { pointerId: 9, button: 0, isPrimary: true, clientX: 718 });
  right.dispatch('pointermove', { pointerId: 9, clientX: 1200 });
  assert.equal(w.sessionsPanel.style.width, '520px', 'the width clamps at 520px');
  right.dispatch('pointermove', { pointerId: 9, clientX: -800 });
  assert.equal(w.sessionsPanel.style.width, '280px', 'the width clamps at 280px');
  right.dispatch('pointerup', { pointerId: 9 });
  assert.equal(w.sessionsPanel.dataset.resizing, undefined, 'the resizing marker clears');
});

test('the switcher filters by title and workspace and closes on Escape', t => {
  const { widget: w, document } = fixture(t, 'zh', { list: true });
  w.setSessions([
    { id: 'a', title: '发布检查', workspace: 'release', updatedAt: 1000 },
    { id: 'b', title: '别的事情', workspace: 'other', updatedAt: 900 },
  ]);
  w.openSessions();
  assert.equal(w.filter.getAttribute('placeholder'), '过滤会话');
  assert.equal(w.sessionList.children.length, 2);
  assert.equal(w.sessionEmpty.hidden, true);
  w.filter.value = 'relea'; w.filter.dispatch('input');
  assert.equal(w.sessionList.children.length, 1);
  assert.equal(w.sessionList.children[0].querySelectorAll('.session-title')[0].textContent, '发布检查');
  w.filter.value = '没有这个'; w.filter.dispatch('input');
  assert.equal(w.sessionList.children.length, 0);
  assert.equal(w.sessionEmpty.hidden, false);
  w.root.dispatch('keydown', { key: 'Escape' });
  assert.equal(w.sessionsPanel.hidden, true);
  assert.equal(document.activeElement, w.button);
});

test('without the session hooks a click keeps greeting-only behaviour', t => {
  const { widget: w } = fixture(t);
  w.setSessions([{ id: 'a', title: 'Alpha', updatedAt: 1000 }]);
  w.button.dispatch('click', { detail: 1 });
  assert.equal(w.sessionsPanel.hidden, true);
  assert.equal(w.machine.view(1000).greeting, true);
});
