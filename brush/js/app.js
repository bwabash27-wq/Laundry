import { StrokeAnalyzer, TARGETS, scoreMoment, feedbackFor, clamp } from "./analyzer.js";
import { Coach, ZONES, ZONE_SECONDS, sideOf } from "./coach.js";
import { startCamera } from "./camera.js";
import { startMotion } from "./motion.js";

const $ = (id) => document.getElementById(id);
const HISTORY_KEY = "brush-coach-history";

const ui = {
  intro: $("intro"), live: $("live"), results: $("results"),
  video: $("video"), overlay: $("overlay"), trace: $("trace"), motionViz: $("motion-viz"),
  status: $("status"), feedback: $("feedback"),
  ring: $("ring"), timeLeft: $("time-left"),
  zoneName: $("zone-name"), zoneSide: $("zone-side"), mouth: $("mouth"),
  voice: $("voice"), introError: $("intro-error"),
};

let session = null;

// ---------- Session lifecycle ----------

async function begin(mode) {
  ui.introError.hidden = true;
  const buttons = document.querySelectorAll(".mode");
  buttons.forEach((b) => (b.disabled = true));
  // Speech must be unlocked from a tap on iOS.
  speak("");

  const s = {
    mode,
    analyzer: new StrokeAnalyzer({ mode: mode === "motion" ? "accel" : "position" }),
    coach: new Coach({ checksZone: mode !== "motion" }),
    last: null, tracking: null, side: null, sideVotes: [], trail: [], raw: [],
    message: null, messageSince: 0, spokenAt: 0, stop: null, timer: null, wakeLock: null,
  };
  session = s;
  show("live");
  ui.motionViz.hidden = mode !== "motion";
  ui.video.hidden = mode === "motion";
  ui.overlay.hidden = mode === "motion";
  buildMouth();
  renderRoutine();

  try {
    if (mode === "camera") {
      s.stop = await startCamera(ui.video, onCameraFrame, setStatus);
    } else if (mode === "motion") {
      s.tracking = true;
      s.stop = await startMotion((t, v) => {
        s.analyzer.push(t, v);
        s.raw.push({ t, v });
      });
    } else {
      s.stop = startDemo();
    }
  } catch (err) {
    console.error(err);
    end(false);
    showIntroError(err);
    return;
  } finally {
    buttons.forEach((b) => (b.disabled = false));
  }

  try {
    s.wakeLock = await navigator.wakeLock?.request("screen");
  } catch { /* screen may dim; not fatal */ }

  setStatus("");
  speak(`Let's go. Start with the ${ZONES[0].label}.`, true);
  s.lastTick = performance.now();
  s.timer = setInterval(tick, 100);
  requestAnimationFrame(draw);
}

function end(showReport = true) {
  const s = session;
  if (!s) return;
  session = null;
  clearInterval(s.timer);
  try { s.stop?.(); } catch { /* already stopped */ }
  s.wakeLock?.release?.().catch(() => {});
  if (!showReport || s.coach.activeTotal < 5) {
    show("intro");
    renderHistory();
    return;
  }
  const summary = { ...s.coach.summary(), mode: s.mode };
  if (s.mode !== "demo") saveHistory(summary);
  renderResults(summary);
  show("results");
  speak(`All done. Your technique score is ${summary.score}.`, true);
}

function show(name) {
  for (const k of ["intro", "live", "results"]) ui[k].hidden = k !== name;
  window.scrollTo(0, 0);
}

function setStatus(text) {
  ui.status.hidden = !text;
  ui.status.textContent = text;
}

function showIntroError(err) {
  let msg = err?.message || String(err);
  if (err?.name === "NotAllowedError") msg = "Camera access was blocked. Allow it in your browser's site settings, then try again.";
  if (err?.name === "NotFoundError") msg = "No camera found. Try motion-sensor mode on a phone.";
  if (!window.isSecureContext) msg += " (The camera and sensors need the page to be served over https.)";
  ui.introError.textContent = msg;
  ui.introError.hidden = false;
}

