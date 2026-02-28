import { sanitizeName } from "../domain/playerState.js";
import { ack } from "../utils/ack.js";

function randomDefaultName() {
  return `PLAYER_${Math.floor(Math.random() * 9000 + 1000)}`;
}

export function registerSocketHandlers({
  io,
  roomService,
  playerCounter,
  worldRuntime,
  config = {},
  log = console
}) {
  io.on("connection", (socket) => {
    const online = playerCounter.increment();
    socket.data.playerName = randomDefaultName();
    socket.data.roomCode = null;
    worldRuntime?.onPlayerConnected(socket);

    log.log(`[+] player connected (${online}) ${socket.id}`);

    roomService.joinDefaultRoom(socket);
    roomService.emitRoomList(socket);

    socket.on("chat:send", ({ name, text }) => {
      const safeName = sanitizeName(name ?? socket.data.playerName);
      const safeText = String(text ?? "").trim().slice(0, 200);
      if (!safeText) {
        return;
      }

      const room = roomService.getRoomBySocket(socket);
      if (!room) {
        return;
      }

      const player = room.players.get(socket.id);
      if (!player) {
        return;
      }

      socket.data.playerName = safeName;
      player.name = safeName;

      io.to(room.code).emit("chat:message", {
        id: socket.id,
        name: safeName,
        text: safeText
      });
      roomService.emitRoomUpdate(room);
    });

    socket.on("input:cmd", (payload = {}) => {
      worldRuntime?.handleInputCommand(socket, payload);
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
      ack(ackFn, roomService.joinDefaultRoom(socket, payload.name));
    });

    socket.on("room:create", (payload = {}, ackFn) => {
      ack(ackFn, roomService.joinDefaultRoom(socket, payload.name));
    });

    socket.on("room:join", (payload = {}, ackFn) => {
      ack(ackFn, roomService.joinDefaultRoom(socket, payload.name));
    });

    socket.on("room:leave", (ackFn) => {
      ack(ackFn, roomService.joinDefaultRoom(socket));
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

    socket.on("disconnecting", () => {
      roomService.leaveCurrentRoom(socket);
    });

    socket.on("disconnect", () => {
      const remaining = playerCounter.decrement();
      worldRuntime?.onPlayerDisconnected(socket);
      log.log(`[-] player disconnected (${remaining}) ${socket.id}`);
    });
  });
}
