import { sanitizeName, sanitizePlayerState } from "./playerState.js";
import { chooseDistributedSpawnState } from "./spawn.js";
import { readFileSync } from "node:fs";
import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve as resolvePath } from "node:path";

const SURFACE_ID_PATTERN = /^[a-zA-Z0-9:_-]{1,96}$/;
const MAX_SURFACE_IMAGE_CHARS = 4_200_000;
const RIGHT_BILLBOARD_ALLOWED_VIDEO_IDS = Object.freeze([
  "GROK01",
  "GROK02",
  "GROK03",
  "GROK04",
  "YTDown1",
  "YTDown2",
  "YTDown3",
  "YTDown4",
  "YTDown6",
  "YTDown7",
  "YTDown8"
]);
const RIGHT_BILLBOARD_VIDEO_ID_LOOKUP = Object.freeze(
  RIGHT_BILLBOARD_ALLOWED_VIDEO_IDS.reduce((lookup, id) => {
    lookup[String(id).toLowerCase()] = id;
    return lookup;
  }, {
    "grok-video_01": "GROK01",
    "grok-video_02": "GROK02",
    "grok-video_03": "GROK03",
    "grok-video_04": "GROK04"
  })
);
const MAX_LEFT_BILLBOARD_IMAGE_CHARS = 4_200_000;
const MAX_MAIN_PORTAL_AD_IMAGE_CHARS = 4_200_000;
const MAX_PORTAL_DISPLAY_TITLE_CHARS = 40;
const MAX_BILLBOARD_VIDEO_DATA_URL_CHARS = 30_000_000;
const SURFACE_PAINT_STORE_VERSION = 1;
const SURFACE_PAINT_CORE_PAYLOAD_VERSION = 1;
const MAX_SHARED_AUDIO_DATA_URL_CHARS = 12_000_000;
const MAX_SHARED_AUDIO_NAME_CHARS = 120;
const DEFAULT_PLATFORM_LIMIT = 400;
const DEFAULT_ROPE_LIMIT = 200;
const MIN_EDITOR_LIMIT = 1;
const MAX_EDITOR_LIMIT = 10_000;
const MIN_EDITOR_SCALE = 0.25;
const MAX_EDITOR_SCALE = 8;
const OBJECT_POSITION_ID_PATTERN = /^[a-zA-Z0-9:_-]{1,96}$/;
const HOST_CUSTOM_BLOCK_ID_PATTERN = /^host_custom_block_\d+$/;
const CORE_MEMORY_SCHEMA_VERSION = 1;
const MAX_OBJECT_POSITIONS = 4000;
const MAX_OBJECT_COORDINATE = 2500;
const MIN_OBJECT_SCALE = 0.25;
const MAX_OBJECT_SCALE = 8;
const CITY_OBJECT_REAR_MIGRATION_VERSION = "2026-03-05-city-rear-v2";
const CITY_OBJECT_REAR_MIGRATION_DELTA_Z = 36;
const CITY_OBJECT_REAR_MIGRATION_MIN_Z = 72;
const CITY_OBJECT_ID_PATTERN =
  /^city_(?:tower|mega_tower|kiosk|block|outer_block|bridge_block)_\d+$/;
const PROMO_OWNER_KEY_PATTERN = /^[a-zA-Z0-9:_-]{8,96}$/;
const MAX_PROMO_OBJECTS = 300;
const MAX_PROMO_NAME_CHARS = 48;
const MAX_PROMO_URL_CHARS = 2048;
const MAX_PROMO_MEDIA_DATA_URL_CHARS = 9_000_000;
const PROMO_MIN_SCALE = 0.35;
const PROMO_MAX_SCALE = 2.85;
const PROMO_MIN_Y = -1.5;
const PROMO_MAX_Y = 6.5;
const PROMO_BLOCK_WIDTH = 2.8;
const PROMO_BLOCK_DEPTH = 1.8;
const PROMO_BLOCK_BASE_RADIUS = Math.hypot(PROMO_BLOCK_WIDTH * 0.5, PROMO_BLOCK_DEPTH * 0.5);
const PROMO_BLOCKED_SPAWN_X = 0;
const PROMO_BLOCKED_SPAWN_Z = -98;
const PROMO_BLOCKED_SPAWN_RADIUS = 14;
const PROMO_BLOCKED_BRIDGE_A_X = 0;
const PROMO_BLOCKED_BRIDGE_A_Z = -86;
const PROMO_BLOCKED_BRIDGE_B_X = 0;
const PROMO_BLOCKED_BRIDGE_B_Z = -18;
const PROMO_BLOCKED_BRIDGE_HALF_WIDTH = 7;
const PROMO_BLOCKED_CENTER_X = 0;
const PROMO_BLOCKED_CENTER_Z = 0;
const PROMO_BLOCKED_CENTER_RADIUS = 11.5;
const PROMO_BLOCKED_PORTAL_ZONES = Object.freeze([
  Object.freeze({ x: 60, z: -4, radius: 6.4 }),
  Object.freeze({ x: 0, z: -4, radius: 6.4 }),
  Object.freeze({ x: -60, z: -4, radius: 6.2 })
]);
const HOST_CONTROLLED_SURFACE_ID_PATTERN = /^bridge_panel_\d+:(?:px|nx|py|ny|pz|nz)$/;
const CHAT_MESSAGE_ID_PATTERN = /^[a-zA-Z0-9:_-]{1,80}$/;
const MAX_CHAT_MESSAGES = 5000;
const MAX_CHAT_TEXT_CHARS = 200;
const MAX_PORTAL_DISPLAY_LINE_CHARS = 72;
const PORTAL_DISPLAY_KEYS = Object.freeze(["portal1", "portal2", "hall"]);
const PORTAL_DISPLAY_DEFAULT_TITLES = Object.freeze({
  portal1: "OX 퀴즈 대회",
  portal2: "포탈 2",
  hall: "공연장"
});
const PORTAL_DISPLAY_DEFAULT_MODES = Object.freeze({
  portal1: "text",
  portal2: "text",
  hall: "time"
});
const PORTAL_DISPLAY_DEFAULT_LINES = Object.freeze({
  portal1: Object.freeze({
    line2: "포탈 1 링크는 패널에서 변경",
    line3: ""
  }),
  portal2: Object.freeze({
    line2: "포탈 2 링크는 패널에서 변경",
    line3: ""
  }),
  hall: Object.freeze({
    line2: "",
    line3: ""
  })
});
const ROOM_ZONE_IDS = Object.freeze(["lobby", "fps", "ox"]);
const ROOM_ZONE_PORTAL_OBJECT_ID_BY_ZONE = Object.freeze({
  fps: "portal_fps",
  ox: "portal_ox",
  hall: "portal_hall"
});
const PERSISTED_FIXED_OBJECT_IDS = Object.freeze([
  ROOM_ZONE_PORTAL_OBJECT_ID_BY_ZONE.ox,
  ROOM_ZONE_PORTAL_OBJECT_ID_BY_ZONE.fps,
  ROOM_ZONE_PORTAL_OBJECT_ID_BY_ZONE.hall,
  "hall_venue",
  "plaza_billboard_right",
  "plaza_billboard_left"
]);
const PERSISTED_FIXED_OBJECT_ID_SET = new Set(PERSISTED_FIXED_OBJECT_IDS);
const ROOM_ZONE_PORTAL_ENTRY_DISTANCE = 6;
const ROOM_ZONE_STATE_BY_ID = Object.freeze({
  lobby: Object.freeze({
    x: 0,
    y: 1.72,
    z: -8,
    yaw: 0,
    pitch: -0.02
  }),
  fps: Object.freeze({
    // Spawn in front of the center FPS portal so re-entry is intentional.
    x: 0,
    y: 1.72,
    z: -10,
    yaw: 0,
    pitch: -0.02
  }),
  ox: Object.freeze({
    // Spawn in front of the B-zone portal used for OX transfers.
    x: 54,
    y: 1.72,
    z: -4,
    yaw: 1.46,
    pitch: -0.02
  })
});
const RETURN_PORTAL_UNSAFE_RADIUS_BY_HINT = Object.freeze({
  fps: 6.4,
  ox: 6.4,
  hall: 6.2
});
const RETURN_PORTAL_FALLBACK_CENTER_BY_HINT = Object.freeze({
  fps: Object.freeze({
    x: 0,
    z: -4
  }),
  ox: Object.freeze({
    x: 60,
    z: -4
  }),
  hall: Object.freeze({
    x: -60,
    z: -4
  })
});

function normalizeYawAngle(rawValue, fallback = 0) {
  const value = Number(rawValue);
  if (!Number.isFinite(value)) {
    const fallbackValue = Number(fallback);
    return Number.isFinite(fallbackValue) ? fallbackValue : 0;
  }
  return Math.atan2(Math.sin(value), Math.cos(value));
}

function normalizeMapLayoutVersion(rawValue, fallback = "default-layout-v1") {
  const value = String(rawValue ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9._:-]/g, "")
    .slice(0, 96);
  if (!value) {
    return String(fallback ?? "default-layout-v1")
      .trim()
      .replace(/[^a-zA-Z0-9._:-]/g, "")
      .slice(0, 96);
  }
  return value;
}

function normalizeRoomPortalTarget(rawValue, fallback = "") {
  const text = String(rawValue ?? "").trim().slice(0, 2048);
  if (!text) {
    return String(fallback ?? "").trim();
  }

  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    return String(fallback ?? "").trim();
  }

  const protocol = String(parsed.protocol ?? "").toLowerCase();
  if (protocol !== "http:" && protocol !== "https:") {
    return String(fallback ?? "").trim();
  }

  const zoneHint = normalizeRoomZoneHint(
    parsed.searchParams.get("zone") ?? parsed.searchParams.get("z") ?? "",
    ""
  );
  const pathname = String(parsed.pathname ?? "").trim();
  if (zoneHint && (!pathname || pathname === "/")) {
    parsed.pathname = "/";
    parsed.search = "";
    parsed.hash = "";
    parsed.searchParams.set("zone", zoneHint);
    return parsed.toString();
  }

  return parsed.toString();
}

function normalizeRoomZone(rawValue, fallback = "lobby") {
  const value = String(rawValue ?? "")
    .trim()
    .toLowerCase();
  if (ROOM_ZONE_IDS.includes(value)) {
    return value;
  }

  const fallbackValue = String(fallback ?? "")
    .trim()
    .toLowerCase();
  if (ROOM_ZONE_IDS.includes(fallbackValue)) {
    return fallbackValue;
  }
  return "";
}

function normalizeRoomZoneHint(rawValue, fallback = "") {
  const strict = normalizeRoomZone(rawValue, "");
  if (strict) {
    return strict;
  }
  const value = String(rawValue ?? "")
    .trim()
    .toLowerCase();
  if (value.startsWith("lobby")) {
    return "lobby";
  }
  if (value.startsWith("fps")) {
    return "fps";
  }
  if (value.startsWith("ox")) {
    return "ox";
  }
  const fallbackValue = String(fallback ?? "")
    .trim()
    .toLowerCase();
  if (fallbackValue === "lobby" || fallbackValue === "fps" || fallbackValue === "ox") {
    return fallbackValue;
  }
  return "";
}

function normalizeReturnPortalHint(rawValue, fallback = "") {
  const value = String(rawValue ?? "")
    .trim()
    .toLowerCase();
  if (value === "fps" || value === "ox" || value === "hall") {
    return value;
  }
  if (value.includes("fps") || value.includes("reclaim-fps") || value.includes("a-zone")) {
    return "fps";
  }
  if (value.includes("ox") || value.includes("singularity-ox") || value.includes("quiz")) {
    return "ox";
  }
  if (
    value.includes("hall") ||
    value.includes("performance") ||
    value.includes("concert") ||
    value.includes("show")
  ) {
    return "hall";
  }
  const fallbackValue = String(fallback ?? "")
    .trim()
    .toLowerCase();
  if (fallbackValue === "fps" || fallbackValue === "ox" || fallbackValue === "hall") {
    return fallbackValue;
  }
  return "";
}

function getPortalAnchoredZoneSpawnState(room, zone, baseState) {
  if (!room || typeof room !== "object") {
    return null;
  }
  const portalObjectId = ROOM_ZONE_PORTAL_OBJECT_ID_BY_ZONE[zone];
  if (!portalObjectId) {
    return null;
  }
  const source =
    room.objectPositions && typeof room.objectPositions === "object"
      ? room.objectPositions
      : null;
  if (!source) {
    return null;
  }
  const portalEntry = normalizeObjectPositionEntry(source[portalObjectId]);
  if (!portalEntry) {
    return null;
  }

  const portalX = Number(portalEntry.x);
  const portalZ = Number(portalEntry.z);
  if (!Number.isFinite(portalX) || !Number.isFinite(portalZ)) {
    return null;
  }

  const lobbyBase = ROOM_ZONE_STATE_BY_ID.lobby;
  const targetX = Number(lobbyBase?.x) || 0;
  const targetZ = Number(lobbyBase?.z) || 0;
  const fallbackPortalYaw = Math.atan2(targetX - portalX, targetZ - portalZ);
  const portalYaw = normalizeYawAngle(portalEntry.ry, fallbackPortalYaw);
  const spawnDistance = ROOM_ZONE_PORTAL_ENTRY_DISTANCE;
  const spawnX = portalX + Math.sin(portalYaw) * spawnDistance;
  const spawnZ = portalZ + Math.cos(portalYaw) * spawnDistance;
  const lookYaw = Math.atan2(portalX - spawnX, portalZ - spawnZ);
  const spawnY = Number(baseState?.y);
  const pitch = Number(baseState?.pitch);

  return sanitizePlayerState({
    x: spawnX,
    y: Number.isFinite(spawnY) ? spawnY : 1.72,
    z: spawnZ,
    yaw: normalizeYawAngle(lookYaw, 0),
    pitch: Number.isFinite(pitch) ? pitch : -0.02
  });
}

