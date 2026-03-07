import { Server } from "socket.io";
import { mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { loadRuntimeConfig } from "../config/runtimeConfig.js";
import { RoomService } from "../domain/RoomService.js";
import { createStatusServer } from "../http/createStatusServer.js";
import { registerSocketHandlers } from "../socket/registerSocketHandlers.js";
import { createPlayerCounter } from "../utils/playerCounter.js";
import { probeExistingServer } from "../utils/probeExistingServer.js";
import { AuthoritativeWorld } from "./AuthoritativeWorld.js";

function buildFallbackRoomStats(maxRoomPlayers) {
  return {
    rooms: 1,
    globalPlayers: 0,
    globalCapacity: maxRoomPlayers
  };
}

function buildFallbackPersistenceStatus(config) {
  const available = config?.persistentStateAvailable !== false;
  const reason = String(config?.persistentStateReason ?? "").trim();
  const storePath = String(config?.surfacePaintStorePath ?? "").trim() || null;
  return {
    storePath,
    available,
    queued: false,
    inFlight: false,
    lastPersistAt: null,
    lastPersistError: null,
    coreMemory: {
      schemaVersion: 1,
      authoredType: "gray_block",
      payloadVersion: 1,
      durabilityTier: "core",
      storageKey: "hostCustomBlocks",
      available,
      reason,
      count: 0,
      lastPersistAt: null,
      lastPersistError: null,
      queued: false,
      inFlight: false
    }
  };
}

function validatePersistentStateStorePath(storePath) {
  const normalizedPath = String(storePath ?? "").trim();
  if (!normalizedPath) {
    return {
      ok: false,
      reason: "persistent storage path missing"
    };
  }

  const probePath = `${normalizedPath}.probe-${process.pid}-${Date.now()}`;
  try {
    mkdirSync(dirname(normalizedPath), { recursive: true });
    writeFileSync(probePath, "", "utf8");
    unlinkSync(probePath);
    return { ok: true, path: normalizedPath };
  } catch (error) {
    try {
      unlinkSync(probePath);
    } catch {
      // ignore cleanup failures
    }
    return {
      ok: false,
      reason: error?.message ?? String(error ?? "storage validation failed")
    };
  }
}

export function startRealtimeServer(options = {}) {
  const env = options.env ?? process.env;
  const log = options.log ?? console;
  const config = loadRuntimeConfig(env);
  const persistenceCheck = validatePersistentStateStorePath(config.surfacePaintStorePath);
  config.persistentStateAvailable = persistenceCheck.ok;
  config.persistentStateReason = persistenceCheck.ok
    ? ""
    : String(persistenceCheck.reason ?? "persistent storage unavailable");
  if (!persistenceCheck.ok) {
    config.surfacePaintStorePath = "";
    config.surfacePaintMode = "off";
    config.promoMode = "off";
  }
  const linkGateVersion = String(env.EMPTINES_LINK_GATE_VERSION ?? "2026-03-03-allowlist-v1").trim();
  const linkGateDisabledRaw = String(env.EMPTINES_LINK_GATE_DISABLED ?? "").trim().toLowerCase();
  const linkGateEnabled =
    linkGateVersion.length > 0 &&
    linkGateDisabledRaw !== "1" &&
    linkGateDisabledRaw !== "true" &&
    linkGateDisabledRaw !== "yes";

  const playerCounter = createPlayerCounter();
  let roomService = null;
  let worldRuntime = null;

  const httpServer = createStatusServer({
    serviceName: config.serviceName,
    defaultRoomCode: config.defaultRoomCode,
    maxRoomPlayers: config.maxRoomPlayers,
    staticClientDir: config.staticClientDir,
    getOnlineCount: () => playerCounter.get(),
    getRoomStats: () => roomService?.getHealthSnapshot() ?? buildFallbackRoomStats(config.maxRoomPlayers),
    getMetrics: () => worldRuntime?.getMetrics() ?? null,
    getPersistenceStatus: () =>
      roomService?.getPersistenceStatus?.() ?? buildFallbackPersistenceStatus(config)
  });

  const io = new Server(httpServer, {
    cors: {
      origin: config.corsOrigin,
      methods: ["GET", "POST"]
    },
    maxHttpBufferSize: config.maxSocketPayloadBytes,
    transports: ["websocket", "polling"],
    pingInterval: 5000,
    pingTimeout: 5000
  });
  if (linkGateEnabled) {
    io.use((socket, next) => {
      const auth = socket.handshake?.auth ?? {};
      const gateVersion = String(auth?.linkGateVersion ?? "").trim();
      const gateMode = String(auth?.linkGateMode ?? "")
        .trim()
        .toLowerCase();
      const modeAllowed = gateMode === "player" || gateMode === "host";
      if (gateVersion !== linkGateVersion || !modeAllowed) {
        next(new Error("link gate denied"));
        return;
      }
      socket.data.linkGateMode = gateMode;
      next();
    });
    log.log(`[link-gate] enabled (version=${linkGateVersion})`);
  } else {
    log.log("[link-gate] disabled");
  }

  roomService = new RoomService({
    io,
    defaultRoomCode: config.defaultRoomCode,
    maxRoomPlayers: config.maxRoomPlayers,
    defaultPortalTargetUrl: config.defaultPortalTargetUrl,
    defaultAZonePortalTargetUrl: config.defaultAZonePortalTargetUrl,
    surfacePaintStorePath: config.surfacePaintStorePath,
    mapLayoutVersion: config.mapLayoutVersion,
    surfacePaintSaveDebounceMs: config.surfacePaintSaveDebounceMs,
    log
  });

  setInterval(() => {
    for (const room of roomService.rooms.values()) {
      const changed = roomService.tickPortalSchedule(room);
      if (changed) {
        roomService.emitPortalScheduleUpdate(room);
      }
    }
  }, 1000);

  worldRuntime = new AuthoritativeWorld({
    io,
    roomService,
    config,
    log
  });
  worldRuntime.start();

  registerSocketHandlers({
    io,
    roomService,
    playerCounter,
    worldRuntime,
    config,
    log
  });

  httpServer.on("error", (error) => {
    if (error && error.code === "EADDRINUSE") {
      void (async () => {
        const existingServer = await probeExistingServer(config.port, config.serviceName);
        if (existingServer) {
          log.log(`Port ${config.port} is already in use. Existing sync server is running.`);
          process.exit(0);
        }

        log.error(
          `Port ${config.port} is in use by another process. Free the port or set a different PORT.`
        );
        process.exit(1);
      })();
      return;
    }

    log.error("Sync server failed to start:", error);
    process.exit(1);
  });

  httpServer.listen(config.port, () => {
    const persistenceStatus =
      roomService?.getPersistenceStatus?.() ?? buildFallbackPersistenceStatus(config);
    const coreMemoryStatus = persistenceStatus?.coreMemory ?? null;
    log.log(`Chat server running on http://localhost:${config.port}`);
    log.log(`Persistent room: ${config.defaultRoomCode} (capacity ${config.maxRoomPlayers})`);
    log.log(`[paint] store path: ${config.surfacePaintStorePath || "(disabled)"}`);
    log.log(`[paint] map layout version: ${config.mapLayoutVersion}`);
    if (!config.persistentStateAvailable) {
      log.warn(`[paint] persistent state unavailable: ${config.persistentStateReason}`);
    }
    log.log(
      `[core] gray_block persistence: ${
        coreMemoryStatus?.available ? "enabled" : "disabled"
      } key=hostCustomBlocks count=${Math.max(0, Math.trunc(Number(coreMemoryStatus?.count) || 0))}`
    );
    if (!coreMemoryStatus?.available) {
      log.warn(
        `[core] gray_block persistence unavailable: ${
          String(coreMemoryStatus?.reason ?? config.persistentStateReason ?? "unknown").trim() ||
          "unknown"
        }`
      );
    }
    log.log(`[policy] surface paint mode: ${config.surfacePaintMode}`);
    log.log(`[policy] promo mode: ${config.promoMode}`);
    log.log(
      `[guard] connections/ip=${config.antiAbuse.maxConnectionsPerIp} burst=${config.antiAbuse.maxConnectionsPerWindowPerIp}/${config.antiAbuse.connectionWindowMs}ms ban=${config.antiAbuse.connectionBanMs}ms after ${config.antiAbuse.connectionViolationsBeforeBan} violations`
    );
  });

  // Flush pending surface paint to disk before process exits
  const flushAndExit = (code = 0) => {
    const pending = roomService?.surfacePaintSaveQueued || roomService?.surfacePaintSaveTimer;
    if (!pending) {
      process.exit(code);
      return;
    }
    if (roomService?.surfacePaintSaveTimer) {
      clearTimeout(roomService.surfacePaintSaveTimer);
      roomService.surfacePaintSaveTimer = null;
    }
    roomService.flushSurfacePaintToDisk().then(() => process.exit(code)).catch(() => process.exit(code));
  };

  process.once("SIGINT", () => flushAndExit(0));
  process.once("SIGTERM", () => flushAndExit(0));

  return {
    config,
    io,
    httpServer,
    roomService,
    playerCounter,
    worldRuntime
  };
}
