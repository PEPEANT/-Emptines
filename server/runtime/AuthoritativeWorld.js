import { quantizeState, sanitizePlayerState } from "../domain/playerState.js";
import { availableParallelism } from "node:os";

function clamp(value, min, max, fallback = min) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return Math.min(max, Math.max(min, fallback));
  }
  return Math.min(max, Math.max(min, number));
}

function normalizeAngle(value, fallback = 0) {
  const number = Number(value);
  const base = Number.isFinite(number) ? number : Number(fallback) || 0;
  return Math.atan2(Math.sin(base), Math.cos(base));
}

function normalizeMove(inputX, inputZ) {
  const x = Number(inputX) || 0;
  const z = Number(inputZ) || 0;
  const length = Math.hypot(x, z);
  if (length < 0.0001) {
    return { x: 0, z: 0 };
  }
  return { x: x / length, z: z / length };
}

function bytesOf(payload) {
  return Buffer.byteLength(JSON.stringify(payload), "utf8");
}

function percentile95(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * 0.95)));
  return sorted[index];
}

function maxValue(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return 0;
  }
  return values.reduce((max, value) => (value > max ? value : max), values[0]);
}

function toSnapshotState(state) {
  return [
    Number(state?.x) || 0,
    Number(state?.y) || 0,
    Number(state?.z) || 0,
    Number(state?.yaw) || 0,
    Number(state?.pitch) || 0
  ];
}

function hasSnapshotStateChanged(prev, next, thresholds) {
  if (!prev || !next) {
    return true;
  }

  const dx = next[0] - prev[0];
  const dy = next[1] - prev[1];
  const dz = next[2] - prev[2];
  const moveSq = dx * dx + dy * dy + dz * dz;
  if (moveSq >= Number(thresholds?.minMoveSq ?? 0.00064)) {
    return true;
  }

  const yawDelta = Math.abs(Math.atan2(Math.sin(next[3] - prev[3]), Math.cos(next[3] - prev[3])));
  if (yawDelta >= Number(thresholds?.minYawDelta ?? 0.01)) {
    return true;
  }

  if (Math.abs(next[4] - prev[4]) >= Number(thresholds?.minPitchDelta ?? 0.01)) {
    return true;
  }

  return false;
}

function trackSample(target, value, limit = 300) {
  target.push(value);
  if (target.length > limit) {
    target.splice(0, target.length - limit);
  }
}

export class AuthoritativeWorld {
  constructor({ io, roomService, config, log = console }) {
    this.io = io;
    this.roomService = roomService;
    this.config = config;
    this.log = log;
    this.tickIntervalMs = Math.round(1000 / Number(config?.sim?.tickRateHz || 20));
    this.timer = null;
    this.snapshotSeq = 0;
    this.expectedTickAt = 0;
    this.metrics = {
      tickDriftMs: [],
      snapshotBytes: [],
      cpuPct: [],
      inputsAccepted: 0,
      inputsDropped: 0,
      snapshotsSent: 0,
      lastMetricsAt: Date.now()
    };
    this.cpuCoreCount = Math.max(1, Number(availableParallelism?.() || 1));
    this.lastCpuUsage = process.cpuUsage();
    this.lastCpuAt = Date.now();
  }

  start() {
    if (this.timer) {
      return;
    }
    this.expectedTickAt = Date.now() + this.tickIntervalMs;
    this.timer = setInterval(() => {
      this.tick();
    }, this.tickIntervalMs);
    this.timer.unref?.();
  }

  stop() {
    if (!this.timer) {
      return;
    }
    clearInterval(this.timer);
    this.timer = null;
  }

  onPlayerConnected(socket) {
    socket.data.inputRate = {
      windowStart: Date.now(),
      count: 0,
      lastAt: 0
    };
    socket.data.snapshotCache = {
      entities: new Map()
    };
    socket.data.clientRttMs = null;
    socket.data.lastAckInputSeq = 0;
  }

