import { sanitizeName, sanitizePlayerState } from "./playerState.js";
import { chooseDistributedSpawnState } from "./spawn.js";
import { readFileSync } from "node:fs";
import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve as resolvePath } from "node:path";

const SURFACE_ID_PATTERN = /^[a-zA-Z0-9:_-]{1,96}$/;
const MAX_SURFACE_IMAGE_CHARS = 1_400_000;
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
const SURFACE_PAINT_STORE_VERSION = 1;
const MAX_SHARED_AUDIO_DATA_URL_CHARS = 12_000_000;
const MAX_SHARED_AUDIO_NAME_CHARS = 120;
const DEFAULT_PLATFORM_LIMIT = 400;
const DEFAULT_ROPE_LIMIT = 200;
const MIN_EDITOR_LIMIT = 1;
const MAX_EDITOR_LIMIT = 10_000;
const MIN_EDITOR_SCALE = 0.25;
const MAX_EDITOR_SCALE = 8;
const PROMO_OWNER_KEY_PATTERN = /^[a-zA-Z0-9:_-]{8,96}$/;
const MAX_PROMO_OBJECTS = 1200;
const MAX_PROMO_NAME_CHARS = 48;
const MAX_PROMO_URL_CHARS = 2048;
const MAX_PROMO_MEDIA_DATA_URL_CHARS = 9_000_000;

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

  return parsed.toString();
}

function normalizeSurfaceId(rawValue) {
  const value = String(rawValue ?? "").trim();
  if (!value || !SURFACE_ID_PATTERN.test(value)) {
    return "";
  }
  return value;
}

function normalizeSurfaceImageDataUrl(rawValue) {
  const value = String(rawValue ?? "").trim();
  if (!value || value.length > MAX_SURFACE_IMAGE_CHARS) {
    return "";
  }
  if (!value.startsWith("data:image/")) {
    return "";
  }
  return value;
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
    mode: "idle",
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
    updatedAt: Date.now()
  };
}

