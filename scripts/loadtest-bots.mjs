import { io } from "socket.io-client";

function parseArg(name, fallback) {
  const prefix = `--${name}=`;
  const entry = process.argv.find((arg) => arg.startsWith(prefix));
  if (!entry) {
    return fallback;
  }
  return entry.slice(prefix.length);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url, timeoutMs = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`Request failed (${response.status}): ${url}`);
    }
    return response.json();
  } finally {
    clearTimeout(timer);
  }
}

const endpoint = String(parseArg("server", "http://localhost:3001")).trim();
const botCount = Math.max(1, Math.min(200, Number(parseArg("bots", 50)) || 50));
const durationSec = Math.max(5, Math.min(900, Number(parseArg("duration", 35)) || 35));
const sendHz = Math.max(5, Math.min(60, Number(parseArg("hz", 20)) || 20));
const sendIntervalMs = Math.max(8, Math.round(1000 / sendHz));

const sockets = [];
const intervals = [];
let connected = 0;
let snapshots = 0;
let inputAcked = 0;

console.log(`[loadtest] endpoint=${endpoint} bots=${botCount} duration=${durationSec}s sendHz=${sendHz}`);

for (let index = 0; index < botCount; index += 1) {
  const socket = io(endpoint, {
    transports: ["websocket"],
    timeout: 6000,
    reconnection: false
  });
  sockets.push(socket);

  let seq = 0;
  let angle = (Math.PI * 2 * index) / Math.max(botCount, 1);
  let sprint = false;
  const pingSentAt = new Map();

  socket.on("connect", () => {
    connected += 1;
    socket.emit("room:quick-join", { name: `BOT_${String(index + 1).padStart(2, "0")}` });

    const timer = setInterval(() => {
      if (!socket.connected) {
        return;
      }
      angle += 0.08 + (index % 7) * 0.003;
      sprint = !sprint;
      seq += 1;
      socket.emit("input:cmd", {
        seq,
        moveX: Math.cos(angle) * 0.8,
        moveZ: Math.sin(angle),
        yaw: ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) - Math.PI,
        pitch: -0.05,
        sprint,
        jump: seq % 70 === 0
      });
    }, sendIntervalMs);

    intervals.push(timer);

    const pingTimer = setInterval(() => {
      if (!socket.connected) {
        return;
      }
      const pingId = seq + 1000000 + index;
      pingSentAt.set(pingId, performance.now());
      socket.emit("net:ping", { id: pingId, t: Date.now() });
    }, 2500);
    intervals.push(pingTimer);
  });

  socket.on("snapshot:world", () => {
    snapshots += 1;
  });

  socket.on("ack:input", () => {
    inputAcked += 1;
  });

  socket.on("net:pong", (payload) => {
    const id = Math.trunc(Number(payload?.id) || 0);
    if (!id) {
      return;
    }
    const sentAt = pingSentAt.get(id);
    if (!Number.isFinite(sentAt)) {
      return;
    }
    pingSentAt.delete(id);
    socket.emit("net:rtt", {
      rttMs: Math.round(Math.max(0, performance.now() - sentAt))
    });
  });
}

await sleep(3000);
console.log(`[loadtest] connected=${connected}/${botCount}`);
if (connected < Math.ceil(botCount * 0.9)) {
  console.warn("[loadtest] warning: less than 90% bots connected");
}

await sleep(durationSec * 1000);

const health = await fetchJson(`${endpoint}/health`);
const metrics = health?.metrics ?? {};

for (const timer of intervals) {
  clearInterval(timer);
}
for (const socket of sockets) {
  socket.disconnect();
}

await sleep(800);
const driftP95 = Number(metrics?.tickDriftP95Ms ?? NaN);
const rttAvg = Number(metrics?.avgRttMs ?? NaN);
const dropRate = Number(metrics?.inputDropRate ?? NaN);

console.log("[loadtest] summary");
console.log(`connected: ${connected}/${botCount}`);
console.log(`snapshot events: ${snapshots}`);
console.log(`input ack events: ${inputAcked}`);
console.log(`tickDriftP95Ms: ${metrics?.tickDriftP95Ms ?? "n/a"}`);
console.log(`sendSizeP95Bytes: ${metrics?.sendSizeP95Bytes ?? "n/a"}`);
console.log(`cpuAvgPct: ${metrics?.cpuAvgPct ?? "n/a"}`);
console.log(`cpuP95Pct: ${metrics?.cpuP95Pct ?? "n/a"}`);
console.log(`cpuPeakPct: ${metrics?.cpuPeakPct ?? "n/a"}`);
console.log(`memRssMb: ${metrics?.memRssMb ?? "n/a"}`);
console.log(`avgRttMs: ${metrics?.avgRttMs ?? "n/a"}`);
console.log(`inputDropRate: ${metrics?.inputDropRate ?? "n/a"}`);

if (Number.isFinite(driftP95) && driftP95 >= 5) {
  console.warn("[loadtest] threshold miss: tickDriftP95Ms >= 5");
}
if (Number.isFinite(rttAvg) && rttAvg >= 120) {
  console.warn("[loadtest] threshold miss: avgRttMs >= 120");
}
if (Number.isFinite(dropRate) && dropRate > 0.05) {
  console.warn("[loadtest] threshold miss: inputDropRate > 0.05");
}