// ---------- Tracking input ----------

function onCameraFrame(frame) {
  const s = session;
  if (!s) return;
  s.frame = frame;
  s.tracking = !!frame.rel;
  if (frame.rel) {
    s.analyzer.push(frame.t, [frame.rel.x, frame.rel.y]);
    // Majority vote over the last ~0.6 s so the side doesn't flicker.
    s.sideVotes.push(sideOf(frame.rel.side));
    if (s.sideVotes.length > 18) s.sideVotes.shift();
    const counts = {};
    for (const v of s.sideVotes) counts[v] = (counts[v] || 0) + 1;
    s.side = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
    s.trail.push({ x: frame.hand.x, y: frame.hand.y, t: frame.t });
  }
  const cutoff = frame.t - 0.8;
  while (s.trail.length && s.trail[0].t < cutoff) s.trail.shift();
}

// Synthetic brushing for trying the UI without a camera (?demo).
function startDemo() {
  let alive = true;
  const t0 = performance.now() / 1000;
  const loop = () => {
    if (!alive || !session) return;
    const t = performance.now() / 1000;
    const phase = Math.floor((t - t0) / 6) % 4;
    const hz = [2.6, 5.5, 2.4, 1.0][phase];
    const amp = [1.4, 1.4, 4.2, 1.2][phase];
    const zone = session.coach.current ?? ZONES[0];
    const offset = { left: 0.25, front: 0, right: -0.25 }[zone.side];
    const x = (amp / 2) * Math.sin(2 * Math.PI * hz * (t - t0)) + (Math.random() - 0.5) * 0.08;
    const y = (Math.random() - 0.5) * 0.08;
    onCameraFrame({
      t, width: 640, height: 480, rel: { x, y, side: offset },
      hand: { x: 320 + offset * 400 + x * 25, y: 330 + y * 25 },
      face: { mouth: { x: 320, y: 300 }, width: 220 },
    });
    setTimeout(loop, 33);
  };
  loop();
  return () => (alive = false);
}

// ---------- Main loop ----------

function tick() {
  const s = session;
  if (!s) return;
  const now = performance.now();
  const dt = Math.min(0.5, (now - s.lastTick) / 1000);
  s.lastTick = now;

  const m = s.analyzer.compute(now / 1000);
  const zone = s.coach.current;
  const onTarget = s.mode === "motion" || !s.tracking ? null : s.side === zone.side;
  const score = scoreMoment(m, onTarget);
  const goodRate = m.active && m.rate >= TARGETS.rate.min && m.rate <= TARGETS.rate.max;
  const changed = s.coach.tick(dt, {
    active: m.active && s.tracking !== false,
    onTarget,
    score,
    goodRate,
    strokes: m.totalStrokes,
  });

  s.last = m;
  renderMetrics(m, score, onTarget);
  renderRoutine(onTarget);

  if (s.coach.done) {
    end(true);
    return;
  }
  if (changed) {
    chime();
    vibrate([60, 60, 60]);
    speak(`Now the ${s.coach.current.label}.`, true);
    setFeedback({ level: "info", text: `Move to the ${s.coach.current.label}` }, true);
    return;
  }

  const fb = feedbackFor(m, { tracking: s.tracking, onTarget, zoneLabel: `the ${zone.label}` });
  setFeedback(fb);
}

// Hold each message briefly so the banner doesn't flicker, and speak
// corrections that persist.
function setFeedback(fb, force = false) {
  const s = session;
  const now = performance.now();
  if (!force && s.message && s.message.text !== fb.text && now - s.messageSince < 900) return;
  if (!s.message || s.message.text !== fb.text) {
    s.message = fb;
    s.messageSince = now;
    s.messageSpoken = force;
    ui.feedback.textContent = fb.text;
    ui.feedback.dataset.level = fb.level;
  }
  if (!s.messageSpoken && (fb.level === "warn" || fb.level === "bad") && now - s.messageSince > 1500 && now - s.spokenAt > 5000) {
    s.messageSpoken = true;
    speak(fb.text);
    if (s.mode === "motion" && fb.level === "bad") vibrate(200);
  }
}

