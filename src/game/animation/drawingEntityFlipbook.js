function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function computeDrawingEntityFlipbookFrame({
  entry,
  motion,
  frameCount = 1,
  nowSeconds = 0
} = {}) {
  const safeFrameCount = Math.max(1, Math.trunc(Number(frameCount) || 1));
  if (safeFrameCount <= 1) {
    return 0;
  }

  const mode = String(motion?.mode ?? "").trim().toLowerCase();
  const isFollowing = mode === "follow";
  const travelDistance = Math.max(0, Number(motion?.travelDistance) || 0);
  const createdAtSeconds = Math.max(0, Number(entry?.createdAt) || 0) / 1000;
  const elapsed = Math.max(0, Number(nowSeconds) - createdAtSeconds);
  const frameDurationsMs = Array.isArray(entry?.frameDurationsMs)
    ? entry.frameDurationsMs.slice(0, safeFrameCount)
    : [];
  if (frameDurationsMs.length > 0) {
    const durations = [];
    for (let index = 0; index < safeFrameCount; index += 1) {
      durations.push(clamp(Number(frameDurationsMs[index]) || 220, 80, 1200));
    }
    const cycleDurationMs = durations.reduce((sum, value) => sum + value, 0);
    if (cycleDurationMs > 0) {
      const seedRatio = ((Number(entry?.motionSeed) || 0) % 997) / 997;
      const cycleMs = (elapsed * 1000 + seedRatio * cycleDurationMs) % cycleDurationMs;
      let cursor = 0;
      for (let index = 0; index < durations.length; index += 1) {
        cursor += durations[index];
        if (cycleMs < cursor) {
          return index;
        }
      }
      return durations.length - 1;
    }
  }
  const motionSpeed = clamp(Number(entry?.motionSpeed) || 0.72, 0.18, 2.6);
  const movementRatio = isFollowing
    ? clamp(travelDistance / 1.1, 0.35, 1)
    : clamp(travelDistance / 0.7, 0.2, 1);
  const baseFps = isFollowing ? 4.2 : 3.2;
  const framesPerSecond =
    baseFps +
    motionSpeed * (isFollowing ? 1.2 : 1.45) +
    movementRatio * (isFollowing ? 2.1 : 1.6);
  const seedOffset = ((Number(entry?.motionSeed) || 0) % 997) / 997;
  const frameClock = (elapsed + seedOffset) * framesPerSecond;
  return Math.abs(Math.floor(frameClock)) % safeFrameCount;
}