  onPlayerDisconnected(socket) {
    socket.data.snapshotCache = {
      entities: new Map()
    };
  }

  handleClientRtt(socket, payload = {}) {
    const value = Number(payload?.rttMs);
    if (!Number.isFinite(value) || value < 0 || value > 5000) {
      return;
    }
    socket.data.clientRttMs = value;
  }

  shouldDropInput(socket, now) {
    const rate = socket.data.inputRate ?? {
      windowStart: now,
      count: 0,
      lastAt: 0
    };

    if (now - rate.windowStart >= 1000) {
      rate.windowStart = now;
      rate.count = 0;
    }
    rate.count += 1;
    socket.data.inputRate = rate;

    const minIntervalMs = Number(this.config?.sim?.minInputIntervalMs ?? 8);
    const maxInputPerSecond = Number(this.config?.sim?.maxInputPerSecond ?? 90);
    const elapsed = now - Number(rate.lastAt || 0);
    rate.lastAt = now;

    if (elapsed >= 0 && elapsed < minIntervalMs) {
      return true;
    }
    if (rate.count > maxInputPerSecond) {
      return true;
    }
    return false;
  }

  getPlayerForSocket(socket) {
    const room = this.roomService.getRoomBySocket(socket);
    if (!room) {
      return null;
    }
    const player = room.players.get(socket.id);
    if (!player) {
      return null;
    }
    return { room, player };
  }

  handleInputCommand(socket, payload = {}) {
    const result = this.getPlayerForSocket(socket);
    if (!result) {
      return;
    }

    const now = Date.now();
    if (this.shouldDropInput(socket, now)) {
      this.metrics.inputsDropped += 1;
      return;
    }

    const sequence = Math.max(0, Math.trunc(Number(payload?.seq) || 0));
    const moveX = clamp(payload?.moveX, -1, 1, 0);
    const moveZ = clamp(payload?.moveZ, -1, 1, 0);
    const yaw = normalizeAngle(payload?.yaw, Number(result.player?.state?.yaw) || 0);
    const pitch = clamp(payload?.pitch, -1.55, 1.55, Number(result.player?.state?.pitch) || 0);
    const sprint = Boolean(payload?.sprint);
    const jump = Boolean(payload?.jump);

    const { player } = result;
    player.lastInputSeq = Math.max(Number(player.lastInputSeq) || 0, sequence);
    player.input = {
      seq: sequence,
      moveX,
      moveZ,
      sprint,
      jump,
      yaw,
      pitch,
      updatedAt: now
    };

    socket.data.lastAckInputSeq = sequence;
    socket.emit("ack:input", { seq: sequence, t: now });
    this.metrics.inputsAccepted += 1;
  }

  handleClientStateSync(socket, payload = {}) {
    const result = this.getPlayerForSocket(socket);
    if (!result) {
      return { ok: false, error: "room not found" };
    }

    const { player } = result;
    if (!player?.state) {
      player.state = sanitizePlayerState();
    }

    const now = Date.now();
    const worldLimit = Number(this.config?.sim?.worldLimit || 120);
    const playerHeight = Number(this.config?.sim?.playerHeight || 1.72);

    const currentX = Number(player.state.x) || 0;
    const currentY = Number(player.state.y) || playerHeight;
    const currentZ = Number(player.state.z) || 0;

    const nextX = clamp(payload?.x, -worldLimit, worldLimit, currentX);
    const nextY = clamp(payload?.y, playerHeight, 32, currentY);
    const nextZ = clamp(payload?.z, -worldLimit, worldLimit, currentZ);
    const nextYaw = normalizeAngle(payload?.yaw, Number(player.state.yaw) || 0);
    const nextPitch = clamp(payload?.pitch, -1.55, 1.55, Number(player.state.pitch) || 0);

    const dx = nextX - currentX;
    const dz = nextZ - currentZ;
    const maxSyncDistance = Math.max(40, worldLimit * 1.35);
    if (dx * dx + dz * dz > maxSyncDistance * maxSyncDistance) {
      return { ok: false, error: "state sync too far" };
    }

    const sequence = Math.max(0, Math.trunc(Number(player?.lastInputSeq) || 0));
    player.input = {
      seq: sequence,
      moveX: 0,
      moveZ: 0,
      sprint: false,
      jump: false,
      yaw: nextYaw,
      pitch: nextPitch,
      updatedAt: now
    };
    player.lastProcessedInputSeq = sequence;
    player.velocityY = 0;
    player.onGround = nextY <= playerHeight + 0.001;
    player.state = quantizeState({
      x: nextX,
      y: nextY,
      z: nextZ,
      yaw: nextYaw,
      pitch: nextPitch,
      updatedAt: now
    });

    socket.data.lastAckInputSeq = sequence;
    socket.emit("ack:input", { seq: sequence, t: now });

    return {
      ok: true,
      state: toSnapshotState(player.state)
    };
  }

