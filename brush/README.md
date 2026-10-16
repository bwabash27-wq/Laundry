# Brush Coach

A browser app that watches you brush your teeth and gives live feedback on stroke rate, stroke length, brush speed, rhythm, and which part of your mouth you're on. A guided routine takes you through six zones (upper and lower, each split into left, front and right) with 20 seconds of active brushing each. The timer only runs while you're actually brushing.

There's no build step. It's plain HTML, CSS and JavaScript modules.

## Two ways to track

- **Camera.** Prop a phone or laptop up facing you. MediaPipe face and hand landmarks find your mouth and your brushing hand. The hand's motion relative to your mouth gives the stroke measurements, and its sideways offset tells which side you're on. Your face width (about 14 cm) is used to convert pixels to centimetres.
- **Motion sensor.** Strap your phone to your brushing wrist. Strokes are read from the accelerometer, and stroke length is estimated from acceleration and stroke rate. This mode can't tell which zone you're in, so it only times the routine.

## Feedback

| Measure | Target | Feedback when off |
|---|---|---|
| Stroke rate | 3–8 strokes per second (180–480/min) | "Slow down" / "A little faster" |
| Stroke length | 0.6–2.5 cm (one or two teeth) | "Shorter strokes" |
| Direction | Not long side-to-side scrubbing | "Try small circles" |
| Rhythm | Steady timing between strokes | "Keep a steady rhythm" |
| Zone (camera only) | Hand on the side being prompted | "Move to the upper left" |

Corrections that last more than about 1.5 seconds are also spoken, if spoken coaching is on. A chime and a vibration mark each zone change. At the end you get a score out of 100, coverage, accuracy per zone and tips. The last 20 sessions are kept in the browser's local storage.

The app can't detect brushing pressure. The upper/lower split is guided by prompts, not detected. The camera can only reliably tell left, front and right apart.

## Running it

The camera and motion sensors only work over **https** (or `localhost`):

```sh
python3 -m http.server 8000
# open http://localhost:8000/brush/
```

On GitHub Pages it's served at `/brush/`. To try the interface without a camera, add `?demo` to the URL. That runs a simulated session that cycles through good, too-fast, too-long and too-slow brushing.

Tracking models load from the jsDelivr CDN and Google's MediaPipe model storage the first time. Video and sensor data stay on your device.

## Files

- `js/analyzer.js`: stroke detection (principal motion axis and direction reversals with hysteresis), scoring and feedback rules
- `js/coach.js`: the six-zone routine and the session summary
- `js/camera.js`: MediaPipe camera tracking
- `js/motion.js`: accelerometer tracking
- `js/app.js`: UI, live loop, speech, history
- `test/analyzer.test.mjs`: unit tests on synthetic brushing signals. Run them with `node --test brush/test/`
