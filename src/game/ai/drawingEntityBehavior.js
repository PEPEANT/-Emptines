function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function lerp(start, end, alpha) {
  return start + (end - start) * alpha;
}

function moveToward(current, target, maxStep) {
  const dx = (Number(target?.x) || 0) - (Number(current?.x) || 0);
  const dz = (Number(target?.z) || 0) - (Number(current?.z) || 0);
  const distance = Math.hypot(dx, dz);
  if (distance <= 0.0001 || !Number.isFinite(distance)) {
    return {
      x: Number(current?.x) || 0,
      z: Number(current?.z) || 0,
      distance: 0
    };
  }
  const step = Math.min(distance, Math.max(0, Number(maxStep) || 0));
  return {
    x: (Number(current?.x) || 0) + dx / distance * step,
    z: (Number(current?.z) || 0) + dz / distance * step,
    distance
  };
}

function normalizeDeltaSeconds(rawValue) {
  const value = Number(rawValue);
  if (!Number.isFinite(value) || value <= 0) {
    return 1 / 60;
  }
  return clamp(value, 1 / 180, 0.12);
}

function buildFollowSlot(entry, followTarget, phase, currentX, currentZ) {
  const targetX = Number(followTarget?.x) || 0;
  const targetZ = Number(followTarget?.z) || 0;
  const yaw = Number(followTarget?.yaw) || 0;
  const radius = Math.max(0.18, Number(entry?.motionRadius) || 1.4);
  const laneSign = ((Number(entry?.motionSeed) || 0) & 1) === 0 ? -1 : 1;
  const trailingDistance = clamp(radius * 0.52 + 1.8, 1.8, 12.5);
  const lateralBase = laneSign * clamp(radius * 0.08, 0.12, 0.9);
  const lateralDrift = Math.sin(phase * 0.44 + (Number(entry?.phaseOffset) || 0) * 0.8)
    * clamp(radius * 0.04, 0.02, 0.24);
  const trailingDrift = Math.cos(phase * 0.28 + (Number(entry?.phaseOffset) || 0) * 0.35)
    * clamp(radius * 0.03, 0.01, 0.18);
  let headingX = Number(followTarget?.headingX) || 0;
  let headingZ = Number(followTarget?.headingZ) || 0;
  let headingLength = Math.hypot(headingX, headingZ);
  if (!Number.isFinite(headingLength) || headingLength < 0.001) {
    headingX = -Math.sin(yaw);
    headingZ = -Math.cos(yaw);
    headingLength = Math.hypot(headingX, headingZ);
  }
  if (headingLength < 0.001) {
    headingX = 0;
    headingZ = -1;
    headingLength = 1;
  }
  headingX /= headingLength;
  headingZ /= headingLength;
  const behindX = -headingX;
  const behindZ = -headingZ;
  const perpX = -behindZ;
  const perpZ = behindX;
  const lateral = lateralBase + lateralDrift;
  const trailing = trailingDistance + trailingDrift;
  const anchor = {
    x: targetX + behindX * trailing + perpX * lateral,
    z: targetZ + behindZ * trailing + perpZ * lateral
  };
  const currentDistanceToOwner = Math.hypot((Number(currentX) || 0) - targetX, (Number(currentZ) || 0) - targetZ);
  if (currentDistanceToOwner > trailingDistance * 1.8) {
    return {
      x: lerp(Number(currentX) || 0, anchor.x, 0.82),
      z: lerp(Number(currentZ) || 0, anchor.z, 0.82)
    };
  }
  return anchor;
}

