import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const manifest = JSON.parse(read('package.json'));
test('package is a self-contained DSH bundle with only its own inserted row', () => {
  assert.equal(manifest.name, 'dsh-plugin-whale-girl');
  assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml');
  assert.equal(manifest.dsh.client.platform, 'web');
  for (const target of Object.values(manifest.exports)) assert.equal(fs.existsSync(path.join(root, target)), true);
  assert.equal((read('cordis.patch.yml').match(/- id:/g) || []).length, 1);
  assert.match(read('cordis.patch.yml'), /id: whale-girl\s*\n\s*name: dsh-plugin-whale-girl/);
  assert.equal(manifest.dependencies, undefined);
  for (const hook of ['preinstall', 'install', 'postinstall', 'prepare', 'prepack', 'postpack']) {
    assert.equal(manifest.scripts[hook], undefined);
  }
  // The manifest version must be the newest dated release in the CHANGELOG, so a
  // release cannot ship while its own entry is still Unreleased or missing.
  assert.equal(manifest.version, read('CHANGELOG.md').match(/^## (\d+\.\d+\.\d+) — \d{4}-\d{2}-\d{2}$/m)?.[1]);
  assert.equal(fs.existsSync(path.join(root, 'lib/version.js')), false);
  assert.equal(manifest.files.includes('DIAGNOSTICS.md'), false);
  assert.deepEqual(manifest.repository, { type: 'git', url: 'git+https://github.com/esters18443/dsh-plugin-whale-girl.git' });
  assert.equal(manifest.homepage, 'https://github.com/esters18443/dsh-plugin-whale-girl');
  assert.equal(manifest.bugs.url, `${manifest.homepage}/issues`);
  assert.equal(manifest.packageManager, 'pnpm@12.8.1');
  assert.equal(manifest.engines.node, '>=22');
  assert.equal(manifest.scripts.build, 'node tools/bridge-build.mjs && node tools/build.mjs');
  assert.equal(manifest.scripts.test, 'node --test tests/*.test.mjs');
  assert.equal(manifest.scripts['test:browser'], undefined);
  assert.ok(manifest.files.includes('UPGRADE.md'));
  assert.doesNotMatch(read('tools/bridge-build.mjs'), /WHALE_BRIDGE_DEPS|\/Users\/|dsh-pet-research/);
});
test('formal runtime has no diagnostic feature or prerelease helper', () => {
  for (const file of ['src/widget.js', 'src/adapter.js', 'src/bridge-client.js', 'src/host-bridge.js', 'src/global-state.js', 'lib/client.js', 'lib/index.js', 'lib/remote.js', 'lib/typert.host.js']) {
    assert.doesNotMatch(read(file), /WhaleDiagnostics|refreshHostDiagnostics|WHALE_DIAGNOSTICS|onDiagnosticsRefresh|diagnostics-toggle|namespaceFailures/);
  }
  assert.equal(fs.existsSync(path.join(root, 'src/diagnostics.js')), false);
  assert.equal(fs.existsSync(path.join(root, 'DIAGNOSTICS.md')), false);
  assert.ok(manifest.files.includes('CHANGELOG.md'));
  assert.doesNotMatch(read('README.md'), /Local test build|Local diagnostic build|Install the beta/);
});
test('browser output registers one lazy factory using host React and official icons', () => {
  const registrations = [];
  vm.runInNewContext(read('lib/client.js'), { window: { __ModuleLoader__: { load: item => registrations.push(item) } } });
  assert.equal(registrations.length, 1); assert.equal(registrations[0].id, manifest.name);
  const requested = [];
  const plugin = registrations[0].factory(id => { requested.push(id); return { Component: class {}, createElement() {} }; });
  assert.deepEqual(requested, ['react', 'react-dom', '@deepseek-ai/dsh-client-ui-primitives']);
  assert.ok(manifest.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-primitives'));
  assert.doesNotMatch(read('lib/client.js'), /M4 6L7\.29289|__WhaleOfficialIconTest|react\.production\.min/); assert.deepEqual(Array.from(plugin.inject), ['slots', 'sessions', 'connection', 'locale', 'remote']);
  const slots = [];
  plugin.apply({ slots: { inject(name, fn) { assert.equal(name, 'shell.overlay'); fn(); }, register(options, component) { slots.push(options); assert.equal(typeof component, 'function'); return () => {}; } } });
  assert.equal(slots.length, 1); assert.equal(slots[0].name, 'shell.overlay'); assert.equal(slots[0].id, 'whale-girl');
});
test('pet has no extra status indicator dot in source or generated bundle', () => {
  for (const file of ['src/widget.js', 'src/pet.css', 'lib/client.js']) {
    assert.doesNotMatch(read(file), /class="indicator"|\.indicator\b/);
  }
});
test('host contributes only a read-only boundary service and owned listener', async () => {
  const host = await import('../lib/index.js');
  assert.equal(host.name, 'whaleGirl'); assert.deepEqual(host.inject, ['agents']);
  let service, cleanup;
  host.apply({ get: () => ({ list: () => [], roots: () => [] }),
    provide(key, value) { assert.equal(key, 'whaleGirl'); service = value; },
    on(event, callback, options) { assert.equal(event, 'session/event'); assert.equal(options.global, true); assert.equal(typeof callback, 'function'); },
    effect(factory) { cleanup = factory(); },
  });
  assert.equal(service.typertRemote.service, service);
  const stream = service.watch(new AbortController().signal);
  assert.equal((await stream.next()).value.type, 'baseline'); cleanup();
  assert.equal((await stream.next()).done, true);
  assert.doesNotMatch(read('lib/index.js'), /from ['"](?:node:)?(?:fs|http|https|child_process)|createServer|writeFile|fetch\(/);
});
test('embedded bubble fonts ship with OFL notices and no runtime font dependency', () => {
  let total = 0;
  for (const language of ['en', 'zh']) {
    const bytes = fs.readFileSync(path.join(root, `assets/fonts/bubble-${language}.woff2`));
    assert.equal(bytes.toString('ascii', 0, 4), 'wOF2'); total += bytes.length;
  }
  assert.ok(total < 150000, 'Only a compact bubble subset belongs in the runtime');
  const notices = fs.readdirSync(path.join(root, 'assets/fonts')).filter(name => /OFL|LICENSE/i.test(name));
  assert.ok(notices.length >= 2);
  for (const notice of notices) assert.match(read(`assets/fonts/${notice}`), /SIL OPEN FONT LICENSE/);
  assert.ok(manifest.files.includes('FONT-LICENSES.md'));
  assert.match(read('FONT-LICENSES.md'), /Fredoka/); assert.match(read('FONT-LICENSES.md'), /ZCOOL/);
  assert.match(read('lib/client.js'), /data:font\/woff2;base64,/);
});
test('the sliced character sprites are attributed, sized and bundled, without source paths', () => {
  const sprites = JSON.parse(read('assets/sprites/manifest.json'));
  assert.equal(sprites.character.name, '鲸鱼娘');
  assert.equal(sprites.character.credit, 'ZipZipPipe');
  assert.equal(sprites.character.license, 'MIT');
  assert.deepEqual(Object.keys(sprites.states).sort(), ['celebrate', 'drag', 'error', 'resting', 'sleeping', 'waiting', 'working']);
  let frames = 0, bytes = 0;
  for (const [state, sprite] of Object.entries(sprites.states)) {
    assert.ok(sprite.count >= 1 && sprite.frames.length === sprite.count, `${state} frame count`);
    assert.ok(sprite.fps >= 1 && sprite.fps <= 12, `${state} fps`);
    assert.ok(['loop', 'pingpong', 'once', 'blink'].includes(sprite.playback), `${state} playback`);
    for (const file of sprite.frames) {
      const png = fs.readFileSync(path.join(root, 'assets/sprites', file));
      assert.equal(png.subarray(0, 8).toString('latin1'), '\x89PNG\r\n\x1a\n', file);
      frames++; bytes += png.length;
    }
  }
  assert.equal(frames, 15);
  assert.ok(bytes < 1600000, `the shipped frames stay within the sprite budget (${bytes} bytes)`);
  // The counter anchor is measured from the working frames, so the art cannot drift away from it.
  assert.match(sprites.counter.source, /light bulb/);
  assert.deepEqual(sprites.counter.viewBox, [103, 114]);
  const [left, top, right, bottom] = sprites.counter.bulb;
  assert.ok(left < right && top < bottom, `the measured bulb box ${sprites.counter.bulb} is not a box`);
  assert.ok(left > 0 && bottom < sprites.counter.viewBox[1], 'the bulb box stays inside the frame');
  assert.ok(Math.abs((left + right) / 2 - sprites.counter.anchor[0]) <= 0.1);
  assert.ok(Math.abs((top + bottom) / 2 - sprites.counter.anchor[1]) <= 0.1);
  assert.ok(sprites.counter.bulbTop > 0 && sprites.counter.bulbTop <= top,
    `the bulb draws up to ${sprites.counter.bulbTop} but its solid box starts at ${top}`);
  assert.ok(sprites.counter.anchor[0] > 0 && sprites.counter.anchor[0] < sprites.counter.viewBox[0]);
  assert.ok(sprites.counter.anchor[1] > 0 && sprites.counter.anchor[1] < sprites.counter.viewBox[1]);
  // assets/ carries the character frames and the plugin-manager icon as PNGs; no SVG artwork is shipped.
  assert.deepEqual(fs.readdirSync(path.join(root, 'assets')).filter(name => name.endsWith('.svg')), []);
  assert.ok(fs.existsSync(path.join(root, 'assets/icon.png')));
  assert.match(read('ASSETS-LICENSE.md'), /ZipZipPipe/);
  assert.match(read('ASSETS-LICENSE.md'), /MIT/);
  assert.match(read('lib/client.js'), /data:image\/png;base64,/);
  assert.doesNotMatch(read('lib/client.js'), /data:image\/svg\+xml;base64,/);
  assert.doesNotMatch(read('lib/client.js'), /\/Users\/|fetch\(|XMLHttpRequest|dsh-pet-research|bridge-build-probe/);
  assert.doesNotMatch(read('lib/remote.js'), /\/Users\/|dsh-pet-research|bridge-build-probe/);
  assert.doesNotMatch(read('tools/build.mjs'), /tools\/fixtures|dsh-chevron\.svg/);
  assert.ok(!read('lib/client.js').includes('M 4 6 L 8 10 L 12 6'), 'the generic stand-in chevron never leaks into the production bundle');
});
test('manifest icon is a shippable, inert, package-relative image within DSH limits', () => {
  const icon = manifest.icon;
  assert.equal(typeof icon, 'string');
  // DSH accepts only a relative file path; absolute paths, URLs and data: URIs are rejected.
  assert.doesNotMatch(icon, /^(?:[A-Za-z]:[\\/]|[\\/]|[A-Za-z][A-Za-z\d+.-]*:)/);
  const ext = path.extname(icon).toLowerCase();
  assert.ok(['.svg', '.png', '.jpg', '.jpeg', '.webp'].includes(ext),
    'DSH accepts SVG, PNG, JPEG and WebP plugin icons');
  const resolved = path.resolve(root, icon);
  const relative = path.relative(root, resolved);
  assert.ok(!relative.startsWith('..') && !path.isAbsolute(relative));
  const stat = fs.statSync(resolved);
  assert.ok(stat.isFile());
  assert.ok(stat.size <= 256 * 1024, 'the icon must stay within the 256 KiB DSH limit');
  const bytes = fs.readFileSync(resolved);
  if (ext === '.svg') {
    const svg = bytes.toString('utf8');
    assert.match(svg, /^<svg\s/);
    assert.doesNotMatch(svg, /<script|<foreignObject|\son\w+\s*=|\shref\s*=|\sstyle\s*=|javascript:|data:/i);
    assert.doesNotMatch(svg.replace(/xmlns="http:\/\/www\.w3\.org\/2000\/svg"/g, ''), /https?:\/\//);
    const tags = [...svg.matchAll(/<\/?([a-zA-Z][\w:-]*)\b/g)].map(match => match[1]);
    assert.deepEqual([...new Set(tags)].sort(), ['defs', 'linearGradient', 'path', 'stop', 'svg']);
  } else {
    // Raster icons must be real images: check the container's magic bytes and, for
    // PNG, a sane canvas size (parsed from the IHDR chunk).
    if (ext === '.png') {
      assert.deepEqual([...bytes.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 'PNG magic bytes');
      const width = bytes.readUInt32BE(16);
      const height = bytes.readUInt32BE(20);
      assert.ok(width > 0 && height > 0 && width <= 1024 && height <= 1024,
        `PNG canvas ${width}x${height} is sane`);
    } else if (ext === '.jpg' || ext === '.jpeg') {
      assert.deepEqual([...bytes.subarray(0, 3)], [0xff, 0xd8, 0xff], 'JPEG magic bytes');
    } else {
      assert.equal(bytes.subarray(0, 4).toString('latin1'), 'RIFF', 'WebP RIFF header');
      assert.equal(bytes.subarray(8, 12).toString('latin1'), 'WEBP', 'WebP magic bytes');
    }
  }
  // The icon is the whale-girl waiting frame itself (assets/icon.png), scaled onto a
  // rounded light plate; the structural checks above guard its packaging.
  assert.equal(fs.existsSync(path.join(root, 'assets/working.svg')), false);
  // assets/ is published, so the icon travels with the package.
  assert.ok(manifest.files.includes('assets'));
});