  simulatePlayer(player, dt, now) {
    if (!player?.state) {
      player.state = sanitizePlayerState();
    }
    if (!player.input) {
      player.input = {
        seq: 0,
        moveX: 0,
        moveZ: 0,
        sprint: false,
        jump: false,
        yaw: player.state.yaw,
        pitch: player.state.pitch,
        updatedAt: now
      };
    }

    const state = {
      x: Number(player.state.x) || 0,
      y: Number(player.state.y) || Number(this.config?.sim?.playerHeight || 1.72),
      z: Number(player.state.z) || 0,
      yaw: normalizeAngle(Number(player.state.yaw) || 0, 0),
      pitch: Number(player.state.pitch) || 0
    };

    const input = player.input;
    const inputAgeMs = now - Number(input.updatedAt || 0);
    const staleMs = Number(this.config?.sim?.inputStaleMs || 380);
    const staleInput = inputAgeMs > staleMs;

    const inputMoveX = staleInput ? 0 : clamp(input.moveX, -1, 1, 0);
    const inputMoveZ = staleInput ? 0 : clamp(input.moveZ, -1, 1, 0);
    const normalized = normalizeMove(inputMoveX, inputMoveZ);
    const yaw = normalizeAngle(input.yaw, state.yaw);
    const pitch = clamp(input.pitch, -1.55, 1.55, state.pitch);
    const speed = staleInput
      ? Number(this.config?.sim?.playerSpeed || 8.8)
      : input.sprint
        ? Number(this.config?.sim?.playerSprint || 13.2)
        : Number(this.config?.sim?.playerSpeed || 8.8);

    if (normalized.x !== 0 || normalized.z !== 0) {
      const sinYaw = Math.sin(yaw);
      const cosYaw = Math.cos(yaw);
      const moveX = -sinYaw * normalized.z + cosYaw * normalized.x;
      const moveZ = -cosYaw * normalized.z - sinYaw * normalized.x;
      const moveStep = speed * dt;
      const worldLimit = Number(this.config?.sim?.worldLimit || 120);
      state.x = clamp(state.x + moveX * moveStep, -worldLimit, worldLimit);
      state.z = clamp(state.z + moveZ * moveStep, -worldLimit, worldLimit);
    }

    const gravity = Number(this.config?.sim?.playerGravity || -24);
    const jumpForce = Number(this.config?.sim?.jumpForce || 8.8);
    const playerHeight = Number(this.config?.sim?.playerHeight || 1.72);
    let velocityY = Number(player.velocityY) || 0;
    let onGround = Boolean(player.onGround);

    if (!staleInput && input.jump && onGround) {
      velocityY = jumpForce;
      onGround = false;
    }

    velocityY += gravity * dt;
    state.y += velocityY * dt;
    if (state.y <= playerHeight) {
      state.y = playerHeight;
      velocityY = 0;
      onGround = true;
    } else {
      onGround = false;
    }

    state.yaw = yaw;
    state.pitch = pitch;

    player.velocityY = velocityY;
    player.onGround = onGround;
    player.lastProcessedInputSeq = Math.max(
      Number(player.lastProcessedInputSeq) || 0,
      Math.trunc(Number(input.seq) || 0)
    );
    player.input.jump = false;
    player.state = quantizeState({
      ...state,
      updatedAt: now
    });
  }

