import { createServer } from "http";
import { Server } from "socket.io";

function parseCorsOrigins(rawValue) {
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

function writeJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

async function probeExistingServer(port) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1200);
  try {
    const response = await fetch(`http://localhost:${port}/health`, {
      method: "GET",
      signal: controller.signal,
      headers: { accept: "application/json" }
    });
    if (!response.ok) {
      return false;
    }
    const payload = await response.json().catch(() => null);
    return Boolean(payload?.ok && payload?.service === "reclaim-fps-chat");
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

const DEFAULT_ROOM_CODE = "GLOBAL";
const MAX_ROOM_PLAYERS = 50;

const rooms = new Map();
let playerCount = 0;

function createPersistentRoom() {
  return {
    code: DEFAULT_ROOM_CODE,
    hostId: null,
    players: new Map(),
    persistent: true,
    createdAt: Date.now()
  };
}

function getDefaultRoom() {
  let room = rooms.get(DEFAULT_ROOM_CODE);
  if (!room) {
    room = createPersistentRoom();
    rooms.set(DEFAULT_ROOM_CODE, room);
  }
  return room;
}

getDefaultRoom();

function sanitizeName(raw) {
  const value = String(raw ?? "")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 16);
  return value || "PLAYER";
}

function serializeRoom(room) {
  pruneRoomPlayers(room);
  return {
    code: room.code,
    hostId: room.hostId,
    players: Array.from(room.players.values()).map((player) => ({
      id: player.id,
      name: player.name,
      team: player.team ?? null
    }))
  };
}

function summarizeRooms() {
  const room = getDefaultRoom();
  pruneRoomPlayers(room);
  return [
    {
      code: room.code,
      count: room.players.size,
      capacity: MAX_ROOM_PLAYERS,
      hostName: room.players.get(room.hostId)?.name ?? "AUTO"
    }
  ];
}

function emitRoomList(target = io) {
  target.emit("room:list", summarizeRooms());
}

function emitRoomUpdate(room) {
  io.to(room.code).emit("room:update", serializeRoom(room));
}

function updateHost(room) {
  if (room.hostId && room.players.has(room.hostId)) {
    return;
  }
  room.hostId = room.players.keys().next().value ?? null;
}

function pruneRoomPlayers(room) {
  if (!room || !io?.sockets?.sockets) {
    return false;
  }

  let changed = false;
  for (const socketId of room.players.keys()) {
    if (!io.sockets.sockets.has(socketId)) {
      room.players.delete(socketId);
      changed = true;
    }
  }

  if (changed) {
    updateHost(room);
  }
  return changed;
}

function ack(ackFn, payload) {
  if (typeof ackFn === "function") {
    ackFn(payload);
  }
}

function leaveCurrentRoom(socket) {
  const roomCode = socket.data.roomCode;
  if (!roomCode) {
    return;
  }

  const room = rooms.get(roomCode);
  socket.leave(roomCode);
  socket.data.roomCode = null;

  if (!room) {
    emitRoomList();
    return;
  }

  room.players.delete(socket.id);
  pruneRoomPlayers(room);
  updateHost(room);

  if (!room.persistent && room.players.size === 0) {
    rooms.delete(room.code);
  }

  emitRoomUpdate(room);
  emitRoomList();
}

function joinDefaultRoom(socket, nameOverride = null) {
  const room = getDefaultRoom();
  pruneRoomPlayers(room);
  const name = sanitizeName(nameOverride ?? socket.data.playerName);
  socket.data.playerName = name;

  if (socket.data.roomCode === room.code && room.players.has(socket.id)) {
    return { ok: true, room: serializeRoom(room) };
  }

  leaveCurrentRoom(socket);

  if (room.players.size >= MAX_ROOM_PLAYERS) {
    return {
      ok: false,
      error: `GLOBAL room is full (${MAX_ROOM_PLAYERS})`
    };
  }

  room.players.set(socket.id, {
    id: socket.id,
    name,
    team: null
  });

  updateHost(room);
  socket.join(room.code);
  socket.data.roomCode = room.code;

  emitRoomUpdate(room);
  emitRoomList();

  return { ok: true, room: serializeRoom(room) };
}

