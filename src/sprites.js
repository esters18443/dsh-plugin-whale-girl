/**
 * 纯帧步进逻辑：只回答「下一帧是哪一张、当前这帧还停多久」，不碰 DOM / 定时器 / 图片。
 * 精灵表按水平方向排列；时长一律毫秒；随机数由调用方注入，因此可以直接单测。
 */

// 四种播放方式；取值不在表内一律回落 loop。
export const FRAME_MODES = ['loop', 'pingpong', 'once', 'blink'];
export const DEFAULT_FPS = 2;
export const MIN_FPS = 1;
export const MAX_FPS = 12;
// 随机眨眼间隔的 [下界, 上界]，毫秒。
export const BLINK_HOLD = [1200, 5000];

// 随机数上限压到 1 以下，保证 round 之后也落在 BLINK_HOLD 内。
const BLINK_RATIO_MAX = 1 - 1e-9;

// 只认真正的有限数：字符串 '3' 不算数，Infinity / NaN 也不算。
function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

// 帧表只保留非空字符串，其余条目（数字、空串、null）静默丢弃。
function frameList(value) {
  if (typeof value === 'string') return value.length > 0 ? [value] : [];
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const item of value) {
    if (typeof item === 'string' && item.length > 0) out.push(item);
  }
  return out;
}

function modeOf(value) {
  return FRAME_MODES.indexOf(value) >= 0 ? value : 'loop';
}

// 非法 fps 回落默认值，合法值再夹进 [MIN_FPS, MAX_FPS]。
function fpsOf(value) {
  if (!finiteNumber(value) || value <= 0) return DEFAULT_FPS;
  if (value < MIN_FPS) return MIN_FPS;
  if (value > MAX_FPS) return MAX_FPS;
  return value;
}

// 逐帧时长必须与帧数等长且每项都是正有限数，否则整份作废（复制一份，避免共享可变状态）。
function msList(value, count) {
  if (!Array.isArray(value) || value.length !== count) return null;
  for (const item of value) {
    if (!finiteNumber(item) || item <= 0) return null;
  }
  return value.slice();
}

// 读精灵表的公共入口：任何输入都不会抛错，缺字段按默认值处理。
function readSprite(sprite) {
  const source = sprite && typeof sprite === 'object' ? sprite : {};
  const frames = Array.isArray(source.frames) ? source.frames : [];
  return {
    count: frames.length,
    fps: fpsOf(source.fps),
    playback: modeOf(source.playback),
    frameMs: Array.isArray(source.frameMs) ? source.frameMs : null,
  };
}

// 当前帧号只认 [0, count-1] 内的有限数；越界、NaN、非数字一律当 0。
function frameIndex(frame, count) {
  const raw = frame && typeof frame === 'object' ? frame.index : undefined;
  if (!finiteNumber(raw)) return 0;
  const index = Math.trunc(raw);
  if (index < 0 || index > count - 1) return 0;
  return index;
}

// 只读帧号本身，不做越界归零，供「是否播完」这类判断使用。
function rawIndex(frame) {
  const raw = frame && typeof frame === 'object' ? frame.index : undefined;
  return finiteNumber(raw) ? Math.trunc(raw) : 0;
}

function frameDirection(frame) {
  return frame && typeof frame === 'object' && frame.direction === -1 ? -1 : 1;
}

// 宽容读取：字符串 / 字符串数组 / {frames, fps, playback, frameMs} 都接受。
export function spriteFrom(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  const frames = frameList(source ? source.frames : value);
  return {
    frames: frames,
    fps: fpsOf(source ? source.fps : undefined),
    playback: modeOf(source ? source.playback : undefined),
    frameMs: msList(source ? source.frameMs : undefined, frames.length),
  };
}

// 第 0 帧是每种模式下的静息/起始姿势。
export function initialFrame(sprite) {
  return { index: 0, direction: 1 };
}

// 给定当前帧，返回下一帧；帧步进是确定的，随机数只影响 holdMs 里的眨眼间隔。
export function advanceFrame(sprite, frame, random = Math.random) {
  const info = readSprite(sprite);
  const count = info.count;
  if (count <= 1) return { index: 0, direction: 1 };
  const index = frameIndex(frame, count);

  if (info.playback === 'pingpong') {
    // 撞到两端就掉头，中间保持原方向。
    let direction = frameDirection(frame);
    if (index >= count - 1) direction = -1;
    else if (index <= 0) direction = 1;
    return { index: index + direction, direction: direction };
  }
  if (info.playback === 'once') {
    // 停在最后一帧不再前进。
    return { index: Math.min(index + 1, count - 1), direction: 1 };
  }
  if (info.playback === 'blink') {
    // 从第 1 帧播到最后一帧，然后回到 0，绝不回弹。
    return { index: index >= count - 1 ? 0 : index + 1, direction: 1 };
  }
  return { index: (index + 1) % count, direction: 1 };
}

// 当前这帧还要停多久：逐帧时长优先，其次是 blink 静息帧的随机眨眼，最后按 fps 换算。
export function holdMs(sprite, frame, random = Math.random) {
  const info = readSprite(sprite);
  const count = info.count;
  if (count === 0) return 0;
  const index = frameIndex(frame, count);
  const perFrame = info.frameMs ? info.frameMs[index] : undefined;
  if (finiteNumber(perFrame) && perFrame > 0) return perFrame;
  if (info.playback === 'blink' && index === 0) return blinkHold(random);
  return Math.round(1000 / info.fps);
}

// 注入的随机数先夹进 [0, 1)，保证返回值是 BLINK_HOLD 区间内的整数。
function blinkHold(random) {
  const value = typeof random === 'function' ? random() : NaN;
  const ratio = finiteNumber(value) && value > 0 ? Math.min(value, BLINK_RATIO_MAX) : 0;
  return Math.round(BLINK_HOLD[0] + ratio * (BLINK_HOLD[1] - BLINK_HOLD[0]));
}

// 只有 once 且已经停在最后一帧才算播完；单帧精灵表永远不算播完。
export function isFinished(sprite, frame) {
  const info = readSprite(sprite);
  if (info.playback !== 'once' || info.count <= 1) return false;
  return rawIndex(frame) >= info.count - 1;
}

export function animates(sprite) {
  return readSprite(sprite).count > 1;
}
