import { sanitizeName } from "../domain/playerState.js";
import { ack } from "../utils/ack.js";

function randomDefaultName() {
  return `PLAYER_${Math.floor(Math.random() * 9000 + 1000)}`;
}

function sanitizeChatMessageId(rawValue) {
  const text = String(rawValue ?? "").trim();
  if (!text) {
    return "";
  }
  const normalized = text.replace(/[^a-zA-Z0-9:_-]/g, "").slice(0, 80);
  return normalized;
}

function sanitizeOwnerKey(rawValue) {
  const text = String(rawValue ?? "").trim();
  if (!text) {
    return "";
  }
  return text.replace(/[^a-zA-Z0-9:_-]/g, "").slice(0, 96);
}

function normalizeFeatureMode(rawValue, fallback = "public") {
  const text = String(rawValue ?? "")
    .trim()
    .toLowerCase();
  if (text === "off" || text === "host" || text === "public") {
    return text;
  }
  return fallback;
}

function getFeatureModeBlockReason(mode, featureLabel, isHost) {
  const normalizedMode = normalizeFeatureMode(mode);
  if (normalizedMode === "public") {
    return "";
  }
  if (normalizedMode === "host") {
    return isHost ? "" : `${featureLabel} host only`;
  }
  return `${featureLabel} disabled`;
}

function getPersistentStateBlockReason(config, featureLabel = "editing") {
  if (config?.persistentStateAvailable !== false) {
    return "";
  }
  const reason = String(config?.persistentStateReason ?? "").trim();
  if (!reason) {
    return `${featureLabel} disabled`;
  }
  return `${featureLabel} disabled: ${reason}`;
}

function sanitizeChatHistoryRequestPayload(payload = {}) {
  const modeRaw = String(payload?.mode ?? "").trim().toLowerCase();
  const mode = modeRaw === "before-today" ? "before-today" : "all";
  const beforeCreatedAtMsRaw = Math.trunc(Number(payload?.beforeCreatedAtMs) || 0);
  const nowMs = Date.now();
  const maxFutureAllowanceMs = 24 * 60 * 60 * 1000;
  const beforeCreatedAtMs = Math.min(
    nowMs + maxFutureAllowanceMs,
    Math.max(0, beforeCreatedAtMsRaw)
  );
  return {
    mode,
    beforeCreatedAtMs,
    replace: Boolean(payload?.replace)
  };
}

function findDuplicateSessionSocketId(io, room, ownerKey, exceptSocketId = "") {
  const normalizedKey = sanitizeOwnerKey(ownerKey);
  if (!normalizedKey || !room?.players || typeof room.players.keys !== "function") {
    return "";
  }
  const skipId = String(exceptSocketId ?? "").trim();
  for (const socketId of room.players.keys()) {
    const candidateId = String(socketId ?? "").trim();
    if (!candidateId || candidateId === skipId) {
      continue;
    }
    const candidateSocket = io?.sockets?.sockets?.get(candidateId);
    if (!candidateSocket) {
      continue;
    }
    const candidateKey = sanitizeOwnerKey(candidateSocket?.data?.playerKey ?? "");
    if (candidateKey && candidateKey === normalizedKey) {
      return candidateId;
    }
  }
  return "";
}

const PAINT_SOCKET_WINDOW_MS = 15_000;
const PAINT_SOCKET_MAX_WRITES = 64;
const PAINT_SOCKET_MAX_SURFACES = 18;
const PAINT_SOCKET_MIN_INTERVAL_MS = 120;
const PAINT_ROOM_WINDOW_MS = 3_000;
const PAINT_ROOM_MAX_WRITES = 120;
const SESSION_REQUIRED_MIN_KEY_LENGTH = 8;
const DEFAULT_ANTI_ABUSE = Object.freeze({
  maxConnectionsPerIp: 3,
  connectionWindowMs: 60_000,
  maxConnectionsPerWindowPerIp: 12,
  connectionViolationWindowMs: 180_000,
  connectionViolationsBeforeBan: 3,
  connectionBanMs: 15 * 60 * 1000,
  promoWindowMs: 15_000,
  promoMaxOpsPerSocketWindow: 14,
  promoMaxOpsPerIpWindow: 40
});
const CHAT_SOCKET_WINDOW_MS = 10_000;
const CHAT_SOCKET_MAX_MESSAGES_PER_WINDOW = 8;
const CHAT_SOCKET_MIN_INTERVAL_MS = 700;
const CHAT_SOCKET_MAX_SAME_TEXT_STREAK = 2;
const CHAT_BLOCK_NOTICE_COOLDOWN_MS = 1_800;

function normalizeClientIp(rawValue) {
  const text = String(rawValue ?? "").trim();
  if (!text) {
    return "unknown";
  }
  const first = text.split(",")[0]?.trim() ?? "";
  if (!first) {
    return "unknown";
  }
  if (first.startsWith("::ffff:")) {
    return first.slice(7);
  }
  return first;
}

function getSocketClientIp(socket) {
  const forwardedFor = socket?.handshake?.headers?.["x-forwarded-for"];
  if (Array.isArray(forwardedFor) && forwardedFor.length > 0) {
    return normalizeClientIp(forwardedFor[0]);
  }
  if (typeof forwardedFor === "string" && forwardedFor.trim()) {
    return normalizeClientIp(forwardedFor);
  }
  return normalizeClientIp(socket?.handshake?.address ?? "");
}

function getSocketAuthOwnerKey(socket) {
  const auth = socket?.handshake?.auth ?? {};
  return sanitizeOwnerKey(auth?.playerKey ?? auth?.ownerKey ?? auth?.sessionKey ?? "");
}

function pruneRecent(now, recent = [], windowMs = 60_000) {
  const lowerBound = now - Math.max(1_000, Math.trunc(Number(windowMs) || 60_000));
  let start = 0;
  for (; start < recent.length; start += 1) {
    if (Number(recent[start]) >= lowerBound) {
      break;
    }
  }
  if (start > 0) {
    recent.splice(0, start);
  }
}

function registerConnectionViolation(state, now, antiAbuse = DEFAULT_ANTI_ABUSE) {
  if (!Array.isArray(state.violations)) {
    state.violations = [];
  }
  const violationWindowMs = Math.max(
    5_000,
    Math.trunc(
      Number(antiAbuse?.connectionViolationWindowMs) ||
        DEFAULT_ANTI_ABUSE.connectionViolationWindowMs
    )
  );
  const connectionViolationsBeforeBan = Math.max(
    1,
    Math.trunc(
      Number(antiAbuse?.connectionViolationsBeforeBan) ||
        DEFAULT_ANTI_ABUSE.connectionViolationsBeforeBan
    )
  );
  const connectionBanMs = Math.max(
    5_000,
    Math.trunc(Number(antiAbuse?.connectionBanMs) || DEFAULT_ANTI_ABUSE.connectionBanMs)
  );
  pruneRecent(now, state.violations, violationWindowMs);
  state.violations.push(now);
  if (state.violations.length >= connectionViolationsBeforeBan) {
    state.blockedUntil = Math.max(
      Math.trunc(Number(state.blockedUntil) || 0),
      now + connectionBanMs
    );
  }
  return Math.trunc(Number(state.blockedUntil) || 0);
}

