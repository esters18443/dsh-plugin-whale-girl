import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FRAME_MODES, DEFAULT_FPS, MIN_FPS, MAX_FPS, BLINK_HOLD,
  spriteFrom, initialFrame, advanceFrame, holdMs, isFinished, animates,
} from '../src/sprites.js';

// Step a sprite from its initial frame and return the explicit index list, including the start.
function walk(sprite, steps) {
  const list = [initialFrame(sprite).index];
  let frame = initialFrame(sprite);
  for (let i = 0; i < steps; i++) {
    frame = advanceFrame(sprite, frame);
    list.push(frame.index);
  }
  return list;
}

test('spriteFrom accepts a bare string, a string array and filters junk entries', () => {
  assert.deepEqual(spriteFrom('idle.png'), { frames: ['idle.png'], fps: DEFAULT_FPS, playback: 'loop', frameMs: null });
  assert.deepEqual(spriteFrom(['a.png', '', 3, null, undefined, 'b.png']).frames, ['a.png', 'b.png']);
  assert.deepEqual(spriteFrom(['ok.png']).frames, ['ok.png']);
  // Empty strings, non-strings and non-arrays yield an empty frame list.
  assert.deepEqual(spriteFrom('').frames, []);
  assert.deepEqual(spriteFrom([0, false, '', null]).frames, []);
  assert.deepEqual(spriteFrom(42).frames, []);
  assert.deepEqual(spriteFrom(null).frames, []);
  assert.deepEqual(spriteFrom(undefined).frames, []);
});

test('spriteFrom reads the object form for frames, fps and playback', () => {
  assert.deepEqual(spriteFrom({ frames: ['a', 'b'], fps: 4, playback: 'pingpong', frameMs: [100, 250] }), {
    frames: ['a', 'b'], fps: 4, playback: 'pingpong', frameMs: [100, 250],
  });
  // An object may also carry a bare string, and junk frames fall back to an empty list.
  assert.deepEqual(spriteFrom({ frames: 'solo.png' }).frames, ['solo.png']);
  assert.deepEqual(spriteFrom({ frames: ['a', 7, ''] }).frames, ['a']);
  assert.deepEqual(spriteFrom({ frames: {} }).frames, []);
  assert.deepEqual(spriteFrom({}).frames, []);
});

test('spriteFrom falls back to DEFAULT_FPS for invalid fps and never coerces strings', () => {
  const fallbacks = ['3', 0, -3, NaN, Infinity, -Infinity, null, undefined, 'fast', {}];
  for (const fps of fallbacks) {
    assert.equal(spriteFrom({ frames: ['a'], fps }).fps, DEFAULT_FPS, `fps ${String(fps)}`);
  }
  assert.equal(DEFAULT_FPS, 2);
  assert.equal(spriteFrom(['a', 'b']).fps, DEFAULT_FPS);
});

test('spriteFrom clamps fps into MIN_FPS..MAX_FPS at both ends', () => {
  assert.equal(spriteFrom({ frames: ['a'], fps: 0.5 }).fps, MIN_FPS);
  assert.equal(spriteFrom({ frames: ['a'], fps: 0.001 }).fps, MIN_FPS);
  assert.equal(spriteFrom({ frames: ['a'], fps: MIN_FPS }).fps, MIN_FPS);
  assert.equal(spriteFrom({ frames: ['a'], fps: 100 }).fps, MAX_FPS);
  assert.equal(spriteFrom({ frames: ['a'], fps: MAX_FPS }).fps, MAX_FPS);
  // In-range values are kept verbatim, not rounded.
  assert.equal(spriteFrom({ frames: ['a'], fps: 2.5 }).fps, 2.5);
  assert.deepEqual([MIN_FPS, MAX_FPS], [1, 12]);
});

test('spriteFrom only accepts known playback modes and otherwise loops', () => {
  assert.deepEqual(FRAME_MODES, ['loop', 'pingpong', 'once', 'blink']);
  for (const playback of FRAME_MODES) {
    assert.equal(spriteFrom({ frames: ['a'], playback }).playback, playback);
  }
  for (const playback of ['BOUNCE', 'Loop', '', 42, null, undefined, {}]) {
    assert.equal(spriteFrom({ frames: ['a'], playback }).playback, 'loop', `playback ${String(playback)}`);
  }
  // A bare string or array has no playback field at all.
  assert.equal(spriteFrom('idle.png').playback, 'loop');
});

