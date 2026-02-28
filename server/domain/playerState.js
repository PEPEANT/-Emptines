function clampNumber(value, min, max, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, num));
}

function angleDelta(a, b) {
  return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
}

export function sanitizeName(raw) {
  const value = String(raw ?? "")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 16);
  return value || "PLAYER";
}

export function sanitizePlayerState(raw = {}) {
  return {
    x: clampNumber(raw.x, -256, 256, 0),
    y: clampNumber(raw.y, 0, 128, 1.75),
    z: clampNumber(raw.z, -256, 256, 0),
    yaw: clampNumber(raw.yaw, -Math.PI, Math.PI, 0),
    pitch: clampNumber(raw.pitch, -1.55, 1.55, 0),
    updatedAt: Date.now()
  };
}

export function hasMeaningfulStateChange(prev, next, thresholds) {
  if (!prev) {
    return true;
  }

  const dx = next.x - prev.x;
  const dy = next.y - prev.y;
  const dz = next.z - prev.z;
  const moveSq = dx * dx + dy * dy + dz * dz;

  if (moveSq >= Number(thresholds?.minMoveSq ?? 0.0009)) {
    return true;
  }
  if (angleDelta(next.yaw, prev.yaw) >= Number(thresholds?.minYawDelta ?? 0.006)) {
    return true;
  }
  if (Math.abs(next.pitch - prev.pitch) >= Number(thresholds?.minPitchDelta ?? 0.006)) {
    return true;
  }

  return false;
}

export function quantizeState(state) {
  const q3 = (value) => Math.round((Number(value) || 0) * 1000) / 1000;
  const q4 = (value) => Math.round((Number(value) || 0) * 10000) / 10000;

  return {
    x: q3(state.x),
    y: q3(state.y),
    z: q3(state.z),
    yaw: q4(state.yaw),
    pitch: q4(state.pitch),
    updatedAt: state.updatedAt
  };
}
