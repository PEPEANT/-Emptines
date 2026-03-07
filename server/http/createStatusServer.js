import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve as resolvePath } from "node:path";

const MIME_TYPES = Object.freeze({
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".hdr": "image/vnd.radiance",
  ".txt": "text/plain; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf"
});

const LEGACY_HALL_PORTAL_PATH = "/performance/index.html";
const DEFAULT_EXTERNAL_HALL_PORTAL_URL =
  "https://performance-i3w5.onrender.com/performance/";

function writeJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function requestPathname(req) {
  if (typeof req?.url !== "string") {
    return "/";
  }
  try {
    const url = new URL(req.url, "http://localhost");
    return url.pathname || "/";
  } catch {
    return "/";
  }
}

function requestUrl(req) {
  try {
    return new URL(req?.url ?? "/", "http://localhost");
  } catch {
    return new URL("/", "http://localhost");
  }
}

function requestMethod(req) {
  const method = String(req?.method ?? "GET").trim().toUpperCase();
  return method || "GET";
}

function toSafePathSegments(pathname) {
  const rawPath = String(pathname ?? "/").trim() || "/";
  let decoded = rawPath;
  try {
    decoded = decodeURIComponent(rawPath);
  } catch {
    return null;
  }

  const segments = decoded.split("/").filter(Boolean);
  if (segments.some((segment) => segment === "." || segment === ".." || segment.includes("\0"))) {
    return null;
  }
  return segments;
}

function getContentType(filePath) {
  const ext = extname(String(filePath ?? "")).toLowerCase();
  return MIME_TYPES[ext] ?? "application/octet-stream";
}

function resolveDeployMeta() {
  const gitSha = String(process.env.RENDER_GIT_COMMIT ?? process.env.GIT_SHA ?? "").trim();
  const serviceId = String(process.env.RENDER_SERVICE_ID ?? "").trim();
  return {
    gitSha: gitSha || null,
    serviceId: serviceId || null
  };
}

async function serveStaticFile(res, method, rootDir, pathname) {
  if (!rootDir) {
    return false;
  }

  const segments = toSafePathSegments(pathname);
  if (!segments) {
    return false;
  }

  let candidatePath =
    segments.length > 0
      ? resolvePath(rootDir, ...segments)
      : resolvePath(rootDir, "index.html");
  if (!candidatePath.startsWith(rootDir)) {
    return false;
  }

  let info = null;
  try {
    info = await stat(candidatePath);
  } catch {
    return false;
  }
  if (info?.isDirectory?.()) {
    candidatePath = resolvePath(candidatePath, "index.html");
    if (!candidatePath.startsWith(rootDir)) {
      return false;
    }
    try {
      info = await stat(candidatePath);
    } catch {
      return false;
    }
  }
  if (!info?.isFile?.()) {
    return false;
  }

  res.writeHead(200, {
    "content-type": getContentType(candidatePath),
    "cache-control": "public, max-age=300"
  });
  if (method === "HEAD") {
    res.end();
    return true;
  }

  const stream = createReadStream(candidatePath);
  stream.on("error", () => {
    if (!res.headersSent) {
      res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    }
    res.end("Internal server error");
  });
  stream.pipe(res);
  return true;
}

export function createStatusServer({
  serviceName,
  defaultRoomCode,
  maxRoomPlayers,
  getOnlineCount,
  getRoomStats,
  getMetrics,
  getPersistenceStatus,
  staticClientDir = "dist"
}) {
  const resolvedStaticDir = String(staticClientDir ?? "").trim()
    ? resolvePath(process.cwd(), String(staticClientDir))
    : "";
  const deploy = resolveDeployMeta();

  return createServer(async (req, res) => {
    const parsedRequestUrl = requestUrl(req);
    const pathname = requestPathname(req);
    const method = requestMethod(req);
    const canServeFile = method === "GET" || method === "HEAD";
    if (pathname === "/socket.io" || pathname.startsWith("/socket.io/")) {
      return;
    }

    if (pathname === "/health") {
      const stats = getRoomStats();
      const metrics = typeof getMetrics === "function" ? getMetrics() : null;
      const persistence = typeof getPersistenceStatus === "function" ? getPersistenceStatus() : null;
      writeJson(res, 200, {
        ok: true,
        service: serviceName,
        rooms: Number(stats?.rooms) || 1,
        online: Number(getOnlineCount?.()) || 0,
        globalPlayers: Number(stats?.globalPlayers) || 0,
        globalCapacity: Number(stats?.globalCapacity) || maxRoomPlayers,
        metrics,
        persistence,
        deploy,
        now: Date.now()
      });
      return;
    }

    if (pathname === "/status") {
      const persistence = typeof getPersistenceStatus === "function" ? getPersistenceStatus() : null;
      writeJson(res, 200, {
        ok: true,
        message: "Emptines realtime sync server is running",
        room: defaultRoomCode,
        capacity: maxRoomPlayers,
        health: "/health",
        persistence,
        deploy
      });
      return;
    }

    // Backward compatibility: older clients still navigate to /performance/index.html.
    // Redirect them to the dedicated external hall service instead of returning 404.
    if (pathname === LEGACY_HALL_PORTAL_PATH) {
      try {
        const target = new URL(DEFAULT_EXTERNAL_HALL_PORTAL_URL);
        for (const [key, value] of parsedRequestUrl.searchParams.entries()) {
          if (!target.searchParams.has(key)) {
            target.searchParams.set(key, value);
          }
        }
        if (!target.searchParams.has("host")) {
          target.searchParams.set("host", "0");
        }
        if (!target.searchParams.has("room")) {
          target.searchParams.set("room", "event01");
        }
        if (!target.searchParams.has("from")) {
          target.searchParams.set("from", "emptines");
        }
        res.writeHead(302, {
          location: target.toString(),
          "cache-control": "no-store"
        });
        res.end();
        return;
      } catch {
        // fall through
      }
    }

    if (canServeFile && resolvedStaticDir) {
      const servedDirectFile = await serveStaticFile(res, method, resolvedStaticDir, pathname);
      if (servedDirectFile) {
        return;
      }

      const hasFileExtension = extname(pathname).length > 0;
      if (!hasFileExtension) {
        const servedSpaIndex = await serveStaticFile(res, method, resolvedStaticDir, "/index.html");
        if (servedSpaIndex) {
          return;
        }
      }
    }

    if (pathname === "/") {
      const persistence = typeof getPersistenceStatus === "function" ? getPersistenceStatus() : null;
      writeJson(res, 200, {
        ok: true,
        message: "Emptines realtime sync server is running",
        room: defaultRoomCode,
        capacity: maxRoomPlayers,
        health: "/health",
        persistence,
        deploy
      });
      return;
    }

    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  });
}