// ---------- Rendering ----------

function levelFor(x, lo, hi, soft) {
  if (x >= lo && x <= hi) return "good";
  return x < lo - soft || x > hi + soft ? "bad" : "warn";
}

function setMetric(id, value, level) {
  const el = $(id);
  el.querySelector("b").textContent = value;
  if (level) el.dataset.level = level;
  else delete el.dataset.level;
}

function setGauge(id, value, lo, hi, max) {
  const g = $(id).querySelector(".gauge");
  if (!g) return;
  g.querySelector(".band").style.left = `${(lo / max) * 100}%`;
  g.querySelector(".band").style.width = `${((hi - lo) / max) * 100}%`;
  g.querySelector(".needle").style.left = `${clamp(value / max, 0, 1) * 100}%`;
  g.classList.toggle("on", value > 0);
}

function renderMetrics(m, score, onTarget) {
  const s = session;
  const r = TARGETS.rate;
  const l = TARGETS.length;
  if (m.active) {
    // Shown as strokes per minute (two strokes per back-and-forth cycle).
    setMetric("m-rate", Math.round(m.rate * 120), levelFor(m.rate, r.min, r.max, 0.8));
    setMetric("m-length", m.length.toFixed(1), levelFor(m.length, l.min, l.max, 1));
    setMetric("m-speed", m.speed.toFixed(1), levelFor(m.speed, 2 * l.min * r.min, 2 * l.max * r.max, 4));
    setMetric("m-score", score, score >= 75 ? "good" : score >= 50 ? "warn" : "bad");
  } else {
    for (const id of ["m-rate", "m-length", "m-speed", "m-score"]) setMetric(id, "–");
  }
  setGauge("m-rate", m.active ? m.rate : 0, r.min, r.max, 6.5);
  setGauge("m-length", m.active ? m.length : 0, l.min, l.max, 5);
  setMetric("m-strokes", m.totalStrokes);

  const sum = s.coach.zones.reduce((a, z) => ({ on: a.on + z.onTarget, act: a.act + z.active }), { on: 0, act: 0 });
  if (s.mode === "motion") {
    $("m-accuracy").querySelector(".metric-label").textContent = "Brushing time";
    setMetric("m-accuracy", `${Math.round(s.coach.activeTotal)}s`);
    $("m-accuracy").querySelector("small").textContent = "";
  } else {
    const pct = sum.act > 1 ? Math.round((100 * sum.on) / sum.act) : null;
    setMetric("m-accuracy", pct ?? "–", pct == null ? null : pct >= 75 ? "good" : pct >= 50 ? "warn" : "bad");
  }
}

function renderRoutine(onTarget = null) {
  const s = session;
  const total = ZONE_SECONDS * ZONES.length;
  const done = s.coach.activeTotal;
  const left = Math.max(0, Math.ceil(total - done));
  ui.timeLeft.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  ui.ring.style.strokeDasharray = `${(done / total) * 100} 100`;
  ui.ring.style.opacity = done > 0 ? 1 : 0;

  const zone = s.coach.current;
  if (zone) ui.zoneName.textContent = zone.label;
  if (s.mode === "motion" || !zone) {
    ui.zoneSide.textContent = "Outer, inner and chewing surfaces";
    ui.zoneSide.className = "zone-side";
  } else if (s.side && s.tracking) {
    ui.zoneSide.textContent = onTarget ? "✓ You're on the right side" : `You seem to be on the ${s.side === "front" ? "front" : s.side + " side"}`;
    ui.zoneSide.className = `zone-side ${onTarget ? "ok" : "off"}`;
  } else {
    ui.zoneSide.textContent = "";
  }

  s.coach.zones.forEach((z, i) => {
    const g = ui.mouth.querySelector(`[data-zone="${z.id}"]`);
    const fill = g.querySelector(".seg-fill");
    fill.style.strokeDasharray = `${(Math.min(z.active, ZONE_SECONDS) / ZONE_SECONDS) * 100} 100`;
    // A zero-length dash still draws a round cap, so hide it until it grows.
    fill.style.opacity = z.active > 0 ? 1 : 0;
    g.classList.toggle("current", i === s.coach.index);
    g.classList.toggle("done", z.active >= ZONE_SECONDS);
  });
}

