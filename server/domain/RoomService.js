import { sanitizeName, sanitizePlayerState } from "./playerState.js";
import { chooseDistributedSpawnState } from "./spawn.js";
import { readFileSync } from "node:fs";
import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve as resolvePath } from "node:path";

const SURFACE_ID_PATTERN = /^[a-zA-Z0-9:_-]{1,96}$/;
const MAX_SURFACE_IMAGE_CHARS = 1_400_000;
const RIGHT_BILLBOARD_VIDEO_ID_PATTERN = /^YTDown([1-8])$/i;
const MAX_LEFT_BILLBOARD_IMAGE_CHARS = 4_200_000;
const SURFACE_PAINT_STORE_VERSION = 1;
const MAX_SHARED_AUDIO_DATA_URL_CHARS = 12_000_000;
const MAX_SHARED_AUDIO_NAME_CHARS = 120;

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

function normalizeRightBillboardVideoId(rawValue) {
  const text = String(rawValue ?? "").trim();
  const match = text.match(RIGHT_BILLBOARD_VIDEO_ID_PATTERN);
  if (!match) {
    return "";
  }
  return `YTDown${Math.trunc(Number(match[1]) || 0)}`;
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
    surfacePaint: new Map(),
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

    const surfaces = Array.isArray(parsed?.surfaces) ? parsed.surfaces : [];
    const restored = new Map();
    for (const entry of surfaces) {
      const surfaceId = normalizeSurfaceId(entry?.surfaceId);
      const imageDataUrl = normalizeSurfaceImageDataUrl(entry?.imageDataUrl);
      if (!surfaceId || !imageDataUrl) {
        continue;
      }
      restored.set(surfaceId, imageDataUrl);
    }

    const room = this.getDefaultRoom();
    room.surfacePaint = restored;
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
    const payload = {
      version: SURFACE_PAINT_STORE_VERSION,
      savedAt: Date.now(),
      defaultRoomCode: this.defaultRoomCode,
      surfaces: this.serializeSurfacePaint(this.getDefaultRoom())
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
      leftBillboard: this.serializeLeftBillboard(room),
      rightBillboard: this.serializeRightBillboard(room),
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
      const imageDataUrl = normalizeSurfaceImageDataUrl(imageDataUrlRaw);
      if (!surfaceId || !imageDataUrl) {
        continue;
      }
      list.push({ surfaceId, imageDataUrl });
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

    const previous = room.surfacePaint.get(surfaceId);
    if (previous === imageDataUrl) {
      return {
        ok: true,
        changed: false,
        surfaceId,
        imageDataUrl,
        updatedAt: Date.now()
      };
    }

    room.surfacePaint.set(surfaceId, imageDataUrl);
    this.scheduleSurfacePaintSave();
    return {
      ok: true,
      changed: true,
      surfaceId,
      imageDataUrl,
      updatedAt: Date.now()
    };
  }

  updateHost(room) {
    if (room.hostId && room.players.has(room.hostId)) {
      return;
    }
    room.hostId = room.players.keys().next().value ?? null;
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
    state.mode = "open";
    state.startAtMs = now;
    state.openUntilMs = now + this.portalOpenSeconds * 1000;
    state.remainingSec = this.portalOpenSeconds;
    state.finalCountdownSeconds = this.portalFinalCountdownSeconds;
    state.updatedAt = now;

    return {
      ok: true,
      changed: true,
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