test('spriteFrom keeps frameMs only when it matches the frame count with positive numbers', () => {
  assert.deepEqual(spriteFrom({ frames: ['a', 'b'], frameMs: [100, 250] }).frameMs, [100, 250]);
  assert.deepEqual(spriteFrom({ frames: ['a', 'b', 'c'], frameMs: [1, 2, 3.5] }).frameMs, [1, 2, 3.5]);
  // Wrong length, non-positive, non-finite or non-numeric entries invalidate the whole list.
  assert.equal(spriteFrom({ frames: ['a', 'b'], frameMs: [100] }).frameMs, null);
  assert.equal(spriteFrom({ frames: ['a'], frameMs: [100, 250] }).frameMs, null);
  assert.equal(spriteFrom({ frames: ['a', 'b'], frameMs: [100, 0] }).frameMs, null);
  assert.equal(spriteFrom({ frames: ['a', 'b'], frameMs: [100, -5] }).frameMs, null);
  assert.equal(spriteFrom({ frames: ['a', 'b'], frameMs: [100, NaN] }).frameMs, null);
  assert.equal(spriteFrom({ frames: ['a', 'b'], frameMs: [100, Infinity] }).frameMs, null);
  assert.equal(spriteFrom({ frames: ['a', 'b'], frameMs: [100, '250'] }).frameMs, null);
  assert.equal(spriteFrom({ frames: ['a', 'b'], frameMs: 100 }).frameMs, null);
  assert.equal(spriteFrom({ frames: ['a', 'b'] }).frameMs, null);
});

test('spriteFrom returns a fresh object with its own frames and frameMs arrays', () => {
  const source = { frames: ['a.png', 'b.png'], frameMs: [10, 20] };
  const first = spriteFrom(source);
  const second = spriteFrom(source);

  assert.notEqual(first, second);
  assert.notEqual(first.frames, second.frames);
  assert.notEqual(first.frames, source.frames);
  assert.notEqual(first.frameMs, source.frameMs);

  // Mutating one result must not leak into the other result or into the input.
  first.frames.push('c.png');
  first.frameMs[0] = 999;
  assert.deepEqual(second.frames, ['a.png', 'b.png']);
  assert.deepEqual(second.frameMs, [10, 20]);
  assert.deepEqual(source.frames, ['a.png', 'b.png']);
  assert.deepEqual(source.frameMs, [10, 20]);
});

test('initialFrame starts at frame 0 facing forward in every mode', () => {
  for (const playback of FRAME_MODES) {
    const sprite = spriteFrom({ frames: ['a', 'b', 'c'], playback });
    assert.deepEqual(initialFrame(sprite), { index: 0, direction: 1 });
  }
  assert.deepEqual(initialFrame(spriteFrom('solo.png')), { index: 0, direction: 1 });
  assert.deepEqual(initialFrame(spriteFrom(null)), { index: 0, direction: 1 });
  assert.deepEqual(initialFrame(undefined), { index: 0, direction: 1 });
});

test('advanceFrame loops forward through 3 frames and wraps', () => {
  const sprite = spriteFrom({ frames: ['a', 'b', 'c'], playback: 'loop' });
  assert.deepEqual(walk(sprite, 7), [0, 1, 2, 0, 1, 2, 0, 1]);
  assert.deepEqual(advanceFrame(sprite, initialFrame(sprite)), { index: 1, direction: 1 });
  // Loop never bounces, even when the incoming frame claims a backward direction.
  assert.deepEqual(advanceFrame(sprite, { index: 2, direction: -1 }), { index: 0, direction: 1 });
  assert.deepEqual(advanceFrame(sprite, { index: 0, direction: -1 }), { index: 1, direction: 1 });
});

test('advanceFrame pingpongs over 3 frames: 0,1,2,1,0,1,2', () => {
  const sprite = spriteFrom({ frames: ['a', 'b', 'c'], playback: 'pingpong' });
  assert.deepEqual(walk(sprite, 8), [0, 1, 2, 1, 0, 1, 2, 1, 0]);
  assert.deepEqual(advanceFrame(sprite, { index: 2, direction: 1 }), { index: 1, direction: -1 });
  assert.deepEqual(advanceFrame(sprite, { index: 0, direction: -1 }), { index: 1, direction: 1 });
  // In the middle the incoming direction is preserved.
  assert.deepEqual(advanceFrame(sprite, { index: 1, direction: -1 }), { index: 0, direction: -1 });
  assert.deepEqual(advanceFrame(sprite, { index: 1, direction: 1 }), { index: 2, direction: 1 });
});

test('advanceFrame pingpongs over 2 frames: 0,1,0,1', () => {
  const sprite = spriteFrom({ frames: ['a', 'b'], playback: 'pingpong' });
  assert.deepEqual(walk(sprite, 6), [0, 1, 0, 1, 0, 1, 0]);
  assert.deepEqual(advanceFrame(sprite, { index: 0, direction: 1 }), { index: 1, direction: 1 });
  assert.deepEqual(advanceFrame(sprite, { index: 1, direction: 1 }), { index: 0, direction: -1 });
  assert.deepEqual(advanceFrame(sprite, { index: 0, direction: -1 }), { index: 1, direction: 1 });
});