function getReturnPortalSafetyConfig(room, rawPortalHint) {
  const portalHint = normalizeReturnPortalHint(rawPortalHint, "");
  if (!portalHint) {
    return null;
  }

  const fallbackCenter = RETURN_PORTAL_FALLBACK_CENTER_BY_HINT[portalHint] ?? null;
  let centerX = Number(fallbackCenter?.x);
  let centerZ = Number(fallbackCenter?.z);
  const portalObjectId = ROOM_ZONE_PORTAL_OBJECT_ID_BY_ZONE[portalHint];
  const source =
    room?.objectPositions && typeof room.objectPositions === "object"
      ? room.objectPositions
      : null;
  if (portalObjectId && source) {
    const portalEntry = normalizeObjectPositionEntry(source[portalObjectId]);
    const portalX = Number(portalEntry?.x);
    const portalZ = Number(portalEntry?.z);
    if (Number.isFinite(portalX) && Number.isFinite(portalZ)) {
      centerX = portalX;
      centerZ = portalZ;
    }
  }

  if (!Number.isFinite(centerX) || !Number.isFinite(centerZ)) {
    return null;
  }

  return {
    portalHint,
    centerX,
    centerZ,
    unsafeRadius: Math.max(
      4.8,
      Number(RETURN_PORTAL_UNSAFE_RADIUS_BY_HINT[portalHint]) || ROOM_ZONE_PORTAL_ENTRY_DISTANCE
    )
  };
}

function isReturnPortalStateUnsafe(room, rawPortalHint, rawState) {
  const config = getReturnPortalSafetyConfig(room, rawPortalHint);
  if (!config || !rawState || typeof rawState !== "object") {
    return false;
  }
  const state = sanitizePlayerState(rawState);
  const dx = Number(state.x) - config.centerX;
  const dz = Number(state.z) - config.centerZ;
  return dx * dx + dz * dz <= config.unsafeRadius * config.unsafeRadius;
}

function buildSafeReturnPortalSpawnState(room, rawPortalHint) {
  const config = getReturnPortalSafetyConfig(room, rawPortalHint);
  const lobbyBase = ROOM_ZONE_STATE_BY_ID.lobby;
  if (!config) {
    return sanitizePlayerState(lobbyBase);
  }

  let directionX = Number(lobbyBase.x) - config.centerX;
  let directionZ = Number(lobbyBase.z) - config.centerZ;
  const directionLength = Math.hypot(directionX, directionZ);
  if (directionLength <= 0.0001) {
    directionX = 0;
    directionZ = -1;
  } else {
    directionX /= directionLength;
    directionZ /= directionLength;
  }

  const spawnDistance = Math.max(config.unsafeRadius + 1.8, ROOM_ZONE_PORTAL_ENTRY_DISTANCE + 1.8);
  const spawnX = config.centerX + directionX * spawnDistance;
  const spawnZ = config.centerZ + directionZ * spawnDistance;
  const yaw = Math.atan2(Number(lobbyBase.x) - spawnX, Number(lobbyBase.z) - spawnZ);

  return sanitizePlayerState({
    x: spawnX,
    y: Number(lobbyBase.y) || 1.72,
    z: spawnZ,
    yaw: normalizeYawAngle(yaw, 0),
    pitch: Number(lobbyBase.pitch) || -0.02
  });
}

function getRoomZoneSpawnState(room, rawZone) {
  const zone = normalizeRoomZone(rawZone, "lobby");
  const base = ROOM_ZONE_STATE_BY_ID[zone] ?? ROOM_ZONE_STATE_BY_ID.lobby;
  if (zone === "fps" || zone === "ox") {
    const portalAnchoredState = getPortalAnchoredZoneSpawnState(room, zone, base);
    if (portalAnchoredState) {
      return portalAnchoredState;
    }
  }
  return sanitizePlayerState(base);
}

function normalizeSurfaceId(rawValue) {
  const value = String(rawValue ?? "").trim();
  if (!value || !SURFACE_ID_PATTERN.test(value)) {
    return "";
  }
  return value;
}

function normalizeChatActorId(rawValue) {
  const value = String(rawValue ?? "").trim();
  if (!value) {
    return "";
  }
  return value.replace(/[^a-zA-Z0-9:_-]/g, "").slice(0, 96);
}

function normalizeChatMessageId(rawValue) {
  const value = String(rawValue ?? "").trim();
  if (!value) {
    return "";
  }
  const normalized = value.replace(/[^a-zA-Z0-9:_-]/g, "").slice(0, 80);
  if (!normalized || !CHAT_MESSAGE_ID_PATTERN.test(normalized)) {
    return "";
  }
  return normalized;
}

function normalizeChatText(rawValue) {
  const value = String(rawValue ?? "").trim().slice(0, MAX_CHAT_TEXT_CHARS);
  if (!value) {
    return "";
  }
  return value;
}

function normalizeChatHistoryEntry(rawValue, fallbackCreatedAt = Date.now()) {
  if (!rawValue || typeof rawValue !== "object") {
    return null;
  }

  const messageId = normalizeChatMessageId(rawValue?.messageId ?? rawValue?.clientMessageId ?? "");
  const text = normalizeChatText(rawValue?.text ?? "");
  if (!messageId || !text) {
    return null;
  }

  return {
    messageId,
    id: normalizeChatActorId(rawValue?.id ?? rawValue?.playerId ?? ""),
    name: sanitizeName(rawValue?.name ?? "PLAYER"),
    text,
    createdAt: Math.max(
      0,
      Math.trunc(Number(rawValue?.createdAt) || Number(fallbackCreatedAt) || Date.now())
    )
  };
}

function getPromoOwnerKeyFromSurfaceId(rawSurfaceId, promoMap = null) {
  const surfaceId = normalizeSurfaceId(rawSurfaceId);
  if (!surfaceId || !surfaceId.startsWith("po_")) {
    return "";
  }
  const surfaceBaseId = String(surfaceId.split(":")[0] ?? "").trim();
  if (!surfaceBaseId.startsWith("po_")) {
    return "";
  }

  const rawOwnerKey = surfaceBaseId.slice(3);
  const directOwnerKey = normalizePromoOwnerKey(rawOwnerKey);
  const strippedOwnerKey = normalizePromoOwnerKey(rawOwnerKey.replace(/_q[0-3]$/i, ""));

  if (promoMap instanceof Map) {
    if (directOwnerKey && promoMap.has(directOwnerKey)) {
      return directOwnerKey;
    }
    if (strippedOwnerKey && promoMap.has(strippedOwnerKey)) {
      return strippedOwnerKey;
    }
  }

  return strippedOwnerKey || directOwnerKey || "";
}

function normalizeBooleanFlag(rawValue, fallback = false) {
  if (typeof rawValue === "boolean") {
    return rawValue;
  }
  if (typeof rawValue === "number") {
    return rawValue !== 0;
  }
  if (typeof rawValue === "string") {
    const normalized = rawValue.trim().toLowerCase();
    if (!normalized) {
      return Boolean(fallback);
    }
    if (["1", "true", "yes", "y", "on"].includes(normalized)) {
      return true;
    }
    if (["0", "false", "no", "n", "off"].includes(normalized)) {
      return false;
    }
  }
  return Boolean(fallback);
}

function normalizeSurfaceImageDataUrl(rawValue) {
  const value = String(rawValue ?? "").trim();
  if (!value || value.length > MAX_SURFACE_IMAGE_CHARS) {
    return "";
  }
  if (!/^data:image\/webp;base64,/i.test(value)) {
    return "";
  }
  return value;
}

function isHostControlledSurfaceId(surfaceId = "") {
  return HOST_CONTROLLED_SURFACE_ID_PATTERN.test(String(surfaceId ?? "").trim().toLowerCase());
}

function normalizeSurfacePaintEntry(rawValue, fallbackUpdatedAt = Date.now()) {
  if (typeof rawValue === "string") {
    const imageDataUrl = normalizeSurfaceImageDataUrl(rawValue);
    if (!imageDataUrl) {
      return null;
    }
    return {
      imageDataUrl,
      updatedAt: Math.max(0, Math.trunc(Number(fallbackUpdatedAt) || Date.now()))
    };
  }

  const imageDataUrl = normalizeSurfaceImageDataUrl(
    rawValue?.imageDataUrl ?? rawValue?.dataUrl ?? ""
  );
  if (!imageDataUrl) {
    return null;
  }
  return {
    imageDataUrl,
    updatedAt: Math.max(0, Math.trunc(Number(rawValue?.updatedAt) || Number(fallbackUpdatedAt) || Date.now()))
  };
}

function normalizeObjectPositionId(rawValue) {
  const value = String(rawValue ?? "").trim();
  if (!value || !OBJECT_POSITION_ID_PATTERN.test(value)) {
    return "";
  }
  return value;
}

function normalizeHostCustomBlockId(rawValue) {
  const value = normalizeObjectPositionId(rawValue);
  if (!value || !HOST_CUSTOM_BLOCK_ID_PATTERN.test(value)) {
    return "";
  }
  return value;
}

function normalizePersistedObjectPositionId(rawValue) {
  const value = normalizeObjectPositionId(rawValue);
  if (!value) {
    return "";
  }
  if (normalizeHostCustomBlockId(value) || PERSISTED_FIXED_OBJECT_ID_SET.has(value)) {
    return value;
  }
  return "";
}

function normalizeObjectPositionEntry(rawValue) {
  if (!rawValue || typeof rawValue !== "object") {
    return null;
  }
  const x = Number(rawValue.x);
  const y = Number(rawValue.y);
  const z = Number(rawValue.z);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
    return null;
  }
  const sxRaw = Number(rawValue?.sx);
  const syRaw = Number(rawValue?.sy);
  const szRaw = Number(rawValue?.sz);
  const sx = Number.isFinite(sxRaw)
    ? Math.max(MIN_OBJECT_SCALE, Math.min(MAX_OBJECT_SCALE, sxRaw))
    : 1;
  const sy = Number.isFinite(syRaw)
    ? Math.max(MIN_OBJECT_SCALE, Math.min(MAX_OBJECT_SCALE, syRaw))
    : 1;
  const sz = Number.isFinite(szRaw)
    ? Math.max(MIN_OBJECT_SCALE, Math.min(MAX_OBJECT_SCALE, szRaw))
    : 1;
  const ryRaw = Number(rawValue?.ry);
  const hasYaw = Number.isFinite(ryRaw);
  const ry = hasYaw ? normalizeYawAngle(ryRaw, 0) : null;
  let visible = true;
  if (typeof rawValue?.visible === "boolean") {
    visible = rawValue.visible;
  } else if (rawValue?.visible === 0 || rawValue?.visible === "0") {
    visible = false;
  } else if (rawValue?.visible === 1 || rawValue?.visible === "1") {
    visible = true;
  }
  return {
    x: Math.max(-MAX_OBJECT_COORDINATE, Math.min(MAX_OBJECT_COORDINATE, x)),
    y: Math.max(-MAX_OBJECT_COORDINATE, Math.min(MAX_OBJECT_COORDINATE, y)),
    z: Math.max(-MAX_OBJECT_COORDINATE, Math.min(MAX_OBJECT_COORDINATE, z)),
    sx,
    sy,
    sz,
    ...(hasYaw ? { ry } : {}),
    visible
  };
}

function sortHostCustomBlockIds(leftId, rightId) {
  const leftMatch = String(leftId ?? "").match(/(\d+)$/);
  const rightMatch = String(rightId ?? "").match(/(\d+)$/);
  const leftIndex = Number(leftMatch?.[1]);
  const rightIndex = Number(rightMatch?.[1]);
  if (Number.isFinite(leftIndex) && Number.isFinite(rightIndex) && leftIndex !== rightIndex) {
    return leftIndex - rightIndex;
  }
  return String(leftId ?? "").localeCompare(String(rightId ?? ""));
}

function normalizePersistedHostCustomBlockPositions(rawValue) {
  const source = rawValue && typeof rawValue === "object" ? rawValue : {};
  const sanitized = {};
  let count = 0;
  for (const [rawId, rawEntry] of Object.entries(source)) {
    if (count >= MAX_OBJECT_POSITIONS) {
      break;
    }
    const id = normalizePersistedObjectPositionId(rawId);
    const normalized = normalizeObjectPositionEntry(rawEntry);
    const isHostCustom = HOST_CUSTOM_BLOCK_ID_PATTERN.test(id);
    if (!id || !normalized || (isHostCustom && normalized.visible === false)) {
      continue;
    }
    sanitized[id] = normalized;
    count += 1;
  }
  return sanitized;
}

function normalizePersistedHostCustomBlockList(rawValue) {
  const list = Array.isArray(rawValue) ? rawValue : [];
  const asPositions = {};
  for (const entry of list) {
    const id = normalizePersistedObjectPositionId(entry?.id);
    if (!id) {
      continue;
    }
    asPositions[id] = entry;
  }
  return normalizePersistedHostCustomBlockPositions(asPositions);
}

function serializePersistedHostCustomBlockList(rawValue) {
  const positions = normalizePersistedHostCustomBlockPositions(rawValue);
  const list = [];
  for (const id of Object.keys(positions).sort(sortHostCustomBlockIds)) {
    const entry = positions[id];
    list.push({
      id,
      x: entry.x,
      y: entry.y,
      z: entry.z,
      ...(Number.isFinite(Number(entry.ry)) ? { ry: Number(entry.ry) } : {}),
      sx: entry.sx,
      sy: entry.sy,
      sz: entry.sz,
      visible: entry.visible !== false
    });
  }
  return list;
}

function migrateCityObjectPositionsToRearBand(rawPositions, savedMigrationVersion) {
  const source = rawPositions && typeof rawPositions === "object" ? rawPositions : {};
  const normalizedSavedVersion = normalizeMapLayoutVersion(savedMigrationVersion, "");
  if (normalizedSavedVersion === CITY_OBJECT_REAR_MIGRATION_VERSION) {
    return { positions: source, changed: false };
  }

  let changed = false;
  const migrated = {};
  for (const [rawId, rawValue] of Object.entries(source)) {
    const id = normalizeObjectPositionId(rawId);
    if (!id) {
      continue;
    }
    if (!CITY_OBJECT_ID_PATTERN.test(id)) {
      migrated[id] = rawValue;
      continue;
    }
    const entry = normalizeObjectPositionEntry(rawValue);
    if (!entry) {
      continue;
    }
    if (Number(entry.z) >= CITY_OBJECT_REAR_MIGRATION_MIN_Z) {
      migrated[id] = rawValue;
      continue;
    }
    const nextZ = Math.max(
      -MAX_OBJECT_COORDINATE,
      Math.min(MAX_OBJECT_COORDINATE, Number(entry.z) + CITY_OBJECT_REAR_MIGRATION_DELTA_Z)
    );
    if (!Number.isFinite(nextZ)) {
      migrated[id] = rawValue;
      continue;
    }
    if (Math.abs(nextZ - Number(entry.z)) > 0.0001) {
      changed = true;
    }
    migrated[id] = {
      ...rawValue,
      z: nextZ
    };
  }

  return { positions: migrated, changed };
}

