import { io } from "socket.io-client";

const DEFAULT_LINK_GATE_VERSION = "2026-03-03-allowlist-v1";
const DEFAULTS = Object.freeze({
  lobbyUrl: "https://emptines-chat-2.onrender.com/?zone=lobby",
  healthUrl: "https://emptines-chat-2.onrender.com/health",
  realtimeSocketUrl: "https://emptines-chat-2.onrender.com",
  oxUrl: "https://singularity-ox.onrender.com/?v=0.2",
  fpsUrl: "https://reclaim-fps.onrender.com/"
});

function resolveConfig(env = process.env) {
  return {
    lobbyUrl: String(env.CHECK_LOBBY_URL ?? DEFAULTS.lobbyUrl).trim(),
    healthUrl: String(env.CHECK_HEALTH_URL ?? DEFAULTS.healthUrl).trim(),
    realtimeSocketUrl: String(env.CHECK_SOCKET_URL ?? DEFAULTS.realtimeSocketUrl).trim(),
    oxUrl: String(env.CHECK_OX_URL ?? DEFAULTS.oxUrl).trim(),
    fpsUrl: String(env.CHECK_FPS_URL ?? DEFAULTS.fpsUrl).trim(),
    linkGateVersion: String(env.EMPTINES_LINK_GATE_VERSION ?? DEFAULT_LINK_GATE_VERSION).trim(),
    linkGateDisabled: ["1", "true", "yes"].includes(
      String(env.EMPTINES_LINK_GATE_DISABLED ?? "").trim().toLowerCase()
    )
  };
}

async function timedFetch(url, timeoutMs = 45000) {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("timeout")), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal
    });
    return {
      ok: response.ok,
      status: response.status,
      ms: Date.now() - startedAt,
      error: ""
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      ms: Date.now() - startedAt,
      error: String(error?.message ?? error)
    };
  } finally {
    clearTimeout(timer);
  }
}

function formatHttpLine(name, result) {
  if (result.ok) {
    return `[http] ${name}: ok status=${result.status} time=${result.ms}ms`;
  }
  return `[http] ${name}: fail status=${result.status || "n/a"} time=${result.ms}ms error=${result.error}`;
}

function emitAck(socket, event, payload = {}, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} ack timeout`)), timeoutMs);
    socket.emit(event, payload, (response = {}) => {
      clearTimeout(timer);
      resolve(response);
    });
  });
}

async function checkSocket(config) {
  const auth = config.linkGateDisabled
    ? undefined
    : {
        linkGateVersion: config.linkGateVersion,
        linkGateMode: "player"
      };
  const socket = io(config.realtimeSocketUrl, {
    transports: ["websocket"],
    timeout: 12000,
    auth
  });

  const connectResult = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("socket connect timeout")), 12000);
    socket.once("connect", () => {
      clearTimeout(timer);
      resolve({ ok: true, id: socket.id });
    });
    socket.once("connect_error", (error) => {
      clearTimeout(timer);
      reject(new Error(error?.message || "socket connect error"));
    });
  });

  const join = await emitAck(socket, "room:quick-join", { name: "live-check" });
  const switchFps = await emitAck(socket, "room:zone:switch", { zone: "fps" });
  const switchOx = await emitAck(socket, "room:zone:switch", { zone: "ox" });
  const switchLobby = await emitAck(socket, "room:zone:switch", { zone: "lobby" });

  socket.disconnect();

  return {
    connectResult,
    join,
    switchFps,
    switchOx,
    switchLobby
  };
}

async function main() {
  const config = resolveConfig(process.env);
  const httpChecks = [
    ["lobby", config.lobbyUrl],
    ["health", config.healthUrl],
    ["ox", config.oxUrl],
    ["fps", config.fpsUrl]
  ];

  let hasError = false;
  for (const [name, url] of httpChecks) {
    const result = await timedFetch(url);
    console.log(formatHttpLine(name, result));
    if (!result.ok) {
      hasError = true;
    }
  }

  try {
    const socketResult = await checkSocket(config);
    console.log(`[socket] connected id=${socketResult.connectResult.id}`);
    console.log(
      `[socket] quick-join ok=${Boolean(socketResult.join?.ok)} room=${socketResult.join?.room?.code || "n/a"}`
    );
    console.log(
      `[socket] zone-switch fps=${Boolean(socketResult.switchFps?.ok)} ox=${Boolean(
        socketResult.switchOx?.ok
      )} lobby=${Boolean(socketResult.switchLobby?.ok)}`
    );
    if (!socketResult.join?.ok || !socketResult.switchFps?.ok || !socketResult.switchOx?.ok || !socketResult.switchLobby?.ok) {
      hasError = true;
    }
  } catch (error) {
    hasError = true;
    console.log(`[socket] fail error=${String(error?.message ?? error)}`);
  }

  if (hasError) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`[live-check] failed: ${String(error?.stack ?? error)}`);
  process.exit(1);
});