function createLeftBillboardState() {
  return {
    mode: "ad",
    imageDataUrl: "",
    updatedAt: Date.now()
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
  if (!/^data:(image|video)\/[a-z0-9.+-]+;base64,/i.test(value)) {
    return "";
  }
  return value;
}

function normalizePromoScale(rawValue, fallback = 1) {
  const parsed = Number(rawValue);
  const safe = Number.isFinite(parsed) ? parsed : Number(fallback) || 1;
  return Math.max(0.35, Math.min(8, safe));
}

function normalizePromoAxis(rawValue, fallback = 0, min = -2000, max = 2000) {
  const parsed = Number(rawValue);
  const safe = Number.isFinite(parsed) ? parsed : Number(fallback) || 0;
  return Math.max(min, Math.min(max, safe));
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

function createPersistentRoom(code, defaultPortalTargetUrl) {
  return {
    code,
    hostId: null,
    portalTarget: defaultPortalTargetUrl,
    portalSchedule: createPortalScheduleState(),
    leftBillboard: createLeftBillboardState(),
    rightBillboard: createRightBillboardState(),
    sharedMusic: createSharedMusicState(),
    securityTest: createSecurityTestState(),
    surfacePaint: new Map(),
    promoObjects: new Map(),
    objectEditor: createObjectEditorState(),
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
    portalOpenSeconds = 24,
    portalFinalCountdownSeconds = 10,
    surfacePaintStorePath = "",
    surfacePaintSaveDebounceMs = 300,
    log = console
  }) {
    this.io = io;
    this.log = log ?? console;
    this.defaultRoomCode = defaultRoomCode;
    this.maxRoomPlayers = maxRoomPlayers;
    this.defaultPortalTargetUrl = normalizeRoomPortalTarget(defaultPortalTargetUrl, "");
    this.portalOpenSeconds = Math.max(5, Math.trunc(Number(portalOpenSeconds) || 24));
    this.portalFinalCountdownSeconds = Math.max(
      3,
      Math.min(30, Math.trunc(Number(portalFinalCountdownSeconds) || 10))
    );
    this.rooms = new Map();
    this.surfacePaintStorePath = this.resolveSurfacePaintStorePath(surfacePaintStorePath);
    this.surfacePaintSaveDebounceMs = Math.max(
      50,
      Math.trunc(Number(surfacePaintSaveDebounceMs) || 300)
    );
    this.surfacePaintSaveTimer = null;
    this.surfacePaintSaveInFlight = false;
    this.surfacePaintSaveQueued = false;
    this.getDefaultRoom();
    this.loadSurfacePaintFromDisk();
  }

  getDefaultRoom() {
    let room = this.rooms.get(this.defaultRoomCode);
    if (!room) {
      room = createPersistentRoom(this.defaultRoomCode, this.defaultPortalTargetUrl);
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
    const surfaces = Array.isArray(parsed?.surfaces) ? parsed.surfaces : [];
    const platforms = Array.isArray(parsed?.platforms) ? parsed.platforms : [];
    const ropes = Array.isArray(parsed?.ropes) ? parsed.ropes : [];
    const promoObjects = Array.isArray(parsed?.promoObjects) ? parsed.promoObjects : [];
    const restored = new Map();
    for (const entry of surfaces) {
      const surfaceId = normalizeSurfaceId(entry?.surfaceId);
      const paintEntry = normalizeSurfacePaintEntry(entry, savedAt);
      if (!surfaceId || !paintEntry) {
        continue;
      }
      restored.set(surfaceId, paintEntry);
    }

    const room = this.getDefaultRoom();
    room.surfacePaint = restored;
    room.objectEditor = normalizeObjectEditorState(parsed?.objectEditor, room.objectEditor);
    this.setPlatforms(room, platforms, { persist: false });
    this.setRopes(room, ropes, { persist: false });
    this.setPromoObjects(room, promoObjects, { persist: false });
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

  async flushSurfacePaintToDisk() {
    if (!this.surfacePaintStorePath || this.surfacePaintSaveInFlight || !this.surfacePaintSaveQueued) {
      return;
    }

    this.surfacePaintSaveInFlight = true;
    this.surfacePaintSaveQueued = false;
    const room = this.getDefaultRoom();
    const payload = {
      version: SURFACE_PAINT_STORE_VERSION,
      savedAt: Date.now(),
      defaultRoomCode: this.defaultRoomCode,
      surfaces: this.serializeSurfacePaint(room),
      platforms: this.serializePlatforms(room),
      ropes: this.serializeRopes(room),
      promoObjects: this.serializePromoObjects(room),
      objectEditor: this.serializeObjectEditor(room)
    };
    const tmpPath = `${this.surfacePaintStorePath}.tmp`;

    try {
      await mkdir(dirname(this.surfacePaintStorePath), { recursive: true });
      await writeFile(tmpPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
      await rename(tmpPath, this.surfacePaintStorePath);
    } catch (error) {
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
    } finally {
      this.surfacePaintSaveInFlight = false;
      if (this.surfacePaintSaveQueued) {
        this.scheduleSurfacePaintSave();
      }
    }
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

  serializeRoom(room) {
    this.pruneRoomPlayers(room);
    this.tickPortalSchedule(room);
    return {
      code: room.code,
      hostId: room.hostId,
      portalTarget: String(room.portalTarget ?? "").trim(),
      portalSchedule: this.serializePortalSchedule(room),
      rightBillboard: this.serializeRightBillboard(room),
      securityTest: this.serializeSecurityTest(room),
      objectEditor: this.serializeObjectEditor(room),
      promoObjects: this.serializePromoObjects(room),
      players: Array.from(room.players.values()).map((player) => ({
        id: player.id,
        name: player.name,
        state: player.state ?? null
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

  emitPortalTargetUpdate(room) {
    this.io.to(room.code).emit("portal:target:update", {
      targetUrl: String(room?.portalTarget ?? "").trim()
    });
  }

  serializeObjectEditor(room) {
    if (!room) {
      return createObjectEditorState();
    }
    room.objectEditor = normalizeObjectEditorState(room.objectEditor, room.objectEditor);
    return room.objectEditor;
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
      mediaKind = /^data:image\//i.test(mediaDataUrl) ? "image" : "video";
    }

    return {
      ownerKey,
      ownerName: normalizePromoName(source.ownerName ?? fallback?.ownerName ?? "PLAYER"),
      x: normalizePromoAxis(source.x, fallback?.x ?? 0),
      y: normalizePromoAxis(source.y, fallback?.y ?? 0, -100, 400),
      z: normalizePromoAxis(source.z, fallback?.z ?? 0),
      scale: normalizePromoScale(source.scale, fallback?.scale ?? 1),
      linkUrl: normalizePromoUrl(source.linkUrl ?? fallback?.linkUrl ?? ""),
      mediaDataUrl,
      mediaKind,
      allowOthersDraw: Boolean(source.allowOthersDraw ?? fallback?.allowOthersDraw ?? false),
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
      if (!previous) {
        return { ok: false, error: "target not found" };
      }
      if (!previous.allowOthersDraw) {
        return { ok: false, error: "owner denied edits" };
      }
    }

    const fallback = previous
      ? { ...previous }
      : {
          ownerKey: targetOwnerKey,
          ownerName: actorName,
          x: 0,
          y: 0,
          z: 0,
          scale: 1,
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
    if (targetOwnerKey !== actorKey && !previous.allowOthersDraw) {
      return { ok: false, error: "owner denied edits" };
    }
    map.delete(targetOwnerKey);
    this.scheduleSurfacePaintSave();
    return { ok: true, changed: true };
  }

  serializePlatforms(room) {
    return Array.isArray(room?.platforms) ? room.platforms : [];
  }

  emitPlatformUpdate(room) {
    this.io.to(room.code).emit("platform:state", { platforms: this.serializePlatforms(room) });
  }

  setPlatforms(room, rawPlatforms, { persist = true } = {}) {
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
    if (persist) {
      this.scheduleSurfacePaintSave();
    }
    return { ok: true };
  }

  serializeRopes(room) {
    return Array.isArray(room?.ropes) ? room.ropes : [];
  }

  emitRopeUpdate(room) {
    this.io.to(room.code).emit("rope:state", { ropes: this.serializeRopes(room) });
  }

  setRopes(room, rawRopes, { persist = true } = {}) {
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

  serializeLeftBillboard(room) {
    const state = room?.leftBillboard ?? createLeftBillboardState();
    const imageDataUrl = normalizeLeftBillboardImageDataUrl(state.imageDataUrl);
    const modeRaw = String(state.mode ?? "ad").trim().toLowerCase();
    const mode = modeRaw === "image" && imageDataUrl ? "image" : "ad";

    return {
      mode,
      imageDataUrl: mode === "image" ? imageDataUrl : "",
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
    room.leftBillboard.updatedAt = Date.now();

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
    room.leftBillboard.updatedAt = Date.now();

    return {
      ok: true,
      changed: true,
      state: this.serializeLeftBillboard(room)
    };
  }

  serializeRightBillboard(room) {
    const state = room?.rightBillboard ?? createRightBillboardState();
    const videoId = normalizeRightBillboardVideoId(state.videoId);
    const modeRaw = String(state.mode ?? "ad").trim().toLowerCase();
    const mode = modeRaw === "video" && videoId ? "video" : "ad";

    return {
      mode,
      videoId: mode === "video" ? videoId : "",
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
    room.rightBillboard.updatedAt = Date.now();

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
    if (previous.mode === "ad" && !previous.videoId) {
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
    room.rightBillboard.updatedAt = Date.now();

    return {
      ok: true,
      changed: true,
      state: this.serializeRightBillboard(room)
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

  setSurfacePaint(room, rawSurfaceId, rawImageDataUrl) {
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
    return { ok: true, changed: true, targetUrl: room.portalTarget };
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