function buildWanderTarget(entry, phase) {
  const radius = Math.max(0.18, Number(entry?.motionRadius) || 1.4);
  const stretch = clamp(Number(entry?.motionStretch) || 0.65, 0.35, 1.2);
  const seed = Number(entry?.motionSeed) || 0;
  const orbitX =
    Math.sin(phase * 0.74 + (Number(entry?.phaseOffset) || 0) * 0.42) * radius * 0.96;
  const orbitZ =
    Math.sin(phase * 0.42 + (Number(entry?.phaseOffset) || 0) * 0.88) *
    Math.cos(phase * 0.9 + (Number(entry?.phaseOffset) || 0) * 0.2) *
    radius *
    stretch *
    1.02;
  const driftX = Math.sin(phase * 0.17 + seed * 0.0013) * radius * 0.34;
  const driftZ = Math.cos(phase * 0.22 + seed * 0.0017) * radius * stretch * 0.3;
  const figureX = Math.sin(phase * 0.31 + seed * 0.0007) * Math.cos(phase * 0.14) * radius * 0.22;
  const figureZ = Math.sin(phase * 0.27 + seed * 0.0009) * radius * stretch * 0.18;
  return {
    x: (Number(entry?.x) || 0) + orbitX + driftX + figureX,
    z: (Number(entry?.z) || 0) + orbitZ + driftZ + figureZ
  };
}

export function computeDrawingEntityMotion({
  entry,
  followTarget = null,
  nowSeconds = 0,
  deltaSeconds = 1 / 60,
  currentX = null,
  currentZ = null
} = {}) {
  if (!entry) {
    return null;
  }

  const safeDeltaSeconds = normalizeDeltaSeconds(deltaSeconds);
  const radius = Math.max(0.18, Number(entry?.motionRadius) || 1.4);
  const speed = clamp(Number(entry.motionSpeed) || 0.72, 0.18, 2.6);
  const elapsed = Math.max(0, Number(nowSeconds) - Number(entry.createdAt || 0) / 1000);
  const phaseRate = followTarget
    ? speed * clamp(0.6 / Math.pow(radius + 0.9, 0.52), 0.05, 0.4)
    : speed * clamp(0.84 / Math.pow(radius + 0.9, 0.82), 0.02, 0.42);
  const phase = (Number(entry.phaseOffset) || 0) + elapsed * phaseRate;
  const baseX = Number.isFinite(Number(currentX)) ? Number(currentX) : Number(entry.x) || 0;
  const baseZ = Number.isFinite(Number(currentZ)) ? Number(currentZ) : Number(entry.z) || 0;
  const desired = followTarget
    ? buildFollowSlot(entry, followTarget, phase, baseX, baseZ)
    : buildWanderTarget(entry, phase);

  const targetDistance = Math.hypot(desired.x - baseX, desired.z - baseZ);
  const maxSpeed = followTarget
    ? clamp(1.2 + Math.min(2.8, targetDistance * 0.12), 1.2, 4.4)
    : clamp(0.55 + speed * 0.2 + Math.min(0.45, radius * 0.012), 0.55, 1.5);
  const stepped = moveToward(
    { x: baseX, z: baseZ },
    desired,
    maxSpeed * safeDeltaSeconds
  );
  const x = stepped.x;
  const z = stepped.z;

  const bobAmplitude = clamp(Number(entry.bobAmplitude) || 0.12, 0.04, 0.42);
  const bob = Math.abs(Math.sin(phase * (followTarget ? 1.14 : 1.62))) * bobAmplitude * (followTarget ? 0.72 : 1);
  const bobRatio = bobAmplitude > 0.0001 ? 1 - bob / bobAmplitude : 0.5;
  const pulseX = 1 + Math.sin(phase * (followTarget ? 1.28 : 2.08)) * (followTarget ? 0.018 : 0.036);
  const pulseY = 1 + Math.cos(phase * (followTarget ? 1.08 : 1.92)) * (followTarget ? 0.012 : 0.024);
  const shadowOpacity = clamp(
    (followTarget ? 0.05 : 0.07) + bobRatio * (followTarget ? 0.06 : 0.09),
    0.05,
    0.18
  );
  const labelYOffset = 0.4 + bob * (followTarget ? 0.16 : 0.1);

  return {
    x,
    z,
    bob,
    phase,
    mode: followTarget ? "follow" : "wander",
    travelDistance: stepped.distance,
    pulseX,
    pulseY,
    shadowOpacity,
    labelYOffset
  };
}