test('advanceFrame once stops on the last frame and stays there', () => {
  const sprite = spriteFrom({ frames: ['a', 'b', 'c'], playback: 'once' });
  assert.deepEqual(walk(sprite, 5), [0, 1, 2, 2, 2, 2]);
  assert.deepEqual(advanceFrame(sprite, { index: 2, direction: -1 }), { index: 2, direction: 1 });
});

test('advanceFrame blink plays 0..n-1 then returns to 0 without bouncing', () => {
  const three = spriteFrom({ frames: ['a', 'b', 'c'], playback: 'blink' });
  assert.deepEqual(walk(three, 6), [0, 1, 2, 0, 1, 2, 0]);
  assert.deepEqual(advanceFrame(three, { index: 2, direction: -1 }), { index: 0, direction: 1 });

  const two = spriteFrom({ frames: ['a', 'b'], playback: 'blink' });
  assert.deepEqual(walk(two, 5), [0, 1, 0, 1, 0, 1]);
});

test('advanceFrame normalises single-frame and empty sprites to index 0', () => {
  const single = spriteFrom('solo.png');
  assert.deepEqual(advanceFrame(single, { index: 0, direction: 1 }), { index: 0, direction: 1 });
  assert.deepEqual(advanceFrame(single, { index: 99, direction: -1 }), { index: 0, direction: 1 });
  assert.deepEqual(advanceFrame(single, { index: NaN, direction: NaN }), { index: 0, direction: 1 });
  assert.deepEqual(advanceFrame(single, undefined), { index: 0, direction: 1 });

  for (const playback of FRAME_MODES) {
    const empty = spriteFrom({ frames: [], playback });
    assert.deepEqual(advanceFrame(empty, { index: 5, direction: -1 }), { index: 0, direction: 1 });
    assert.deepEqual(advanceFrame(empty, undefined), { index: 0, direction: 1 });
  }
});

test('advanceFrame treats a non-numeric or out-of-range index as 0', () => {
  const sprite = spriteFrom({ frames: ['a', 'b', 'c'], playback: 'loop' });
  for (const index of [NaN, Infinity, 99, -5, -0.5, '1', null, undefined, {}]) {
    assert.deepEqual(advanceFrame(sprite, { index }), { index: 1, direction: 1 }, `index ${String(index)}`);
  }
  assert.deepEqual(advanceFrame(sprite, undefined), { index: 1, direction: 1 });
  assert.deepEqual(advanceFrame(sprite, {}), { index: 1, direction: 1 });
  // Out of range collapses to 0 first, so pingpong leaves from the left end.
  const bounce = spriteFrom({ frames: ['a', 'b', 'c'], playback: 'pingpong' });
  assert.deepEqual(advanceFrame(bounce, { index: 99 }), { index: 1, direction: 1 });
  assert.deepEqual(advanceFrame(bounce, { index: -5 }), { index: 1, direction: 1 });
});

test('advanceFrame always returns an integer index in range and a direction of 1 or -1', () => {
  const frames = ['a', 'b', 'c', 'd'];
  const junk = [undefined, null, {}, { index: NaN }, { index: -9 }, { index: 1.7 }, { index: 99, direction: 0 }];
  for (const playback of FRAME_MODES) {
    const sprite = spriteFrom({ frames, playback });
    for (const frame of junk) {
      const next = advanceFrame(sprite, frame);
      assert.equal(Number.isInteger(next.index), true, `${playback} index ${String(next.index)}`);
      assert.equal(next.index >= 0 && next.index <= frames.length - 1, true, `${playback} index ${next.index}`);
      assert.equal(next.direction === 1 || next.direction === -1, true, `${playback} direction ${next.direction}`);
    }
  }
  // Junk sprites must not throw either.
  assert.deepEqual(advanceFrame(null, { index: 3 }), { index: 0, direction: 1 });
  assert.deepEqual(advanceFrame(7, undefined), { index: 0, direction: 1 });
  assert.deepEqual(advanceFrame({ frames: 'nope' }, { index: 0 }), { index: 0, direction: 1 });
});

test('advanceFrame never consumes the random argument', () => {
  const boom = () => { throw new Error('random must not be used for stepping'); };
  for (const playback of FRAME_MODES) {
    const sprite = spriteFrom({ frames: ['a', 'b', 'c'], playback });
    assert.equal(Number.isInteger(advanceFrame(sprite, { index: 1 }, boom).index), true);
  }
});