function normalizeStateRevision(rawValue, fallback = 0) {
  const parsed = Math.trunc(Number(rawValue));
  if (!Number.isFinite(parsed) || parsed < 0) {
    const fallbackParsed = Math.trunc(Number(fallback));
    return Number.isFinite(fallbackParsed) && fallbackParsed >= 0 ? fallbackParsed : 0;
  }
  return parsed;
}

function nextStateRevision(currentRevision = 0) {
  const base = normalizeStateRevision(currentRevision, 0);
  const now = Math.trunc(Date.now());
  return Math.max(base + 1, now);
}

function normalizeSharedAudioDataUrl(rawValue) {
  const value = String(rawValue ?? "").trim();
  if (!value || value.length > MAX_SHARED_AUDIO_DATA_URL_CHARS) {
    return "";
  }
  if (!/^data:audio\/[a-z0-9.+-]+;base64,/i.test(value)) {
    return "";
  }
  return value;
}

function normalizeSharedAudioName(rawValue) {
  const value = String(rawValue ?? "").trim().replace(/\s+/g, " ");
  if (!value) {
    return "";
  }
  return value.slice(0, MAX_SHARED_AUDIO_NAME_CHARS);
}

function createPortalScheduleState() {
  return {
    mode: "open_manual",
    startAtMs: 0,
    openUntilMs: 0,
    remainingSec: 0,
    finalCountdownSeconds: 10,
    updatedAt: Date.now()
  };
}

function createRightBillboardState() {
  return {
    mode: "ad",
    videoId: "",
    videoDataUrl: "",
    updatedAt: Date.now()
  };
}

function createLeftBillboardState() {
  return {
    mode: "ad",
    imageDataUrl: "",
    videoDataUrl: "",
    updatedAt: Date.now()
  };
}

function createMainPortalAdState() {
  return {
    mode: "ad",
    imageDataUrl: "",
    updatedAt: Date.now()
  };
}

function createPortalDisplayState(rawPortalKey, rawValue = {}) {
  const defaults = getPortalDisplayDefaults(rawPortalKey);
  return normalizePortalDisplayState(
    {
      ...rawValue,
      updatedAt: Number(rawValue?.updatedAt) || Date.now()
    },
    defaults
  );
}

function createPortalDisplaysState(rawValue = {}) {
  const source = rawValue && typeof rawValue === "object" ? rawValue : {};
  return {
    portal1: createPortalDisplayState("portal1", source.portal1),
    portal2: createPortalDisplayState("portal2", source.portal2),
    hall: createPortalDisplayState("hall", source.hall)
  };
}

function createSharedMusicState() {
  return {
    mode: "idle",
    dataUrl: "",
    name: "",
    startAtMs: 0,
    updatedAt: Date.now()
  };
}

function createSecurityTestState() {
  return {
    enabled: false,
    updatedAt: Date.now()
  };
}

function clampEditorLimit(rawValue, fallback) {
  const parsed = Math.trunc(Number(rawValue));
  const safe = Number.isFinite(parsed) ? parsed : Math.trunc(Number(fallback) || 0);
  return Math.max(MIN_EDITOR_LIMIT, Math.min(MAX_EDITOR_LIMIT, safe));
}

function clampEditorScale(rawValue, fallback) {
  const parsed = Number(rawValue);
  const safe = Number.isFinite(parsed) ? parsed : Number(fallback) || 1;
  return Math.max(MIN_EDITOR_SCALE, Math.min(MAX_EDITOR_SCALE, safe));
}

function createObjectEditorState() {
  return {
    platformLimit: DEFAULT_PLATFORM_LIMIT,
    ropeLimit: DEFAULT_ROPE_LIMIT,
    platformScale: 1,
    ropeScale: 1,
    updatedAt: Date.now()
  };
}

function createSurfacePoliciesState(rawValue = null) {
  const source = rawValue && typeof rawValue === "object" ? rawValue : {};
  const bridgePanelsNzSource =
    source.bridgePanelsNz && typeof source.bridgePanelsNz === "object"
      ? source.bridgePanelsNz
      : source.bridge_panels_nz && typeof source.bridge_panels_nz === "object"
        ? source.bridge_panels_nz
        : {};
  const bridgePanel12NzSource =
    source.bridgePanel12Nz && typeof source.bridgePanel12Nz === "object"
      ? source.bridgePanel12Nz
      : source.bridge_panel_12_nz && typeof source.bridge_panel_12_nz === "object"
        ? source.bridge_panel_12_nz
        : {};
  const allowOthersDraw = normalizeBooleanFlag(
    bridgePanelsNzSource.allowOthersDraw ?? bridgePanelsNzSource.allow_others_draw,
    normalizeBooleanFlag(
      bridgePanel12NzSource.allowOthersDraw ?? bridgePanel12NzSource.allow_others_draw,
      false
    )
  );
  const updatedAt = Math.max(
    0,
    Math.trunc(
      Number(bridgePanelsNzSource.updatedAt) ||
        Number(bridgePanelsNzSource.updated_at) ||
        Number(bridgePanel12NzSource.updatedAt) ||
        Number(bridgePanel12NzSource.updated_at) ||
        Date.now()
    )
  );
  return {
    bridgePanelsNz: {
      surfacePattern: "bridge_panel_*:*",
      allowOthersDraw,
      updatedAt
    }
  };
}

function normalizeObjectEditorState(rawValue, fallback = null) {
  const source = rawValue && typeof rawValue === "object" ? rawValue : {};
  const base = fallback && typeof fallback === "object" ? fallback : createObjectEditorState();
  return {
    platformLimit: clampEditorLimit(source.platformLimit, base.platformLimit),
    ropeLimit: clampEditorLimit(source.ropeLimit, base.ropeLimit),
    platformScale: clampEditorScale(source.platformScale, base.platformScale),
    ropeScale: clampEditorScale(source.ropeScale, base.ropeScale),
    updatedAt: Math.max(
      0,
      Math.trunc(Number(source.updatedAt) || Number(base.updatedAt) || Date.now())
    )
  };
}

function normalizePromoOwnerKey(rawValue) {
  const value = String(rawValue ?? "").trim();
  if (!value || !PROMO_OWNER_KEY_PATTERN.test(value)) {
    return "";
  }
  return value;
}

function normalizePromoName(rawValue) {
  const collapsed = String(rawValue ?? "").trim().replace(/\s+/g, " ");
  if (!collapsed) {
    return "PLAYER";
  }
  return collapsed.slice(0, MAX_PROMO_NAME_CHARS);
}

function normalizePromoUrl(rawValue) {
  const value = String(rawValue ?? "").trim().slice(0, MAX_PROMO_URL_CHARS);
  if (!value) {
    return "";
  }
  try {
    const parsed = new URL(value);
    const protocol = String(parsed.protocol ?? "").toLowerCase();
    if (protocol !== "http:" && protocol !== "https:") {
      return "";
    }
    return parsed.toString();
  } catch {
    return "";
  }
}

function normalizePromoMediaDataUrl(rawValue) {
  const value = String(rawValue ?? "").trim();
  if (!value || value.length > MAX_PROMO_MEDIA_DATA_URL_CHARS) {
    return "";
  }
  if (!/^data:image\/webp;base64,/i.test(value)) {
    return "";
  }
  return value;
}

function normalizePromoScale(rawValue, fallback = 1) {
  const parsed = Number(rawValue);
  const safe = Number.isFinite(parsed) ? parsed : Number(fallback) || 1;
  return Math.max(PROMO_MIN_SCALE, Math.min(PROMO_MAX_SCALE, safe));
}

function getPromoFootprintRadius(rawScale = 1) {
  const scale = normalizePromoScale(rawScale, 1);
  return Math.max(0.7, PROMO_BLOCK_BASE_RADIUS * scale);
}

function normalizePromoYaw(rawValue, fallback = 0) {
  const parsed = Number(rawValue);
  const safe = Number.isFinite(parsed) ? parsed : Number(fallback) || 0;
  const twoPi = Math.PI * 2;
  let wrapped = ((safe + Math.PI) % twoPi + twoPi) % twoPi - Math.PI;
  if (Math.abs(wrapped) < 0.00001) {
    wrapped = 0;
  }
  return wrapped;
}

function normalizePromoAxis(rawValue, fallback = 0, min = -2000, max = 2000) {
  const parsed = Number(rawValue);
  const safe = Number.isFinite(parsed) ? parsed : Number(fallback) || 0;
  return Math.max(min, Math.min(max, safe));
}

function normalizePromoKind(rawValue) {
  const value = String(rawValue ?? "").trim().toLowerCase();
  if (value === "block") {
    return "block";
  }
  return "block";
}

function getPromoPlacementBlockReason(x, z, scale = 1) {
  const safeX = Number(x);
  const safeZ = Number(z);
  if (!Number.isFinite(safeX) || !Number.isFinite(safeZ)) {
    return "";
  }
  const footprintRadius = getPromoFootprintRadius(scale);

  const spawnDx = safeX - PROMO_BLOCKED_SPAWN_X;
  const spawnDz = safeZ - PROMO_BLOCKED_SPAWN_Z;
  const spawnBlockedRadius = PROMO_BLOCKED_SPAWN_RADIUS + footprintRadius;
  if (spawnDx * spawnDx + spawnDz * spawnDz <= spawnBlockedRadius * spawnBlockedRadius) {
    return "spawn";
  }

  const abx = PROMO_BLOCKED_BRIDGE_B_X - PROMO_BLOCKED_BRIDGE_A_X;
  const abz = PROMO_BLOCKED_BRIDGE_B_Z - PROMO_BLOCKED_BRIDGE_A_Z;
  const abLenSq = abx * abx + abz * abz;
  if (abLenSq > 0.001) {
    const apx = safeX - PROMO_BLOCKED_BRIDGE_A_X;
    const apz = safeZ - PROMO_BLOCKED_BRIDGE_A_Z;
    const rawT = (apx * abx + apz * abz) / abLenSq;
    const edgeMargin = Math.max(0.08, footprintRadius / Math.sqrt(abLenSq));
    if (rawT >= -edgeMargin && rawT <= 1 + edgeMargin) {
      const t = Math.max(0, Math.min(1, rawT));
      const nearX = PROMO_BLOCKED_BRIDGE_A_X + abx * t;
      const nearZ = PROMO_BLOCKED_BRIDGE_A_Z + abz * t;
      const lateralDx = safeX - nearX;
      const lateralDz = safeZ - nearZ;
      const bridgeHalfWidth = PROMO_BLOCKED_BRIDGE_HALF_WIDTH + footprintRadius;
      if (
        lateralDx * lateralDx + lateralDz * lateralDz <=
        bridgeHalfWidth * bridgeHalfWidth
      ) {
        return "bridge";
      }
    }
  }

  for (const zone of PROMO_BLOCKED_PORTAL_ZONES) {
    const dx = safeX - (Number(zone?.x) || 0);
    const dz = safeZ - (Number(zone?.z) || 0);
    const radius = Math.max(1.8, Number(zone?.radius) || 0) + footprintRadius;
    if (dx * dx + dz * dz <= radius * radius) {
      return "portal";
    }
  }

  const centerDx = safeX - PROMO_BLOCKED_CENTER_X;
  const centerDz = safeZ - PROMO_BLOCKED_CENTER_Z;
  const centerBlockedRadius = PROMO_BLOCKED_CENTER_RADIUS + footprintRadius;
  if (centerDx * centerDx + centerDz * centerDz <= centerBlockedRadius * centerBlockedRadius) {
    return "center";
  }

  return "";
}

function normalizeRightBillboardVideoId(rawValue) {
  const text = String(rawValue ?? "").trim().toLowerCase();
  if (!text) {
    return "";
  }
  return RIGHT_BILLBOARD_VIDEO_ID_LOOKUP[text] ?? "";
}

function normalizeLeftBillboardImageDataUrl(rawValue) {
  const value = String(rawValue ?? "").trim();
  if (!value || value.length > MAX_LEFT_BILLBOARD_IMAGE_CHARS) {
    return "";
  }
  if (!value.startsWith("data:image/")) {
    return "";
  }
  return value;
}

function normalizeMainPortalAdImageDataUrl(rawValue) {
  const value = String(rawValue ?? "").trim();
  if (!value || value.length > MAX_MAIN_PORTAL_AD_IMAGE_CHARS) {
    return "";
  }
  if (!value.startsWith("data:image/")) {
    return "";
  }
  return value;
}

function normalizePortalDisplayKey(rawValue) {
  const value = String(rawValue ?? "").trim().toLowerCase();
  return PORTAL_DISPLAY_KEYS.includes(value) ? value : "";
}

function normalizePortalDisplayTitle(rawValue, fallback = "") {
  const value = String(rawValue ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, MAX_PORTAL_DISPLAY_TITLE_CHARS);
  if (value) {
    return value;
  }
  return String(fallback ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, MAX_PORTAL_DISPLAY_TITLE_CHARS);
}

function normalizePortalDisplayLine(rawValue, fallback = "") {
  const value = String(rawValue ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, MAX_PORTAL_DISPLAY_LINE_CHARS);
  if (value) {
    return value;
  }
  return String(fallback ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, MAX_PORTAL_DISPLAY_LINE_CHARS);
}

function normalizePortalDisplayMode(rawValue, fallback = "text") {
  const value = String(rawValue ?? "")
    .trim()
    .toLowerCase();
  if (value === "time") {
    return "time";
  }
  if (value === "text") {
    return "text";
  }
  return fallback === "time" ? "time" : "text";
}

function normalizePortalDisplayState(rawValue, defaults = {}) {
  const source = rawValue && typeof rawValue === "object" ? rawValue : {};
  return {
    mode: normalizePortalDisplayMode(source.mode, defaults.mode),
    title: normalizePortalDisplayTitle(source.title, defaults.title),
    line2: normalizePortalDisplayLine(source.line2, defaults.line2),
    line3: normalizePortalDisplayLine(source.line3, defaults.line3),
    imageDataUrl: normalizeMainPortalAdImageDataUrl(source.imageDataUrl),
    updatedAt: Math.max(0, Math.trunc(Number(source.updatedAt) || Date.now()))
  };
}