// Upper and lower arches, each split into left / front / right, drawn as
// if you're looking in a mirror (your left on the left).
function buildMouth() {
  const arc = (cx, cy, rx, ry, a0, a1) => {
    const p = (a) => [cx + rx * Math.cos((a * Math.PI) / 180), cy + ry * Math.sin((a * Math.PI) / 180)];
    const [x0, y0] = p(a0);
    const [x1, y1] = p(a1);
    return `M${x0.toFixed(1)} ${y0.toFixed(1)} A${rx} ${ry} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  };
  const segs = {
    ul: arc(100, 78, 72, 52, 185, 232), uf: arc(100, 78, 72, 52, 246, 294), ur: arc(100, 78, 72, 52, 308, 355),
    lr: arc(100, 92, 72, 52, 5, 52), lf: arc(100, 92, 72, 52, 66, 114), ll: arc(100, 92, 72, 52, 128, 175),
  };
  ui.mouth.innerHTML = Object.entries(segs).map(([id, d]) => `
    <g data-zone="${id}">
      <path class="seg-track" d="${d}" pathLength="100"></path>
      <path class="seg-fill" d="${d}" pathLength="100"></path>
      <path class="seg-current" d="${d}" pathLength="100"></path>
    </g>`).join("") +
    `<text x="6" y="170">← Your left</text><text x="194" y="170" text-anchor="end">Your right →</text>
     <text x="100" y="82" text-anchor="middle">upper</text><text x="100" y="96" text-anchor="middle">lower</text>`;
}

function draw() {
  const s = session;
  if (!s) return;
  if (s.mode === "motion") drawTrace(s);
  else drawOverlay(s);
  requestAnimationFrame(draw);
}

function drawOverlay(s) {
  const f = s.frame;
  const c = ui.overlay;
  if (!f || !f.width) return;
  if (c.width !== f.width) { c.width = f.width; c.height = f.height; }
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, c.width, c.height);
  const color = { good: "#34d399", warn: "#fbbf24", bad: "#f87171", info: "#7dd3fc" }[s.message?.level ?? "info"];
  if (f.face) {
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(f.face.mouth.x, f.face.mouth.y, f.face.width * 0.22, f.face.width * 0.12, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (s.trail.length > 1) {
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = color;
    ctx.beginPath();
    s.trail.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.stroke();
  }
  if (f.hand) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(f.hand.x, f.hand.y, 9, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Motion mode: scrolling plot of acceleration, so you can see your strokes.
function drawTrace(s) {
  const c = ui.trace;
  const w = c.clientWidth * devicePixelRatio;
  const h = c.clientHeight * devicePixelRatio;
  if (c.width !== w) { c.width = w; c.height = h; }
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, w, h);
  const now = performance.now() / 1000;
  while (s.raw.length && s.raw[0].t < now - 4) s.raw.shift();
  if (s.raw.length < 2) return;
  const colors = ["#2dd4bf", "#7dd3fc", "#c4b5fd"];
  for (let d = 0; d < 3; d++) {
    const mean = s.raw.reduce((a, r) => a + r.v[d], 0) / s.raw.length;
    ctx.strokeStyle = colors[d];
    ctx.lineWidth = 2 * devicePixelRatio;
    ctx.beginPath();
    s.raw.forEach((r, i) => {
      const x = w - ((now - r.t) / 4) * w;
      const y = h * 0.42 - (r.v[d] - mean) * h * 0.04;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.stroke();
  }
}

function renderResults(r) {
  $("r-score").textContent = r.score;
  const stats = [
    [`${Math.floor(r.brushingSeconds / 60)}:${String(r.brushingSeconds % 60).padStart(2, "0")}`, "time brushing"],
    [`${r.coverage}%`, "zones covered"],
    [r.strokes, "strokes"],
    [`${r.goodSpeed}%`, "time at a good pace"],
  ];
  if (r.accuracy != null) stats.push([`${r.accuracy}%`, "on the right zone"]);
  $("r-stats").innerHTML = stats.map(([b, label]) => `<div class="stat"><b>${b}</b><span>${label}</span></div>`).join("");
  $("r-zones").innerHTML = r.zones.map((z) => `
    <li><span>${z.label}</span><span class="bar"><i style="width:${z.score}%"></i></span><span class="num">${z.score}</span></li>`).join("");

  const tips = [];
  if (r.coverage < 100) tips.push("Brush all six zones for the full 20 seconds each. You finished early.");
  if (r.goodSpeed < 60) tips.push("Aim for a steady 3 to 8 strokes a second. Gentle and controlled beats fast and hard.");
  if (r.accuracy != null && r.accuracy < 70) tips.push("Follow the zone prompts. Move the brush to the side shown on screen.");
  const weakest = [...r.zones].sort((a, b) => a.score - b.score)[0];
  if (weakest && weakest.score < 70) tips.push(`Your weakest zone was the ${weakest.label}. Give it extra attention next time.`);
  tips.push("Angle the bristles 45° toward the gumline and use short strokes, about one or two teeth wide.");
  $("r-tips").innerHTML = tips.map((t) => `<li>${t}</li>`).join("");
}

// ---------- History ----------

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; } catch { return []; }
}

function saveHistory(summary) {
  try {
    const h = [summary, ...loadHistory()].slice(0, 20);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(h));
  } catch { /* storage unavailable */ }
}

function renderHistory() {
  const h = loadHistory();
  $("history").hidden = h.length === 0;
  $("history-list").innerHTML = h.slice(0, 7).map((x) => {
    const d = new Date(x.date);
    const when = d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) +
      ", " + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    return `<li><span><span>${when}</span><br><span class="h-meta">${Math.round(x.brushingSeconds)}s · ${x.coverage}% covered · ${x.mode}</span></span><span class="h-score">${x.score}</span></li>`;
  }).join("");
}

// ---------- Sound, speech, haptics ----------

function speak(text, important = false) {
  if (!ui.voice.checked || !("speechSynthesis" in window)) return;
  if (important) speechSynthesis.cancel();
  else if (speechSynthesis.speaking) return;
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 1.05;
  speechSynthesis.speak(u);
  if (session && text) session.spokenAt = performance.now();
}

let audio;
function chime() {
  try {
    audio ??= new AudioContext();
    const t = audio.currentTime;
    [660, 880].forEach((f, i) => {
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + i * 0.12);
      g.gain.exponentialRampToValueAtTime(0.2, t + i * 0.12 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.12 + 0.25);
      o.connect(g).connect(audio.destination);
      o.start(t + i * 0.12);
      o.stop(t + i * 0.12 + 0.3);
    });
  } catch { /* audio unavailable */ }
}

function vibrate(pattern) {
  try { navigator.vibrate?.(pattern); } catch { /* unsupported */ }
}

// ---------- Wire up ----------

$("start-camera").addEventListener("click", () => begin("camera"));
$("start-motion").addEventListener("click", () => begin("motion"));
$("stop").addEventListener("click", () => end(true));
$("again").addEventListener("click", () => { show("intro"); renderHistory(); });
document.addEventListener("visibilitychange", () => { if (document.hidden && session) end(true); });
if (new URLSearchParams(location.search).has("demo")) begin("demo");
renderHistory();
