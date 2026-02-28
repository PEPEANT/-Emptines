import { createServer } from "http";

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
  const [pathname] = req.url.split("?");
  return pathname || "/";
}

export function createStatusServer({
  serviceName,
  defaultRoomCode,
  maxRoomPlayers,
  getOnlineCount,
  getRoomStats,
  getMetrics
}) {
  return createServer((req, res) => {
    const pathname = requestPathname(req);
    if (pathname === "/health") {
      const stats = getRoomStats();
      const metrics = typeof getMetrics === "function" ? getMetrics() : null;
      writeJson(res, 200, {
        ok: true,
        service: serviceName,
        rooms: Number(stats?.rooms) || 1,
        online: Number(getOnlineCount?.()) || 0,
        globalPlayers: Number(stats?.globalPlayers) || 0,
        globalCapacity: Number(stats?.globalCapacity) || maxRoomPlayers,
        metrics,
        now: Date.now()
      });
      return;
    }

    if (pathname === "/" || pathname === "/status") {
      writeJson(res, 200, {
        ok: true,
        message: "Emptines realtime sync server is running",
        room: defaultRoomCode,
        capacity: maxRoomPlayers,
        health: "/health"
      });
      return;
    }

    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  });
}