  collectVisiblePeers(room, selfPlayer) {
    const aoiRadius = Number(this.config?.snapshot?.aoiRadius || 64);
    const maxPeers = Math.max(1, Math.trunc(Number(this.config?.snapshot?.maxPeersPerClient || 24)));
    const aoiSq = aoiRadius * aoiRadius;

    const selfState = selfPlayer?.state;
    if (!selfState) {
      return [];
    }

    const ranked = [];
    for (const peer of room.players.values()) {
      if (!peer?.state || peer.id === selfPlayer.id) {
        continue;
      }
      const dx = (Number(peer.state.x) || 0) - (Number(selfState.x) || 0);
      const dz = (Number(peer.state.z) || 0) - (Number(selfState.z) || 0);
      const distSq = dx * dx + dz * dz;
      if (distSq <= aoiSq) {
        ranked.push({ peer, distSq });
      }
    }

    ranked.sort((a, b) => a.distSq - b.distSq);
    return ranked.slice(0, maxPeers).map((entry) => entry.peer);
  }

  buildSnapshotForSocket(room, socket, now) {
    const selfPlayer = room.players.get(socket.id);
    if (!selfPlayer?.state) {
      return null;
    }

    const cache = socket.data.snapshotCache ?? { entities: new Map() };
    socket.data.snapshotCache = cache;
    if (!(cache.entities instanceof Map)) {
      cache.entities = new Map();
    }

    const visiblePeers = this.collectVisiblePeers(room, selfPlayer);
    const visibleIds = new Set();
    const playersDelta = [];
    const heartbeatMs = Number(this.config?.snapshot?.heartbeatMs || 950);

    for (const peer of visiblePeers) {
      visibleIds.add(peer.id);
      const snapshotState = toSnapshotState(peer.state);
      const prev = cache.entities.get(peer.id) ?? null;
      const needsHeartbeat = !prev || now - Number(prev.lastSentAt || 0) >= heartbeatMs;
      const changed =
        needsHeartbeat ||
        hasSnapshotStateChanged(prev?.state, snapshotState, this.config?.snapshot) ||
        String(prev?.name ?? "") !== String(peer.name ?? "");

      if (!changed) {
        continue;
      }

      const item = {
        id: peer.id,
        s: snapshotState
      };
      if (!prev || String(prev?.name ?? "") !== String(peer.name ?? "")) {
        item.n = String(peer.name ?? "");
      }

      playersDelta.push(item);
      cache.entities.set(peer.id, {
        state: snapshotState,
        name: peer.name,
        lastSentAt: now
      });
    }

    const gone = [];
    for (const cachedId of cache.entities.keys()) {
      if (cachedId === selfPlayer.id) {
        continue;
      }
      if (!visibleIds.has(cachedId)) {
        gone.push(cachedId);
      }
    }
    for (const id of gone) {
      cache.entities.delete(id);
    }

    const selfState = toSnapshotState(selfPlayer.state);
    const selfPayload = {
      s: selfState,
      seq: Number(selfPlayer.lastProcessedInputSeq) || 0
    };

    const selfPrev = cache.entities.get(selfPlayer.id) ?? null;
    const selfNeedsHeartbeat = !selfPrev || now - Number(selfPrev.lastSentAt || 0) >= heartbeatMs;
    const selfChanged =
      selfNeedsHeartbeat ||
      hasSnapshotStateChanged(selfPrev?.state, selfState, this.config?.snapshot);
    if (selfChanged) {
      cache.entities.set(selfPlayer.id, {
        state: selfState,
        name: selfPlayer.name,
        lastSentAt: now
      });
    }

    if (!selfChanged && playersDelta.length === 0 && gone.length === 0) {
      return null;
    }

    return {
      t: now,
      seq: ++this.snapshotSeq,
      self: selfPayload,
      players: playersDelta,
      gone
    };
  }