test('holdMs converts fps to a rounded frame duration', () => {
  assert.equal(holdMs(spriteFrom({ frames: ['a', 'b'], fps: 4 }), { index: 0 }), 250);
  assert.equal(holdMs(spriteFrom({ frames: ['a', 'b'], fps: 7 }), { index: 1 }), 143);
  assert.equal(holdMs(spriteFrom({ frames: ['a', 'b'], fps: 3 }), { index: 0 }), 333);
  // Default fps 2 → 500ms, also when fps was rejected outright.
  assert.equal(holdMs(spriteFrom({ frames: ['a', 'b'] }), { index: 0 }), 500);
  assert.equal(holdMs(spriteFrom({ frames: ['a', 'b'], fps: '3' }), { index: 0 }), 500);
  // A rubbish frame normalises to index 0 rather than throwing.
  assert.equal(holdMs(spriteFrom({ frames: ['a', 'b'], fps: 4 }), { index: NaN }), 250);
});

test('holdMs gives per-frame frameMs precedence over fps in every mode', () => {
  for (const playback of FRAME_MODES) {
    const sprite = spriteFrom({ frames: ['a', 'b', 'c'], playback, fps: 10, frameMs: [120, 999, 250] });
    assert.equal(holdMs(sprite, { index: 0 }, () => 0.5), 120, `${playback} frame 0`);
    assert.equal(holdMs(sprite, { index: 1 }, () => 0.5), 999, `${playback} frame 1`);
    assert.equal(holdMs(sprite, { index: 2 }, () => 0.5), 250, `${playback} frame 2`);
  }
});

test('holdMs keeps the blink rest hold inside BLINK_HOLD for odd random values', () => {
  const sprite = spriteFrom({ frames: ['a', 'b', 'c'], playback: 'blink' });
  const randoms = [() => 0, () => 0.5, () => 0.999, () => 1, () => NaN, () => -1, () => '0.5', () => Infinity, null];
  for (const random of randoms) {
    const ms = holdMs(sprite, { index: 0 }, random);
    assert.equal(Number.isInteger(ms), true, `integer for ${String(random)}`);
    assert.equal(ms >= BLINK_HOLD[0] && ms <= BLINK_HOLD[1], true, `bounds for ${String(random)}: ${ms}`);
  }
  // Default Math.random must also stay in bounds.
  for (let i = 0; i < 50; i++) {
    const ms = holdMs(sprite, { index: 0 });
    assert.equal(ms >= BLINK_HOLD[0] && ms <= BLINK_HOLD[1], true, `default random: ${ms}`);
  }
  // Blink holds only apply on the rest frame; other frames use fps.
  assert.equal(holdMs(sprite, { index: 1 }, () => 0), 500);
});

test('holdMs pins both blink bounds and returns 0 for an empty or missing sprite', () => {
  const sprite = spriteFrom({ frames: ['a', 'b', 'c'], playback: 'blink' });
  assert.equal(holdMs(sprite, { index: 0 }, () => 0), BLINK_HOLD[0]);
  assert.equal(holdMs(sprite, { index: 0 }, () => 0.999999), BLINK_HOLD[1]);
  assert.deepEqual(BLINK_HOLD, [1200, 5000]);

  assert.equal(holdMs(spriteFrom({ frames: [] }), { index: 0 }), 0);
  assert.equal(holdMs(spriteFrom({ frames: [], playback: 'blink' }), { index: 0 }, () => 0.5), 0);
  assert.equal(holdMs(spriteFrom(null), undefined), 0);
  assert.equal(holdMs(undefined, { index: NaN }), 0);
});

test('isFinished is true only for once on the last frame of a multi-frame sheet', () => {
  const once = spriteFrom({ frames: ['a', 'b', 'c'], playback: 'once' });
  assert.equal(isFinished(once, { index: 0 }), false);
  assert.equal(isFinished(once, { index: 1 }), false);
  assert.equal(isFinished(once, { index: 2 }), true);
  // Frame 0 of a single-frame once sheet is never "finished"; it simply never animates.
  assert.equal(isFinished(spriteFrom({ frames: ['a'], playback: 'once' }), { index: 0 }), false);
  assert.equal(isFinished(spriteFrom({ frames: [], playback: 'once' }), { index: 0 }), false);
  assert.equal(isFinished(once, undefined), false);
  assert.equal(isFinished(once, { index: NaN }), false);
  assert.equal(isFinished(once, { index: -5 }), false);

  for (const playback of ['loop', 'pingpong', 'blink']) {
    const sprite = spriteFrom({ frames: ['a', 'b', 'c'], playback });
    assert.equal(isFinished(sprite, { index: 2 }), false, playback);
    assert.equal(isFinished(sprite, initialFrame(sprite)), false, playback);
  }
});

test('animates reports whether the sheet has more than one frame', () => {
  assert.equal(animates(spriteFrom('solo.png')), false);
  assert.equal(animates(spriteFrom(['a', 'b'])), true);
  assert.equal(animates(spriteFrom({ frames: [] })), false);
  assert.equal(animates(spriteFrom(null)), false);
  assert.equal(animates(null), false);
  assert.equal(animates(undefined), false);
});
