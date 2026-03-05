export const SERVICE_NAME = "reclaim-fps-chat";
export const DEFAULT_ROOM_CODE = "GLOBAL";
export const DEFAULT_PORTAL_TARGET_URL =
  "https://singularity-ox.onrender.com/?v=08d5432";
export const DEFAULT_A_ZONE_PORTAL_TARGET_URL =
  "https://reclaim-fps.onrender.com/";
export const DEFAULT_SURFACE_PAINT_STORE_PATH = "server/data/surface-paint.json";
export const DEFAULT_RENDER_SURFACE_PAINT_STORE_PATH = "/var/data/surface-paint.json";
export const DEFAULT_SURFACE_PAINT_SAVE_DEBOUNCE_MS = 300;
export const DEFAULT_MAX_SOCKET_PAYLOAD_BYTES = 35_000_000;
export const DEFAULT_STATIC_CLIENT_DIR = "dist";
export const DEFAULT_MAP_LAYOUT_VERSION = "2026-03-04-layout-v1";
export const DEFAULT_ANTI_ABUSE_CONFIG = Object.freeze({
  maxConnectionsPerIp: 6,
  connectionWindowMs: 60_000,
  maxConnectionsPerWindowPerIp: 24,
  promoWindowMs: 15_000,
  promoMaxOpsPerSocketWindow: 14,
  promoMaxOpsPerIpWindow: 40
});

const DEFAULT_MAX_ROOM_PLAYERS = 120;
const MIN_ROOM_PLAYERS = 16;
const MAX_ROOM_PLAYERS_LIMIT = 256;

export const DEFAULT_SERVER_SIM_CONFIG = {
  tickRateHz: 20,
  playerHeight: 1.72,
  playerSpeed: 8.8,
  playerSprint: 13.2,
  playerGravity: -24,
  jumpForce: 11.5,
  worldLimit: 120,
  inputStaleMs: 600,
  minInputIntervalMs: 8,
  maxInputPerSecond: 90
};

