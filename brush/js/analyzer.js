// Stroke analysis shared by the camera and motion-sensor trackers.
//
// Samples are pushed as (time in seconds, vector). In "position" mode the
// vector is the brushing hand's position in centimetres; in "accel" mode it
// is linear acceleration in m/s². The analyzer finds the main axis of
// back-and-forth motion, counts direction reversals (one reversal = one
// stroke), and derives stroke rate, stroke length, speed, direction and
// rhythm from them.

export const TARGETS = {
  // Back-and-forth cycles per second (one cycle = two strokes).
  rate: { min: 1.5, max: 4.0 },
  // Peak-to-peak stroke length in cm (about 1–2 teeth wide).
  length: { min: 0.6, max: 2.5 },
};

export class StrokeAnalyzer {
  constructor({ mode = "position", windowSec = 1.6, hysteresis } = {}) {
    this.mode = mode;
    this.windowSec = windowSec;
    // Minimum swing that counts as a reversal: 3 mm of hand travel, or
    // 0.8 m/s² of acceleration.
    this.hysteresis = hysteresis ?? (mode === "accel" ? 0.8 : 0.3);
    this.samples = [];
    this.totalStrokes = 0;
    this.lastCountedT = -Infinity;
  }

  reset() {
    this.samples = [];
    this.totalStrokes = 0;
    this.lastCountedT = -Infinity;
  }

  push(t, vec) {
    this.samples.push({ t, v: vec.slice() });
    const cutoff = t - this.windowSec;
    while (this.samples.length && this.samples[0].t < cutoff) this.samples.shift();
  }

  compute(now) {
    const idle = {
      active: false, rate: 0, length: 0, speed: 0, angle: 0,
      circularity: 0, rhythm: 0, totalStrokes: this.totalStrokes,
    };
    const s = this.samples;
    if (s.length < 8 || now - s[s.length - 1].t > 0.4) return idle;
    const span = s[s.length - 1].t - s[0].t;
    if (span < 0.6) return idle;

    const dims = s[0].v.length;
    const centred = detrend(s, dims);
    const { axis, ratio } = principalAxis(centred, dims);
    const proj = centred.map((v) => dot(v, axis));
    const turns = reversals(proj, s.map((x) => x.t), this.hysteresis);

    // Count strokes once each, even though windows overlap.
    for (const r of turns) {
      if (r.t > this.lastCountedT) {
        this.totalStrokes++;
        this.lastCountedT = r.t;
      }
    }

    const recent = turns.filter((r) => now - r.t < 0.9);
    if (turns.length < 2 || recent.length === 0) return { ...idle, totalStrokes: this.totalStrokes };

    const halfPeriods = [];
    const swings = [];
    for (let i = 1; i < turns.length; i++) {
      halfPeriods.push(turns[i].t - turns[i - 1].t);
      swings.push(Math.abs(turns[i].value - turns[i - 1].value));
    }
    const meanHalf = mean(halfPeriods);
    const rate = 1 / (2 * meanHalf);
    let length = median(swings);
    if (this.mode === "accel") {
      // For a sinusoid, displacement amplitude = acceleration amplitude / ω².
      const w = 2 * Math.PI * rate;
      length = (length / (w * w)) * 100; // metres → cm
    }
    // A full cycle travels twice the stroke length.
    const speed = 2 * length * rate;
    const cv = halfPeriods.length > 1 ? stdev(halfPeriods) / meanHalf : 0.5;
    const rhythm = clamp(1 - cv / 0.6, 0, 1);
    // 0° = horizontal (side to side), 90° = vertical (up and down).
    const angle = dims >= 2
      ? Math.abs((Math.atan2(axis[1], axis[0]) * 180) / Math.PI) % 180
      : 0;

    return {
      active: length > 0.25,
      rate,
      length,
      speed,
      angle: angle > 90 ? 180 - angle : angle,
      circularity: ratio,
      rhythm,
      totalStrokes: this.totalStrokes,
    };
  }
}

// Score one moment of brushing, 0–100. `onTarget` is null when the zone
// cannot be checked (motion-sensor mode).
export function scoreMoment(m, onTarget) {
  if (!m.active) return 0;
  const rateScore = bandScore(m.rate, TARGETS.rate.min, TARGETS.rate.max, 1.0);
  const lengthScore = bandScore(m.length, TARGETS.length.min, TARGETS.length.max, 1.5);
  const zoneScore = onTarget === null ? 1 : onTarget ? 1 : 0.3;
  return Math.round(100 * (0.35 * rateScore + 0.3 * lengthScore + 0.2 * zoneScore + 0.15 * m.rhythm));
}