function reserveConnectionSlotByIp({
  map,
  clientIp,
  socketId,
  now = Date.now(),
  antiAbuse = DEFAULT_ANTI_ABUSE
}) {
  const ipKey = normalizeClientIp(clientIp);
  const state = map.get(ipKey) ?? {
    active: new Set(),
    recent: [],
    violations: [],
    blockedUntil: 0
  };
  const maxConnectionsPerIp = Math.max(
    1,
    Math.trunc(Number(antiAbuse?.maxConnectionsPerIp) || DEFAULT_ANTI_ABUSE.maxConnectionsPerIp)
  );
  const connectionWindowMs = Math.max(
    1_000,
    Math.trunc(Number(antiAbuse?.connectionWindowMs) || DEFAULT_ANTI_ABUSE.connectionWindowMs)
  );
  const maxConnectionsPerWindowPerIp = Math.max(
    2,
    Math.trunc(
      Number(antiAbuse?.maxConnectionsPerWindowPerIp) ||
        DEFAULT_ANTI_ABUSE.maxConnectionsPerWindowPerIp
    )
  );
  const violationWindowMs = Math.max(
    5_000,
    Math.trunc(
      Number(antiAbuse?.connectionViolationWindowMs) ||
        DEFAULT_ANTI_ABUSE.connectionViolationWindowMs
    )
  );

  pruneRecent(now, state.recent, connectionWindowMs);
  if (!Array.isArray(state.violations)) {
    state.violations = [];
  }
  pruneRecent(now, state.violations, violationWindowMs);
  const blockedUntil = Math.trunc(Number(state.blockedUntil) || 0);
  if (blockedUntil > now) {
    map.set(ipKey, state);
    return { ok: false, error: "ip temporarily banned", ip: ipKey, blockedUntil };
  }
  state.recent.push(now);
  if (state.recent.length > maxConnectionsPerWindowPerIp) {
    const nextBlockedUntil = registerConnectionViolation(state, now, antiAbuse);
    map.set(ipKey, state);
    return {
      ok: false,
      error: nextBlockedUntil > now ? "ip temporarily banned" : "ip connect rate limited",
      ip: ipKey,
      blockedUntil: nextBlockedUntil
    };
  }
  if (state.active.size >= maxConnectionsPerIp) {
    const nextBlockedUntil = registerConnectionViolation(state, now, antiAbuse);
    map.set(ipKey, state);
    return {
      ok: false,
      error: nextBlockedUntil > now ? "ip temporarily banned" : "ip concurrent limit reached",
      ip: ipKey,
      blockedUntil: nextBlockedUntil
    };
  }

  state.active.add(String(socketId ?? "").trim());
  map.set(ipKey, state);
  return { ok: true, ip: ipKey };
}

function releaseConnectionSlotByIp(map, clientIp, socketId, antiAbuse = DEFAULT_ANTI_ABUSE) {
  const ipKey = normalizeClientIp(clientIp);
  const state = map.get(ipKey);
  if (!state) {
    return;
  }
  state.active?.delete?.(String(socketId ?? "").trim());
  const now = Date.now();
  pruneRecent(
    now,
    state.recent,
    Math.max(
      1_000,
      Math.trunc(Number(antiAbuse?.connectionWindowMs) || DEFAULT_ANTI_ABUSE.connectionWindowMs)
    )
  );
  pruneRecent(
    now,
    state.violations,
    Math.max(
      5_000,
      Math.trunc(
        Number(antiAbuse?.connectionViolationWindowMs) ||
          DEFAULT_ANTI_ABUSE.connectionViolationWindowMs
      )
    )
  );
  const blockedUntil = Math.trunc(Number(state.blockedUntil) || 0);
  if (
    (state.active?.size ?? 0) <= 0 &&
    (!Array.isArray(state.recent) || state.recent.length <= 0) &&
    (!Array.isArray(state.violations) || state.violations.length <= 0) &&
    blockedUntil <= now
  ) {
    map.delete(ipKey);
    return;
  }
  map.set(ipKey, state);
}

function consumePromoOperationBudget({
  socketState,
  ipStateMap,
  clientIp = "",
  isHost = false,
  antiAbuse = DEFAULT_ANTI_ABUSE,
  now = Date.now()
}) {
  if (isHost) {
    return { ok: true };
  }
  const promoWindowMs = Math.max(
    1_000,
    Math.trunc(Number(antiAbuse?.promoWindowMs) || DEFAULT_ANTI_ABUSE.promoWindowMs)
  );
  const promoMaxOpsPerSocketWindow = Math.max(
    1,
    Math.trunc(
      Number(antiAbuse?.promoMaxOpsPerSocketWindow) ||
        DEFAULT_ANTI_ABUSE.promoMaxOpsPerSocketWindow
    )
  );
  const promoMaxOpsPerIpWindow = Math.max(
    1,
    Math.trunc(Number(antiAbuse?.promoMaxOpsPerIpWindow) || DEFAULT_ANTI_ABUSE.promoMaxOpsPerIpWindow)
  );

  const local = socketState ?? {};
  const localWindowStart = Number(local.windowStart) || 0;
  if (localWindowStart <= 0 || now - localWindowStart > promoWindowMs) {
    local.windowStart = now;
    local.count = 0;
  }
  local.count = Math.max(0, Math.trunc(Number(local.count) || 0)) + 1;
  if (local.count > promoMaxOpsPerSocketWindow) {
    return { ok: false, error: "promo rate limited" };
  }

  const ipKey = normalizeClientIp(clientIp);
  const ipState = ipStateMap.get(ipKey) ?? { windowStart: now, count: 0 };
  const ipWindowStart = Number(ipState.windowStart) || 0;
  if (ipWindowStart <= 0 || now - ipWindowStart > promoWindowMs) {
    ipState.windowStart = now;
    ipState.count = 0;
  }
  ipState.count = Math.max(0, Math.trunc(Number(ipState.count) || 0)) + 1;
  ipStateMap.set(ipKey, ipState);
  if (ipState.count > promoMaxOpsPerIpWindow) {
    return { ok: false, error: "promo ip flood detected" };
  }

  return { ok: true };
}