export const DEFAULT_SNAPSHOT_CONFIG = {
  aoiRadius: 380,
  maxPeersPerClient: 48,
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

function trimTrailingSlashes(value) {
  return String(value ?? "").replace(/[\\/]+$/, "");
}

function resolveSurfacePaintStorePath(env = process.env) {
  const explicitPath = parseOptionalString(env.SURFACE_PAINT_STORE_PATH, 2048);
  if (explicitPath) {
    return explicitPath;
  }

  const renderDiskMountPath = parseOptionalString(
    env.RENDER_DISK_MOUNT_PATH ?? env.DISK_MOUNT_PATH ?? "",
    2048
  );
  if (renderDiskMountPath) {
    return `${trimTrailingSlashes(renderDiskMountPath)}/surface-paint.json`;
  }

  const isRender = parseOptionalString(env.RENDER, 16).toLowerCase() === "true";
  if (isRender) {
    return DEFAULT_RENDER_SURFACE_PAINT_STORE_PATH;
  }

  return DEFAULT_SURFACE_PAINT_STORE_PATH;
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

function migrateLegacyOxZonePortalTarget(rawUrl, fallback = "") {
  const normalized = normalizeAbsoluteHttpUrl(rawUrl, fallback);
  if (!normalized) {
    return fallback;
  }

  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    return normalized;
  }

  const zone = String(parsed.searchParams.get("zone") ?? parsed.searchParams.get("z") ?? "")
    .trim()
    .toLowerCase();
  const pathname = String(parsed.pathname ?? "").trim();
  if (zone === "ox" && (pathname === "" || pathname === "/")) {
    return `${parsed.origin}/ox/`;
  }
  return normalized;
}

function migrateLegacyFpsZonePortalTarget(rawUrl, fallback = "") {
  const normalized = normalizeAbsoluteHttpUrl(rawUrl, fallback);
  if (!normalized) {
    return fallback;
  }

  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    return normalized;
  }

  const zone = String(parsed.searchParams.get("zone") ?? parsed.searchParams.get("z") ?? "")
    .trim()
    .toLowerCase();
  const pathname = String(parsed.pathname ?? "").trim();
  if (zone === "fps" && (pathname === "" || pathname === "/")) {
    return DEFAULT_A_ZONE_PORTAL_TARGET_URL;
  }
  return normalized;
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
  const defaultPortalTargetUrl = migrateLegacyOxZonePortalTarget(
    env.DEFAULT_PORTAL_TARGET_URL,
    DEFAULT_PORTAL_TARGET_URL
  );
  const defaultAZonePortalTargetUrl = migrateLegacyFpsZonePortalTarget(
    env.DEFAULT_A_ZONE_PORTAL_TARGET_URL,
    DEFAULT_A_ZONE_PORTAL_TARGET_URL
  );

  return {
    serviceName: SERVICE_NAME,
    defaultRoomCode: DEFAULT_ROOM_CODE,
    maxRoomPlayers,
    hostClaimKey: parseOptionalString(env.HOST_CLAIM_KEY, 256),
    defaultPortalTargetUrl,
    defaultAZonePortalTargetUrl,
    surfacePaintStorePath: resolveSurfacePaintStorePath(env),
    mapLayoutVersion:
      parseOptionalString(env.MAP_LAYOUT_VERSION, 128) || DEFAULT_MAP_LAYOUT_VERSION,
    surfacePaintSaveDebounceMs: Math.trunc(
      parseBoundedNumber(
        env.SURFACE_PAINT_SAVE_DEBOUNCE_MS,
        DEFAULT_SURFACE_PAINT_SAVE_DEBOUNCE_MS,
        50,
        5000
      )
    ),
    maxSocketPayloadBytes: Math.trunc(
      parseBoundedNumber(
        env.MAX_SOCKET_PAYLOAD_BYTES,
        DEFAULT_MAX_SOCKET_PAYLOAD_BYTES,
        1_000_000,
        50_000_000
      )
    ),
    staticClientDir:
      parseOptionalString(env.STATIC_CLIENT_DIR, 2048) || DEFAULT_STATIC_CLIENT_DIR,
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
      aoiRadius: parseBoundedNumber(env.SNAPSHOT_AOI_RADIUS, DEFAULT_SNAPSHOT_CONFIG.aoiRadius, 8, 512),
      maxPeersPerClient: Math.trunc(
        parseBoundedNumber(
          env.SNAPSHOT_MAX_PEERS,
          DEFAULT_SNAPSHOT_CONFIG.maxPeersPerClient,
          4,
          256
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
    antiAbuse: {
      maxConnectionsPerIp: Math.trunc(
        parseBoundedNumber(
          env.ABUSE_MAX_CONNECTIONS_PER_IP,
          DEFAULT_ANTI_ABUSE_CONFIG.maxConnectionsPerIp,
          1,
          64
        )
      ),
      connectionWindowMs: Math.trunc(
        parseBoundedNumber(
          env.ABUSE_CONNECTION_WINDOW_MS,
          DEFAULT_ANTI_ABUSE_CONFIG.connectionWindowMs,
          1_000,
          10 * 60 * 1000
        )
      ),
      maxConnectionsPerWindowPerIp: Math.trunc(
        parseBoundedNumber(
          env.ABUSE_MAX_CONNECTIONS_PER_WINDOW_PER_IP,
          DEFAULT_ANTI_ABUSE_CONFIG.maxConnectionsPerWindowPerIp,
          2,
          500
        )
      ),
      promoWindowMs: Math.trunc(
        parseBoundedNumber(
          env.ABUSE_PROMO_WINDOW_MS,
          DEFAULT_ANTI_ABUSE_CONFIG.promoWindowMs,
          1_000,
          2 * 60 * 1000
        )
      ),
      promoMaxOpsPerSocketWindow: Math.trunc(
        parseBoundedNumber(
          env.ABUSE_PROMO_MAX_OPS_PER_SOCKET_WINDOW,
          DEFAULT_ANTI_ABUSE_CONFIG.promoMaxOpsPerSocketWindow,
          1,
          500
        )
      ),
      promoMaxOpsPerIpWindow: Math.trunc(
        parseBoundedNumber(
          env.ABUSE_PROMO_MAX_OPS_PER_IP_WINDOW,
          DEFAULT_ANTI_ABUSE_CONFIG.promoMaxOpsPerIpWindow,
          1,
          2_000
        )
      )
    },
    port,
    corsOrigin: parseCorsOrigins(env.CORS_ORIGIN)
  };
}