// Pick the single most useful piece of advice for this moment.
export function feedbackFor(m, { tracking, onTarget, zoneLabel }) {
  if (!tracking) return { level: "warn", text: tracking === null ? "Starting…" : "Can't see you. Face the camera with your hand in view." };
  if (!m.active) return { level: "info", text: "Start brushing" };
  if (onTarget === false) return { level: "warn", text: `Move to ${zoneLabel}` };
  if (m.rate > TARGETS.rate.max + 0.8) return { level: "bad", text: "Too fast. Slow down and be gentle." };
  if (m.rate > TARGETS.rate.max) return { level: "warn", text: "A little slower" };
  if (m.length > TARGETS.length.max + 1) return { level: "bad", text: "Strokes too long. Cover 1–2 teeth at a time." };
  if (m.length > TARGETS.length.max) return { level: "warn", text: "Slightly shorter strokes" };
  if (m.rate < TARGETS.rate.min - 0.5) return { level: "warn", text: "Too slow. Pick up the pace a bit." };
  if (m.rate < TARGETS.rate.min) return { level: "warn", text: "A little faster" };
  if (m.angle < 20 && m.circularity < 0.15 && m.length > 1.8) {
    return { level: "warn", text: "Long side-to-side scrubbing. Try small circles." };
  }
  if (m.rhythm < 0.35) return { level: "warn", text: "Keep a steady rhythm" };
  return { level: "good", text: "Great technique, keep going!" };
}

// 1 inside [lo, hi], falling linearly to 0 at `soft` units outside it.
export function bandScore(x, lo, hi, soft) {
  if (x >= lo && x <= hi) return 1;
  const d = x < lo ? lo - x : x - hi;
  return clamp(1 - d / soft, 0, 1);
}

// Subtract a ~0.7 s moving average so slow drift (moving between zones,
// gravity in accel mode) doesn't look like a stroke.
function detrend(s, dims) {
  const out = [];
  let lo = 0;
  let hi = 0;
  const sum = new Array(dims).fill(0);
  for (let i = 0; i < s.length; i++) {
    while (hi < s.length && s[hi].t <= s[i].t + 0.35) {
      for (let d = 0; d < dims; d++) sum[d] += s[hi].v[d];
      hi++;
    }
    while (s[lo].t < s[i].t - 0.35) {
      for (let d = 0; d < dims; d++) sum[d] -= s[lo].v[d];
      lo++;
    }
    const n = hi - lo;
    out.push(s[i].v.map((x, d) => x - sum[d] / n));
  }
  return out;
}

// Dominant direction of motion via power iteration on the covariance
// matrix. `ratio` is second/first variance: ~0 for straight lines,
// ~1 for circles.
function principalAxis(vs, dims) {
  const cov = Array.from({ length: dims }, () => new Array(dims).fill(0));
  for (const v of vs) {
    for (let i = 0; i < dims; i++) for (let j = 0; j < dims; j++) cov[i][j] += v[i] * v[j];
  }
  let axis = new Array(dims).fill(0).map((_, i) => (i === 0 ? 1 : 0.5));
  let lambda = 0;
  for (let k = 0; k < 30; k++) {
    const next = cov.map((row) => dot(row, axis));
    lambda = Math.hypot(...next);
    if (lambda === 0) break;
    axis = next.map((x) => x / lambda);
  }
  const trace = cov.reduce((acc, row, i) => acc + row[i], 0);
  const rest = Math.max(0, trace - lambda);
  const second = dims > 2 ? rest / (dims - 1) : rest;
  return { axis, ratio: lambda > 0 ? clamp(second / lambda, 0, 1) : 0 };
}

// Direction reversals with hysteresis, so sensor jitter isn't counted.
function reversals(xs, ts, hyst) {
  const out = [];
  let dir = 0;
  let hiV = xs[0], hiT = ts[0], loV = xs[0], loT = ts[0];
  for (let i = 1; i < xs.length; i++) {
    const x = xs[i];
    if (dir !== -1 && x > hiV) { hiV = x; hiT = ts[i]; }
    if (dir !== 1 && x < loV) { loV = x; loT = ts[i]; }
    if (dir !== -1 && x < hiV - hyst) {
      if (dir === 1) out.push({ t: hiT, value: hiV });
      dir = -1;
      loV = x; loT = ts[i];
    } else if (dir !== 1 && x > loV + hyst) {
      if (dir === -1) out.push({ t: loT, value: loV });
      dir = 1;
      hiV = x; hiT = ts[i];
    }
  }
  return out;
}

const dot = (a, b) => a.reduce((acc, x, i) => acc + x * b[i], 0);
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const stdev = (xs) => {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
};
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};
export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
