export const SERVICE_NAME = "reclaim-fps-chat";
export const DEFAULT_ROOM_CODE = "GLOBAL";
export const DEFAULT_PORTAL_TARGET_URL =
  "http://localhost:5173/?server=http://localhost:3001&name=PLAYER";

const DEFAULT_MAX_ROOM_PLAYERS = 120;
const MIN_ROOM_PLAYERS = 16;
const MAX_ROOM_PLAYERS_LIMIT = 256;

export const DEFAULT_SERVER_SIM_CONFIG = {
  tickRateHz: 20,
  playerHeight: 1.72,
  playerSpeed: 8.8,
  playerSprint: 13.2,
  playerGravity: -24,
  jumpForce: 8.8,
  worldLimit: 95,
  inputStaleMs: 380,
  minInputIntervalMs: 8,
  maxInputPerSecond: 90
};

export const DEFAULT_SNAPSHOT_CONFIG = {
  aoiRadius: 64,
  maxPeersPerClient: 24,
  heartbeatMs: 950,
  minMoveSq: 0.00064,
  minYawDelta: 0.01,
  minPitchDelta: 0.01
};

function parseBoundedNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}

function parseOptionalString(value, maxLength = 256) {
  const text = String(value ?? "").trim();
  if (!text) {
    return "";
  }
  return text.slice(0, Math.max(1, Math.trunc(maxLength)));
}

function normalizeAbsoluteHttpUrl(rawValue, fallback = "") {
  const value = parseOptionalString(rawValue, 2048);
  if (!value) {
    return fallback;
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return fallback;
  }

  const protocol = String(parsed.protocol ?? "").toLowerCase();
  if (protocol !== "http:" && protocol !== "https:") {
    return fallback;
  }

  return parsed.toString();
}

export function parseCorsOrigins(rawValue) {
  const value = String(rawValue ?? "").trim();
  if (!value || value === "*") {
    return "*";
  }

  const list = value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return list.length > 0 ? list : "*";
}

export function loadRuntimeConfig(env = process.env) {
  const parsedRoomCap = Number(env.MAX_ROOM_PLAYERS ?? DEFAULT_MAX_ROOM_PLAYERS);
  const maxRoomPlayers = Number.isFinite(parsedRoomCap)
    ? Math.max(MIN_ROOM_PLAYERS, Math.min(MAX_ROOM_PLAYERS_LIMIT, Math.trunc(parsedRoomCap)))
    : DEFAULT_MAX_ROOM_PLAYERS;

  const parsedPort = Number(env.PORT ?? 3001);
  const port = Number.isFinite(parsedPort) ? Math.max(1, Math.trunc(parsedPort)) : 3001;

  return {
    serviceName: SERVICE_NAME,
    defaultRoomCode: DEFAULT_ROOM_CODE,
    maxRoomPlayers,
    hostClaimKey: parseOptionalString(env.HOST_CLAIM_KEY, 256),
    defaultPortalTargetUrl: normalizeAbsoluteHttpUrl(
      env.DEFAULT_PORTAL_TARGET_URL,
      DEFAULT_PORTAL_TARGET_URL
    ),
    sim: {
      tickRateHz: parseBoundedNumber(
        env.SIM_TICK_RATE_HZ,
        DEFAULT_SERVER_SIM_CONFIG.tickRateHz,
        5,
        60
      ),
      playerHeight: parseBoundedNumber(
        env.SIM_PLAYER_HEIGHT,
        DEFAULT_SERVER_SIM_CONFIG.playerHeight,
        1,
        3
      ),
      playerSpeed: parseBoundedNumber(
        env.SIM_PLAYER_SPEED,
        DEFAULT_SERVER_SIM_CONFIG.playerSpeed,
        1,
        25
      ),
      playerSprint: parseBoundedNumber(
        env.SIM_PLAYER_SPRINT,
        DEFAULT_SERVER_SIM_CONFIG.playerSprint,
        1,
        35
      ),
      playerGravity: parseBoundedNumber(
        env.SIM_PLAYER_GRAVITY,
        DEFAULT_SERVER_SIM_CONFIG.playerGravity,
        -80,
        -1
      ),
      jumpForce: parseBoundedNumber(
        env.SIM_JUMP_FORCE,
        DEFAULT_SERVER_SIM_CONFIG.jumpForce,
        1,
        30
      ),
      worldLimit: parseBoundedNumber(
        env.SIM_WORLD_LIMIT,
        DEFAULT_SERVER_SIM_CONFIG.worldLimit,
        16,
        1024
      ),
      inputStaleMs: parseBoundedNumber(
        env.SIM_INPUT_STALE_MS,
        DEFAULT_SERVER_SIM_CONFIG.inputStaleMs,
        80,
        4000
      ),
      minInputIntervalMs: parseBoundedNumber(
        env.SIM_MIN_INPUT_INTERVAL_MS,
        DEFAULT_SERVER_SIM_CONFIG.minInputIntervalMs,
        0,
        100
      ),
      maxInputPerSecond: parseBoundedNumber(
        env.SIM_MAX_INPUT_PER_SECOND,
        DEFAULT_SERVER_SIM_CONFIG.maxInputPerSecond,
        10,
        240
      )
    },
    snapshot: {
      aoiRadius: parseBoundedNumber(env.SNAPSHOT_AOI_RADIUS, DEFAULT_SNAPSHOT_CONFIG.aoiRadius, 8, 256),
      maxPeersPerClient: Math.trunc(
        parseBoundedNumber(
          env.SNAPSHOT_MAX_PEERS,
          DEFAULT_SNAPSHOT_CONFIG.maxPeersPerClient,
          4,
          128
        )
      ),
      heartbeatMs: parseBoundedNumber(
        env.SNAPSHOT_HEARTBEAT_MS,
        DEFAULT_SNAPSHOT_CONFIG.heartbeatMs,
        120,
        5000
      ),
      minMoveSq: parseBoundedNumber(
        env.SNAPSHOT_MIN_MOVE_SQ,
        DEFAULT_SNAPSHOT_CONFIG.minMoveSq,
        0.00001,
        0.5
      ),
      minYawDelta: parseBoundedNumber(
        env.SNAPSHOT_MIN_YAW_DELTA,
        DEFAULT_SNAPSHOT_CONFIG.minYawDelta,
        0.0001,
        0.4
      ),
      minPitchDelta: parseBoundedNumber(
        env.SNAPSHOT_MIN_PITCH_DELTA,
        DEFAULT_SNAPSHOT_CONFIG.minPitchDelta,
        0.0001,
        0.4
      )
    },
    port,
    corsOrigin: parseCorsOrigins(env.CORS_ORIGIN)
  };
}
