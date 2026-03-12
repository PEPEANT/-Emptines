function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function computeDrawingEntityAnimation({
  entry,
  motion,
  planeWidth = 1,
  planeHeight = 1,
  shadowBaseScaleX = 1,
  shadowBaseScaleY = 1
} = {}) {
  if (!entry || !motion) {
    return null;
  }

  const phase = Number(motion.phase) || 0;
  const radius = Math.max(0.18, Number(entry?.motionRadius) || 1.4);
  const travelDistance = Math.max(0, Number(motion.travelDistance) || 0);
  const isFollow = motion.mode === "follow";
  const stepRatio = isFollow
    ? clamp(travelDistance / 2.2, 0, 1)
    : clamp(travelDistance / Math.max(0.9, radius * 0.18), 0, 1);
  const sway = Math.sin(phase * (isFollow ? 1.2 : 1.74));
  const counterSway = Math.cos(phase * (isFollow ? 0.88 : 1.36));

  const planeScaleX =
    1 -
    stepRatio * (isFollow ? 0.028 : 0.042) +
    sway * (isFollow ? 0.012 : 0.022) +
    (Number(motion.pulseX) - 1) * 0.6;
  const planeScaleY =
    1 +
    stepRatio * (isFollow ? 0.034 : 0.058) +
    counterSway * (isFollow ? 0.01 : 0.018) +
    (Number(motion.pulseY) - 1) * 0.7;
  const planeTilt =
    sway * (isFollow ? 0.035 : 0.06) +
    counterSway * (isFollow ? 0.01 : 0.018);
  const planeLocalX = sway * planeWidth * (isFollow ? 0.012 : 0.02);
  const planeLocalY =
    (Number(motion.bob) || 0) * (isFollow ? 0.12 : 0.08) +
    Math.abs(counterSway) * planeHeight * (isFollow ? 0.004 : 0.008);

  const shadowScaleX =
    shadowBaseScaleX *
    (1 + stepRatio * (isFollow ? 0.04 : 0.08) - (Number(motion.bob) || 0) * 0.08);
  const shadowScaleY =
    shadowBaseScaleY *
    (1 - stepRatio * (isFollow ? 0.03 : 0.06) - (Number(motion.bob) || 0) * 0.05);
  const shadowOpacity = clamp(
    Number(motion.shadowOpacity) + stepRatio * (isFollow ? 0.01 : 0.018),
    0.05,
    0.2
  );
  const labelYOffset =
    Number(motion.labelYOffset) + Math.abs(sway) * (isFollow ? 0.015 : 0.03);

  return {
    planeScaleX,
    planeScaleY,
    planeTilt,
    planeLocalX,
    planeLocalY,
    shadowScaleX,
    shadowScaleY,
    shadowOpacity,
    labelYOffset
  };
}
