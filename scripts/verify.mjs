import { spawn } from "node:child_process";
import { unlink } from "node:fs/promises";
import { resolve as resolvePath } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { io } from "socket.io-client";

const skipBuild = process.argv.includes("--skip-build");
const DEFAULT_LINK_GATE_VERSION = "2026-03-03-allowlist-v1";

function resolveLinkGateAuth(env = process.env) {
  const linkGateVersion = String(env.EMPTINES_LINK_GATE_VERSION ?? DEFAULT_LINK_GATE_VERSION).trim();
  const disabledRaw = String(env.EMPTINES_LINK_GATE_DISABLED ?? "").trim().toLowerCase();
  const linkGateEnabled =
    linkGateVersion.length > 0 &&
    disabledRaw !== "1" &&
    disabledRaw !== "true" &&
    disabledRaw !== "yes";
  if (!linkGateEnabled) {
    return null;
  }
  return {
    linkGateVersion,
    linkGateMode: "player"
  };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      stdio: options.stdio ?? "pipe",
      env: options.env ?? process.env
    });

    let stdout = "";
    let stderr = "";

    if (child.stdout) {
      child.stdout.on("data", (data) => {
        stdout += String(data);
      });
    }

    if (child.stderr) {
      child.stderr.on("data", (data) => {
        stderr += String(data);
      });
    }

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(
          new Error(
            `Command failed (${command} ${args.join(" ")}):\n${stderr || stdout || `exit ${code}`}`
          )
        );
      }
    });
  });
}

function runNpm(args) {
  if (process.platform === "win32") {
    return run("cmd.exe", ["/d", "/s", "/c", `npm ${args.join(" ")}`]);
  }
  return run("npm", args);
}

async function waitFor(fn, timeoutMs = 6000, stepMs = 30) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (fn()) {
      return;
    }
    await sleep(stepMs);
  }
  throw new Error("Timed out waiting for condition");
}

async function checkSyntax() {
  const files = [
    "src/main.js",
    "src/game/index.js",
    "src/game/ui/HUD.js",
    "src/game/runtime/GameRuntime.js",
    "src/game/config/gameConstants.js",
    "src/game/content/registry.js",
    "src/game/content/schema.js",
    "src/game/content/packs/baseVoidPack.js",
    "src/game/content/packs/base-void/pack.js",
    "src/game/content/packs/template/pack.template.js",
    "src/game/utils/device.js",
    "src/game/utils/math.js",
    "src/game/utils/threeUtils.js",
    "scripts/world-audit.mjs",
    "server.js",
    "server/config/runtimeConfig.js",
    "server/domain/playerState.js",
    "server/domain/RoomService.js",
    "server/domain/spawn.js",
    "server/http/createStatusServer.js",
    "server/runtime/startRealtimeServer.js",
    "server/runtime/AuthoritativeWorld.js",
    "server/socket/registerSocketHandlers.js",
    "server/utils/ack.js",
    "server/utils/playerCounter.js",
    "server/utils/probeExistingServer.js"
  ];
  for (const file of files) {
    await run(process.execPath, ["--check", file]);
  }
}

async function checkSocketServer() {
  const port = 3101 + Math.floor(Math.random() * 2000);
  const verifyStorePath = resolvePath(
    process.cwd(),
    "server",
    "data",
    `verify-test-persist-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}.json`
  );
  const verifyEnv = {
    ...process.env,
    PORT: String(port),
    SURFACE_PAINT_STORE_PATH: verifyStorePath
  };
  const linkGateAuth = resolveLinkGateAuth(verifyEnv);
  const server = spawn(process.execPath, ["server.js"], {
    cwd: process.cwd(),
    env: verifyEnv,
    stdio: ["ignore", "pipe", "pipe"]
  });

  let serverReady = false;
  let serverFailed = false;
  let bootLog = "";

  if (server.stdout) {
    server.stdout.on("data", (data) => {
      const line = String(data);
      bootLog += line;
      if (line.includes("Chat server running on")) {
        serverReady = true;
      }
      if (line.includes("failed")) {
        serverFailed = true;
      }
    });
  }

  if (server.stderr) {
    server.stderr.on("data", (data) => {
      bootLog += String(data);
    });
  }

  let c1 = null;
  let c2 = null;

  try {
    await waitFor(() => serverReady || serverFailed, 6000);
    assert(serverReady, `Server failed to boot:\n${bootLog}`);

    const clientOneAuth = {
      ...(linkGateAuth ?? {}),
      playerKey: "verify_player_key_one"
    };
    const clientTwoAuth = {
      ...(linkGateAuth ?? {}),
      playerKey: "verify_player_key_two"
    };

    c1 = io(`http://localhost:${port}`, {
      transports: ["websocket"],
      timeout: 5000,
      reconnection: true,
      reconnectionAttempts: 8,
      reconnectionDelay: 120,
      auth: clientOneAuth
    });
    c2 = io(`http://localhost:${port}`, {
      transports: ["websocket"],
      timeout: 5000,
      reconnection: true,
      reconnectionAttempts: 8,
      reconnectionDelay: 120,
      auth: clientTwoAuth
    });

    await Promise.all([waitFor(() => c1.connected, 6000), waitFor(() => c2.connected, 6000)]);

    let roomPlayerCount = 0;
    let receivedSnapshotAck = false;

    c1.on("snapshot:world", (payload) => {
      const ackSeq = Number(payload?.self?.seq) || 0;
      if (ackSeq >= 1) {
        receivedSnapshotAck = true;
      }
    });

    c1.on("room:list", (rooms) => {
      const first = Array.isArray(rooms) ? rooms[0] : null;
      roomPlayerCount = Number(first?.count) || 0;
    });

    c1.emit("input:cmd", {
      seq: 1,
      moveX: 0.2,
      moveZ: 0.8,
      yaw: 0.8,
      pitch: -0.12,
      sprint: false,
      jump: false
    });
    c1.emit("room:list");

    await waitFor(() => receivedSnapshotAck, 5000);
    await waitFor(() => roomPlayerCount >= 2, 5000);

    c2.disconnect();
    c1.emit("room:list");

    await waitFor(() => roomPlayerCount <= 1, 5000);
  } finally {
    c1?.disconnect();
    c2?.disconnect();
    if (!server.killed) {
      server.kill();
    }
    await sleep(120);
    try {
      await unlink(verifyStorePath);
    } catch {
      // ignore cleanup errors
    }
  }
}

async function main() {
  console.log("[verify] syntax checks...");
  await checkSyntax();

  if (!skipBuild) {
    console.log("[verify] production build...");
    const buildResult = await runNpm(["run", "build"]);
    if (buildResult.stdout) {
      process.stdout.write(buildResult.stdout);
    }
    if (buildResult.stderr) {
      process.stderr.write(buildResult.stderr);
    }
  }

  console.log("[verify] socket sync smoke...");
  await checkSocketServer();

  console.log("[verify] all checks passed");
}

main().catch((error) => {
  console.error("[verify] failed");
  console.error(String(error?.stack ?? error));
  process.exit(1);
});
