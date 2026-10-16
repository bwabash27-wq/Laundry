// Motion-sensor tracking: the phone is worn on the brushing hand or wrist,
// and its accelerometer picks up each stroke.

export async function startMotion(onSample) {
  if (typeof DeviceMotionEvent === "undefined") {
    throw new Error("This device has no motion sensor. Try camera mode instead.");
  }
  // iOS asks for permission, and only from a tap.
  if (typeof DeviceMotionEvent.requestPermission === "function") {
    const state = await DeviceMotionEvent.requestPermission();
    if (state !== "granted") throw new Error("Motion sensor permission was denied.");
  }

  let got = false;
  const handler = (e) => {
    // Prefer gravity-free acceleration; the analyzer's detrending removes
    // gravity from the fallback reading.
    const a = e.acceleration?.x != null ? e.acceleration : e.accelerationIncludingGravity;
    if (!a || a.x == null) return;
    got = true;
    onSample(performance.now() / 1000, [a.x, a.y, a.z]);
  };
  window.addEventListener("devicemotion", handler);

  await new Promise((r) => setTimeout(r, 1200));
  if (!got) {
    window.removeEventListener("devicemotion", handler);
    throw new Error("No motion data is coming in. This mode needs a phone or tablet.");
  }
  return () => window.removeEventListener("devicemotion", handler);
}