const httpServer = createServer((req, res) => {
  if (req.url === "/health") {
    const globalRoom = getDefaultRoom();
    writeJson(res, 200, {
      ok: true,
      service: "reclaim-fps-chat",
      rooms: rooms.size,
      online: playerCount,
      globalPlayers: globalRoom.players.size,
      globalCapacity: MAX_ROOM_PLAYERS,
      now: Date.now()
    });
    return;
  }

  if (req.url === "/" || req.url === "/status") {
    writeJson(res, 200, {
      ok: true,
      message: "RECLAIM FPS socket server is running",
      room: DEFAULT_ROOM_CODE,
      capacity: MAX_ROOM_PLAYERS,
      health: "/health"
    });
    return;
  }

  res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
  res.end("Not found");
});

const corsOrigin = parseCorsOrigins(process.env.CORS_ORIGIN);

const io = new Server(httpServer, {
  cors: {
    origin: corsOrigin,
    methods: ["GET", "POST"]
  },
  transports: ["websocket", "polling"],
  pingInterval: 5000,
  pingTimeout: 5000
});

io.on("connection", (socket) => {
  playerCount += 1;
  socket.data.playerName = `PLAYER_${Math.floor(Math.random() * 9000 + 1000)}`;
  socket.data.roomCode = null;

  console.log(`[+] player connected (${playerCount}) ${socket.id}`);

  const joined = joinDefaultRoom(socket);
  if (joined.ok) {
    ack(null, joined);
  }
  emitRoomList(socket);

  socket.on("chat:send", ({ name, text }) => {
    const safeName = sanitizeName(name ?? socket.data.playerName);
    const safeText = String(text ?? "").trim().slice(0, 200);
    if (!safeText) {
      return;
    }

    socket.data.playerName = safeName;
    io.emit("chat:message", { name: safeName, text: safeText });
  });

  socket.on("room:list", () => {
    emitRoomList(socket);
  });

  socket.on("room:quick-join", (payload = {}, ackFn) => {
    ack(ackFn, joinDefaultRoom(socket, payload.name));
  });

  socket.on("room:create", (payload = {}, ackFn) => {
    ack(ackFn, joinDefaultRoom(socket, payload.name));
  });

  socket.on("room:join", (payload = {}, ackFn) => {
    ack(ackFn, joinDefaultRoom(socket, payload.name));
  });

  socket.on("room:leave", (ackFn) => {
    ack(ackFn, joinDefaultRoom(socket));
  });

  socket.on("room:set-team", (payload = {}, ackFn) => {
    const team = payload.team === "alpha" || payload.team === "bravo" ? payload.team : null;
    if (!team) {
      ack(ackFn, { ok: false, error: "Invalid team" });
      return;
    }

    const roomCode = socket.data.roomCode;
    const room = roomCode ? rooms.get(roomCode) : null;
    if (!room) {
      ack(ackFn, { ok: false, error: "Not in room" });
      return;
    }

    const player = room.players.get(socket.id);
    if (!player) {
      ack(ackFn, { ok: false, error: "Not in room" });
      return;
    }

    player.team = team;
    emitRoomUpdate(room);
    ack(ackFn, { ok: true });
  });

  socket.on("room:start", (ackFn) => {
    const roomCode = socket.data.roomCode;
    const room = roomCode ? rooms.get(roomCode) : null;
    if (!room) {
      ack(ackFn, { ok: false, error: "Not in room" });
      return;
    }

    io.to(room.code).emit("room:started", { code: room.code, startedAt: Date.now() });
    ack(ackFn, { ok: true });
  });

  socket.on("disconnecting", () => {
    leaveCurrentRoom(socket);
  });

  socket.on("disconnect", () => {
    playerCount = Math.max(0, playerCount - 1);
    console.log(`[-] player disconnected (${playerCount}) ${socket.id}`);
  });
});

const PORT = Number(process.env.PORT ?? 3001);
httpServer.on("error", (error) => {
  if (error && error.code === "EADDRINUSE") {
    void (async () => {
      const existingChatServer = await probeExistingServer(PORT);
      if (existingChatServer) {
        console.log(`Port ${PORT} is already in use. Existing chat server is running.`);
        process.exit(0);
      }

      console.error(
        `Port ${PORT} is in use by another process. Free the port or set a different PORT.`
      );
      process.exit(1);
    })();
    return;
  }

  console.error("Chat server failed to start:", error);
  process.exit(1);
});

httpServer.listen(PORT, () => {
  console.log(`Chat server running on http://localhost:${PORT}`);
  console.log(`Persistent room: ${DEFAULT_ROOM_CODE} (capacity ${MAX_ROOM_PLAYERS})`);
});