function getPortalDisplayDefaults(portalKey) {
  const normalizedKey = normalizePortalDisplayKey(portalKey);
  return {
    title: PORTAL_DISPLAY_DEFAULT_TITLES[normalizedKey] ?? "Hall",
    mode: PORTAL_DISPLAY_DEFAULT_MODES[normalizedKey] ?? "text",
    line2: PORTAL_DISPLAY_DEFAULT_LINES[normalizedKey]?.line2 ?? "",
    line3: PORTAL_DISPLAY_DEFAULT_LINES[normalizedKey]?.line3 ?? ""
  };
}

function normalizeBillboardVideoDataUrl(rawValue) {
  const value = String(rawValue ?? "").trim();
  if (!value || value.length > MAX_BILLBOARD_VIDEO_DATA_URL_CHARS) {
    return "";
  }
  if (!/^data:video\/[a-z0-9.+-]+;base64,/i.test(value)) {
    return "";
  }
  return value;
}

function normalizeBillboardVideoTarget(rawValue) {
  const text = String(rawValue ?? "").trim().toLowerCase();
  if (text === "left" || text === "right" || text === "both") {
    return text;
  }
  return "";
}

function createPersistentRoom(code, defaultPortalTargetUrl, defaultAZonePortalTargetUrl) {
  return {
    code,
    hostId: null,
    portalTarget: defaultPortalTargetUrl,
    aZonePortalTarget: defaultAZonePortalTargetUrl,
    portalSchedule: createPortalScheduleState(),
    portalDisplays: createPortalDisplaysState(),
    mainPortalAd: createMainPortalAdState(),
    leftBillboard: createLeftBillboardState(),
    rightBillboard: createRightBillboardState(),
    sharedMusic: createSharedMusicState(),
    securityTest: createSecurityTestState(),
    surfacePolicies: createSurfacePoliciesState(),
    surfacePaint: new Map(),
    chatHistory: [],
    promoObjects: new Map(),
    objectEditor: createObjectEditorState(),
    objectPositions: {},
    platformRevision: 0,
    ropeRevision: 0,
    objectRevision: 0,
    platforms: [],
    ropes: [],
    players: new Map(),
    persistent: true,
    createdAt: Date.now()
  };
}

export class RoomService {
  constructor({
    io,
    defaultRoomCode,
    maxRoomPlayers,
    defaultPortalTargetUrl,
    defaultAZonePortalTargetUrl = "",
    portalOpenSeconds = 24,
    portalFinalCountdownSeconds = 10,
    surfacePaintStorePath = "",
    mapLayoutVersion = "default-layout-v1",
    surfacePaintSaveDebounceMs = 300,
    log = console
  }) {
    this.io = io;
    this.log = log ?? console;
    this.defaultRoomCode = defaultRoomCode;
    this.maxRoomPlayers = maxRoomPlayers;
    this.defaultPortalTargetUrl = normalizeRoomPortalTarget(defaultPortalTargetUrl, "");
    this.defaultAZonePortalTargetUrl = normalizeRoomPortalTarget(
      defaultAZonePortalTargetUrl,
      this.defaultPortalTargetUrl
    );
    this.portalOpenSeconds = Math.max(5, Math.trunc(Number(portalOpenSeconds) || 24));
    this.portalFinalCountdownSeconds = Math.max(
      3,
      Math.min(30, Math.trunc(Number(portalFinalCountdownSeconds) || 10))
    );
    this.rooms = new Map();
    this.surfacePaintStorePath = this.resolveSurfacePaintStorePath(surfacePaintStorePath);
    this.mapLayoutVersion = normalizeMapLayoutVersion(mapLayoutVersion);
    this.surfacePaintSaveDebounceMs = Math.max(
      50,
      Math.trunc(Number(surfacePaintSaveDebounceMs) || 300)
    );
    this.surfacePaintSaveTimer = null;
    this.surfacePaintSaveInFlight = false;
    this.surfacePaintSaveQueued = false;
    this.surfacePaintForceNextFlush = false;
    this.surfacePaintSaveInFlightPromise = null;
    this.surfacePaintLastPersistError = "";
    this.surfacePaintLastPersistAt = 0;
    this.getDefaultRoom();
    this.loadSurfacePaintFromDisk();
  }

  getDefaultRoom() {
    let room = this.rooms.get(this.defaultRoomCode);
    if (!room) {
      room = createPersistentRoom(
        this.defaultRoomCode,
        this.defaultPortalTargetUrl,
        this.defaultAZonePortalTargetUrl
      );
      this.rooms.set(this.defaultRoomCode, room);
    }
    return room;
  }

  resolveSurfacePaintStorePath(rawPath) {
    const value = String(rawPath ?? "").trim();
    if (!value) {
      return "";
    }
    return isAbsolute(value) ? value : resolvePath(process.cwd(), value);
  }

  loadSurfacePaintFromDisk() {
    if (!this.surfacePaintStorePath) {
      return;
    }

    let parsed = null;
    try {
      const raw = readFileSync(this.surfacePaintStorePath, "utf8");
      const trimmed = String(raw ?? "").trim();
      if (!trimmed) {
        return;
      }
      parsed = JSON.parse(trimmed);
    } catch (error) {
      if (error?.code !== "ENOENT") {
        this.log?.warn?.(
          `[paint] Failed to read surface store (${this.surfacePaintStorePath}): ${
            error?.message ?? error
          }`
        );
      }
      return;
    }

    const savedAt = Math.max(0, Math.trunc(Number(parsed?.savedAt) || Date.now()));
    const hasSurfacePaintCoreField =
      parsed && typeof parsed === "object"
        ? Object.prototype.hasOwnProperty.call(parsed, "surfacePaintCore")
        : false;
    const hasLegacySurfacesField =
      parsed && typeof parsed === "object"
        ? Object.prototype.hasOwnProperty.call(parsed, "surfaces")
        : false;
    const surfacePaintCoreSource =
      parsed?.surfacePaintCore && typeof parsed.surfacePaintCore === "object"
        ? parsed.surfacePaintCore
        : null;
    const surfaces = hasSurfacePaintCoreField
      ? Array.isArray(surfacePaintCoreSource?.surfaces)
        ? surfacePaintCoreSource.surfaces
        : Array.isArray(parsed?.surfacePaintCore)
          ? parsed.surfacePaintCore
          : []
      : Array.isArray(parsed?.surfaces)
        ? parsed.surfaces
        : [];
    const platforms = Array.isArray(parsed?.platforms) ? parsed.platforms : [];
    const ropes = Array.isArray(parsed?.ropes) ? parsed.ropes : [];
    const promoObjects = Array.isArray(parsed?.promoObjects) ? parsed.promoObjects : [];
    const hasHostCustomBlocksField =
      parsed && typeof parsed === "object"
        ? Object.prototype.hasOwnProperty.call(parsed, "hostCustomBlocks")
        : false;
    const hasLegacyObjectPositionsField =
      parsed && typeof parsed === "object"
        ? Object.prototype.hasOwnProperty.call(parsed, "objectPositions")
        : false;
    const persistedHostCustomBlocks = hasHostCustomBlocksField
      ? normalizePersistedHostCustomBlockList(parsed?.hostCustomBlocks)
      : normalizePersistedHostCustomBlockPositions(parsed?.objectPositions);
    const platformRevision = normalizeStateRevision(parsed?.platformRevision, 0);
    const ropeRevision = normalizeStateRevision(parsed?.ropeRevision, 0);
    const objectRevision = normalizeStateRevision(parsed?.objectRevision, 0);
    const chatHistorySource = Array.isArray(parsed?.chatHistory) ? parsed.chatHistory : [];
    const savedLayoutVersion = normalizeMapLayoutVersion(parsed?.layoutVersion, "");
    const layoutVersionNeedsRewrite = savedLayoutVersion !== this.mapLayoutVersion;
    const portalTarget = normalizeRoomPortalTarget(
      parsed?.portalTarget,
      this.defaultPortalTargetUrl
    );
    const aZonePortalTarget = normalizeRoomPortalTarget(
      parsed?.aZonePortalTarget,
      this.defaultAZonePortalTargetUrl
    );
    const portalDisplays = createPortalDisplaysState(parsed?.portalDisplays);
    const mainPortalAd = this.serializeMainPortalAd({ mainPortalAd: parsed?.mainPortalAd });
    const leftBillboard = this.serializeLeftBillboard({ leftBillboard: parsed?.leftBillboard });
    const rightBillboard = this.serializeRightBillboard({ rightBillboard: parsed?.rightBillboard });
    const restored = new Map();
    const restoredChatHistory = [];
    for (const entry of surfaces) {
      const surfaceId = normalizeSurfaceId(entry?.surfaceId);
      const paintEntry = normalizeSurfacePaintEntry(entry, savedAt);
      if (!surfaceId || !paintEntry) {
        continue;
      }
      restored.set(surfaceId, paintEntry);
    }
    for (const entry of chatHistorySource) {
      const normalized = normalizeChatHistoryEntry(entry, savedAt);
      if (!normalized) {
        continue;
      }
      restoredChatHistory.push(normalized);
      if (restoredChatHistory.length >= MAX_CHAT_MESSAGES) {
        break;
      }
    }
    restoredChatHistory.sort((a, b) => a.createdAt - b.createdAt);

    const room = this.getDefaultRoom();
    room.portalTarget = portalTarget;
    room.aZonePortalTarget = aZonePortalTarget;
    room.surfacePaint = restored;
    room.chatHistory = restoredChatHistory;
    room.portalDisplays = portalDisplays;
    room.mainPortalAd = mainPortalAd;
    room.leftBillboard = leftBillboard;
    room.rightBillboard = rightBillboard;
    room.surfacePolicies = createSurfacePoliciesState(parsed?.surfacePolicies ?? room.surfacePolicies);
    room.objectEditor = normalizeObjectEditorState(parsed?.objectEditor, room.objectEditor);
    if (layoutVersionNeedsRewrite) {
      this.log?.warn?.(
        `[paint] Layout version mismatch (saved=${savedLayoutVersion || "none"}, runtime=${this.mapLayoutVersion}); applying compatible restore.`
      );
    }
    room.platformRevision = platformRevision;
    room.ropeRevision = ropeRevision;
    room.objectRevision = objectRevision;
    this.setObjectPositions(room, persistedHostCustomBlocks, {
      persist: false,
      bumpRevision: false
    });
    this.setPlatforms(room, platforms, { persist: false, bumpRevision: false });
    this.setRopes(room, ropes, { persist: false, bumpRevision: false });
    this.setPromoObjects(room, promoObjects, { persist: false });
    if (!hasSurfacePaintCoreField && hasLegacySurfacesField) {
      this.log?.log?.("[paint] Migrating legacy surfaces to surfacePaintCore.");
    }
    if (!hasHostCustomBlocksField && hasLegacyObjectPositionsField) {
      this.log?.log?.("[paint] Migrating legacy objectPositions to hostCustomBlocks subset.");
    }
    if (
      (!hasSurfacePaintCoreField && hasLegacySurfacesField) ||
      (!hasHostCustomBlocksField && hasLegacyObjectPositionsField) ||
      layoutVersionNeedsRewrite
    ) {
      this.scheduleSurfacePaintSave();
    }
    if (restored.size > 0) {
      this.log?.log?.(
        `[paint] Restored ${restored.size} painted surfaces from ${this.surfacePaintStorePath}`
      );
    }
  }

  scheduleSurfacePaintSave() {
    if (!this.surfacePaintStorePath) {
      return;
    }
    this.surfacePaintSaveQueued = true;
    if (this.surfacePaintSaveTimer || this.surfacePaintSaveInFlight) {
      return;
    }

    this.surfacePaintSaveTimer = setTimeout(() => {
      this.surfacePaintSaveTimer = null;
      void this.flushSurfacePaintToDisk();
    }, this.surfacePaintSaveDebounceMs);
  }

  async flushSurfacePaintToDiskNow() {
    if (!this.surfacePaintStorePath) {
      throw new Error("persistent storage path missing");
    }
    this.surfacePaintSaveQueued = true;
    this.surfacePaintForceNextFlush = true;
    if (this.surfacePaintSaveTimer) {
      clearTimeout(this.surfacePaintSaveTimer);
      this.surfacePaintSaveTimer = null;
    }
    if (this.surfacePaintSaveInFlightPromise) {
      try {
        await this.surfacePaintSaveInFlightPromise;
      } catch {
        // ignore; follow-up flush below still attempts persistence
      }
    }
    let flushResult = await this.flushSurfacePaintToDisk();
    if (this.surfacePaintSaveInFlightPromise) {
      try {
        await this.surfacePaintSaveInFlightPromise;
      } catch {
        // ignore completion wait errors; caller only needs best-effort durability
      }
    }
    if (!flushResult || typeof flushResult !== "object") {
      flushResult = this.surfacePaintLastPersistError
        ? { ok: false, error: this.surfacePaintLastPersistError }
        : { ok: true };
    }
    if (!flushResult.ok) {
      throw new Error(String(flushResult.error ?? "failed to persist surface store"));
    }
  }

