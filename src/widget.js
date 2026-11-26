import { PetStateMachine, cleanPreferences, clampPosition, STORAGE_KEY } from './state.js';
import { normalizeLanguage, translate } from './i18n.js';
import { acquireBubbleFonts } from './fonts.js';
import { bubbleLayout } from './bubble-layout.js';
import { attachBubbleSurface } from './bubble-surface.js';
import { spriteFrom, initialFrame, advanceFrame, holdMs, isFinished, animates } from './sprites.js';

/** Framework-independent UI shared by the real plugin and the tests. */
export class WhaleWidget {
  constructor(host, { assets, sprites, css, fonts, storage, language = 'en', now = () => Date.now(), random = Math.random, onView = () => {}, onScopeChange = () => {}, onSelectSession = () => {}, canOpenSessions = false } = {}) {
    this.host = host;
    this.language = normalizeLanguage(language);
    this.originalLang = host.getAttribute('lang');
    this.now = now;
    this.random = random;
    this.onView = onView;
    this.onScopeChange = onScopeChange;
    this.onSelectSession = onSelectSession;
    // The session list needs live session hooks; without them the whale keeps its older behaviour.
    this.canOpenSessions = Boolean(canOpenSessions);
    this.sessions = [];
    this.sessionSignature = '';
    this.sessionQuery = '';
    this.assets = assets;
    // The character credits travel with the sliced sprites, never hardcoded in the UI.
    this.sprites = sprites || {};
    this.frameSignature = '';
    this.frameSprite = spriteFrom(null);
    this.frame = initialFrame(this.frameSprite);
    this.frameTimer = null;
    this.cleanups = [];
    this.disposed = false;
    this.storage = storage;
    if (storage === undefined) { try { this.storage = window.localStorage; } catch { this.storage = null; } }
    let saved;
    try { saved = JSON.parse(this.storage?.getItem(STORAGE_KEY) || 'null'); } catch { /* corrupt storage is optional */ }
    this.preferences = cleanPreferences(saved);
    this.machine = new PetStateMachine(now(), this.preferences.sleepAfterMs);
    this.root = host.shadowRoot || host.attachShadow({ mode: 'open' });
    this.root.replaceChildren();
    const sheet = document.createElement('style');
    sheet.textContent = css;
    this.root.append(sheet);
    // All HTML is static; SVGs are validated at build time and rendered as inert images.
    const template = document.createElement('template');
    template.innerHTML = `
      <div class="pet" data-state="resting">
        <div class="bubble" aria-hidden="true"><span class="bubble-message"></span></div><span class="ground"></span>
        <button type="button" class="pet-button" aria-label="Whale companion" aria-keyshortcuts="Enter Space ArrowUp ArrowDown ArrowLeft ArrowRight">
          <span class="pet-art">
            <img class="pet-image" alt="" draggable="false" />
            <svg class="working-count" viewBox="0 0 103 114" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false" hidden>
              <text class="working-count-text" x="78.7" y="-5.5" text-anchor="middle" dominant-baseline="central"></text>
            </svg>
          </span>
        </button>
        <div class="sparkles" aria-hidden="true"><span>✦</span><span>✧</span><span>✦</span></div>
      </div>
      <section class="panel" role="dialog" data-i18n-aria="panel.aria" hidden>
        <div class="panel-head"><strong data-i18n="panel.title"></strong><button class="close" type="button" data-i18n-aria="panel.close"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>
        <div class="setting"><label for="whale-scope" data-i18n="setting.scope"></label><span class="select-control"><select id="whale-scope"><option value="current" data-i18n="setting.scopeCurrent"></option><option value="global" data-i18n="setting.scopeGlobal"></option></select><span class="select-arrow" aria-hidden="true"></span></span></div>
        <div class="setting"><label for="whale-size"><span data-i18n="setting.size"></span> <output class="size-value"></output></label><input id="whale-size" type="range" min="65" max="160" step="5" /></div>
        <div class="setting"><label for="whale-sleep" data-i18n="setting.sleep"></label><span class="select-control"><select id="whale-sleep"><option value="30000" data-i18n="setting.seconds30"></option><option value="120000" data-i18n="setting.minutes2"></option><option value="300000" data-i18n="setting.minutes5"></option></select><span class="select-arrow" aria-hidden="true"></span></span></div>
        <div class="panel-actions"><button class="action reset" type="button" data-i18n="action.reset"></button><button class="action hide" type="button" data-i18n="action.hide"></button></div>
        <p class="credit" hidden></p>
      </section>
      <section class="panel sessions-panel" role="dialog" data-i18n-aria="sessions.aria" hidden>
        <div class="panel-scroll">
        <div class="panel-head"><strong data-i18n="sessions.title"></strong><button class="close" id="whale-sessions-close" type="button" data-i18n-aria="sessions.close"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>
        <label class="session-search"><span class="session-search-icon" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg></span><input id="whale-filter" type="search" autocomplete="off" spellcheck="false" data-i18n-aria="sessions.filter" /></label>
        <p class="session-empty" data-i18n="sessions.empty" hidden></p>
        <ul class="session-list" role="listbox" data-i18n-aria="sessions.aria"></ul>
        </div>
        <div class="panel-edge panel-edge-left" data-edge="left" aria-hidden="true"></div><div class="panel-edge panel-edge-right" data-edge="right" aria-hidden="true"></div>
      </section>
      <button class="restore" type="button" hidden data-i18n-aria="action.restoreAria" data-i18n="action.restore"></button>`;
    this.root.append(template.content.cloneNode(true));
    this.pet = this.root.querySelector('.pet');
    this.button = this.root.querySelector('.pet-button');
    this.art = this.root.querySelector('.pet-art');
    this.image = this.root.querySelector('.pet-image');
    this.countOverlay = this.root.querySelector('.working-count');
    this.countText = this.root.querySelector('.working-count-text');
    this.scope = this.root.querySelector('#whale-scope');
    this.bubble = this.root.querySelector('.bubble');
    this.bubbleText = this.root.querySelector('.bubble-message');
    this.bubbleSurface = attachBubbleSurface(this.bubble, () => this.positionBubble());
    this.cleanups.push(() => this.bubbleSurface.dispose());
    this.panel = this.root.querySelector('.panel');
    this.restore = this.root.querySelector('.restore');
    this.range = this.root.querySelector('#whale-size');
    this.sleep = this.root.querySelector('#whale-sleep');
    this.sessionsPanel = this.root.querySelector('.sessions-panel');
    this.sessionList = this.root.querySelector('.session-list');
    this.sessionEmpty = this.root.querySelector('.session-empty');
    this.filter = this.root.querySelector('#whale-filter');
    this.credit = this.root.querySelector('.credit');
    const fontLease = acquireBubbleFonts(host.ownerDocument, fonts);
    this.fontsReady = fontLease.ready;
    this.cleanups.push(() => fontLease.release());
    this.fontsReady.then(() => { if (!this.disposed) this.positionBubble(); });
    this.listen(this.image, 'load', () => { this.paintArtBox(); this.positionBubble(); });
    this.listen(this.button, 'pointerdown', e => this.pointerDown(e));
    this.listen(this.button, 'pointermove', e => this.pointerMove(e));
    this.listen(this.button, 'pointerup', e => this.pointerEnd(e));
    this.listen(this.button, 'pointercancel', e => this.pointerEnd(e, true));
    this.listen(this.button, 'lostpointercapture', () => { this.drag = null; delete this.pet.dataset.dragging; delete this.pet.dataset.facing; this.paint(); });
    this.listen(this.button, 'click', e => {
      if (this.suppressClick) { this.suppressClick = false; return; }
      if (e.detail === 0) { this.openPanel(); return; }
      this.machine.touch(this.now()); this.paint();
      this.openSessions();
    });
    this.listen(this.button, 'contextmenu', e => { e.preventDefault(); this.openPanel(); });
    this.listen(this.button, 'keydown', e => {
      const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      if (directions[e.key]) {
        e.preventDefault(); const [dx, dy] = directions[e.key]; const step = e.shiftKey ? 20 : 5;
        this.preferences.x = this.position.x + dx * step;
        this.preferences.y = this.position.y + dy * step;
        this.reposition(); this.save();
      }
    });
    this.listen(this.root.querySelector('.close'), 'click', () => this.closePanel());
    this.listen(this.root.querySelector('#whale-sessions-close'), 'click', () => this.closeSessions());
    // The switcher resizes from either edge; the width persists as a preference.
    for (const edge of ['left', 'right']) {
      const handle = this.root.querySelector(`.panel-edge-${edge}`);
      this.listen(handle, 'pointerdown', e => this.startSessionsResize(e, edge));
      this.listen(handle, 'pointermove', e => this.moveSessionsResize(e));
      this.listen(handle, 'pointerup', e => this.endSessionsResize(e));
      this.listen(handle, 'pointercancel', e => this.endSessionsResize(e));
    }
    this.listen(this.filter, 'input', () => { this.sessionQuery = this.filter.value || ''; this.renderSessions(); });
    this.listen(this.root, 'keydown', e => {
      if (e.key !== 'Escape') return;
      if (this.panel.hidden && this.sessionsPanel.hidden) return;
      // First Escape belongs to the native picker; the next closes the open panel.
      if (this.root.querySelector('select:open')) { e.stopPropagation(); return; }
      e.preventDefault(); e.stopPropagation();
      if (!this.panel.hidden) this.closePanel(); else this.closeSessions();
    });
    this.listen(document, 'pointerdown', e => {
      if (e.composedPath().includes(host)) return;
      if (!this.panel.hidden) this.closePanel(false);
      if (!this.sessionsPanel.hidden) this.closeSessions(false);
    });
    this.listen(this.range, 'input', () => {
      this.preferences.scale = Number(this.range.value) / 100; this.applyPreferences(); this.save();
    });
    this.listen(this.scope, 'change', () => {
      const scope = this.scope.value === 'current' ? 'current' : 'global';
      if (scope === this.preferences.scope) return;
      this.preferences.scope = scope; this.save();
      this.onScopeChange(scope); this.paint();
    });
    this.listen(this.sleep, 'change', () => {
      this.preferences.sleepAfterMs = Number(this.sleep.value);
      this.machine.sleepAfterMs = this.preferences.sleepAfterMs; this.save(); this.paint();
    });
    this.listen(this.root.querySelector('.reset'), 'click', () => {
      this.preferences.x = null; this.preferences.y = null; this.reposition(); this.save();
    });
    this.listen(this.root.querySelector('.hide'), 'click', () => {
      this.preferences.hidden = true; this.closePanel(false); this.applyPreferences(); this.save(); this.restore.focus();
    });
    this.listen(this.restore, 'click', () => {
      this.preferences.hidden = false; this.machine.touch(this.now()); this.applyPreferences(); this.save(); this.button.focus(); this.paint();
    });
    this.listen(window, 'resize', () => this.reposition());
    this.listen(document, 'visibilitychange', () => { this.visibility(); this.paint(); });
    // The whale always animates: the OS reduced-motion setting is deliberately
    // ignored (the 0.2.1 decision), so no media query is consulted here.
    this.listen(window, 'storage', e => {
      if (e.key !== STORAGE_KEY && e.key !== null) return;
      let preferences;
      try { preferences = cleanPreferences(JSON.parse(e.newValue || 'null')); } catch { /* ignore malformed cross-tab data */ return; }
      const changedScope = preferences.scope !== this.preferences.scope;
      this.preferences = preferences; this.applyPreferences();
      if (changedScope) this.onScopeChange(this.preferences.scope);
      this.paint();
    });
    this.interval = setInterval(() => { if (!document.hidden && !this.preferences.hidden) this.paint(); }, 500);
    this.cleanups.push(() => clearInterval(this.interval));
    this.applyPreferences(); this.setLanguage(this.language);
  }
  setLanguage(language) {
    if (this.disposed) return;
    this.language = normalizeLanguage(language);
    this.host.setAttribute('lang', this.language);
    for (const element of this.root.querySelectorAll('[data-i18n]')) {
      element.textContent = translate(this.language, element.dataset.i18n);
    }
    for (const element of this.root.querySelectorAll('[data-i18n-aria]')) {
      element.setAttribute('aria-label', translate(this.language, element.dataset.i18nAria));
    }
    this.filter.setAttribute('placeholder', translate(this.language, 'sessions.filter'));
    // The character credit carries values, so it is filled here instead of by data-i18n.
    const credit = this.sprites.credit;
    this.credit.hidden = !credit;
    if (credit) this.credit.textContent = translate(this.language, 'pet.credit', { name: this.sprites.name, credit, license: this.sprites.license });
    // Update text in place: keep pointer capture, focus, timers, phase and preferences.
    this.paint();
    if (!this.panel.hidden) this.positionPanel();
    if (!this.sessionsPanel.hidden) { this.renderSessions(); this.positionPanel(this.sessionsPanel); }
  }
  listen(target, event, callback, options) {
    target.addEventListener(event, callback, options);
    this.cleanups.push(() => target.removeEventListener(event, callback, options));
  }
  save() { try { this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.preferences)); } catch { /* storage denial does not break the pet */ } }
  visibility() { this.host.dataset.paused = String(document.hidden || this.preferences.hidden); this.syncFrames(); }
  applyPreferences() {
    this.range.value = String(Math.round(this.preferences.scale * 100));
    this.root.querySelector('.size-value').textContent = `${this.range.value}%`;
    this.range.setAttribute('aria-valuetext', `${this.range.value}%`);
    this.range.style.setProperty('--range-progress', `${(Number(this.range.value) - Number(this.range.min)) / (Number(this.range.max) - Number(this.range.min)) * 100}%`);
    this.scope.value = this.preferences.scope;
    this.sessionsPanel.style.width = `${Math.round(this.preferences.sessionsWidth)}px`;
    this.sleep.value = String(this.preferences.sleepAfterMs);
    this.machine.sleepAfterMs = this.preferences.sleepAfterMs;
    this.pet.hidden = this.preferences.hidden; this.restore.hidden = !this.preferences.hidden;
    if (this.preferences.hidden) { this.closePanel(false); this.closeSessions(false); }
    this.visibility(); this.reposition();
  }
  reposition() {
    const size = 156 * this.preferences.scale;
    this.pet.style.width = `${size}px`; this.pet.style.height = `${size}px`;
    const top = Math.max(56, parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dsh-frame-top-clearance')) || 0);
    this.position = clampPosition(this.preferences.x ?? window.innerWidth - size - 24,
      this.preferences.y ?? window.innerHeight - size - 90, size, size, window.innerWidth, window.innerHeight, top);
    this.pet.style.left = `${this.position.x}px`; this.pet.style.top = `${this.position.y}px`;
    this.paintArtBox();
    this.positionBubble();
    if (!this.panel.hidden) this.positionPanel();
    if (!this.sessionsPanel.hidden) this.positionPanel(this.sessionsPanel);
  }
  positionBubble() {
    if (this.disposed || !this.position || this.preferences.hidden) return;
    this.bubbleSurface.update();
    const size = 156 * this.preferences.scale;
    const button = getComputedStyle(this.button);
    const bottomInset = parseFloat(button.paddingBottom) || 0;
    const artWidth = size - ((parseFloat(button.paddingLeft) || 0) + (parseFloat(button.paddingRight) || 0));
    const availableHeight = size - (parseFloat(button.paddingTop) || 0) - bottomInset;
    const ratio = this.image.naturalWidth > 0 && this.image.naturalHeight > 0 ? this.image.naturalWidth / this.image.naturalHeight : 1;
    const layout = bubbleLayout({
      x: this.position.x, y: this.position.y, size,
      width: this.bubble.offsetWidth, height: this.bubble.offsetHeight,
      visibleHeight: Math.min(availableHeight, artWidth / ratio), bottomInset,
      viewportWidth: window.innerWidth, viewportHeight: window.innerHeight,
      topClearance: Math.max(56, parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dsh-frame-top-clearance')) || 0),
    });
    this.bubble.style.left = `${layout.left - this.position.x}px`;
    this.bubble.style.top = `${layout.top - this.position.y}px`;
    this.bubble.style.bottom = 'auto';
    this.bubble.style.setProperty('--tail-x', `${layout.tailX}px`);
    this.bubble.dataset.side = layout.side;
  }
  positionPanel(panel = this.panel) {
    const size = 156 * this.preferences.scale;
    const width = panel.offsetWidth || Math.min(280, window.innerWidth - 24);
    const height = panel.offsetHeight || 310;
    const position = clampPosition(this.position.x + size / 2 - width / 2,
      this.position.y - height - 12, width, height, window.innerWidth, window.innerHeight);
    panel.style.left = `${position.x}px`; panel.style.top = `${position.y}px`;
  }
  openPanel() {
    this.closeSessions(false);
    this.panel.hidden = false; this.positionPanel(); this.root.querySelector('.close').focus();
  }
  closePanel(focus = true) {
    this.panel.hidden = true;
    if (focus) this.button.focus();
  }
  openSessions() {
    if (!this.canOpenSessions) return;
    this.closePanel(false);
    this.sessionsPanel.hidden = false;
    this.renderSessions();
    this.positionPanel(this.sessionsPanel);
    this.filter.focus();
  }
  closeSessions(focus = true) {
    this.sessionsPanel.hidden = true;
    if (focus) this.button.focus();
  }
  // Either edge of the switcher resizes it: the anchored edge stays put, the free side
  // follows the pointer, and the width persists as the sessionsWidth preference.
  startSessionsResize(e, edge) {
    if (this.sessionsResize || !e.isPrimary || e.button !== 0) return;
    const rect = this.sessionsPanel.getBoundingClientRect();
    this.sessionsResize = { edge, id: e.pointerId, startX: e.clientX, startWidth: this.sessionsPanel.offsetWidth,
      anchor: edge === 'right' ? rect.left : rect.right };
    this.sessionsPanel.dataset.resizing = edge;
    // Capture on the handle itself: it owns the move/up listeners, and capture
    // retargets every later pointer event of this drag to it.
    try { this.root.querySelector(`.panel-edge-${edge}`).setPointerCapture(e.pointerId); } catch { /* detached panel */ }
    e.preventDefault();
  }
  moveSessionsResize(e) {
    const size = this.sessionsResize;
    if (!size || size.id !== e.pointerId) return;
    const dx = e.clientX - size.startX;
    const raw = size.edge === 'right' ? size.startWidth + dx : size.startWidth - dx;
    // The window edge stops the free side at a 12px margin, ahead of the 280–520px range.
    const viewportCap = size.edge === 'right' ? window.innerWidth - size.anchor - 12 : size.anchor - 12;
    this.preferences.sessionsWidth = Math.round(Math.min(520, viewportCap, Math.max(280, raw)));
    this.sessionsPanel.style.width = `${this.preferences.sessionsWidth}px`;
    if (size.edge === 'left') this.sessionsPanel.style.left = `${Math.max(12, size.anchor - this.preferences.sessionsWidth)}px`;
    e.preventDefault();
  }
  endSessionsResize(e) {
    const size = this.sessionsResize;
    if (!size || size.id !== e.pointerId) return;
    this.sessionsResize = null;
    delete this.sessionsPanel.dataset.resizing;
    const handle = this.root.querySelector(`.panel-edge-${size.edge}`);
    if (handle.hasPointerCapture(e.pointerId)) handle.releasePointerCapture(e.pointerId);
    this.save();
    if (!this.sessionsPanel.hidden) this.positionPanel(this.sessionsPanel);
  }
  setSessions(rows) {
    this.sessions = Array.isArray(rows) ? rows : [];
    const signature = JSON.stringify(this.sessions.map(row => [row.id, row.title, row.workspace,
      row.running ? 1 : 0, row.waiting ? 1 : 0, row.unread ? 1 : 0, row.current ? 1 : 0, row.updatedAt || 0]));
    // Rebuild only on a real change so an open list keeps its scroll and focus.
    if (signature === this.sessionSignature) return;
    this.sessionSignature = signature;
    if (!this.sessionsPanel.hidden) this.renderSessions();
  }
  selectSession(id) {
    try { this.onSelectSession(id); } catch { /* A failed jump never breaks the pet. */ }
    this.closeSessions(false);
  }
  relativeTime(updatedAt, now) {
    if (!Number.isFinite(updatedAt)) return '';
    const seconds = Math.max(0, Math.round((now - updatedAt) / 1000));
    if (seconds < 60) return translate(this.language, 'time.now');
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return translate(this.language, 'time.minutes', { n: minutes });
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return translate(this.language, 'time.hours', { n: hours });
    const days = Math.floor(hours / 24);
    if (days < 30) return translate(this.language, 'time.days', { n: days });
    try { return new Date(updatedAt).toLocaleDateString(this.language === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric' }); } catch { return ''; }
  }
  sessionStateLabel(row) {
    if (row.waiting) return translate(this.language, 'sessions.waiting');
    if (row.running) return translate(this.language, 'sessions.running');
    if (row.unread) return translate(this.language, 'sessions.unread');
    return translate(this.language, 'sessions.idle');
  }
  renderSessions() {
    const now = this.now();
    const query = this.sessionQuery.trim().toLowerCase();
    const rows = this.sessions.filter(row => !query || `${row.title} ${row.workspace}`.toLowerCase().includes(query));
    this.sessionList.replaceChildren();
    this.sessionEmpty.hidden = rows.length > 0;
    for (const row of rows) this.sessionList.append(this.sessionNode(row, now));
  }
  sessionNode(row, now) {
    const title = row.title || translate(this.language, 'sessions.untitled');
    const state = this.sessionStateLabel(row);
    const item = document.createElement('li');
    item.setAttribute('class', `session-row${row.current ? ' current' : ''}`);
    item.setAttribute('role', 'option');
    item.setAttribute('tabindex', '0');
    item.setAttribute('aria-selected', String(Boolean(row.current)));
    item.setAttribute('aria-label', translate(this.language, 'sessions.rowAria', {
      title, state: row.current ? `${state} · ${translate(this.language, 'sessions.current')}` : state,
    }));
    const dot = document.createElement('span');
    dot.setAttribute('class', `session-dot${row.waiting ? ' waiting' : row.running ? ' running' : row.unread ? ' unread' : ''}`);
    dot.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span');
    label.setAttribute('class', 'session-title'); label.textContent = title;
    const meta = document.createElement('span');
    meta.setAttribute('class', 'session-meta');
    if (row.workspace) {
      const workspace = document.createElement('span');
      workspace.setAttribute('class', 'session-workspace'); workspace.textContent = row.workspace;
      meta.append(workspace);
    }
    const time = document.createElement('span');
    time.setAttribute('class', 'session-time'); time.textContent = this.relativeTime(row.updatedAt, now);
    meta.append(time);
    item.append(dot, label, meta);
    item.addEventListener('click', () => this.selectSession(row.id));
    item.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault(); this.selectSession(row.id);
    });
    return item;
  }
  pointerDown(e) {
    if (e.button !== 0 || !e.isPrimary) return;    this.suppressClick = false;
    this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, originX: this.position.x, originY: this.position.y, moved: false };
    // The carried look (dimmed shadow) starts the moment the whale is grabbed;
    // the drag pose art itself waits for real movement so a click never flashes it.
    this.pet.dataset.dragging = 'true';
    this.button.setPointerCapture(e.pointerId);
  }
  pointerMove(e) {
    if (!this.drag || this.drag.id !== e.pointerId) return;
    const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
    if (Math.hypot(dx, dy) > 4 && !this.drag.moved) { this.drag.moved = true; this.paint(); }
    if (!this.drag.moved) return;
    // The pose stretches toward the top-right at baseline, so facing follows the drag
    // displacement: rightward keeps the sheet as drawn, leftward mirrors it.
    if (dx > 0) this.pet.dataset.facing = 'right';
    else if (dx < 0) this.pet.dataset.facing = 'left';
    this.pet.dataset.dragging = 'true';
    this.preferences.x = this.drag.originX + dx; this.preferences.y = this.drag.originY + dy;
    this.reposition();
  }
  pointerEnd(e, cancelled = false) {
    if (!this.drag || this.drag.id !== e.pointerId) return;
    this.suppressClick = this.drag.moved || cancelled;
    if (this.drag.moved) {
      this.preferences.x = this.position.x; this.preferences.y = this.position.y; this.save();
    }
    this.drag = null; delete this.pet.dataset.dragging; delete this.pet.dataset.facing;
    if (this.button.hasPointerCapture(e.pointerId)) this.button.releasePointerCapture(e.pointerId);
    this.paint();
  }
  update(snapshot) { if (!this.disposed) { this.machine.update(snapshot, this.now()); this.paint(); } }
  paint() {
    if (this.disposed) return;
    const view = this.machine.view(this.now());
    // A real drag holds the upstream drag pose instead of the machine's own art.
    const state = this.drag && this.drag.moved ? 'drag' : view.state;
    if (this.pet.dataset.state !== state || !this.image.getAttribute('src')) {
      this.pet.dataset.state = state; this.setArt(state);
    }
    this.pet.dataset.notice = String(Boolean(view.noticeKey || ['waiting', 'celebrate', 'error'].includes(view.state) || view.greeting));
    this.pet.dataset.touch = String(Boolean(view.greeting && !view.noticeKey && !['waiting', 'working', 'celebrate', 'error'].includes(view.state)));
    const count = view.state === 'working' && Number.isFinite(view.workingCount) ? Math.max(0, Math.floor(view.workingCount)) : 0;
    this.countOverlay.toggleAttribute('hidden', count === 0);
    this.countText.textContent = count > 0 ? (count > 99 ? '99+' : String(count)) : '';
    const messageKey = view.noticeKey || (view.greeting && view.state === 'resting' ? 'pet.greeting' : view.messageKey);
    const message = translate(this.language, messageKey);
    this.bubbleText.textContent = message;
    this.positionBubble();
    // The decorative screen number is announced once, with its actual count,
    // as part of the button label, and never leaks into resting greetings.
    const status = count > 0 ? `${message} ${translate(this.language, count === 1 ? 'pet.workingCountOne' : 'pet.workingCount', { count })}` : message;
    this.button.setAttribute('aria-label', translate(this.language, 'pet.aria', { status }));
    this.onView(view);
  }
  // A portrait frame inside a wider art box leaves object-fit gutters: the counter must ignore them.
  paintArtBox() {
    const width = this.image.naturalWidth || 0, height = this.image.naturalHeight || 0;
    const box = this.art?.getBoundingClientRect?.();
    if (!width || !height || !box || !box.width || !box.height) return;
    const scale = Math.min(box.width / width, box.height / height);
    this.pet.style.setProperty('--art-width', `${(width * scale / box.width * 100).toFixed(3)}%`);
    this.pet.style.setProperty('--art-height', `${(height * scale / box.height * 100).toFixed(3)}%`);
  }
  // Each state is a strip of frames: the widget owns the timer, src/sprites.js owns the order.
  setArt(state) {
    const sprite = spriteFrom(this.assets?.[state]);
    const signature = [state, sprite.frames.length, sprite.fps, sprite.playback, sprite.frameMs ? sprite.frameMs.join(',') : ''].join('|');
    if (signature !== this.frameSignature) {
      this.frameSignature = signature;
      this.frameSprite = sprite;
      this.frame = initialFrame(sprite);
      this.stopFrames();
      this.image.src = sprite.frames[0] ?? '';
    } else if (!this.image.getAttribute('src') && sprite.frames.length) {
      this.image.src = sprite.frames[this.frame.index] ?? sprite.frames[0];
    }
    this.paintArtBox();
    this.syncFrames();
  }
  syncFrames() {
    if (this.disposed) return;
    if (document.hidden || this.preferences.hidden) { this.stopFrames(); return; }
    this.scheduleFrame();
  }
  scheduleFrame() {
    if (this.disposed || this.frameTimer || !animates(this.frameSprite)) return;
    if (document.hidden || this.preferences.hidden) return;
    const delay = holdMs(this.frameSprite, this.frame, this.random);
    if (!(delay > 0)) return;
    this.frameTimer = setTimeout(() => {
      this.frameTimer = null;
      if (this.disposed || isFinished(this.frameSprite, this.frame)) return;
      this.frame = advanceFrame(this.frameSprite, this.frame, this.random);
      const source = this.frameSprite.frames[this.frame.index];
      if (source) this.image.src = source;
      this.scheduleFrame();
    }, delay);
  }
  stopFrames() {
    if (this.frameTimer) clearTimeout(this.frameTimer);
    this.frameTimer = null;
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.stopFrames();
    for (const cleanup of this.cleanups.splice(0).reverse()) cleanup();
    this.root.replaceChildren();
    delete this.host.dataset.paused;
    if (this.originalLang === null) this.host.removeAttribute('lang');
    else this.host.setAttribute('lang', this.originalLang);
  }
}