function normalizeChatRateText(rawValue) {
  return String(rawValue ?? "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 120);
}

function consumeChatSendBudget({ socketState, text = "", now = Date.now() }) {
  const state = socketState ?? {};
  const lastAt = Math.max(0, Math.trunc(Number(state.lastAt) || 0));
  if (lastAt > 0 && now - lastAt < CHAT_SOCKET_MIN_INTERVAL_MS) {
    return { ok: false, error: "chat too fast" };
  }

  const windowStart = Math.max(0, Math.trunc(Number(state.windowStart) || 0));
  if (windowStart <= 0 || now - windowStart > CHAT_SOCKET_WINDOW_MS) {
    state.windowStart = now;
    state.count = 0;
  }
  state.lastAt = now;
  state.count = Math.max(0, Math.trunc(Number(state.count) || 0)) + 1;
  if (state.count > CHAT_SOCKET_MAX_MESSAGES_PER_WINDOW) {
    return { ok: false, error: "chat rate limited" };
  }

  const normalizedText = normalizeChatRateText(text);
  if (normalizedText && normalizedText === String(state.lastText ?? "")) {
    state.sameTextStreak = Math.max(0, Math.trunc(Number(state.sameTextStreak) || 0)) + 1;
  } else {
    state.lastText = normalizedText;
    state.sameTextStreak = 1;
  }
  if (state.sameTextStreak > CHAT_SOCKET_MAX_SAME_TEXT_STREAK) {
    return { ok: false, error: "chat duplicate blocked" };
  }

  return { ok: true };
}

function consumeSurfacePaintBudget({
  socketState,
  roomStateMap,
  roomCode = "",
  surfaceId = "",
  isHost = false,
  now = Date.now()
}) {
  if (isHost) {
    return { ok: true };
  }

  const normalizedRoomCode = String(roomCode ?? "").trim().toUpperCase();
  const normalizedSurfaceId = String(surfaceId ?? "").trim().toLowerCase();
  if (!normalizedRoomCode) {
    return { ok: true };
  }

  const localState = socketState ?? {};
  if (Number(localState.lastAt) > 0 && now - Number(localState.lastAt) < PAINT_SOCKET_MIN_INTERVAL_MS) {
    return { ok: false, error: "paint rate limited" };
  }
  const localWindowStart = Number(localState.windowStart) || 0;
  if (localWindowStart <= 0 || now - localWindowStart > PAINT_SOCKET_WINDOW_MS) {
    localState.windowStart = now;
    localState.count = 0;
    localState.surfaces = new Set();
  }
  localState.lastAt = now;
  localState.count = Math.max(0, Math.trunc(Number(localState.count) || 0)) + 1;
  if (localState.count > PAINT_SOCKET_MAX_WRITES) {
    return { ok: false, error: "paint rate limited" };
  }
  if (normalizedSurfaceId) {
    if (!(localState.surfaces instanceof Set)) {
      localState.surfaces = new Set();
    }
    localState.surfaces.add(normalizedSurfaceId);
    if (localState.surfaces.size > PAINT_SOCKET_MAX_SURFACES) {
      return { ok: false, error: "paint too many surfaces" };
    }
  }

  let roomState = roomStateMap.get(normalizedRoomCode);
  if (!roomState) {
    roomState = { windowStart: now, count: 0 };
    roomStateMap.set(normalizedRoomCode, roomState);
  }
  const roomWindowStart = Number(roomState.windowStart) || 0;
  if (roomWindowStart <= 0 || now - roomWindowStart > PAINT_ROOM_WINDOW_MS) {
    roomState.windowStart = now;
    roomState.count = 0;
  }
  roomState.count = Math.max(0, Math.trunc(Number(roomState.count) || 0)) + 1;
  if (roomState.count > PAINT_ROOM_MAX_WRITES) {
    return { ok: false, error: "paint room flood detected" };
  }

  return { ok: true };
}

export function registerSocketHandlers({
  io,
  roomService,
  playerCounter,
  worldRuntime,
  config = {},
  log = console
}) {
  const roomPaintRateState = new Map();
  const connectionStateByIp = new Map();
  const promoOpRateStateByIp = new Map();
  const antiAbuse = {
    maxConnectionsPerIp: Math.max(
      1,
      Math.trunc(
        Number(config?.antiAbuse?.maxConnectionsPerIp) || DEFAULT_ANTI_ABUSE.maxConnectionsPerIp
      )
    ),
    connectionWindowMs: Math.max(
      1_000,
      Math.trunc(
        Number(config?.antiAbuse?.connectionWindowMs) || DEFAULT_ANTI_ABUSE.connectionWindowMs
      )
    ),
    maxConnectionsPerWindowPerIp: Math.max(
      2,
      Math.trunc(
        Number(config?.antiAbuse?.maxConnectionsPerWindowPerIp) ||
          DEFAULT_ANTI_ABUSE.maxConnectionsPerWindowPerIp
      )
    ),
    connectionViolationWindowMs: Math.max(
      5_000,
      Math.trunc(
        Number(config?.antiAbuse?.connectionViolationWindowMs) ||
          DEFAULT_ANTI_ABUSE.connectionViolationWindowMs
      )
    ),
    connectionViolationsBeforeBan: Math.max(
      1,
      Math.trunc(
        Number(config?.antiAbuse?.connectionViolationsBeforeBan) ||
          DEFAULT_ANTI_ABUSE.connectionViolationsBeforeBan
      )
    ),
    connectionBanMs: Math.max(
      5_000,
      Math.trunc(Number(config?.antiAbuse?.connectionBanMs) || DEFAULT_ANTI_ABUSE.connectionBanMs)
    ),
    promoWindowMs: Math.max(
      1_000,
      Math.trunc(Number(config?.antiAbuse?.promoWindowMs) || DEFAULT_ANTI_ABUSE.promoWindowMs)
    ),
    promoMaxOpsPerSocketWindow: Math.max(
      1,
      Math.trunc(
        Number(config?.antiAbuse?.promoMaxOpsPerSocketWindow) ||
          DEFAULT_ANTI_ABUSE.promoMaxOpsPerSocketWindow
      )
    ),
    promoMaxOpsPerIpWindow: Math.max(
      1,
      Math.trunc(
        Number(config?.antiAbuse?.promoMaxOpsPerIpWindow) || DEFAULT_ANTI_ABUSE.promoMaxOpsPerIpWindow
      )
    )
  };

  io.on("connection", (socket) => {
    const connectedAt = Date.now();
    const clientIp = getSocketClientIp(socket);
    const connectionSlotResult = reserveConnectionSlotByIp({
      map: connectionStateByIp,
      clientIp,
      socketId: socket.id,
      now: connectedAt,
      antiAbuse
    });
    if (!connectionSlotResult.ok) {
      const reason = String(connectionSlotResult.error ?? "connection blocked").trim();
      log?.warn?.(
        `[guard] connection denied ip=${clientIp} socket=${socket.id} reason=${reason}`
      );
      socket.emit("session:blocked", { reason });
      try {
        socket.disconnect(true);
      } catch {
        // ignore disconnect errors
      }
      return;
    }

    const socketPaintRateState = {
      windowStart: 0,
      count: 0,
      lastAt: 0,
      surfaces: new Set()
    };
    const socketPromoRateState = {
      windowStart: 0,
      count: 0
    };
    const socketChatRateState = {
      windowStart: 0,
      count: 0,
      lastAt: 0,
      lastText: "",
      sameTextStreak: 0,
      lastBlockedNoticeAt: 0
    };

    const emitSurfacePaintState = () => {
      const room = roomService.getRoomBySocket(socket);
      if (!room) {
        return;
      }
      socket.emit("paint:state", {
        surfaces: roomService.serializeSurfacePaint(room)
      });
    };

    const emitSharedMusicState = () => {
      const room = roomService.getRoomBySocket(socket);
      if (!room) {
        return;
      }
      socket.emit("music:state", {
        state: roomService.serializeSharedMusic(room)
      });
    };

    const emitLeftBillboardState = () => {
      const room = roomService.getRoomBySocket(socket);
      if (!room) {
        return;
      }
      socket.emit("billboard:left:update", roomService.serializeLeftBillboard(room));
    };

    const emitMainPortalAdState = () => {
      const room = roomService.getRoomBySocket(socket);
      if (!room) {
        return;
      }
      socket.emit("portal:ad:update", roomService.serializeMainPortalAd(room));
    };

    const emitPlatformState = () => {
      const room = roomService.getRoomBySocket(socket);
      if (!room) return;
      socket.emit("platform:state", {
        platforms: roomService.serializePlatforms(room),
        revision: roomService.getPlatformRevision(room)
      });
    };

    const emitRopeState = () => {
      const room = roomService.getRoomBySocket(socket);
      if (!room) return;
      socket.emit("rope:state", {
        ropes: roomService.serializeRopes(room),
        revision: roomService.getRopeRevision(room)
      });
    };

    const emitObjectState = () => {
      const room = roomService.getRoomBySocket(socket);
      if (!room) return;
      socket.emit("object:state", {
        positions: roomService.serializeObjectPositions(room),
        revision: roomService.getObjectRevision(room)
      });
    };

    const emitPromoState = () => {
      const room = roomService.getRoomBySocket(socket);
      if (!room) return;
      socket.emit("promo:state", { objects: roomService.serializePromoObjects(room) });
    };

    const emitRuntimePolicyState = () => {
      const persistenceStatus = roomService?.getPersistenceStatus?.() ?? null;
      socket.emit("runtime:policy", {
        promoMode: String(config?.promoMode ?? "").trim().toLowerCase(),
        surfacePaintMode: String(config?.surfacePaintMode ?? "").trim().toLowerCase(),
        persistentStateAvailable: config?.persistentStateAvailable !== false,
        persistentStateReason: String(config?.persistentStateReason ?? "").trim(),
        coreMemory: persistenceStatus?.grayBlockCoreMemory ?? persistenceStatus?.coreMemory ?? null,
        surfacePaintCoreMemory: persistenceStatus?.surfacePaintCoreMemory ?? null
      });
    };

    const flushPersistentStateIfRequested = async (
      payload = {},
      ackFn,
      featureLabel = "editing"
    ) => {
      if (!Boolean(payload?.forceFlush) || typeof roomService.flushSurfacePaintToDiskNow !== "function") {
        return true;
      }
      try {
        await roomService.flushSurfacePaintToDiskNow();
        return true;
      } catch (error) {
        const reason = String(error?.message ?? error ?? "persist failed").trim() || "persist failed";
        ack(ackFn, { ok: false, error: `${featureLabel} persist failed: ${reason}` });
        return false;
      }
    };

    const emitChatHistoryState = (requestPayload = {}) => {
      const room = roomService.getRoomBySocket(socket);
      if (!room) {
        return;
      }
      const request = sanitizeChatHistoryRequestPayload(requestPayload);
      let messages = roomService.serializeChatHistory(room);
      if (request.mode === "before-today" && request.beforeCreatedAtMs > 0) {
        messages = messages.filter((entry) => {
          const createdAt = Math.trunc(Number(entry?.createdAt) || 0);
          if (createdAt <= 0) {
            return true;
          }
          return createdAt < request.beforeCreatedAtMs;
        });
      }
      socket.emit("chat:history", {
        messages,
        mode: request.mode,
        beforeCreatedAtMs: request.beforeCreatedAtMs,
        replace: request.replace
      });
    };

    const emitPortalOpenCatchup = () => {
      const room = roomService.getRoomBySocket(socket);
      if (!room) {
        return;
      }
      const schedule = roomService.serializePortalSchedule(room);
      const mode = String(schedule?.mode ?? "idle");
      if (mode !== "open" && mode !== "open_manual") {
        return;
      }
      socket.emit("portal:force-open", {
        roomCode: room.code,
        hostId: room.hostId ?? null,
        openedAt: Date.now(),
        schedule
      });
    };

    const joinDefaultAndAck = (nameOverride, ackFn) => {
      const result = roomService.joinDefaultRoom(socket, nameOverride);
      if (result?.ok) {
        emitRuntimePolicyState();
        emitSurfacePaintState();
        emitSharedMusicState();
        emitLeftBillboardState();
        emitMainPortalAdState();
        emitPortalOpenCatchup();
        emitPromoState();
        emitObjectState();
        emitChatHistoryState();
      }
      ack(ackFn, result);
      return result;
    };

    socket.data.playerName = randomDefaultName();
    socket.data.roomCode = null;
    socket.data.playerKey = getSocketAuthOwnerKey(socket);
    socket.data.clientIp = clientIp;

    const initialPlayerKey = sanitizeOwnerKey(socket.data.playerKey ?? "");
    if (!initialPlayerKey || initialPlayerKey.length < SESSION_REQUIRED_MIN_KEY_LENGTH) {
      log?.warn?.(`[guard] session key required ip=${clientIp} socket=${socket.id}`);
      socket.emit("session:blocked", { reason: "session key required" });
      releaseConnectionSlotByIp(connectionStateByIp, clientIp, socket.id, antiAbuse);
      setTimeout(() => {
        try {
          socket.disconnect(true);
        } catch {
          // ignore disconnect errors
        }
      }, 60);
      return;
    }

    const duplicateSocketId = findDuplicateSessionSocketId(
      io,
      roomService.getDefaultRoom(),
      initialPlayerKey,
      socket.id
    );
    if (duplicateSocketId) {
      log?.warn?.(
        `[guard] duplicate session denied ip=${clientIp} socket=${socket.id} duplicate=${duplicateSocketId}`
      );
      socket.emit("session:duplicate", {
        reason: "duplicate session",
        duplicateSocketId
      });
      releaseConnectionSlotByIp(connectionStateByIp, clientIp, socket.id, antiAbuse);
      setTimeout(() => {
        try {
          socket.disconnect(true);
        } catch {
          // ignore disconnect errors
        }
      }, 60);
      return;
    }

    const online = playerCounter.increment();
    worldRuntime?.onPlayerConnected(socket);

    log.log(`[+] player connected (${online}) ${socket.id}`);

    roomService.joinDefaultRoom(socket);
    emitRuntimePolicyState();
    emitSurfacePaintState();
    emitSharedMusicState();
    emitLeftBillboardState();
    emitMainPortalAdState();
    emitPortalOpenCatchup();
    emitPlatformState();
    emitRopeState();
    emitPromoState();
    emitObjectState();
    emitChatHistoryState();
    roomService.emitRoomList(socket);

    socket.on("player:key:set", (payload = {}, ackFn) => {
      const nextKey = sanitizeOwnerKey(payload?.key ?? payload?.ownerKey ?? "");
      if (!nextKey || nextKey.length < 8) {
        ack(ackFn, { ok: false, error: "invalid owner key" });
        return;
      }
      const room = roomService.getRoomBySocket(socket);
      const duplicateSocketId = findDuplicateSessionSocketId(io, room, nextKey, socket.id);
      if (duplicateSocketId) {
        ack(ackFn, { ok: false, error: "duplicate session" });
        socket.emit("session:duplicate", {
          reason: "duplicate session",
          duplicateSocketId
        });
        setTimeout(() => {
          try {
            socket.disconnect(true);
          } catch {
            // ignore disconnect errors
          }
        }, 60);
        return;
      }
      socket.data.playerKey = nextKey;
      ack(ackFn, { ok: true, key: nextKey });
    });

    socket.on("chat:send", (payload = {}) => {
      const { name, text } = payload;
      const safeName = sanitizeName(name ?? socket.data.playerName);
      const safeText = String(text ?? "").trim().slice(0, 200);
      if (!safeText) {
        return;
      }
      const chatBudget = consumeChatSendBudget({
        socketState: socketChatRateState,
        text: safeText
      });
      if (!chatBudget.ok) {
        const nowMs = Date.now();
        const lastNoticeAt = Math.max(
          0,
          Math.trunc(Number(socketChatRateState.lastBlockedNoticeAt) || 0)
        );
        if (nowMs - lastNoticeAt >= CHAT_BLOCK_NOTICE_COOLDOWN_MS) {
          socket.emit("chat:blocked", { reason: chatBudget.error });
          socketChatRateState.lastBlockedNoticeAt = nowMs;
        }
        return;
      }
      const safeMessageId = sanitizeChatMessageId(
        payload?.clientMessageId ?? payload?.messageId ?? ""
      );
      const messageId =
        safeMessageId ||
        `srv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;

      const room = roomService.getRoomBySocket(socket);
      if (!room) {
        return;
      }

      const player = room.players.get(socket.id);
      if (!player) {
        return;
      }

      const createdAt = Date.now();

      socket.data.playerName = safeName;
      player.name = safeName;
      const stateRaw = player?.state && typeof player.state === "object" ? player.state : null;
      const sx = Number(stateRaw?.x);
      const sy = Number(stateRaw?.y);
      const sz = Number(stateRaw?.z);
      const syaw = Number(stateRaw?.yaw);
      const spitch = Number(stateRaw?.pitch);
      const state =
        Number.isFinite(sx) &&
        Number.isFinite(sy) &&
        Number.isFinite(sz) &&
        Number.isFinite(syaw) &&
        Number.isFinite(spitch)
          ? { x: sx, y: sy, z: sz, yaw: syaw, pitch: spitch }
          : null;

      const messagePayload = {
        messageId,
        id: socket.id,
        name: safeName,
        text: safeText,
        state,
        createdAt
      };
      roomService.appendChatHistory(room, messagePayload);
      io.to(room.code).emit("chat:message", messagePayload);
      roomService.emitRoomUpdate(room);
    });

    socket.on("chat:history:request", (payload = {}) => {
      emitChatHistoryState(payload);
    });

    socket.on("input:cmd", (payload = {}) => {
      worldRuntime?.handleInputCommand(socket, payload);
    });

    socket.on("player:state:sync", (payload = {}, ackFn) => {
      const result = worldRuntime?.handleClientStateSync(socket, payload);
      if (!result) {
        ack(ackFn, { ok: false, error: "runtime unavailable" });
        return;
      }
      ack(ackFn, result);
    });

    socket.on("net:ping", (payload = {}) => {
      socket.emit("net:pong", {
        id: Math.trunc(Number(payload?.id) || 0),
        t: Date.now()
      });
    });

    socket.on("net:rtt", (payload = {}) => {
      worldRuntime?.handleClientRtt(socket, payload);
    });

    socket.on("room:list", () => {
      roomService.emitRoomList(socket);
    });

    socket.on("room:quick-join", (payload = {}, ackFn) => {
      joinDefaultAndAck(payload.name, ackFn);
    });

    socket.on("room:create", (payload = {}, ackFn) => {
      joinDefaultAndAck(payload.name, ackFn);
    });

    socket.on("room:join", (payload = {}, ackFn) => {
      joinDefaultAndAck(payload.name, ackFn);
    });

    socket.on("room:leave", (ackFn) => {
      joinDefaultAndAck(null, ackFn);
    });

    socket.on("room:zone:switch", (payload = {}, ackFn) => {
      const room = roomService.getRoomBySocket(socket);
      if (!room) {
        ack(ackFn, { ok: false, error: "room not found" });
        return;
      }

      const result = roomService.switchPlayerZone(
        room,
        socket.id,
        payload?.zone ?? payload?.target ?? payload?.id ?? "",
        payload?.portalHint ?? payload?.returnPortal ?? payload?.from ?? ""
      );
      if (!result.ok) {
        ack(ackFn, result);
        return;
      }

      roomService.emitRoomUpdate(room);
      ack(ackFn, {
        ok: true,
        changed: Boolean(result.changed),
        zone: result.zone,
        state: result.state
      });
    });

    socket.on("paint:surface:set", async (payload = {}, ackFn) => {
      const room = roomService.getRoomBySocket(socket);
      if (!room) {
        ack(ackFn, { ok: false, error: "room not found" });
        return;
      }
      if (!room.players?.has?.(socket.id)) {
        ack(ackFn, { ok: false, error: "player not in room" });
        return;
      }
      const isHost = roomService.isHost(room, socket.id);
      const persistenceError = getPersistentStateBlockReason(config, "surface paint");
      if (persistenceError) {
        ack(ackFn, { ok: false, error: persistenceError });
        return;
      }
      const paintModeError = getFeatureModeBlockReason(
        config?.surfacePaintMode,
        "surface paint",
        isHost
      );
      if (paintModeError) {
        ack(ackFn, { ok: false, error: paintModeError });
        return;
      }
      const paintGuard = consumeSurfacePaintBudget({
        socketState: socketPaintRateState,
        roomStateMap: roomPaintRateState,
        roomCode: room.code,
        surfaceId: payload?.surfaceId ?? "",
        isHost
      });
      if (!paintGuard.ok) {
        ack(ackFn, paintGuard);
        return;
      }

      const result = roomService.setSurfacePaint(
        room,
        payload?.surfaceId,
        payload?.imageDataUrl ?? payload?.dataUrl ?? "",
        socket.data.playerKey ?? "",
        isHost
      );
      if (!result.ok) {
        ack(ackFn, result);
        return;
      }

      if (result.changed) {
        io.to(room.code).emit("paint:surface:update", {
          surfaceId: result.surfaceId,
          imageDataUrl: result.imageDataUrl,
          updatedAt: result.updatedAt,
          authorId: socket.id
        });
      }
      if (!(await flushPersistentStateIfRequested(payload, ackFn, "surface paint"))) {
        return;
      }

      ack(ackFn, {
        ok: true,
        changed: Boolean(result.changed),
        surfaceId: result.surfaceId,
        imageDataUrl: result.imageDataUrl,
        updatedAt: result.updatedAt
      });
    });

    socket.on("paint:surface:policy:set", async (payload = {}, ackFn) => {
      const room = roomService.getRoomBySocket(socket);
      if (!room) {
        ack(ackFn, { ok: false, error: "room not found" });
        return;
      }
      if (!room.players?.has?.(socket.id)) {
        ack(ackFn, { ok: false, error: "player not in room" });
        return;
      }
      const isHost = roomService.isHost(room, socket.id);
      if (!isHost) {
        ack(ackFn, { ok: false, error: "host only" });
        return;
      }

      const persistenceError = getPersistentStateBlockReason(config, "surface paint");
      if (persistenceError) {
        ack(ackFn, { ok: false, error: persistenceError });
        return;
      }
      const paintModeError = getFeatureModeBlockReason(
        config?.surfacePaintMode,
        "surface paint",
        isHost
      );
      if (paintModeError) {
        ack(ackFn, { ok: false, error: paintModeError });
        return;
      }

      const result = roomService.setSurfacePaintPolicy(
        room,
        payload?.surfaceId ?? "",
        payload?.allowOthersDraw
      );
      if (!result.ok) {
        ack(ackFn, result);
        return;
      }

      if (result.changed) {
        roomService.emitRoomUpdate(room);
      }

      if (!(await flushPersistentStateIfRequested(payload, ackFn, "surface paint policy"))) {
        return;
      }

      ack(ackFn, {
        ok: true,
        changed: Boolean(result.changed),
        surfaceId: result.surfaceId,
        allowOthersDraw: Boolean(result.allowOthersDraw),
        updatedAt: result.updatedAt,
        surfacePolicies: result.surfacePolicies ?? null
      });
    });

    socket.on("paint:state:request", () => {
      emitSurfacePaintState();
    });

    socket.on("room:host:claim", (payload = {}, ackFn) => {
      const room = roomService.getRoomBySocket(socket);
      if (!room) {
        ack(ackFn, { ok: false, error: "room not found" });
        return;
      }

      const requiredKey = String(config?.hostClaimKey ?? "").trim();
      const providedKey = String(payload?.key ?? "").trim();
      if (requiredKey && providedKey !== requiredKey) {
        ack(ackFn, { ok: false, error: "invalid host key" });
        return;
      }

      const claimResult = roomService.claimHost(room, socket.id);
      if (!claimResult.ok) {
        ack(ackFn, claimResult);
        return;
      }

      if (claimResult.changed) {
        roomService.emitRoomUpdate(room);
        roomService.emitRoomList();
      }

      ack(ackFn, {
        ok: true,
        changed: Boolean(claimResult.changed),
        room: roomService.serializeRoom(room)
      });
    });

    socket.on("security:test:set", (payload = {}, ackFn) => {
      const room = roomService.getRoomBySocket(socket);
      if (!room) {
        ack(ackFn, { ok: false, error: "room not found" });
        return;
      }
      if (!roomService.isHost(room, socket.id)) {
        ack(ackFn, { ok: false, error: "host only" });
        return;
      }

      const result = roomService.setSecurityTestEnabled(
        room,
        payload?.enabled ?? payload?.active ?? false
      );
      if (!result.ok) {
        ack(ackFn, result);
        return;
      }

      if (result.changed) {
        roomService.emitRoomUpdate(room);
      }

      ack(ackFn, {
        ok: true,
        changed: Boolean(result.changed),
        state: result.state
      });
    });

    socket.on("portal:target:set", (payload = {}, ackFn) => {
      const room = roomService.getRoomBySocket(socket);
      if (!room) {
        ack(ackFn, { ok: false, error: "room not found" });
        return;
      }

      if (!roomService.isHost(room, socket.id)) {
        ack(ackFn, { ok: false, error: "host only" });
        return;
      }

      const result = roomService.setPortalTarget(
        room,
        payload?.targetUrl ?? payload?.url ?? ""
      );
      if (!result.ok) {
        ack(ackFn, result);
        return;
      }

      if (result.changed) {
        roomService.emitPortalTargetUpdate(room);
      }

      ack(ackFn, {
        ok: true,
        changed: Boolean(result.changed),
        targetUrl: result.targetUrl
      });
    });

    socket.on("portal:a-zone-target:set", (payload = {}, ackFn) => {
      const room = roomService.getRoomBySocket(socket);
      if (!room) {
        ack(ackFn, { ok: false, error: "room not found" });
        return;
      }

      if (!roomService.isHost(room, socket.id)) {
        ack(ackFn, { ok: false, error: "host only" });
        return;
      }

      const result = roomService.setAZonePortalTarget(
        room,
        payload?.targetUrl ?? payload?.url ?? ""
      );
      if (!result.ok) {
        ack(ackFn, result);
        return;
      }

      if (result.changed) {
        roomService.emitAZonePortalTargetUpdate(room);
      }

      ack(ackFn, {
        ok: true,
        changed: Boolean(result.changed),
        targetUrl: result.targetUrl
      });
    });

    socket.on("portal:ad:set", (payload = {}, ackFn) => {
      const room = roomService.getRoomBySocket(socket);
      if (!room) {
        ack(ackFn, { ok: false, error: "room not found" });
        return;
      }
      if (!roomService.isHost(room, socket.id)) {
        ack(ackFn, { ok: false, error: "host only" });
        return;
      }
      const persistenceError = getPersistentStateBlockReason(config, "portal ad");
      if (persistenceError) {
        ack(ackFn, { ok: false, error: persistenceError });
        return;
      }

      const result = roomService.setMainPortalAdImage(
        room,
        payload?.imageDataUrl ?? payload?.dataUrl ?? payload?.url ?? ""
      );
      if (!result.ok) {
        ack(ackFn, result);
        return;
      }
      if (result.changed) {
        roomService.emitMainPortalAdUpdate(room);
      }
      ack(ackFn, {
        ok: true,
        changed: Boolean(result.changed),
        state: result.state
      });
    });

    socket.on("portal:ad:reset", (_payload = {}, ackFn) => {
      const room = roomService.getRoomBySocket(socket);
      if (!room) {
        ack(ackFn, { ok: false, error: "room not found" });
        return;
      }
      if (!roomService.isHost(room, socket.id)) {
        ack(ackFn, { ok: false, error: "host only" });
        return;
      }
      const persistenceError = getPersistentStateBlockReason(config, "portal ad");
      if (persistenceError) {
        ack(ackFn, { ok: false, error: persistenceError });
        return;
      }

      const result = roomService.resetMainPortalAd(room);
      if (!result.ok) {
        ack(ackFn, result);
        return;
      }
      if (result.changed) {
        roomService.emitMainPortalAdUpdate(room);
      }
      ack(ackFn, {
        ok: true,
        changed: Boolean(result.changed),
        state: result.state
      });
    });

    socket.on("portal:schedule:set", (payload = {}, ackFn) => {
      const room = roomService.getRoomBySocket(socket);
      if (!room) {
        ack(ackFn, { ok: false, error: "room not found" });
        return;
      }

      if (!roomService.isHost(room, socket.id)) {
        ack(ackFn, { ok: false, error: "host only" });
        return;
      }

      const delayFromSeconds = Math.trunc(Number(payload?.delaySeconds) || 0);
      const delayFromMinutes =
        Math.trunc(Number(payload?.minutes) || 0) ||
        Math.trunc(Number(payload?.delayMinutes) || 0) ||
        Math.trunc(Number(payload?.startAfterMinutes) || 0);
      const delaySeconds = delayFromSeconds > 0 ? delayFromSeconds : delayFromMinutes * 60;
      if (delaySeconds <= 0) {
        ack(ackFn, { ok: false, error: "invalid delay" });
        return;
      }

      const result = roomService.setPortalScheduleDelay(room, delaySeconds);
      if (!result.ok) {
        ack(ackFn, result);
        return;
      }

      roomService.emitPortalScheduleUpdate(room);
      ack(ackFn, {
        ok: true,
        schedule: result.schedule
      });
    });

    socket.on("portal:force-open", (_payload = {}, ackFn) => {
      const room = roomService.getRoomBySocket(socket);
      if (!room) {
        ack(ackFn, { ok: false, error: "room not found" });
        return;
      }

      if (!roomService.isHost(room, socket.id)) {
        ack(ackFn, { ok: false, error: "host only" });
        return;
      }

      const forceResult = roomService.forcePortalOpen(room);
      if (!forceResult.ok) {
        ack(ackFn, forceResult);
        return;
      }

      const openedAt = Date.now();
      roomService.emitPortalScheduleUpdate(room);
      io.to(room.code).emit("portal:force-open", {
        roomCode: room.code,
        hostId: socket.id,
        openedAt,
        schedule: forceResult.schedule
      });

      ack(ackFn, { ok: true, openedAt, schedule: forceResult.schedule });
    });

    socket.on("portal:close", (_payload = {}, ackFn) => {
      const room = roomService.getRoomBySocket(socket);
      if (!room) {
        ack(ackFn, { ok: false, error: "room not found" });
        return;
      }

      if (!roomService.isHost(room, socket.id)) {
        ack(ackFn, { ok: false, error: "host only" });
        return;
      }

      const closeResult = roomService.closePortal(room);
      if (!closeResult.ok) {
        ack(ackFn, closeResult);
        return;
      }

      const closedAt = Date.now();
      roomService.emitPortalScheduleUpdate(room);
      io.to(room.code).emit("portal:force-close", {
        roomCode: room.code,
        hostId: socket.id,
        closedAt,
        schedule: closeResult.schedule
      });

      ack(ackFn, { ok: true, closedAt, changed: Boolean(closeResult.changed), schedule: closeResult.schedule });
    });

    socket.on("billboard:right:play", (payload = {}, ackFn) => {
      const room = roomService.getRoomBySocket(socket);
      if (!room) {
        ack(ackFn, { ok: false, error: "room not found" });
        return;
      }
      if (!roomService.isHost(room, socket.id)) {
        ack(ackFn, { ok: false, error: "host only" });
        return;
      }
      const persistenceError = getPersistentStateBlockReason(config, "billboard");
      if (persistenceError) {
        ack(ackFn, { ok: false, error: persistenceError });
        return;
      }

      const result = roomService.setRightBillboardVideo(
        room,
        payload?.videoId ?? payload?.id ?? ""
      );
      if (!result.ok) {
        ack(ackFn, result);
        return;
      }

      if (result.changed) {
        roomService.emitRightBillboardUpdate(room);
      }

      ack(ackFn, {
        ok: true,
        changed: Boolean(result.changed),
        state: result.state
      });
    });

    socket.on("billboard:right:reset", (_payload = {}, ackFn) => {
      const room = roomService.getRoomBySocket(socket);
      if (!room) {
        ack(ackFn, { ok: false, error: "room not found" });
        return;
      }
      if (!roomService.isHost(room, socket.id)) {
        ack(ackFn, { ok: false, error: "host only" });
        return;
      }
      const persistenceError = getPersistentStateBlockReason(config, "billboard");
      if (persistenceError) {
        ack(ackFn, { ok: false, error: persistenceError });
        return;
      }

      const result = roomService.resetRightBillboard(room);
      if (!result.ok) {
        ack(ackFn, result);
        return;
      }

      if (result.changed) {
        roomService.emitRightBillboardUpdate(room);
      }

      ack(ackFn, {
        ok: true,
        changed: Boolean(result.changed),
        state: result.state
      });
    });

    socket.on("billboard:video:set", (payload = {}, ackFn) => {
      const room = roomService.getRoomBySocket(socket);
      if (!room) {
        ack(ackFn, { ok: false, error: "room not found" });
        return;
      }
      if (!roomService.isHost(room, socket.id)) {
        ack(ackFn, { ok: false, error: "host only" });
        return;
      }
      const persistenceError = getPersistentStateBlockReason(config, "billboard");
      if (persistenceError) {
        ack(ackFn, { ok: false, error: persistenceError });
        return;
      }

      const result = roomService.setBillboardVideoData(
        room,
        payload?.videoDataUrl ?? payload?.dataUrl ?? "",
        payload?.target ?? ""
      );
      if (!result.ok) {
        ack(ackFn, result);
        return;
      }

      if (result.changed) {
        roomService.emitLeftBillboardUpdate(room);
        roomService.emitRightBillboardUpdate(room);
      }

      ack(ackFn, {
        ok: true,
        changed: Boolean(result.changed),
        target: result.target,
        leftState: result.leftState,
        rightState: result.rightState
      });
    });

    socket.on("billboard:left:set", (payload = {}, ackFn) => {
      const room = roomService.getRoomBySocket(socket);
      if (!room) {
        ack(ackFn, { ok: false, error: "room not found" });
        return;
      }
      if (!roomService.isHost(room, socket.id)) {
        ack(ackFn, { ok: false, error: "host only" });
        return;
      }
      const persistenceError = getPersistentStateBlockReason(config, "billboard");
      if (persistenceError) {
        ack(ackFn, { ok: false, error: persistenceError });
        return;
      }

      const result = roomService.setLeftBillboardImage(
        room,
        payload?.imageDataUrl ?? payload?.dataUrl ?? payload?.url ?? ""
      );
      if (!result.ok) {
        ack(ackFn, result);
        return;
      }

      if (result.changed) {
        roomService.emitLeftBillboardUpdate(room);
      }

      ack(ackFn, {
        ok: true,
        changed: Boolean(result.changed),
        state: result.state
      });
    });

    socket.on("billboard:left:reset", (_payload = {}, ackFn) => {
      const room = roomService.getRoomBySocket(socket);
      if (!room) {
        ack(ackFn, { ok: false, error: "room not found" });
        return;
      }
      if (!roomService.isHost(room, socket.id)) {
        ack(ackFn, { ok: false, error: "host only" });
        return;
      }
      const persistenceError = getPersistentStateBlockReason(config, "billboard");
      if (persistenceError) {
        ack(ackFn, { ok: false, error: persistenceError });
        return;
      }

      const result = roomService.resetLeftBillboard(room);
      if (!result.ok) {
        ack(ackFn, result);
        return;
      }

      if (result.changed) {
        roomService.emitLeftBillboardUpdate(room);
      }

      ack(ackFn, {
        ok: true,
        changed: Boolean(result.changed),
        state: result.state
      });
    });

    socket.on("music:host:set", (payload = {}, ackFn) => {
      const room = roomService.getRoomBySocket(socket);
      if (!room) {
        ack(ackFn, { ok: false, error: "room not found" });
        return;
      }
      if (!roomService.isHost(room, socket.id)) {
        ack(ackFn, { ok: false, error: "host only" });
        return;
      }

      const result = roomService.setSharedMusic(
        room,
        payload?.dataUrl ?? payload?.audioDataUrl ?? "",
        payload?.name ?? payload?.title ?? ""
      );
      if (!result.ok) {
        ack(ackFn, result);
        return;
      }

      if (result.changed) {
        roomService.emitSharedMusicUpdate(room, { hostId: socket.id });
      }

      ack(ackFn, {
        ok: true,
        changed: Boolean(result.changed),
        state: result.state
      });
    });

    socket.on("music:host:stop", (_payload = {}, ackFn) => {
      const room = roomService.getRoomBySocket(socket);
      if (!room) {
        ack(ackFn, { ok: false, error: "room not found" });
        return;
      }
      if (!roomService.isHost(room, socket.id)) {
        ack(ackFn, { ok: false, error: "host only" });
        return;
      }

      const result = roomService.stopSharedMusic(room);
      if (!result.ok) {
        ack(ackFn, result);
        return;
      }

      if (result.changed) {
        roomService.emitSharedMusicUpdate(room, { hostId: socket.id });
      }

      ack(ackFn, {
        ok: true,
        changed: Boolean(result.changed),
        state: result.state
      });
    });

    socket.on("platform:state:set", async (payload = {}, ackFn) => {
      const room = roomService.getRoomBySocket(socket);
      if (!room) {
        ack(ackFn, { ok: false, error: "room not found" });
        return;
      }
      if (!roomService.isHost(room, socket.id)) {
        ack(ackFn, { ok: false, error: "host only" });
        return;
      }
      const persistenceError = getPersistentStateBlockReason(config, "platform editing");
      if (persistenceError) {
        ack(ackFn, { ok: false, error: persistenceError });
        return;
      }
      const result = roomService.setPlatforms(room, payload?.platforms);
      if (!result.ok) {
        ack(ackFn, result);
        return;
      }
      roomService.emitPlatformUpdate(room);
      if (!(await flushPersistentStateIfRequested(payload, ackFn, "platform editing"))) {
        return;
      }
      ack(ackFn, { ok: true, revision: roomService.getPlatformRevision(room) });
    });

    socket.on("platform:state:request", () => {
      emitPlatformState();
    });

    socket.on("rope:state:set", async (payload = {}, ackFn) => {
      const room = roomService.getRoomBySocket(socket);
      if (!room) {
        ack(ackFn, { ok: false, error: "room not found" });
        return;
      }
      if (!roomService.isHost(room, socket.id)) {
        ack(ackFn, { ok: false, error: "host only" });
        return;
      }
      const persistenceError = getPersistentStateBlockReason(config, "rope editing");
      if (persistenceError) {
        ack(ackFn, { ok: false, error: persistenceError });
        return;
      }
      const result = roomService.setRopes(room, payload?.ropes);
      if (!result.ok) {
        ack(ackFn, result);
        return;
      }
      roomService.emitRopeUpdate(room);
      if (!(await flushPersistentStateIfRequested(payload, ackFn, "rope editing"))) {
        return;
      }
      ack(ackFn, { ok: true, revision: roomService.getRopeRevision(room) });
    });

    socket.on("rope:state:request", () => {
      emitRopeState();
    });

    socket.on("object:state:request", () => {
      emitObjectState();
    });

    socket.on("object:state:set", async (payload = {}, ackFn) => {
      const room = roomService.getRoomBySocket(socket);
      if (!room) {
        ack(ackFn, { ok: false, error: "room not found" });
        return;
      }
      if (!roomService.isHost(room, socket.id)) {
        ack(ackFn, { ok: false, error: "host only" });
        return;
      }
      const persistenceError = getPersistentStateBlockReason(config, "object editing");
      if (persistenceError) {
        ack(ackFn, { ok: false, error: persistenceError });
        return;
      }
      const result = roomService.setObjectPositions(
        room,
        payload?.positions ?? payload?.objectPositions ?? payload
      );
      if (!result.ok) {
        ack(ackFn, result);
        return;
      }
      roomService.emitObjectPositionUpdate(room);
      if (!(await flushPersistentStateIfRequested(payload, ackFn, "object editing"))) {
        return;
      }
      ack(ackFn, { ok: true, revision: roomService.getObjectRevision(room) });
    });

    socket.on("promo:state:request", () => {
      emitPromoState();
    });

    socket.on("promo:upsert", async (payload = {}, ackFn) => {
      const room = roomService.getRoomBySocket(socket);
      if (!room) {
        ack(ackFn, { ok: false, error: "room not found" });
        return;
      }
      if (!room.players?.has?.(socket.id)) {
        ack(ackFn, { ok: false, error: "player not in room" });
        return;
      }
      const isHost = roomService.isHost(room, socket.id);
      const persistenceError = getPersistentStateBlockReason(config, "promo");
      if (persistenceError) {
        ack(ackFn, { ok: false, error: persistenceError });
        return;
      }
      const promoModeError = getFeatureModeBlockReason(config?.promoMode, "promo", isHost);
      if (promoModeError) {
        ack(ackFn, { ok: false, error: promoModeError });
        return;
      }
      const promoGuard = consumePromoOperationBudget({
        socketState: socketPromoRateState,
        ipStateMap: promoOpRateStateByIp,
        clientIp: socket.data.clientIp ?? clientIp,
        isHost,
        antiAbuse
      });
      if (!promoGuard.ok) {
        ack(ackFn, promoGuard);
        return;
      }
      const ownerKey = sanitizeOwnerKey(socket.data.playerKey ?? "");
      if (!ownerKey || ownerKey.length < 8) {
        ack(ackFn, { ok: false, error: "owner key required" });
        return;
      }
      const player = room.players.get(socket.id);
      const actorName = sanitizeName(player?.name ?? socket.data.playerName);
      const result = roomService.upsertPromoObject(room, ownerKey, actorName, payload);
      if (!result.ok) {
        ack(ackFn, result);
        return;
      }
      roomService.emitPromoObjectsUpdate(room);
      roomService.emitRoomUpdate(room);
      if (!(await flushPersistentStateIfRequested(payload, ackFn, "promo"))) {
        return;
      }
      ack(ackFn, {
        ok: true,
        changed: Boolean(result.changed),
        object: result.object ?? null
      });
    });

    socket.on("promo:remove", async (payload = {}, ackFn) => {
      const room = roomService.getRoomBySocket(socket);
      if (!room) {
        ack(ackFn, { ok: false, error: "room not found" });
        return;
      }
      if (!room.players?.has?.(socket.id)) {
        ack(ackFn, { ok: false, error: "player not in room" });
        return;
      }
      const isHost = roomService.isHost(room, socket.id);
      const persistenceError = getPersistentStateBlockReason(config, "promo");
      if (persistenceError) {
        ack(ackFn, { ok: false, error: persistenceError });
        return;
      }
      const promoModeError = getFeatureModeBlockReason(config?.promoMode, "promo", isHost);
      if (promoModeError) {
        ack(ackFn, { ok: false, error: promoModeError });
        return;
      }
      const promoGuard = consumePromoOperationBudget({
        socketState: socketPromoRateState,
        ipStateMap: promoOpRateStateByIp,
        clientIp: socket.data.clientIp ?? clientIp,
        isHost,
        antiAbuse
      });
      if (!promoGuard.ok) {
        ack(ackFn, promoGuard);
        return;
      }
      const ownerKey = sanitizeOwnerKey(socket.data.playerKey ?? "");
      if (!ownerKey || ownerKey.length < 8) {
        ack(ackFn, { ok: false, error: "owner key required" });
        return;
      }
      const result = roomService.removePromoObject(room, ownerKey, payload?.targetOwnerKey ?? "");
      if (!result.ok) {
        ack(ackFn, result);
        return;
      }
      if (result.changed) {
        roomService.emitPromoObjectsUpdate(room);
        roomService.emitRoomUpdate(room);
        if (!(await flushPersistentStateIfRequested(payload, ackFn, "promo"))) {
          return;
        }
      }
      ack(ackFn, {
        ok: true,
        changed: Boolean(result.changed)
      });
    });

    socket.on("editor:settings:set", (payload = {}, ackFn) => {
      const room = roomService.getRoomBySocket(socket);
      if (!room) {
        ack(ackFn, { ok: false, error: "room not found" });
        return;
      }
      if (!roomService.isHost(room, socket.id)) {
        ack(ackFn, { ok: false, error: "host only" });
        return;
      }
      const persistenceError = getPersistentStateBlockReason(config, "editor settings");
      if (persistenceError) {
        ack(ackFn, { ok: false, error: persistenceError });
        return;
      }
      const result = roomService.setObjectEditor(room, payload?.settings ?? payload);
      if (!result.ok) {
        ack(ackFn, result);
        return;
      }
      if (result.changed) {
        roomService.emitRoomUpdate(room);
        roomService.emitPlatformUpdate(room);
        roomService.emitRopeUpdate(room);
      }
      ack(ackFn, {
        ok: true,
        changed: Boolean(result.changed),
        settings: result.settings ?? roomService.serializeObjectEditor(room)
      });
    });

    socket.on("disconnecting", () => {
      releaseConnectionSlotByIp(
        connectionStateByIp,
        socket.data.clientIp ?? clientIp,
        socket.id,
        antiAbuse
      );
      roomService.leaveCurrentRoom(socket);
    });

    socket.on("disconnect", () => {
      releaseConnectionSlotByIp(
        connectionStateByIp,
        socket.data.clientIp ?? clientIp,
        socket.id,
        antiAbuse
      );
      const remaining = playerCounter.decrement();
      worldRuntime?.onPlayerDisconnected(socket);
      log.log(`[-] player disconnected (${remaining}) ${socket.id}`);
    });
  });
}
