const DEFAULT_SPAWN_HEIGHT = 1.72;
const SPAWN_RADIUS = 34;
const SPAWN_SLOTS = 48;
const MIN_DISTANCE = 2.25;
const SPAWN_CENTER_X = 0;
const SPAWN_CENTER_Z = -98;
const SPAWN_FACE_TARGET_X = 0;
const SPAWN_FACE_TARGET_Z = -82;

function getStatePosition(state) {
  const x = Number(state?.x);
  const z = Number(state?.z);
  if (!Number.isFinite(x) || !Number.isFinite(z)) {
    return null;
  }
  return { x, z };
}

function toSpawnState(x, z) {
  const yaw = Math.atan2(SPAWN_FACE_TARGET_X - x, SPAWN_FACE_TARGET_Z - z);
  return {
    x,
    y: DEFAULT_SPAWN_HEIGHT,
    z,
    yaw,
    pitch: 0,
    updatedAt: Date.now()
  };
}

function fallbackSpawn(existingStates) {
  if (existingStates.length === 0) {
    return toSpawnState(SPAWN_CENTER_X, SPAWN_CENTER_Z);
  }
  const jitter = (Math.random() - 0.5) * 2.2;
  const angle = Math.random() * Math.PI * 2;
  const radius = SPAWN_RADIUS * (0.85 + Math.random() * 0.25);
  return toSpawnState(
    SPAWN_CENTER_X + Math.cos(angle + jitter) * radius,
    SPAWN_CENTER_Z + Math.sin(angle + jitter) * radius
  );
}

export function chooseDistributedSpawnState(players) {
  const existingStates = [];
  for (const player of players.values()) {
    const position = getStatePosition(player?.state);
    if (position) {
      existingStates.push(position);
    }
  }

  if (existingStates.length === 0) {
    return toSpawnState(SPAWN_CENTER_X, SPAWN_CENTER_Z);
  }

  let bestCandidate = null;
  let bestScore = -1;
  const minDistanceSq = MIN_DISTANCE * MIN_DISTANCE;

  for (let i = 0; i < SPAWN_SLOTS; i += 1) {
    const angle = (Math.PI * 2 * i) / SPAWN_SLOTS;
    const radius = SPAWN_RADIUS * (0.9 + (i % 3) * 0.05);
    const x = SPAWN_CENTER_X + Math.cos(angle) * radius;
    const z = SPAWN_CENTER_Z + Math.sin(angle) * radius;

    let nearestSq = Number.POSITIVE_INFINITY;
    for (const current of existingStates) {
      const dx = x - current.x;
      const dz = z - current.z;
      const distSq = dx * dx + dz * dz;
      if (distSq < nearestSq) {
        nearestSq = distSq;
      }
    }

    if (nearestSq > bestScore) {
      bestScore = nearestSq;
      bestCandidate = { x, z };
    }
  }

  if (!bestCandidate || bestScore < minDistanceSq) {
    return fallbackSpawn(existingStates);
  }

  return toSpawnState(bestCandidate.x, bestCandidate.z);
}
