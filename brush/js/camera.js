// Camera tracking with MediaPipe: finds the mouth (face landmarks) and the
// brushing hand (hand landmarks) every frame, and reports the hand's
// position relative to the mouth in centimetres.

const MP_VERSION = "0.10.14";
const MP_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}`;
const MODELS = "https://storage.googleapis.com/mediapipe-models";
// Average adult face width (cheek to cheek), used to turn pixels into cm.
const FACE_WIDTH_CM = 14;

const PALM = [0, 5, 9, 13, 17];

export async function startCamera(video, onFrame, onStatus = () => {}) {
  onStatus("Opening camera…");
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
    audio: false,
  });
  video.srcObject = stream;
  await video.play();

  onStatus("Loading tracking models (first time takes a few seconds)…");
  const { FilesetResolver, HandLandmarker, FaceLandmarker } = await import(`${MP_BASE}/vision_bundle.mjs`);
  const fileset = await FilesetResolver.forVisionTasks(`${MP_BASE}/wasm`);
  const make = async (Cls, path, extra) => {
    const opts = (delegate) => ({
      baseOptions: { modelAssetPath: `${MODELS}/${path}`, delegate },
      runningMode: "VIDEO",
      ...extra,
    });
    try {
      return await Cls.createFromOptions(fileset, opts("GPU"));
    } catch {
      return await Cls.createFromOptions(fileset, opts("CPU"));
    }
  };
  const [hands, faces] = await Promise.all([
    make(HandLandmarker, "hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task", {
      numHands: 2,
      // Hands are partly hidden by the brush and face, so be lenient.
      minHandDetectionConfidence: 0.3,
      minHandPresenceConfidence: 0.3,
      minTrackingConfidence: 0.3,
    }),
    make(FaceLandmarker, "face_landmarker/face_landmarker/float16/1/face_landmarker.task", { numFaces: 1 }),
  ]);
  onStatus("");

  let running = true;
  let lastVideoTime = -1;
  let smooth = null;

  const loop = () => {
    if (!running) return;
    if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
      lastVideoTime = video.currentTime;
      const ts = performance.now();
      const w = video.videoWidth;
      const h = video.videoHeight;
      const face = faces.detectForVideo(video, ts).faceLandmarks?.[0];
      const handList = hands.detectForVideo(video, ts).landmarks ?? [];
      const frame = { t: ts / 1000, width: w, height: h, face: null, hand: null, rel: null };

      if (face) {
        const px = (p) => ({ x: p.x * w, y: p.y * h });
        const upper = px(face[13]);
        const lower = px(face[14]);
        const mouth = { x: (upper.x + lower.x) / 2, y: (upper.y + lower.y) / 2 };
        const faceW = Math.hypot(px(face[454]).x - px(face[234]).x, px(face[454]).y - px(face[234]).y);
        frame.face = { mouth, width: faceW };

        // The brushing hand is whichever detected hand is closest to the mouth.
        let best = null;
        for (const lm of handList) {
          const c = PALM.reduce((acc, i) => ({ x: acc.x + lm[i].x * w / PALM.length, y: acc.y + lm[i].y * h / PALM.length }), { x: 0, y: 0 });
          const d = Math.hypot(c.x - mouth.x, c.y - mouth.y);
          if (d < faceW * 2.2 && (!best || d < best.d)) best = { ...c, d };
        }
        if (best) {
          // Light smoothing to calm landmark jitter without hiding strokes.
          smooth = smooth ? { x: smooth.x * 0.4 + best.x * 0.6, y: smooth.y * 0.4 + best.y * 0.6 } : best;
          frame.hand = { ...smooth };
          const scale = FACE_WIDTH_CM / faceW;
          // x is in image coordinates: positive = toward the person's left.
          frame.rel = { x: (smooth.x - mouth.x) * scale, y: (smooth.y - mouth.y) * scale, side: (smooth.x - mouth.x) / faceW };
        } else {
          smooth = null;
        }
      }
      onFrame(frame);
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  return () => {
    running = false;
    stream.getTracks().forEach((t) => t.stop());
    hands.close();
    faces.close();
  };
}
