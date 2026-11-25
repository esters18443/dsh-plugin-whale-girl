// Real-browser check for the whale's own UI: the session switcher and the character art.
// Requires CHROME_PATH (any Chromium: Chrome/Edge) and a freshly built preview.
// Uses a fresh temporary profile and blocks every network URL: it never attaches to the live DSH GUI.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const preview = path.join(root, 'preview/index.html');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'assets/sprites/manifest.json'), 'utf8'));
const chromePath = process.env.CHROME_PATH;
assert.ok(chromePath && fs.existsSync(chromePath), 'Set CHROME_PATH to an installed Chromium executable');
assert.ok(fs.existsSync(preview), 'Build the offline preview before running this check');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'whale-ui-check-'));
const chrome = spawn(chromePath, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
  '--disable-component-update', '--disable-sync', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0',
  `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'], detached: true });

let socket;
const pending = new Map();
const exceptions = [], consoleErrors = [], networkRequests = [];
let sequence = 0;
const pass = [];
const report = (label, value) => { pass.push(label); console.log(`PASS  ${label}${value === undefined ? '' : `  → ${value}`}`); };

try {
  const endpoint = await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error('Chromium debugger startup timed out')), 20000);
    chrome.once('error', error => { clearTimeout(timer); reject(error); });
    chrome.once('exit', code => { clearTimeout(timer); reject(new Error(`Chromium exited before debugger: ${code}`)); });
    chrome.stderr.on('data', chunk => {
      output += chunk.toString();
      const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
  });
  socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails.text);
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') consoleErrors.push(message.params.args.map(arg => arg.value ?? arg.description));
    if (message.method === 'Network.requestWillBeSent' && /^(?:https?|wss?):/i.test(message.params.request.url)) networkRequests.push(message.params.request.url);
    const item = pending.get(message.id);
    if (!item) return;
    pending.delete(message.id);
    clearTimeout(item.timer);
    if (message.error) item.reject(new Error(JSON.stringify(message.error))); else item.resolve(message.result);
  });
  const call = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 20000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  const { targetId } = await call('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await call('Target.attachToTarget', { targetId, flatten: true });
  const page = (method, params) => call(method, params, sessionId);
  await page('Runtime.enable'); await page('Page.enable'); await page('Network.enable');
  await page('Network.setBlockedURLs', { urls: ['http://*', 'https://*', 'ws://*', 'wss://*'] });
  // Reduced motion is pinned to reduce on purpose: since 0.2.1 the whale always
  // animates, so every check below runs inside that hostile environment.
  await page('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await page('Emulation.setDeviceMetricsOverride', { width: 1100, height: 850, deviceScaleFactor: 1, mobile: false });
  await page('Page.navigate', { url: pathToFileURL(preview).href });

  const evaluate = async expression => {
    const result = await page('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    assert.equal(result.exceptionDetails, undefined, JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const waitFor = (expression, message) => evaluate(`new Promise((resolve,reject)=>{let n=0;const step=()=>{if(${expression})resolve(true);else if(++n>150)reject(new Error(${JSON.stringify(message)}));else setTimeout(step,20)};step()})`);

  await waitFor('window.previewPet', 'preview widget missing');
  await evaluate('previewPet.fontsReady');
  assert.equal(await evaluate('location.protocol'), 'file:');

  // Real pointer delivery through the browser input pipeline: the preview has no synthetic shortcut.
  const centreOf = async expression => evaluate(`(()=>{const r=${expression}.getBoundingClientRect();
    return {x:r.left+r.width/2,y:r.top+r.height/2,w:r.width,h:r.height};})()`);
  const clickAt = async point => {
    const base = { x: point.x, y: point.y, button: 'left', clickCount: 1 };
    await page('Input.dispatchMouseEvent', { ...base, type: 'mousePressed', buttons: 1 });
    await page('Input.dispatchMouseEvent', { ...base, type: 'mouseReleased', buttons: 0 });
  };
  const pressKey = async key => {
    const codes = { Backspace: 8 };
    const shared = { key, code: key, windowsVirtualKeyCode: codes[key], nativeVirtualKeyCode: codes[key] };
    await page('Input.dispatchKeyEvent', { ...shared, type: 'keyDown' });
    await page('Input.dispatchKeyEvent', { ...shared, type: 'keyUp' });
  };
  // Optional visual evidence: set SHOTS_DIR to also save a crisp crop of the whale at each step.
  const shotsDir = process.env.SHOTS_DIR;
  const shoot = async (name, expression) => {
    if (!shotsDir) return;
    const clip = await evaluate(`(()=>{const r=${expression}.getBoundingClientRect();
      const pad=46;return {x:Math.max(0,r.left-pad),y:Math.max(0,r.top-pad),width:r.width+pad*2,height:r.height+pad*2};})()`);
    const { data } = await page('Page.captureScreenshot', { format: 'png', clip: { ...clip, scale: 2 }, captureBeyondViewport: false });
    fs.mkdirSync(shotsDir, { recursive: true });
    const file = path.join(shotsDir, `${name}.png`);
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
    console.log(`SHOT  ${file}`);
  };

  assert.equal(await evaluate('previewPet.sessionsPanel.hidden'), true);
  assert.equal(await evaluate('previewPet.sessionList.children.length'), 0);
  report('initial state: switcher closed and empty');

  // ------------------------------------------------------- the whale-girl art ----
  const states = ['resting', 'working', 'waiting', 'celebrate', 'sleeping', 'error', 'drag'];
  const art = await evaluate(`(()=>{const states=${JSON.stringify(states)};
    const strip=state=>previewPet.assets[state];
    return { state: previewPet.pet.dataset.state, png: states.every(s=>strip(s).frames.every(f=>f.startsWith('data:image/png;base64,'))),
      svg: states.some(s=>strip(s).frames.some(f=>f.startsWith('data:image/svg'))),
      natural: [previewPet.image.naturalWidth, previewPet.image.naturalHeight],
      artWidth: Math.round(previewPet.image.getBoundingClientRect().width), artHeight: Math.round(previewPet.image.getBoundingClientRect().height),
      uniqueFirst: new Set(states.map(s=>strip(s).frames[0])).size,
      credit: { hidden: previewPet.credit.hidden, text: previewPet.credit.textContent },
      plan: Object.fromEntries(states.map(s=>[s,[strip(s).frames.length,strip(s).fps,strip(s).playback]])) };})()`);
  assert.equal(art.state, 'resting');
  assert.equal(art.png, true, 'frames ship as PNG data URLs');
  assert.equal(art.svg, false, 'the original SVG whales are gone');
  assert.deepEqual(art.natural, [206, 228], 'every frame keeps the shared crop box');
  // object-fit: contain — the portrait frame is limited by the art box height, so the character fills it.
  const painted = Math.min(art.artWidth / art.natural[0], art.artHeight / art.natural[1]) * art.natural[1];
  assert.ok(Math.abs(painted - art.artHeight) <= 1, `the character fills the art box height (${Math.round(painted)} of ${art.artHeight})`);
  assert.equal(art.uniqueFirst, 7, 'each state opens on its own pose');
  assert.deepEqual(art.plan, { resting: [3, 2, 'blink'], working: [3, 3, 'loop'], waiting: [1, 2, 'loop'], celebrate: [3, 4, 'loop'], sleeping: [2, 1, 'loop'], error: [2, 8, 'once'], drag: [1, 2, 'loop'] });
  assert.equal(art.credit.hidden, false, 'the panel credits the character');
  assert.match(art.credit.text, /ZipZipPipe/);
  report('whale-girl frames, timing and credit are live', `${art.natural.join('x')} px art, resting ${art.plan.resting.join('/')}, credit "${art.credit.text}"`);

  // A real running session must actually move through its frames.
  const artBox = `(()=>{const r=previewPet.art.getBoundingClientRect();return [Math.round(r.width),Math.round(r.height)];})()`;
  const restingBox = await evaluate(artBox);
  await evaluate('previewSet({ sessionId: "preview", available: true, running: true, pending: false })');
  await waitFor('previewPet.pet.dataset.state === "working"', 'a running session did not switch the pose');
  assert.deepEqual(await evaluate(artBox), restingBox, 'the working pose keeps the same art box as every other pose');
  // The frames step even with reduced motion emulated: the OS setting is ignored by design.
  const animated = await evaluate(`new Promise(resolve=>{const seen=new Set();let n=0;
    const step=()=>{seen.add(previewPet.image.getAttribute('src'));if(++n>12||seen.size>=3)resolve(seen.size);else setTimeout(step,140)};step()})`);
  assert.ok(animated >= 2, `the working pose showed only ${animated} distinct frame(s)`);
  report('the working pose animates frame by frame in a browser, ignoring the OS reduced-motion setting', `${animated} distinct frames in ~1.7s`);

  // One screenshot per state: the frame player is paused directly, since the
  // whale now always animates and reduced motion no longer freezes anything.
  await evaluate('previewPet.preferences.hidden = true; previewPet.stopFrames()');
  for (const state of states) {
    await evaluate(`previewPet.image.src = previewPet.assets[${JSON.stringify(state)}].frames[0]`);
    await shoot(`state-${state}`, 'previewPet.pet');
  }
  // The working-session counter belongs on the light bulb the working frames draw.
  await evaluate('previewSet({ sessionId: "preview", available: true, running: true, pending: false, workingCount: 3 })');
  await evaluate('previewPet.image.src = previewPet.assets.working.frames[0]');
  // This art is portrait while the art box is not: the counter must follow the painted character.
  const characterBox = `(()=>{const img=previewPet.image, box=img.getBoundingClientRect(), nw=img.naturalWidth, nh=img.naturalHeight;
    const s=Math.min(box.width/nw, box.height/nh), w=nw*s, h=nh*s;
    return { x: box.left + (box.width - w)/2, y: box.bottom - h, width: w, height: h };})()`;
  const badge = await evaluate(`(()=>{const art=${characterBox}, text=previewPet.countText, ink=text.getBBox(), box=text.getBoundingClientRect(), bubble=previewPet.bubble.getBoundingClientRect();
    return { hidden: previewPet.countOverlay.hasAttribute('hidden'), text: text.textContent,
      ink: [Number(ink.x.toFixed(1)), Number(ink.y.toFixed(1)), Number(ink.width.toFixed(1)), Number(ink.height.toFixed(1))],
      left: Number(((box.left - art.x) / art.width).toFixed(3)), right: Number(((box.right - art.x) / art.width).toFixed(3)),
      top: Number(((box.top - art.y) / art.height).toFixed(3)),
      bubbleBottom: Number(((bubble.bottom - art.y) / art.height).toFixed(3)),
      chipLeft: Math.round(box.left), chipRight: Math.round(box.right),
      tailLeft: Math.round(bubble.left + parseFloat(getComputedStyle(previewPet.bubble).getPropertyValue('--tail-x'))),
      tailRight: Math.round(bubble.left + parseFloat(getComputedStyle(previewPet.bubble).getPropertyValue('--tail-x')) + 18) };})()`);
  assert.equal(badge.hidden, false, 'the working-session count is drawn');
  assert.equal(badge.text, '3');
  const [bulbLeft, bulbTop, bulbRight] = manifest.counter.bulb;
  const [viewX, viewY] = manifest.counter.viewBox;
  // The bulb is the point of the pose, and it draws its own rays up to bulbTop, so the digits are
  // drawn above the character's whole frame: inside it there is no room left at all.
  assert.ok(badge.ink[1] + badge.ink[3] <= 0.5,
    `the digits end at ${(badge.ink[1] + badge.ink[3]).toFixed(1)} in the counter's own space, still inside the frame`);
  assert.ok(badge.ink[1] + badge.ink[3] + 1.2 <= manifest.counter.bulbTop,
    `the digits' outline ends at ${(badge.ink[1] + badge.ink[3] + 1.2).toFixed(1)}, over the bulb that draws up to ${manifest.counter.bulbTop}`);
  assert.ok(Math.abs(badge.ink[0] + badge.ink[2] / 2 - (bulbLeft + bulbRight) / 2) <= 2,
    `the digits are centred at ${(badge.ink[0] + badge.ink[2] / 2).toFixed(1)}, the bulb at ${((bulbLeft + bulbRight) / 2).toFixed(1)}`);
  // No plate: nothing may sit over the bulb except the digits themselves.
  assert.equal(await evaluate('previewPet.root.querySelectorAll(".working-count rect").length'), 0, 'the counter must not draw a plate over the bulb');
  // It also has to clear the speech bubble that hangs over the same corner of the whale,
  // including the two tail dots that hang below the bubble's own box.
  assert.ok(badge.top >= badge.bubbleBottom - 0.01,
    `the counter starts at ${badge.top} of the character, inside the bubble that ends at ${badge.bubbleBottom}`);
  assert.ok(badge.chipRight < badge.tailLeft || badge.chipLeft > badge.tailRight,
    `the counter ${badge.chipLeft}..${badge.chipRight} sits under the bubble tail ${badge.tailLeft}..${badge.tailRight}`);
  // The pixels the browser actually decoded under the digits must still be the bulb.
  const under = await evaluate(`(()=>{const img=previewPet.image, nw=img.naturalWidth, nh=img.naturalHeight;
    const canvas=document.createElement('canvas'); canvas.width=nw; canvas.height=nh;
    const ctx=canvas.getContext('2d'); ctx.drawImage(img,0,0,nw,nh);
    const cx=Math.round(${(bulbLeft + bulbRight) / 2} / ${viewX} * nw), cy=Math.round(${(bulbTop + 3) / viewY} * nh);
    const data=ctx.getImageData(cx-3, cy-3, 6, 6).data; let r=0,g=0,b=0,n=0;
    for(let i=0;i<data.length;i+=4){ r+=data[i]; g+=data[i+1]; b+=data[i+2]; n++; }
    return { r: Math.round(r/n), g: Math.round(g/n), b: Math.round(b/n) };})()`);
  assert.ok(under.r > 180 && under.r - under.b > 40, `the bulb below the digits reads ${JSON.stringify(under)}, not yellow`);
  // Bare digits over an unknown background: one of the two tones has to carry each theme.
  const readability = await evaluate(`(()=>{const rgb=c=>(c.match(/[\\d.]+/g)||[]).map(Number);
    const ch=v=>{ v/=255; return v<=0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055,2.4); };
    const lum=c=>0.2126*ch(c[0])+0.7152*ch(c[1])+0.0722*ch(c[2]);
    const ratio=(a,b)=>Number(((Math.max(a,b)+0.05)/(Math.min(a,b)+0.05)).toFixed(2));
    const style=getComputedStyle(previewPet.countText);
    const ink=lum(rgb(style.fill)), halo=lum(rgb(style.stroke)), bg=lum(rgb(getComputedStyle(document.body).backgroundColor));
    return { ink: ratio(ink,bg), halo: ratio(halo,bg), scheme: getComputedStyle(document.documentElement).colorScheme };})()`);
  assert.ok(Math.max(readability.ink, readability.halo) >= 4.5,
    `neither the glyph (${readability.ink}:1) nor its outline (${readability.halo}:1) reads on the ${readability.scheme} background`);
  // The same bare digits have to read on the dark theme too: the whale floats over either surface.
  const darkReadability = await evaluate(`(()=>{document.body.classList.add('dark'); document.documentElement.style.colorScheme='dark';
    const rgb=c=>(c.match(/[\\d.]+/g)||[]).map(Number);
    const ch=v=>{ v/=255; return v<=0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055,2.4); };
    const lum=c=>0.2126*ch(c[0])+0.7152*ch(c[1])+0.0722*ch(c[2]);
    const ratio=(a,b)=>Number(((Math.max(a,b)+0.05)/(Math.min(a,b)+0.05)).toFixed(2));
    const style=getComputedStyle(previewPet.countText);
    const ink=lum(rgb(style.fill)), halo=lum(rgb(style.stroke)), bg=lum(rgb(getComputedStyle(document.body).backgroundColor));
    return { ink: ratio(ink,bg), halo: ratio(halo,bg), background: getComputedStyle(document.body).backgroundColor };})()`);
  assert.ok(Math.max(darkReadability.ink, darkReadability.halo) >= 4.5,
    `neither the glyph (${darkReadability.ink}:1) nor its outline (${darkReadability.halo}:1) reads on the dark background`);
  await shoot('working-count-dark', 'previewPet.pet');
  await evaluate(`document.body.classList.remove('dark'); document.documentElement.style.colorScheme='light'`);
  report('the session counter sits above the working light bulb',
    `${badge.text} above the bulb (ink ${badge.ink.join('/')} in the counter's own space, page ${badge.chipLeft}..${badge.chipRight}, bubble tail ${badge.tailLeft}..${badge.tailRight}, bulb still RGB ${under.r},${under.g},${under.b}, glyph ${readability.ink}:1 and outline ${readability.halo}:1 light, ${darkReadability.ink}:1/${darkReadability.halo}:1 dark)`);
  await shoot('working-count', 'previewPet.pet');
  await evaluate('previewPet.preferences.hidden = false; previewPet.syncFrames()');
  await evaluate('previewSet({ sessionId: "preview", available: true, running: false, pending: false })');
  await waitFor('previewPet.pet.dataset.state === "resting"', 'the preview did not return to its resting pose');

  const button = await centreOf('previewPet.button');
  await clickAt(button);
  await waitFor('previewPet.sessionsPanel.hidden === false', 'a real click did not open the switcher');
  assert.equal(await evaluate('previewPet.panel.hidden'), true, 'switcher must replace the settings panel');
  report('real click on the whale opens the switcher', `x=${Math.round(button.x)} y=${Math.round(button.y)}`);

  const layout = await evaluate(`(()=>{const rows=[...previewPet.sessionList.children];
    return { count: rows.length, panelWidth: Math.round(previewPet.sessionsPanel.getBoundingClientRect().width),
      rowHeight: Math.round(rows[0].getBoundingClientRect().height), listHeight: Math.round(previewPet.sessionList.getBoundingClientRect().height),
      titles: rows.map(row=>row.querySelector('.session-title').textContent),
      dots: rows.map(row=>row.querySelector('.session-dot').getAttribute('class')),
      workspaces: rows.map(row=>row.querySelector('.session-workspace')?.textContent ?? ''),
      current: rows.map(row=>row.getAttribute('class').includes('current')),
      filterFocused: previewPet.root.activeElement === previewPet.filter };})()`);
  assert.equal(layout.count, 5);
  assert.deepEqual(layout.titles, ['把鲸鱼挂件装回 DSH', '给预览页加上会话列表', '整理字体授权说明', '未命名', '旧的一次尝试']);
  assert.equal(layout.dots[0], 'session-dot waiting');
  assert.equal(layout.dots[1], 'session-dot running');
  assert.deepEqual(layout.current, [false, true, false, false, false]);
  assert.deepEqual(layout.workspaces, ['规范', '规范', 'docs', 'docs', '']);
  assert.equal(layout.panelWidth, 320, 'the switcher defaults to its 320px width');
  assert.ok(layout.rowHeight >= 30, `row height ${layout.rowHeight}`);
  assert.ok(layout.listHeight > 0 && layout.listHeight <= 400, `list height ${layout.listHeight}`);
  assert.equal(layout.filterFocused, true);
  report('real layout, ordering, state dots, Workspace labels and focus', `${layout.count} rows, panel ${layout.panelWidth}px, row ${layout.rowHeight}px`);

  // A real pointer drag on the switcher's left edge resizes it; the width persists as a preference.
  const resizeEdge = await centreOf(`previewPet.root.querySelector('.panel-edge-left')`);
  await page('Input.dispatchMouseEvent', { type: 'mousePressed', x: resizeEdge.x, y: resizeEdge.y, button: 'left', clickCount: 1 });
  await page('Input.dispatchMouseEvent', { type: 'mouseMoved', x: resizeEdge.x - 40, y: resizeEdge.y, button: 'left', buttons: 1 });
  await page('Input.dispatchMouseEvent', { type: 'mouseReleased', x: resizeEdge.x - 40, y: resizeEdge.y, button: 'left', clickCount: 1 });
  const widened = Math.round(await evaluate(`previewPet.sessionsPanel.getBoundingClientRect().width`));
  assert.ok(widened >= 350 && widened <= 370, `resized switcher width ${widened}`);
  report('real edge drag resizes the switcher', `${layout.panelWidth}px → ${widened}px`);

  // Real typing goes through the focused filter input.
  await page('Input.insertText', { text: 'docs' });
  await waitFor('previewPet.sessionList.children.length === 2', 'typing did not filter the list');
  assert.equal(await evaluate(`previewPet.root.activeElement.value`), 'docs');
  assert.equal(await evaluate('previewPet.sessionEmpty.hidden'), true);
  report('real typing filters rows', `${await evaluate('previewPet.sessionList.children.length')} of 5 match "docs"`);

  await page('Input.insertText', { text: 'zzz' });
  await waitFor('previewPet.sessionList.children.length === 0', 'the empty state did not appear');
  assert.equal(await evaluate('previewPet.sessionEmpty.hidden'), false);
  report('empty state appears when nothing matches');

  for (let index = 0; index < 7; index++) await pressKey('Backspace');
  await waitFor('previewPet.sessionList.children.length === 5', 'clearing the filter did not restore rows');
  assert.equal(await evaluate(`previewPet.root.activeElement.value`), '');
  report('real backspaces clear the filter', `${await evaluate('previewPet.sessionList.children.length')} rows restored`);

  const firstRow = await centreOf('previewPet.sessionList.children[0]');
  await clickAt(firstRow);
  await waitFor('Array.isArray(window.__whaleJumps) && window.__whaleJumps.length === 1', 'clicking a row did not jump');
  assert.deepEqual(await evaluate('window.__whaleJumps'), ['preview-2']);
  assert.equal(await evaluate('previewPet.sessionsPanel.hidden'), true, 'the switcher closes after a jump');
  report('real click on a row jumps to that session and closes the switcher', 'preview-2');

  assert.deepEqual(exceptions, [], `uncaught exceptions: ${exceptions.join(' | ')}`);
  assert.deepEqual(consoleErrors, [], `console errors: ${JSON.stringify(consoleErrors)}`);
  assert.deepEqual(networkRequests, [], `network requests: ${networkRequests.join(' | ')}`);
  report('no exceptions, no console errors, no network requests (offline)');
  console.log(`\nAll ${pass.length} real-browser checks passed.`);
} finally {
  try { socket?.close(); } catch { /* already closed */ }
  if (chrome.pid) {
    // Windows has no process groups: negative-pid kills do not reach the detached
    // tree, so taskkill the whole browser process before falling back.
    try { spawn('taskkill', ['/PID', String(chrome.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* not on Windows */ }
    try { process.kill(-chrome.pid); } catch { try { chrome.kill(); } catch { /* already gone */ } }
  } else { try { chrome.kill(); } catch { /* already gone */ } }
  try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* best effort */ }
}
