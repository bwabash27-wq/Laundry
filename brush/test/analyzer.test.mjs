// Run with: node --test brush/test/
import test from "node:test";
import assert from "node:assert/strict";
import { StrokeAnalyzer, scoreMoment, feedbackFor } from "../js/analyzer.js";

function run(a, { hz, ampCm, seconds = 3, fps = 30, vertical = false, noise = 0.05, circle = false }) {
  let m;
  for (let i = 0; i < seconds * fps; i++) {
    const t = i / fps;
    const p = (ampCm / 2) * Math.sin(2 * Math.PI * hz * t);
    const q = circle ? (ampCm / 2) * Math.cos(2 * Math.PI * hz * t) : 0;
    const n = () => (Math.random() - 0.5) * noise;
    a.push(t, vertical ? [q + n(), p + n()] : [p + n(), q + n()]);
    m = a.compute(t);
  }
  return m;
}

test("measures rate and stroke length of a good brushing motion", () => {
  const m = run(new StrokeAnalyzer(), { hz: 2.5, ampCm: 1.5 });
  assert.ok(m.active);
  assert.ok(Math.abs(m.rate - 2.5) < 0.3, `rate ${m.rate}`);
  assert.ok(Math.abs(m.length - 1.5) < 0.4, `length ${m.length}`);
  assert.ok(m.angle < 15, `angle ${m.angle}`);
  assert.equal(feedbackFor(m, { tracking: true, onTarget: true }).level, "good");
  assert.ok(scoreMoment(m, true) > 85);
});

test("counts strokes (two per cycle)", () => {
  const a = new StrokeAnalyzer();
  const m = run(a, { hz: 2, ampCm: 1.5, seconds: 5 });
  assert.ok(Math.abs(m.totalStrokes - 20) <= 2, `strokes ${m.totalStrokes}`);
});

test("flags fast, long and slow brushing", () => {
  assert.equal(feedbackFor(run(new StrokeAnalyzer(), { hz: 6, ampCm: 1.5 }), { tracking: true, onTarget: true }).level, "bad");
  assert.match(feedbackFor(run(new StrokeAnalyzer(), { hz: 2.5, ampCm: 5 }), { tracking: true, onTarget: true }).text, /long/);
  assert.match(feedbackFor(run(new StrokeAnalyzer(), { hz: 0.8, ampCm: 1.5 }), { tracking: true, onTarget: true }).text, /slow/i);
});

test("detects vertical and circular motion", () => {
  assert.ok(run(new StrokeAnalyzer(), { hz: 2.5, ampCm: 1.5, vertical: true }).angle > 75);
  assert.ok(run(new StrokeAnalyzer(), { hz: 2.5, ampCm: 1.5, circle: true }).circularity > 0.7);
});

test("holding still is idle", () => {
  const m = run(new StrokeAnalyzer(), { hz: 2, ampCm: 0, noise: 0.1 });
  assert.equal(m.active, false);
});

test("accel mode recovers stroke length from acceleration", () => {
  const a = new StrokeAnalyzer({ mode: "accel" });
  const hz = 3, ampM = 0.015, w = 2 * Math.PI * hz;
  let m;
  for (let i = 0; i < 180; i++) {
    const t = i / 60;
    a.push(t, [-(ampM / 2) * w * w * Math.sin(w * t), 0, 0]);
    m = a.compute(t);
  }
  assert.ok(Math.abs(m.rate - 3) < 0.3, `rate ${m.rate}`);
  assert.ok(Math.abs(m.length - 1.5) < 0.4, `length ${m.length}`);
});
