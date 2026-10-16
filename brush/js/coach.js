// The guided two-minute routine: six zones, 20 seconds of active brushing
// each. Time only counts while you're actually brushing.

export const ZONES = [
  { id: "ul", label: "upper left", side: "left" },
  { id: "uf", label: "upper front", side: "front" },
  { id: "ur", label: "upper right", side: "right" },
  { id: "lr", label: "lower right", side: "right" },
  { id: "lf", label: "lower front", side: "front" },
  { id: "ll", label: "lower left", side: "left" },
];
export const ZONE_SECONDS = 20;

// Hand offset from the mouth, in face widths, beyond which we call it a side.
const SIDE_THRESHOLD = 0.09;

export function sideOf(sideOffset) {
  if (sideOffset > SIDE_THRESHOLD) return "left";
  if (sideOffset < -SIDE_THRESHOLD) return "right";
  return "front";
}

export class Coach {
  constructor({ checksZone }) {
    this.checksZone = checksZone;
    this.index = 0;
    this.zones = ZONES.map((z) => ({ ...z, active: 0, onTarget: 0, scoreSum: 0, goodRate: 0 }));
    this.startedAt = null;
    this.strokes = 0;
  }

  get current() {
    return this.zones[this.index];
  }

  get done() {
    return this.index >= this.zones.length;
  }

  get activeTotal() {
    return this.zones.reduce((a, z) => a + Math.min(z.active, ZONE_SECONDS), 0);
  }

  // Advance the routine by `dt` seconds. Returns true when the zone changes.
  tick(dt, { active, onTarget, score, goodRate, strokes }) {
    if (this.done) return false;
    this.startedAt ??= performance.now();
    this.strokes = strokes;
    if (!active) return false;
    const z = this.current;
    z.active += dt;
    z.scoreSum += score * dt;
    if (onTarget !== false) z.onTarget += dt;
    if (goodRate) z.goodRate += dt;
    if (z.active >= ZONE_SECONDS) {
      this.index++;
      return true;
    }
    return false;
  }

  summary() {
    const active = this.zones.reduce((a, z) => a + z.active, 0) || 1;
    const sum = (k) => this.zones.reduce((a, z) => a + z[k], 0);
    return {
      date: new Date().toISOString(),
      seconds: Math.round((performance.now() - (this.startedAt ?? performance.now())) / 1000),
      brushingSeconds: Math.round(this.activeTotal),
      score: Math.round(sum("scoreSum") / active),
      accuracy: this.checksZone ? Math.round((100 * sum("onTarget")) / active) : null,
      goodSpeed: Math.round((100 * sum("goodRate")) / active),
      coverage: Math.round((100 * this.activeTotal) / (ZONE_SECONDS * this.zones.length)),
      strokes: this.strokes,
      zones: this.zones.map((z) => ({
        id: z.id,
        label: z.label,
        coverage: Math.round((100 * Math.min(z.active, ZONE_SECONDS)) / ZONE_SECONDS),
        score: z.active ? Math.round(z.scoreSum / z.active) : 0,
        accuracy: z.active && this.checksZone ? Math.round((100 * z.onTarget) / z.active) : null,
      })),
    };
  }
}
