import { Server } from "socket.io";
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

export function startRealtimeServer(options = {}) {
  const env = options.env ?? process.env;
  const log = options.log ?? console;
  const config = loadRuntimeConfig(env);

  const playerCounter = createPlayerCounter();
  let roomService = null;
  let worldRuntime = null;

  const httpServer = createStatusServer({
    serviceName: config.serviceName,
    defaultRoomCode: config.defaultRoomCode,
    maxRoomPlayers: config.maxRoomPlayers,
    getOnlineCount: () => playerCounter.get(),
    getRoomStats: () => roomService?.getHealthSnapshot() ?? buildFallbackRoomStats(config.maxRoomPlayers),
    getMetrics: () => worldRuntime?.getMetrics() ?? null
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

  roomService = new RoomService({
    io,
    defaultRoomCode: config.defaultRoomCode,
    maxRoomPlayers: config.maxRoomPlayers,
    defaultPortalTargetUrl: config.defaultPortalTargetUrl,
    surfacePaintStorePath: config.surfacePaintStorePath,
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
    log.log(`Chat server running on http://localhost:${config.port}`);
    log.log(`Persistent room: ${config.defaultRoomCode} (capacity ${config.maxRoomPlayers})`);
  });

  return {
    config,
    io,
    httpServer,
    roomService,
    playerCounter,
    worldRuntime
  };
}