  emitSnapshots(now) {
    for (const room of this.roomService.rooms.values()) {
      this.roomService.pruneRoomPlayers(room);
      for (const socketId of room.players.keys()) {
        const socket = this.io.sockets.sockets.get(socketId);
        if (!socket) {
          continue;
        }

        const payload = this.buildSnapshotForSocket(room, socket, now);
        if (!payload) {
          continue;
        }

        socket.emit("snapshot:world", payload);
        this.metrics.snapshotsSent += 1;
        trackSample(this.metrics.snapshotBytes, bytesOf(payload), 300);
      }
    }
  }

  tick() {
    const now = Date.now();
    const drift = now - this.expectedTickAt;
    this.expectedTickAt = now + this.tickIntervalMs;
    trackSample(this.metrics.tickDriftMs, drift, 360);

    const dt = this.tickIntervalMs / 1000;
    for (const room of this.roomService.rooms.values()) {
      this.roomService.pruneRoomPlayers(room);
      for (const player of room.players.values()) {
        this.simulatePlayer(player, dt, now);
      }
    }

    this.emitSnapshots(now);

    if (now - this.lastCpuAt >= 1000) {
      const cpuNow = process.cpuUsage();
      const elapsedMs = now - this.lastCpuAt;
      const deltaUs =
        (cpuNow.user - this.lastCpuUsage.user) + (cpuNow.system - this.lastCpuUsage.system);
      if (elapsedMs > 0 && deltaUs >= 0) {
        const cpuPct = (deltaUs / 1000 / elapsedMs / this.cpuCoreCount) * 100;
        trackSample(this.metrics.cpuPct, Number(cpuPct.toFixed(2)), 360);
      }
      this.lastCpuUsage = cpuNow;
      this.lastCpuAt = now;
    }
  }

  getMetrics() {
    const playersWithRtt = [];
    for (const socket of this.io.sockets.sockets.values()) {
      const rtt = Number(socket?.data?.clientRttMs);
      if (Number.isFinite(rtt) && rtt >= 0) {
        playersWithRtt.push(rtt);
      }
    }

    const inputTotal = this.metrics.inputsAccepted + this.metrics.inputsDropped;
    const inputDropRate = inputTotal > 0 ? this.metrics.inputsDropped / inputTotal : 0;
    const processUptimeSec = process.uptime();
    const processCpu = process.cpuUsage();
    const totalCpuSec = (processCpu.user + processCpu.system) / 1_000_000;
    const cpuAvgPct =
      processUptimeSec > 0
        ? (totalCpuSec / processUptimeSec / this.cpuCoreCount) * 100
        : 0;
    const mem = process.memoryUsage();

    return {
      tickRateHz: Number(this.config?.sim?.tickRateHz || 20),
      tickDriftP95Ms: Number(percentile95(this.metrics.tickDriftMs).toFixed(2)),
      sendSizeP95Bytes: Math.round(percentile95(this.metrics.snapshotBytes)),
      cpuAvgPct: Number(cpuAvgPct.toFixed(2)),
      cpuP95Pct: Number(percentile95(this.metrics.cpuPct).toFixed(2)),
      cpuPeakPct: Number(maxValue(this.metrics.cpuPct).toFixed(2)),
      memRssMb: Number((mem.rss / 1_048_576).toFixed(2)),
      memHeapUsedMb: Number((mem.heapUsed / 1_048_576).toFixed(2)),
      snapshotCount: this.metrics.snapshotsSent,
      inputAccepted: this.metrics.inputsAccepted,
      inputDropped: this.metrics.inputsDropped,
      inputDropRate: Number(inputDropRate.toFixed(4)),
      avgRttMs:
        playersWithRtt.length > 0
          ? Number(
              (
                playersWithRtt.reduce((sum, value) => sum + value, 0) /
                playersWithRtt.length
              ).toFixed(2)
            )
          : null
    };
  }
}