  async flushSurfacePaintToDisk() {
    if (!this.surfacePaintStorePath || this.surfacePaintSaveInFlight || !this.surfacePaintSaveQueued) {
      return { ok: false, error: "surface store unavailable" };
    }

    this.surfacePaintSaveInFlight = true;
    this.surfacePaintSaveQueued = false;
    const forceNextFlush = this.surfacePaintForceNextFlush;
    this.surfacePaintForceNextFlush = false;
    const room = this.getDefaultRoom();
    const serializedSurfacePaint = this.serializeSurfacePaint(room);
    const payload = {
      version: SURFACE_PAINT_STORE_VERSION,
      savedAt: Date.now(),
      defaultRoomCode: this.defaultRoomCode,
      layoutVersion: this.mapLayoutVersion,
      portalTarget: String(room.portalTarget ?? "").trim(),
      aZonePortalTarget: String(room.aZonePortalTarget ?? "").trim(),
      surfacePaintCore: {
        payloadVersion: SURFACE_PAINT_CORE_PAYLOAD_VERSION,
        surfaces: serializedSurfacePaint
      },
      chatHistory: this.serializeChatHistory(room),
      portalDisplays: this.serializePortalDisplays(room),
      mainPortalAd: this.serializeMainPortalAd(room),
      leftBillboard: this.serializeLeftBillboard(room),
      rightBillboard: this.serializeRightBillboard(room),
      platforms: this.serializePlatforms(room),
      platformRevision: this.getPlatformRevision(room),
      ropes: this.serializeRopes(room),
      ropeRevision: this.getRopeRevision(room),
      promoObjects: this.serializePromoObjects(room),
      surfacePolicies: this.serializeSurfacePolicies(room),
      hostCustomBlocks: serializePersistedHostCustomBlockList(this.serializeObjectPositions(room)),
      objectRevision: this.getObjectRevision(room),
      objectEditor: this.serializeObjectEditor(room)
    };
    const tmpPath = `${this.surfacePaintStorePath}.tmp`;
    let persistError = "";

    const writePromise = (async () => {
      try {
        await mkdir(dirname(this.surfacePaintStorePath), { recursive: true });
        await writeFile(tmpPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
        await rename(tmpPath, this.surfacePaintStorePath);
      } catch (error) {
        persistError = String(error?.message ?? error ?? "persist failed").trim();
        this.log?.warn?.(
          `[paint] Failed to persist surface store (${this.surfacePaintStorePath}): ${
            error?.message ?? error
          }`
        );
        try {
          await unlink(tmpPath);
        } catch {
          // ignore cleanup failures
        }
      }
    })();
    this.surfacePaintSaveInFlightPromise = writePromise;

    try {
      await writePromise;
    } finally {
      this.surfacePaintSaveInFlight = false;
      this.surfacePaintSaveInFlightPromise = null;
      if (this.surfacePaintSaveQueued) {
        if (this.surfacePaintForceNextFlush || forceNextFlush) {
          void this.flushSurfacePaintToDisk();
        } else {
          this.scheduleSurfacePaintSave();
        }
      } else {
        this.surfacePaintForceNextFlush = false;
      }
    }
    if (persistError) {
      this.surfacePaintLastPersistError = persistError;
      return { ok: false, error: persistError };
    }
    this.surfacePaintLastPersistError = "";
    this.surfacePaintLastPersistAt = Date.now();
    return { ok: true };
  }

  getRoomByCode(code) {
    return this.rooms.get(code);
  }

  getRoomBySocket(socket) {
    const roomCode = socket?.data?.roomCode;
    return roomCode ? this.rooms.get(roomCode) : null;
  }

  getHealthSnapshot() {
    const globalRoom = this.getDefaultRoom();
    this.pruneRoomPlayers(globalRoom);
    return {
      rooms: this.rooms.size,
      globalPlayers: globalRoom.players.size,
      globalCapacity: this.maxRoomPlayers
    };
  }

  getPersistenceStatus() {
    const room = this.getDefaultRoom();
    const hostCustomBlocks = this.serializeObjectPositions(room);
    const surfacePaint = this.serializeSurfacePaint(room);
    const storePath = this.surfacePaintStorePath || null;
    const available = Boolean(storePath);
    const lastPersistAt = Math.max(0, Math.trunc(Number(this.surfacePaintLastPersistAt) || 0));
    const lastPersistError = String(this.surfacePaintLastPersistError ?? "").trim();
    const grayBlockCoreMemory = {
      schemaVersion: CORE_MEMORY_SCHEMA_VERSION,
      authoredType: "gray_block",
      payloadVersion: 1,
      durabilityTier: "core",
      storageKey: "hostCustomBlocks",
      available,
      reason: available ? "" : "persistent storage path missing",
      count: Object.keys(hostCustomBlocks).length,
      lastPersistAt: lastPersistAt > 0 ? lastPersistAt : null,
      lastPersistError: lastPersistError || null,
      queued: Boolean(this.surfacePaintSaveQueued),
      inFlight: Boolean(this.surfacePaintSaveInFlight)
    };
    const surfacePaintCoreMemory = {
      schemaVersion: CORE_MEMORY_SCHEMA_VERSION,
      authoredType: "surface_paint",
      payloadVersion: SURFACE_PAINT_CORE_PAYLOAD_VERSION,
      durabilityTier: "core",
      storageKey: "surfacePaintCore",
      available,
      reason: available ? "" : "persistent storage path missing",
      count: surfacePaint.length,
      lastPersistAt: lastPersistAt > 0 ? lastPersistAt : null,
      lastPersistError: lastPersistError || null,
      queued: Boolean(this.surfacePaintSaveQueued),
      inFlight: Boolean(this.surfacePaintSaveInFlight)
    };
    return {
      storePath,
      available,
      queued: Boolean(this.surfacePaintSaveQueued),
      inFlight: Boolean(this.surfacePaintSaveInFlight),
      lastPersistAt: lastPersistAt > 0 ? lastPersistAt : null,
      lastPersistError: lastPersistError || null,
      coreMemorySchemaVersion: CORE_MEMORY_SCHEMA_VERSION,
      coreMemory: grayBlockCoreMemory,
      grayBlockCoreMemory,
      surfacePaintCoreMemory
    };
  }

  serializeRoom(room) {
    this.pruneRoomPlayers(room);
    this.tickPortalSchedule(room);
    return {
      code: room.code,
      hostId: room.hostId,
      portalTarget: String(room.portalTarget ?? "").trim(),
      aZonePortalTarget: String(room.aZonePortalTarget ?? "").trim(),
      portalSchedule: this.serializePortalSchedule(room),
      portalDisplays: this.serializePortalDisplays(room),
      mainPortalAd: this.serializeMainPortalAd(room),
      rightBillboard: this.serializeRightBillboard(room),
      securityTest: this.serializeSecurityTest(room),
      objectEditor: this.serializeObjectEditor(room),
      promoObjects: this.serializePromoObjects(room),
      surfacePolicies: this.serializeSurfacePolicies(room),
      players: Array.from(room.players.values()).map((player) => ({
        id: player.id,
        name: player.name,
        state: player.state ?? null,
        zone: normalizeRoomZone(player?.zone ?? "lobby", "lobby")
      }))
    };
  }

  summarizeRooms() {
    const room = this.getDefaultRoom();
    this.pruneRoomPlayers(room);
    return [
      {
        code: room.code,
        count: room.players.size,
        capacity: this.maxRoomPlayers,
        hostName: room.players.get(room.hostId)?.name ?? "AUTO"
      }
    ];
  }

  emitRoomList(target = this.io) {
    target.emit("room:list", this.summarizeRooms());
  }

  emitRoomUpdate(room) {
    this.io.to(room.code).emit("room:update", this.serializeRoom(room));
  }

  serializeChatHistory(room) {
    if (!room || typeof room !== "object") {
      return [];
    }
    const source = Array.isArray(room.chatHistory) ? room.chatHistory : [];
    const sanitized = [];
    for (const entry of source) {
      const normalized = normalizeChatHistoryEntry(entry);
      if (!normalized) {
        continue;
      }
      sanitized.push(normalized);
    }
    sanitized.sort((a, b) => a.createdAt - b.createdAt);
    if (sanitized.length > MAX_CHAT_MESSAGES) {
      sanitized.splice(0, sanitized.length - MAX_CHAT_MESSAGES);
    }
    room.chatHistory = sanitized;
    return sanitized;
  }

  appendChatHistory(room, rawEntry, { persist = true } = {}) {
    if (!room || typeof room !== "object") {
      return { ok: false, error: "room not found" };
    }
    const nextEntry = normalizeChatHistoryEntry(rawEntry);
    if (!nextEntry) {
      return { ok: false, error: "invalid chat message" };
    }

    const history = this.serializeChatHistory(room);
    const duplicate = history.some((entry) => entry.messageId === nextEntry.messageId);
    if (duplicate) {
      return { ok: true, changed: false, message: nextEntry };
    }

    history.push(nextEntry);
    history.sort((a, b) => a.createdAt - b.createdAt);
    if (history.length > MAX_CHAT_MESSAGES) {
      history.splice(0, history.length - MAX_CHAT_MESSAGES);
    }
    room.chatHistory = history;

    if (persist) {
      this.scheduleSurfacePaintSave();
    }
    return { ok: true, changed: true, message: nextEntry };
  }

  emitPortalTargetUpdate(room) {
    this.io.to(room.code).emit("portal:target:update", {
      targetUrl: String(room?.portalTarget ?? "").trim()
    });
  }

  emitAZonePortalTargetUpdate(room) {
    this.io.to(room.code).emit("portal:a-zone-target:update", {
      targetUrl: String(room?.aZonePortalTarget ?? "").trim()
    });
  }

  serializeObjectEditor(room) {
    if (!room) {
      return createObjectEditorState();
    }
    room.objectEditor = normalizeObjectEditorState(room.objectEditor, room.objectEditor);
    return room.objectEditor;
  }

  getSurfacePolicies(room) {
    if (!room || typeof room !== "object") {
      return createSurfacePoliciesState();
    }
    room.surfacePolicies = createSurfacePoliciesState(room.surfacePolicies);
    return room.surfacePolicies;
  }

  serializeSurfacePolicies(room) {
    const policies = this.getSurfacePolicies(room);
    return {
      bridgePanelsNz: {
        surfacePattern: "bridge_panel_*:*",
        allowOthersDraw: normalizeBooleanFlag(policies?.bridgePanelsNz?.allowOthersDraw, false),
        updatedAt: Math.max(
          0,
          Math.trunc(Number(policies?.bridgePanelsNz?.updatedAt) || Date.now())
        )
      },
      // backward-compat mirror for older clients that still read a single surface key
      bridgePanel12Nz: {
        surfaceId: "bridge_panel_12:nz",
        allowOthersDraw: normalizeBooleanFlag(policies?.bridgePanelsNz?.allowOthersDraw, false),
        updatedAt: Math.max(
          0,
          Math.trunc(Number(policies?.bridgePanelsNz?.updatedAt) || Date.now())
        )
      }
    };
  }

  setSurfacePaintPolicy(room, rawSurfaceId, rawAllowOthersDraw) {
    if (!room) {
      return { ok: false, error: "room not found" };
    }
    const surfaceId = normalizeSurfaceId(rawSurfaceId);
    if (!surfaceId) {
      return { ok: false, error: "invalid surface id" };
    }
    if (!isHostControlledSurfaceId(surfaceId)) {
      return { ok: false, error: "unsupported surface policy" };
    }

    const policies = this.getSurfacePolicies(room);
    const previous = {
      allowOthersDraw: normalizeBooleanFlag(policies?.bridgePanelsNz?.allowOthersDraw, false),
      updatedAt: Math.max(0, Math.trunc(Number(policies?.bridgePanelsNz?.updatedAt) || 0))
    };
    const allowOthersDraw = normalizeBooleanFlag(rawAllowOthersDraw, previous.allowOthersDraw);
    if (allowOthersDraw === previous.allowOthersDraw) {
      return {
        ok: true,
        changed: false,
        surfaceId,
        allowOthersDraw: previous.allowOthersDraw,
        updatedAt: previous.updatedAt,
        surfacePolicies: this.serializeSurfacePolicies(room)
      };
    }

    const updatedAt = Date.now();
    policies.bridgePanelsNz = {
      surfacePattern: "bridge_panel_*:*",
      allowOthersDraw,
      updatedAt
    };
    this.scheduleSurfacePaintSave();
    return {
      ok: true,
      changed: true,
      surfaceId,
      allowOthersDraw,
      updatedAt,
      surfacePolicies: this.serializeSurfacePolicies(room)
    };
  }

  setObjectEditor(room, rawSettings, { persist = true } = {}) {
    if (!room) {
      return { ok: false, error: "room not found" };
    }
    const previous = this.serializeObjectEditor(room);
    const next = normalizeObjectEditorState(rawSettings, previous);
    const changed =
      next.platformLimit !== previous.platformLimit ||
      next.ropeLimit !== previous.ropeLimit ||
      Math.abs(next.platformScale - previous.platformScale) > 0.0001 ||
      Math.abs(next.ropeScale - previous.ropeScale) > 0.0001;
    if (!changed) {
      return {
        ok: true,
        changed: false,
        settings: previous
      };
    }

    room.objectEditor = {
      ...next,
      updatedAt: Date.now()
    };
    let platformsTrimmed = false;
    let ropesTrimmed = false;
    if (Array.isArray(room.platforms) && room.platforms.length > room.objectEditor.platformLimit) {
      room.platforms = room.platforms.slice(0, room.objectEditor.platformLimit);
      platformsTrimmed = true;
    }
    if (Array.isArray(room.ropes) && room.ropes.length > room.objectEditor.ropeLimit) {
      room.ropes = room.ropes.slice(0, room.objectEditor.ropeLimit);
      ropesTrimmed = true;
    }
    if (persist) {
      this.scheduleSurfacePaintSave();
    }
    return {
      ok: true,
      changed: true,
      settings: this.serializeObjectEditor(room),
      platformsTrimmed,
      ropesTrimmed
    };
  }

  getPromoObjectsMap(room) {
    if (!room) {
      return null;
    }
    if (!(room.promoObjects instanceof Map)) {
      room.promoObjects = new Map();
    }
    return room.promoObjects;
  }

  normalizePromoObject(rawValue, fallback = null) {
    const source = rawValue && typeof rawValue === "object" ? rawValue : {};
    const ownerKey = normalizePromoOwnerKey(source.ownerKey ?? fallback?.ownerKey ?? "");
    if (!ownerKey) {
      return null;
    }

    const mediaDataUrl = normalizePromoMediaDataUrl(source.mediaDataUrl ?? fallback?.mediaDataUrl ?? "");
    let mediaKind = "none";
    if (mediaDataUrl) {
      mediaKind = "image";
    }

    return {
      ownerKey,
      ownerName: normalizePromoName(source.ownerName ?? fallback?.ownerName ?? "PLAYER"),
      kind: normalizePromoKind(source.kind ?? fallback?.kind ?? "block"),
      x: normalizePromoAxis(source.x, fallback?.x ?? 0),
      y: normalizePromoAxis(source.y, fallback?.y ?? 0, PROMO_MIN_Y, PROMO_MAX_Y),
      z: normalizePromoAxis(source.z, fallback?.z ?? 0),
      yaw: normalizePromoYaw(source.yaw, fallback?.yaw ?? 0),
      scale: normalizePromoScale(source.scale, fallback?.scale ?? 1),
      scaleY: normalizePromoScale(source.scaleY, fallback?.scaleY ?? source.scale ?? fallback?.scale ?? 1),
      linkUrl: normalizePromoUrl(source.linkUrl ?? fallback?.linkUrl ?? ""),
      mediaDataUrl,
      mediaKind,
      allowOthersDraw: normalizeBooleanFlag(source.allowOthersDraw, fallback?.allowOthersDraw ?? false),
      updatedAt: Math.max(
        0,
        Math.trunc(Number(source.updatedAt) || Number(fallback?.updatedAt) || Date.now())
      )
    };
  }

  serializePromoObjects(room) {
    const map = this.getPromoObjectsMap(room);
    if (!map) {
      return [];
    }
    const list = [];
    for (const rawValue of map.values()) {
      const normalized = this.normalizePromoObject(rawValue);
      if (!normalized) {
        continue;
      }
      list.push(normalized);
    }
    list.sort((a, b) => a.updatedAt - b.updatedAt);
    return list;
  }

  emitPromoObjectsUpdate(room) {
    this.io.to(room.code).emit("promo:state", {
      objects: this.serializePromoObjects(room)
    });
  }

  setPromoObjects(room, rawList, { persist = true } = {}) {
    if (!room) {
      return { ok: false, error: "room not found" };
    }
    const map = this.getPromoObjectsMap(room);
    map.clear();
    const list = Array.isArray(rawList) ? rawList : [];
    for (const entry of list) {
      const normalized = this.normalizePromoObject(entry);
      if (!normalized) {
        continue;
      }
      if (getPromoPlacementBlockReason(normalized.x, normalized.z, normalized.scale)) {
        continue;
      }
      map.set(normalized.ownerKey, normalized);
      if (map.size >= MAX_PROMO_OBJECTS) {
        break;
      }
    }
    if (persist) {
      this.scheduleSurfacePaintSave();
    }
    return { ok: true };
  }

  upsertPromoObject(room, actorOwnerKey, actorName, rawPayload = {}) {
    if (!room) {
      return { ok: false, error: "room not found" };
    }
    const actorKey = normalizePromoOwnerKey(actorOwnerKey);
    if (!actorKey) {
      return { ok: false, error: "invalid owner key" };
    }
    const map = this.getPromoObjectsMap(room);
    const targetOwnerKeyRaw = normalizePromoOwnerKey(rawPayload?.targetOwnerKey ?? "");
    const targetOwnerKey = targetOwnerKeyRaw || actorKey;
    const previous = map.get(targetOwnerKey) ?? null;

    if (targetOwnerKey !== actorKey) {
      return { ok: false, error: "owner denied edits" };
    }

    const fallback = previous
      ? { ...previous }
      : {
          ownerKey: targetOwnerKey,
          ownerName: actorName,
          x: 0,
          y: 0,
          z: 0,
          yaw: 0,
          scale: 1,
          scaleY: 1,
          linkUrl: "",
          mediaDataUrl: "",
          allowOthersDraw: false,
          updatedAt: Date.now()
        };

    const normalized = this.normalizePromoObject(
      {
        ...rawPayload,
        ownerKey: targetOwnerKey,
        ownerName: previous?.ownerName ?? actorName
      },
      fallback
    );
    if (!normalized) {
      return { ok: false, error: "invalid promo payload" };
    }
    const hasPositionChange =
      !previous ||
      Math.abs(Number(normalized.x) - Number(previous.x)) > 0.001 ||
      Math.abs(Number(normalized.z) - Number(previous.z)) > 0.001;
    const hasScaleChange =
      !previous ||
      Math.abs(Number(normalized.scale) - Number(previous.scale)) > 0.001 ||
      Math.abs(Number(normalized.scaleY) - Number(previous.scaleY ?? previous.scale)) > 0.001;
    if (hasPositionChange || hasScaleChange) {
      const blockReason = getPromoPlacementBlockReason(normalized.x, normalized.z, normalized.scale);
      if (blockReason === "spawn") {
        return { ok: false, error: "placement blocked at spawn" };
      }
      if (blockReason === "bridge") {
        return { ok: false, error: "placement blocked on bridge" };
      }
      if (blockReason === "portal") {
        return { ok: false, error: "placement blocked at portal" };
      }
      if (blockReason === "center") {
        return { ok: false, error: "placement blocked at center" };
      }
      if (blockReason === "land") {
        return { ok: false, error: "placement blocked on land" };
      }
    }
    if (!previous && map.size >= MAX_PROMO_OBJECTS) {
      return { ok: false, error: "promo object limit reached" };
    }
    normalized.updatedAt = Date.now();
    if (targetOwnerKey === actorKey) {
      normalized.ownerName = normalizePromoName(actorName);
    }
    map.set(targetOwnerKey, normalized);
    this.scheduleSurfacePaintSave();
    return {
      ok: true,
      changed: true,
      object: normalized
    };
  }

  removePromoObject(room, actorOwnerKey, rawTargetOwnerKey = "") {
    if (!room) {
      return { ok: false, error: "room not found" };
    }
    const actorKey = normalizePromoOwnerKey(actorOwnerKey);
    if (!actorKey) {
      return { ok: false, error: "invalid owner key" };
    }
    const map = this.getPromoObjectsMap(room);
    const targetOwnerKey = normalizePromoOwnerKey(rawTargetOwnerKey) || actorKey;
    const previous = map.get(targetOwnerKey);
    if (!previous) {
      return { ok: true, changed: false };
    }
    if (targetOwnerKey !== actorKey) {
      return { ok: false, error: "owner denied edits" };
    }
    map.delete(targetOwnerKey);
    this.scheduleSurfacePaintSave();
    return { ok: true, changed: true };
  }

  serializePlatforms(room) {
    return Array.isArray(room?.platforms) ? room.platforms : [];
  }

  getPlatformRevision(room) {
    if (!room || typeof room !== "object") {
      return 0;
    }
    room.platformRevision = normalizeStateRevision(room.platformRevision, 0);
    return room.platformRevision;
  }

  getRopeRevision(room) {
    if (!room || typeof room !== "object") {
      return 0;
    }
    room.ropeRevision = normalizeStateRevision(room.ropeRevision, 0);
    return room.ropeRevision;
  }

  getObjectRevision(room) {
    if (!room || typeof room !== "object") {
      return 0;
    }
    room.objectRevision = normalizeStateRevision(room.objectRevision, 0);
    return room.objectRevision;
  }

  serializeObjectPositions(room) {
    if (!room || typeof room !== "object") {
      return {};
    }
    const sanitized = normalizePersistedHostCustomBlockPositions(room.objectPositions);
    room.objectPositions = sanitized;
    return sanitized;
  }

  emitObjectPositionUpdate(room) {
    this.io.to(room.code).emit("object:state", {
      positions: this.serializeObjectPositions(room),
      revision: this.getObjectRevision(room)
    });
  }

  setObjectPositions(room, rawPositions, { persist = true, bumpRevision = true } = {}) {
    if (!room || typeof room !== "object") {
      return { ok: false, error: "room not found" };
    }
    const sanitized = normalizePersistedHostCustomBlockPositions(rawPositions);
    room.objectPositions = sanitized;
    if (bumpRevision) {
      room.objectRevision = nextStateRevision(room.objectRevision);
    }
    if (persist) {
      this.scheduleSurfacePaintSave();
    }
    return { ok: true };
  }

  emitPlatformUpdate(room) {
    this.io.to(room.code).emit("platform:state", {
      platforms: this.serializePlatforms(room),
      revision: this.getPlatformRevision(room)
    });
  }

  setPlatforms(room, rawPlatforms, { persist = true, bumpRevision = true } = {}) {
    if (!room) return { ok: false, error: "room not found" };
    const MAX_NUM = 2000;
    const editorSettings = this.serializeObjectEditor(room);
    const maxPlatforms = clampEditorLimit(editorSettings.platformLimit, DEFAULT_PLATFORM_LIMIT);
    const sanitized = (Array.isArray(rawPlatforms) ? rawPlatforms : [])
      .slice(0, maxPlatforms)
      .filter((p) => p && typeof p === "object")
      .map((p) => ({
        x: Math.max(-MAX_NUM, Math.min(MAX_NUM, Number(p.x) || 0)),
        y: Math.max(-MAX_NUM, Math.min(MAX_NUM, Number(p.y) || 0)),
        z: Math.max(-MAX_NUM, Math.min(MAX_NUM, Number(p.z) || 0)),
        w: Math.max(0.1, Math.min(50, Number(p.w) || 3)),
        h: Math.max(0.05, Math.min(20, Number(p.h) || 0.3)),
        d: Math.max(0.1, Math.min(50, Number(p.d) || 3))
      }));
    room.platforms = sanitized;
    if (bumpRevision) {
      room.platformRevision = nextStateRevision(room.platformRevision);
    }
    if (persist) {
      this.scheduleSurfacePaintSave();
    }
    return { ok: true };
  }

  serializeRopes(room) {
    return Array.isArray(room?.ropes) ? room.ropes : [];
  }

  emitRopeUpdate(room) {
    this.io.to(room.code).emit("rope:state", {
      ropes: this.serializeRopes(room),
      revision: this.getRopeRevision(room)
    });
  }

  setRopes(room, rawRopes, { persist = true, bumpRevision = true } = {}) {
    if (!room) return { ok: false, error: "room not found" };
    const MAX_NUM = 2000;
    const editorSettings = this.serializeObjectEditor(room);
    const maxRopes = clampEditorLimit(editorSettings.ropeLimit, DEFAULT_ROPE_LIMIT);
    const sanitized = (Array.isArray(rawRopes) ? rawRopes : [])
      .slice(0, maxRopes)
      .filter((r) => r && typeof r === "object")
      .map((r) => ({
        x: Math.max(-MAX_NUM, Math.min(MAX_NUM, Number(r.x) || 0)),
        y: Math.max(-MAX_NUM, Math.min(MAX_NUM, Number(r.y) || 0)),
        z: Math.max(-MAX_NUM, Math.min(MAX_NUM, Number(r.z) || 0)),
        height: Math.max(0.5, Math.min(50, Number(r.height) || 4))
      }));
    room.ropes = sanitized;
    if (bumpRevision) {
      room.ropeRevision = nextStateRevision(room.ropeRevision);
    }
    if (persist) {
      this.scheduleSurfacePaintSave();
    }
    return { ok: true };
  }

  serializePortalSchedule(room) {
    const state = room?.portalSchedule ?? createPortalScheduleState();
    return {
      mode: String(state.mode ?? "idle"),
      startAtMs: Math.max(0, Math.trunc(Number(state.startAtMs) || 0)),
      openUntilMs: Math.max(0, Math.trunc(Number(state.openUntilMs) || 0)),
      remainingSec: Math.max(0, Math.trunc(Number(state.remainingSec) || 0)),
      finalCountdownSeconds: Math.max(
        3,
        Math.min(
          30,
          Math.trunc(
            Number(state.finalCountdownSeconds) || this.portalFinalCountdownSeconds || 10
          )
        )
      ),
      updatedAt: Math.max(0, Math.trunc(Number(state.updatedAt) || Date.now()))
    };
  }

  emitPortalScheduleUpdate(room) {
    this.io.to(room.code).emit("portal:schedule:update", this.serializePortalSchedule(room));
  }

  serializeSecurityTest(room) {
    const state = room?.securityTest ?? createSecurityTestState();
    return {
      enabled: Boolean(state.enabled),
      updatedAt: Math.max(0, Math.trunc(Number(state.updatedAt) || Date.now()))
    };
  }

  serializePortalDisplays(room) {
    if (!room || typeof room !== "object") {
      return createPortalDisplaysState();
    }
    room.portalDisplays = createPortalDisplaysState(room.portalDisplays);
    return {
      portal1: createPortalDisplayState("portal1", room.portalDisplays.portal1),
      portal2: createPortalDisplayState("portal2", room.portalDisplays.portal2),
      hall: createPortalDisplayState("hall", room.portalDisplays.hall)
    };
  }

  emitPortalDisplayUpdate(room) {
    this.io.to(room.code).emit("portal:display:update", this.serializePortalDisplays(room));
  }

  setPortalDisplay(room, rawPortalKey, payload = {}) {
    if (!room) {
      return { ok: false, error: "room not found" };
    }
    const portalKey = normalizePortalDisplayKey(rawPortalKey);
    if (!portalKey) {
      return { ok: false, error: "invalid portal key" };
    }

    const defaults = getPortalDisplayDefaults(portalKey);
    const previousDisplays = this.serializePortalDisplays(room);
    const previous = previousDisplays[portalKey];
    const hasTitle = Object.prototype.hasOwnProperty.call(payload, "title")
      || Object.prototype.hasOwnProperty.call(payload, "name");
    const hasMode = Object.prototype.hasOwnProperty.call(payload, "mode");
    const hasLine2 = Object.prototype.hasOwnProperty.call(payload, "line2");
    const hasLine3 = Object.prototype.hasOwnProperty.call(payload, "line3");
    const hasImageDataUrl = Object.prototype.hasOwnProperty.call(payload, "imageDataUrl")
      || Object.prototype.hasOwnProperty.call(payload, "dataUrl");
    const next = normalizePortalDisplayState(
      {
        mode: hasMode ? payload?.mode ?? "" : previous.mode,
        title: hasTitle ? payload?.title ?? payload?.name ?? "" : previous.title,
        line2: hasLine2 ? payload?.line2 ?? "" : previous.line2,
        line3: hasLine3 ? payload?.line3 ?? "" : previous.line3,
        imageDataUrl: hasImageDataUrl
          ? payload?.imageDataUrl ?? payload?.dataUrl ?? ""
          : previous.imageDataUrl,
        updatedAt: Date.now()
      },
      defaults
    );

    if (
      previous.mode === next.mode &&
      previous.title === next.title &&
      previous.line2 === next.line2 &&
      previous.line3 === next.line3 &&
      previous.imageDataUrl === next.imageDataUrl
    ) {
      return {
        ok: true,
        changed: false,
        portalKey,
        state: previous,
        portalDisplays: previousDisplays
      };
    }

    room.portalDisplays = createPortalDisplaysState(room.portalDisplays);
    room.portalDisplays[portalKey] = next;
    this.scheduleSurfacePaintSave();
    return {
      ok: true,
      changed: true,
      portalKey,
      state: next,
      portalDisplays: this.serializePortalDisplays(room)
    };
  }

  resetPortalDisplay(room, rawPortalKey) {
    if (!room) {
      return { ok: false, error: "room not found" };
    }
    const portalKey = normalizePortalDisplayKey(rawPortalKey);
    if (!portalKey) {
      return { ok: false, error: "invalid portal key" };
    }
    const previousDisplays = this.serializePortalDisplays(room);
    const previous = previousDisplays[portalKey];
    const next = createPortalDisplayState(portalKey);

    if (
      previous.mode === next.mode &&
      previous.title === next.title &&
      previous.line2 === next.line2 &&
      previous.line3 === next.line3 &&
      previous.imageDataUrl === next.imageDataUrl
    ) {
      return {
        ok: true,
        changed: false,
        portalKey,
        state: previous,
        portalDisplays: previousDisplays
      };
    }

    room.portalDisplays = createPortalDisplaysState(room.portalDisplays);
    room.portalDisplays[portalKey] = next;
    this.scheduleSurfacePaintSave();
    return {
      ok: true,
      changed: true,
      portalKey,
      state: next,
      portalDisplays: this.serializePortalDisplays(room)
    };
  }

  serializeMainPortalAd(room) {
    const state = room?.mainPortalAd ?? createMainPortalAdState();
    const imageDataUrl = normalizeMainPortalAdImageDataUrl(state.imageDataUrl);
    const modeRaw = String(state.mode ?? "ad").trim().toLowerCase();
    const mode = modeRaw === "image" && imageDataUrl ? "image" : "ad";
    return {
      mode,
      imageDataUrl: mode === "image" ? imageDataUrl : "",
      updatedAt: Math.max(0, Math.trunc(Number(state.updatedAt) || Date.now()))
    };
  }

  emitMainPortalAdUpdate(room) {
    this.io.to(room.code).emit("portal:ad:update", this.serializeMainPortalAd(room));
  }

  setMainPortalAdImage(room, rawImageDataUrl) {
    if (!room) {
      return { ok: false, error: "room not found" };
    }

    const imageDataUrl = normalizeMainPortalAdImageDataUrl(rawImageDataUrl);
    if (!imageDataUrl) {
      return { ok: false, error: "invalid image data" };
    }

    const previous = this.serializeMainPortalAd(room);
    if (previous.mode === "image" && previous.imageDataUrl === imageDataUrl) {
      return {
        ok: true,
        changed: false,
        state: previous
      };
    }

    if (!room.mainPortalAd || typeof room.mainPortalAd !== "object") {
      room.mainPortalAd = createMainPortalAdState();
    }
    room.mainPortalAd.mode = "image";
    room.mainPortalAd.imageDataUrl = imageDataUrl;
    room.mainPortalAd.updatedAt = Date.now();
    this.scheduleSurfacePaintSave();

    return {
      ok: true,
      changed: true,
      state: this.serializeMainPortalAd(room)
    };
  }

  resetMainPortalAd(room) {
    if (!room) {
      return { ok: false, error: "room not found" };
    }

    const previous = this.serializeMainPortalAd(room);
    if (previous.mode === "ad" && !previous.imageDataUrl) {
      return {
        ok: true,
        changed: false,
        state: previous
      };
    }

    if (!room.mainPortalAd || typeof room.mainPortalAd !== "object") {
      room.mainPortalAd = createMainPortalAdState();
    }
    room.mainPortalAd.mode = "ad";
    room.mainPortalAd.imageDataUrl = "";
    room.mainPortalAd.updatedAt = Date.now();
    this.scheduleSurfacePaintSave();

    return {
      ok: true,
      changed: true,
      state: this.serializeMainPortalAd(room)
    };
  }

  serializeLeftBillboard(room) {
    const state = room?.leftBillboard ?? createLeftBillboardState();
    const imageDataUrl = normalizeLeftBillboardImageDataUrl(state.imageDataUrl);
    const videoDataUrl = normalizeBillboardVideoDataUrl(state.videoDataUrl);
    const modeRaw = String(state.mode ?? "ad").trim().toLowerCase();
    let mode = "ad";
    if (modeRaw === "image" && imageDataUrl) {
      mode = "image";
    } else if (modeRaw === "video_data" && videoDataUrl) {
      mode = "video_data";
    }

    return {
      mode,
      imageDataUrl: mode === "image" ? imageDataUrl : "",
      videoDataUrl: mode === "video_data" ? videoDataUrl : "",
      updatedAt: Math.max(0, Math.trunc(Number(state.updatedAt) || Date.now()))
    };
  }

  emitLeftBillboardUpdate(room) {
    this.io.to(room.code).emit("billboard:left:update", this.serializeLeftBillboard(room));
  }

  setLeftBillboardImage(room, rawImageDataUrl) {
    if (!room) {
      return { ok: false, error: "room not found" };
    }

    const imageDataUrl = normalizeLeftBillboardImageDataUrl(rawImageDataUrl);
    if (!imageDataUrl) {
      return { ok: false, error: "invalid image data" };
    }

    const previous = this.serializeLeftBillboard(room);
    if (previous.mode === "image" && previous.imageDataUrl === imageDataUrl) {
      return {
        ok: true,
        changed: false,
        state: previous
      };
    }

    if (!room.leftBillboard || typeof room.leftBillboard !== "object") {
      room.leftBillboard = createLeftBillboardState();
    }
    room.leftBillboard.mode = "image";
    room.leftBillboard.imageDataUrl = imageDataUrl;
    room.leftBillboard.videoDataUrl = "";
    room.leftBillboard.updatedAt = Date.now();
    this.scheduleSurfacePaintSave();

    return {
      ok: true,
      changed: true,
      state: this.serializeLeftBillboard(room)
    };
  }

  resetLeftBillboard(room) {
    if (!room) {
      return { ok: false, error: "room not found" };
    }

    const previous = this.serializeLeftBillboard(room);
    if (previous.mode === "ad" && !previous.imageDataUrl) {
      return {
        ok: true,
        changed: false,
        state: previous
      };
    }

    if (!room.leftBillboard || typeof room.leftBillboard !== "object") {
      room.leftBillboard = createLeftBillboardState();
    }
    room.leftBillboard.mode = "ad";
    room.leftBillboard.imageDataUrl = "";
    room.leftBillboard.videoDataUrl = "";
    room.leftBillboard.updatedAt = Date.now();
    this.scheduleSurfacePaintSave();

    return {
      ok: true,
      changed: true,
      state: this.serializeLeftBillboard(room)
    };
  }

  serializeRightBillboard(room) {
    const state = room?.rightBillboard ?? createRightBillboardState();
    const videoId = normalizeRightBillboardVideoId(state.videoId);
    const videoDataUrl = normalizeBillboardVideoDataUrl(state.videoDataUrl);
    const modeRaw = String(state.mode ?? "ad").trim().toLowerCase();
    let mode = "ad";
    if (modeRaw === "video_data" && videoDataUrl) {
      mode = "video_data";
    } else if (modeRaw === "video" && videoId) {
      mode = "video";
    }

    return {
      mode,
      videoId: mode === "video" ? videoId : "",
      videoDataUrl: mode === "video_data" ? videoDataUrl : "",
      updatedAt: Math.max(0, Math.trunc(Number(state.updatedAt) || Date.now()))
    };
  }

  emitRightBillboardUpdate(room) {
    this.io.to(room.code).emit("billboard:right:update", this.serializeRightBillboard(room));
  }

  setRightBillboardVideo(room, rawVideoId) {
    if (!room) {
      return { ok: false, error: "room not found" };
    }

    const videoId = normalizeRightBillboardVideoId(rawVideoId);
    if (!videoId) {
      return { ok: false, error: "invalid video id" };
    }

    const previous = this.serializeRightBillboard(room);
    if (previous.mode === "video" && previous.videoId === videoId) {
      return {
        ok: true,
        changed: false,
        state: previous
      };
    }

    if (!room.rightBillboard || typeof room.rightBillboard !== "object") {
      room.rightBillboard = createRightBillboardState();
    }
    room.rightBillboard.mode = "video";
    room.rightBillboard.videoId = videoId;
    room.rightBillboard.videoDataUrl = "";
    room.rightBillboard.updatedAt = Date.now();
    this.scheduleSurfacePaintSave();

    return {
      ok: true,
      changed: true,
      state: this.serializeRightBillboard(room)
    };
  }

  resetRightBillboard(room) {
    if (!room) {
      return { ok: false, error: "room not found" };
    }

    const previous = this.serializeRightBillboard(room);
    if (previous.mode === "ad" && !previous.videoId && !previous.videoDataUrl) {
      return {
        ok: true,
        changed: false,
        state: previous
      };
    }

    if (!room.rightBillboard || typeof room.rightBillboard !== "object") {
      room.rightBillboard = createRightBillboardState();
    }
    room.rightBillboard.mode = "ad";
    room.rightBillboard.videoId = "";
    room.rightBillboard.videoDataUrl = "";
    room.rightBillboard.updatedAt = Date.now();
    this.scheduleSurfacePaintSave();

    return {
      ok: true,
      changed: true,
      state: this.serializeRightBillboard(room)
    };
  }

  setBillboardVideoData(room, rawVideoDataUrl, rawTarget) {
    if (!room) {
      return { ok: false, error: "room not found" };
    }

    const target = normalizeBillboardVideoTarget(rawTarget);
    if (!target) {
      return { ok: false, error: "invalid target" };
    }

    const videoDataUrl = normalizeBillboardVideoDataUrl(rawVideoDataUrl);
    if (!videoDataUrl) {
      return { ok: false, error: "invalid video data" };
    }

    const previousLeft = this.serializeLeftBillboard(room);
    const previousRight = this.serializeRightBillboard(room);

    if (!room.leftBillboard || typeof room.leftBillboard !== "object") {
      room.leftBillboard = createLeftBillboardState();
    }
    if (!room.rightBillboard || typeof room.rightBillboard !== "object") {
      room.rightBillboard = createRightBillboardState();
    }

    const now = Date.now();
    if (target === "left" || target === "both") {
      room.leftBillboard.mode = "video_data";
      room.leftBillboard.imageDataUrl = "";
      room.leftBillboard.videoDataUrl = videoDataUrl;
      room.leftBillboard.updatedAt = now;
    }
    if (target === "right" || target === "both") {
      room.rightBillboard.mode = "video_data";
      room.rightBillboard.videoId = "";
      room.rightBillboard.videoDataUrl = videoDataUrl;
      room.rightBillboard.updatedAt = now;
    }

    const leftState = this.serializeLeftBillboard(room);
    const rightState = this.serializeRightBillboard(room);
    const changed =
      previousLeft.mode !== leftState.mode ||
      previousLeft.imageDataUrl !== leftState.imageDataUrl ||
      previousLeft.videoDataUrl !== leftState.videoDataUrl ||
      previousRight.mode !== rightState.mode ||
      previousRight.videoId !== rightState.videoId ||
      previousRight.videoDataUrl !== rightState.videoDataUrl;

    if (changed) {
      this.scheduleSurfacePaintSave();
    }

    return {
      ok: true,
      changed,
      target,
      leftState,
      rightState
    };
  }

  serializeSharedMusic(room) {
    const state = room?.sharedMusic ?? createSharedMusicState();
    const modeRaw = String(state.mode ?? "idle").trim().toLowerCase();
    const mode = modeRaw === "playing" ? "playing" : "idle";
    const dataUrl = mode === "playing" ? normalizeSharedAudioDataUrl(state.dataUrl) : "";
    const name = normalizeSharedAudioName(state.name);
    const startAtMs = Math.max(0, Math.trunc(Number(state.startAtMs) || 0));
    const updatedAt = Math.max(0, Math.trunc(Number(state.updatedAt) || Date.now()));

    if (mode !== "playing" || !dataUrl) {
      return {
        mode: "idle",
        dataUrl: "",
        name: "",
        startAtMs: 0,
        updatedAt
      };
    }

    return {
      mode: "playing",
      dataUrl,
      name,
      startAtMs,
      updatedAt
    };
  }

  emitSharedMusicUpdate(room, { hostId = "" } = {}) {
    this.io.to(room.code).emit("music:update", {
      state: this.serializeSharedMusic(room),
      hostId: String(hostId ?? "").trim(),
      updatedAt: Date.now()
    });
  }

  setSharedMusic(room, rawDataUrl, rawName) {
    if (!room) {
      return { ok: false, error: "room not found" };
    }

    const dataUrl = normalizeSharedAudioDataUrl(rawDataUrl);
    if (!dataUrl) {
      return { ok: false, error: "invalid audio data" };
    }

    const name = normalizeSharedAudioName(rawName) || "HOST_TRACK.mp3";
    if (!room.sharedMusic || typeof room.sharedMusic !== "object") {
      room.sharedMusic = createSharedMusicState();
    }

    const now = Date.now();
    room.sharedMusic.mode = "playing";
    room.sharedMusic.dataUrl = dataUrl;
    room.sharedMusic.name = name;
    room.sharedMusic.startAtMs = now;
    room.sharedMusic.updatedAt = now;

    return {
      ok: true,
      changed: true,
      state: this.serializeSharedMusic(room)
    };
  }

  stopSharedMusic(room) {
    if (!room) {
      return { ok: false, error: "room not found" };
    }

    const previous = this.serializeSharedMusic(room);
    if (previous.mode === "idle") {
      return {
        ok: true,
        changed: false,
        state: previous
      };
    }

    if (!room.sharedMusic || typeof room.sharedMusic !== "object") {
      room.sharedMusic = createSharedMusicState();
    }
    room.sharedMusic.mode = "idle";
    room.sharedMusic.dataUrl = "";
    room.sharedMusic.name = "";
    room.sharedMusic.startAtMs = 0;
    room.sharedMusic.updatedAt = Date.now();

    return {
      ok: true,
      changed: true,
      state: this.serializeSharedMusic(room)
    };
  }

  serializeSurfacePaint(room) {
    if (!room?.surfacePaint || typeof room.surfacePaint.entries !== "function") {
      return [];
    }

    const list = [];
    for (const [surfaceIdRaw, imageDataUrlRaw] of room.surfacePaint.entries()) {
      const surfaceId = normalizeSurfaceId(surfaceIdRaw);
      const paintEntry = normalizeSurfacePaintEntry(imageDataUrlRaw);
      if (!surfaceId || !paintEntry) {
        continue;
      }
      list.push({
        surfaceId,
        imageDataUrl: paintEntry.imageDataUrl,
        updatedAt: paintEntry.updatedAt
      });
    }
    return list;
  }

  setSurfacePaint(room, rawSurfaceId, rawImageDataUrl, actorOwnerKey = "", actorIsHost = false) {
    if (!room) {
      return { ok: false, error: "room not found" };
    }

    const surfaceId = normalizeSurfaceId(rawSurfaceId);
    if (!surfaceId) {
      return { ok: false, error: "invalid surface id" };
    }

    const imageDataUrl = normalizeSurfaceImageDataUrl(rawImageDataUrl);
    if (!imageDataUrl) {
      return { ok: false, error: "invalid image data" };
    }

    const promoMap = this.getPromoObjectsMap(room);
    const promoOwnerKey = getPromoOwnerKeyFromSurfaceId(surfaceId, promoMap);
    if (promoOwnerKey) {
      const actorKey = normalizePromoOwnerKey(actorOwnerKey);
      if (!actorKey) {
        return { ok: false, error: "invalid owner key" };
      }
      const promoEntry = promoMap instanceof Map ? promoMap.get(promoOwnerKey) : null;
      const allowOthersDraw = normalizeBooleanFlag(promoEntry?.allowOthersDraw, false);
      if (actorKey !== promoOwnerKey && !allowOthersDraw) {
        return { ok: false, error: "owner denied edits" };
      }
    }
    if (isHostControlledSurfaceId(surfaceId) && !actorIsHost) {
      const policies = this.getSurfacePolicies(room);
      const allowOthersDraw = normalizeBooleanFlag(policies?.bridgePanelsNz?.allowOthersDraw, false);
      if (!allowOthersDraw) {
        return { ok: false, error: "host locked surface" };
      }
    }

    if (!room.surfacePaint || typeof room.surfacePaint.set !== "function") {
      room.surfacePaint = new Map();
    }

    const previous = normalizeSurfacePaintEntry(room.surfacePaint.get(surfaceId), 0);
    if (previous && previous.imageDataUrl === imageDataUrl) {
      return {
        ok: true,
        changed: false,
        surfaceId,
        imageDataUrl,
        updatedAt: previous.updatedAt
      };
    }

    const updatedAt = Date.now();
    room.surfacePaint.set(surfaceId, {
      imageDataUrl,
      updatedAt
    });
    this.scheduleSurfacePaintSave();
    return {
      ok: true,
      changed: true,
      surfaceId,
      imageDataUrl,
      updatedAt
    };
  }

  updateHost(room) {
    if (room.hostId && room.players.has(room.hostId)) {
      return;
    }
    room.hostId = null;
  }

  isHost(room, socketId) {
    if (!room || !socketId) {
      return false;
    }
    return room.hostId === socketId;
  }

  claimHost(room, socketId) {
    if (!room || !socketId) {
      return { ok: false, error: "room not found" };
    }

    this.pruneRoomPlayers(room);
    if (!room.players.has(socketId)) {
      return { ok: false, error: "player not in room" };
    }

    if (room.hostId === socketId) {
      return { ok: true, changed: false, hostId: room.hostId };
    }

    // Prevent host takeover when another player is actively in the room as host
    if (room.hostId && room.players.has(room.hostId)) {
      return { ok: false, error: "room already has a host" };
    }

    room.hostId = socketId;
    return { ok: true, changed: true, hostId: room.hostId };
  }

  setPortalTarget(room, rawTarget) {
    if (!room) {
      return { ok: false, error: "room not found" };
    }

    const normalized = normalizeRoomPortalTarget(rawTarget, "");
    if (!normalized) {
      return { ok: false, error: "invalid portal target" };
    }

    if (room.portalTarget === normalized) {
      return { ok: true, changed: false, targetUrl: room.portalTarget };
    }

    room.portalTarget = normalized;
    this.scheduleSurfacePaintSave();
    return { ok: true, changed: true, targetUrl: room.portalTarget };
  }

  setAZonePortalTarget(room, rawTarget) {
    if (!room) {
      return { ok: false, error: "room not found" };
    }

    const normalized = normalizeRoomPortalTarget(rawTarget, "");
    if (!normalized) {
      return { ok: false, error: "invalid portal target" };
    }

    if (room.aZonePortalTarget === normalized) {
      return { ok: true, changed: false, targetUrl: room.aZonePortalTarget };
    }

    room.aZonePortalTarget = normalized;
    this.scheduleSurfacePaintSave();
    return { ok: true, changed: true, targetUrl: room.aZonePortalTarget };
  }

  setSecurityTestEnabled(room, rawEnabled) {
    if (!room) {
      return { ok: false, error: "room not found" };
    }
    const enabled = Boolean(rawEnabled);
    const previous = this.serializeSecurityTest(room);
    if (previous.enabled === enabled) {
      return {
        ok: true,
        changed: false,
        state: previous
      };
    }

    if (!room.securityTest || typeof room.securityTest !== "object") {
      room.securityTest = createSecurityTestState();
    }
    room.securityTest.enabled = enabled;
    room.securityTest.updatedAt = Date.now();
    return {
      ok: true,
      changed: true,
      state: this.serializeSecurityTest(room)
    };
  }

  setPortalScheduleDelay(room, rawDelaySeconds) {
    if (!room) {
      return { ok: false, error: "room not found" };
    }

    const requestedDelaySeconds = Math.trunc(Number(rawDelaySeconds) || 0);
    if (requestedDelaySeconds <= 0) {
      return { ok: false, error: "invalid delay" };
    }
    const delaySeconds = Math.max(10, Math.min(6 * 60 * 60, requestedDelaySeconds));

    const now = Date.now();
    if (!room.portalSchedule) {
      room.portalSchedule = createPortalScheduleState();
    }

    const state = room.portalSchedule;
    const currentMode = String(state.mode ?? "idle");
    if (currentMode === "open_manual") {
      return { ok: false, error: "portal is manually open" };
    }
    state.mode = delaySeconds <= this.portalFinalCountdownSeconds ? "final_countdown" : "waiting";
    state.startAtMs = now + delaySeconds * 1000;
    state.openUntilMs = 0;
    state.remainingSec = delaySeconds;
    state.finalCountdownSeconds = this.portalFinalCountdownSeconds;
    state.updatedAt = now;

    return {
      ok: true,
      changed: true,
      schedule: this.serializePortalSchedule(room)
    };
  }

  forcePortalOpen(room) {
    if (!room) {
      return { ok: false, error: "room not found" };
    }

    const now = Date.now();
    if (!room.portalSchedule) {
      room.portalSchedule = createPortalScheduleState();
    }

    const state = room.portalSchedule;
    state.mode = "open_manual";
    state.startAtMs = now;
    state.openUntilMs = 0;
    state.remainingSec = 0;
    state.finalCountdownSeconds = this.portalFinalCountdownSeconds;
    state.updatedAt = now;

    return {
      ok: true,
      changed: true,
      schedule: this.serializePortalSchedule(room)
    };
  }

  closePortal(room) {
    if (!room) {
      return { ok: false, error: "room not found" };
    }

    if (!room.portalSchedule) {
      room.portalSchedule = createPortalScheduleState();
    }

    const state = room.portalSchedule;
    const prevMode = String(state.mode ?? "idle");
    const prevRemaining = Math.max(0, Math.trunc(Number(state.remainingSec) || 0));
    const changed = prevMode !== "idle" || prevRemaining !== 0;

    state.mode = "idle";
    state.startAtMs = 0;
    state.openUntilMs = 0;
    state.remainingSec = 0;
    state.finalCountdownSeconds = this.portalFinalCountdownSeconds;
    state.updatedAt = Date.now();

    return {
      ok: true,
      changed,
      schedule: this.serializePortalSchedule(room)
    };
  }

  tickPortalSchedule(room, now = Date.now()) {
    if (!room) {
      return false;
    }
    if (!room.portalSchedule) {
      room.portalSchedule = createPortalScheduleState();
    }

    const state = room.portalSchedule;
    const prevMode = String(state.mode ?? "idle");
    const prevRemaining = Math.max(0, Math.trunc(Number(state.remainingSec) || 0));
    let nextMode = prevMode;
    let nextRemaining = prevRemaining;

    if (prevMode === "waiting" || prevMode === "final_countdown") {
      const startAtMs = Math.max(0, Math.trunc(Number(state.startAtMs) || 0));
      const finalCountdown = Math.max(
        3,
        Math.min(30, Math.trunc(Number(state.finalCountdownSeconds) || this.portalFinalCountdownSeconds))
      );
      nextRemaining = Math.max(0, Math.ceil((startAtMs - now) / 1000));
      if (nextRemaining <= 0) {
        nextMode = "open";
        nextRemaining = this.portalOpenSeconds;
        state.startAtMs = now;
        state.openUntilMs = now + this.portalOpenSeconds * 1000;
      } else {
        nextMode = nextRemaining <= finalCountdown ? "final_countdown" : "waiting";
      }
    } else if (prevMode === "open") {
      const openUntilMs = Math.max(0, Math.trunc(Number(state.openUntilMs) || 0));
      nextRemaining = Math.max(0, Math.ceil((openUntilMs - now) / 1000));
      if (nextRemaining <= 0) {
        nextMode = "idle";
        nextRemaining = 0;
        state.startAtMs = 0;
        state.openUntilMs = 0;
      }
    } else if (prevMode === "open_manual") {
      nextMode = "open_manual";
      nextRemaining = 0;
    } else {
      nextMode = "idle";
      nextRemaining = 0;
    }

    const changed = nextMode !== prevMode || nextRemaining !== prevRemaining;
    if (!changed) {
      return false;
    }

    state.mode = nextMode;
    state.remainingSec = nextRemaining;
    state.finalCountdownSeconds = this.portalFinalCountdownSeconds;
    state.updatedAt = now;
    return true;
  }

  pruneRoomPlayers(room) {
    if (!room || !this.io?.sockets?.sockets) {
      return false;
    }

    let changed = false;
    for (const socketId of room.players.keys()) {
      if (!this.io.sockets.sockets.has(socketId)) {
        room.players.delete(socketId);
        changed = true;
      }
    }

    if (changed) {
      this.updateHost(room);
    }
    return changed;
  }

  switchPlayerZone(room, socketId, rawZone, rawPortalHint = "") {
    if (!room || !socketId) {
      return { ok: false, error: "room not found" };
    }

    this.pruneRoomPlayers(room);
    const player = room.players.get(socketId);
    if (!player) {
      return { ok: false, error: "player not in room" };
    }

    const zone = normalizeRoomZone(rawZone, "");
    const returnPortalHint = normalizeReturnPortalHint(rawPortalHint, "");
    if (!zone) {
      return { ok: false, error: "invalid zone" };
    }

    const previousZone = normalizeRoomZone(player?.zone ?? "lobby", "lobby");
    const shouldPreserveLobbyReturnState =
      zone === "lobby" &&
      previousZone === "lobby" &&
      (returnPortalHint === "ox" || returnPortalHint === "fps" || returnPortalHint === "hall") &&
      player?.state &&
      typeof player.state === "object";
    const nextState = shouldPreserveLobbyReturnState
      ? isReturnPortalStateUnsafe(room, returnPortalHint, player.state)
        ? buildSafeReturnPortalSpawnState(room, returnPortalHint)
        : sanitizePlayerState(player.state)
      : getRoomZoneSpawnState(room, zone);
    const now = Date.now();
    const previousSeq = Math.max(0, Math.trunc(Number(player?.lastInputSeq) || 0));

    player.zone = zone;
    player.state = nextState;
    player.velocityY = 0;
    player.onGround = true;
    player.input = {
      seq: previousSeq,
      moveX: 0,
      moveZ: 0,
      sprint: false,
      jump: false,
      yaw: Number(nextState?.yaw) || 0,
      pitch: Number(nextState?.pitch) || 0,
      updatedAt: now
    };
    player.lastProcessedInputSeq = previousSeq;

    return {
      ok: true,
      changed: previousZone !== zone,
      zone,
      state: {
        x: Number(nextState?.x) || 0,
        y: Number(nextState?.y) || 1.72,
        z: Number(nextState?.z) || 0,
        yaw: Number(nextState?.yaw) || 0,
        pitch: Number(nextState?.pitch) || 0
      }
    };
  }

  leaveCurrentRoom(socket) {
    const roomCode = socket.data.roomCode;
    if (!roomCode) {
      return;
    }

    const room = this.rooms.get(roomCode);
    socket.leave(roomCode);
    socket.data.roomCode = null;

    if (!room) {
      this.emitRoomList();
      return;
    }

    room.players.delete(socket.id);
    this.pruneRoomPlayers(room);
    this.updateHost(room);

    if (!room.persistent && room.players.size === 0) {
      this.rooms.delete(room.code);
    }

    this.emitRoomUpdate(room);
    this.emitRoomList();
  }

  joinDefaultRoom(socket, nameOverride = null) {
    const room = this.getDefaultRoom();
    this.pruneRoomPlayers(room);

    const name = sanitizeName(nameOverride ?? socket.data.playerName);
    socket.data.playerName = name;

    if (socket.data.roomCode === room.code && room.players.has(socket.id)) {
      const existing = room.players.get(socket.id);
      existing.name = name;
      existing.zone = normalizeRoomZone(existing?.zone ?? "lobby", "lobby");
      this.emitRoomUpdate(room);
      return { ok: true, room: this.serializeRoom(room) };
    }

    this.leaveCurrentRoom(socket);

    if (room.players.size >= this.maxRoomPlayers) {
      return {
        ok: false,
        error: `${this.defaultRoomCode} room is full (${this.maxRoomPlayers})`
      };
    }

    const spawnState = chooseDistributedSpawnState(room.players);
    const initialState = sanitizePlayerState(spawnState);
    room.players.set(socket.id, {
      id: socket.id,
      name,
      zone: "lobby",
      state: initialState,
      mode: "authoritative",
      velocityY: 0,
      onGround: true,
      input: {
        seq: 0,
        moveX: 0,
        moveZ: 0,
        sprint: false,
        jump: false,
        yaw: initialState.yaw,
        pitch: initialState.pitch,
        updatedAt: Date.now()
      },
      lastInputSeq: 0,
      lastProcessedInputSeq: 0
    });

    this.updateHost(room);
    socket.join(room.code);
    socket.data.roomCode = room.code;

    this.emitRoomUpdate(room);
    this.emitRoomList();

    return { ok: true, room: this.serializeRoom(room) };
  }
}
