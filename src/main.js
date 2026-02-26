import "./styles/main.css";
import { Game } from "./game/Game.js";
import { Chat } from "./game/Chat.js";

const bootGuard =
  typeof window !== "undefined"
    ? (window.__reclaimBootGuard = window.__reclaimBootGuard ?? {})
    : null;
if (bootGuard) {
  bootGuard.moduleLoaded = true;
}

const REQUIRED_DOM_IDS = [
  "app",
  "hud",
  "start-overlay",
  "pause-overlay",
  "gameover-overlay",
  "chat-panel"
];

const uiAssetUrls = [
  "/assets/graphics/ui/menu-bg.svg",
  "/assets/graphics/ui/logo.svg",
  "/assets/graphics/ui/panel.svg",
  "/assets/graphics/ui/crosshair.svg",
  "/assets/graphics/ui/hitmarker.svg",
  "/assets/graphics/ui/icons/play.svg",
  "/assets/graphics/ui/icons/pause.svg",
  "/assets/graphics/ui/icons/reload.svg",
  "/assets/graphics/world/blocks/kenney/grass.png",
  "/assets/graphics/world/blocks/kenney/dirt.png",
  "/assets/graphics/world/blocks/kenney/stone.png",
  "/assets/graphics/world/blocks/kenney/sand.png",
  "/assets/graphics/world/blocks/kenney/clay.png",
  "/assets/graphics/world/blocks/kenney/brick.png",
  "/assets/graphics/world/blocks/kenney/ice.png",
  "/assets/graphics/world/blocks/kenney/metal.png"
];

const audioAssetUrls = [
  "/assets/audio/weapons/gunshot_0.mp3",
  "/assets/audio/weapons/gun_reload_lock_or_click_sound.mp3"
];

function supportsWebGL() {
  try {
    const canvas = document.createElement("canvas");
    return !!(
      canvas.getContext("webgl2") ||
      canvas.getContext("webgl") ||
      canvas.getContext("experimental-webgl")
    );
  } catch {
    return false;
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function showBootError(title, detail = "") {
  const id = "boot-error";
  let root = document.getElementById(id);
  if (!root) {
    root = document.createElement("div");
    root.id = id;
    root.style.position = "fixed";
    root.style.inset = "0";
    root.style.zIndex = "9999";
    root.style.display = "grid";
    root.style.placeItems = "center";
    root.style.background = "rgba(5, 10, 18, 0.94)";
    root.style.padding = "18px";
    document.body.appendChild(root);
  }

  root.innerHTML = `
    <div style="max-width:760px;width:100%;border:1px solid rgba(255,120,120,0.45);border-radius:12px;background:rgba(17,22,34,0.9);padding:16px 18px;color:#ffdede;font-family:Segoe UI, sans-serif;">
      <h2 style="margin:0 0 8px 0;font-size:18px;line-height:1.2;">${escapeHtml(title)}</h2>
      <pre style="margin:0;white-space:pre-wrap;word-break:break-word;font-size:13px;line-height:1.45;color:#ffd0d0;">${escapeHtml(detail)}</pre>
    </div>
  `;
}

const preloadImage = (url) =>
  new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.src = url;
  });

const preloadAudio = (url) =>
  new Promise((resolve) => {
    const audio = new Audio();
    let resolved = false;
    let timeoutId = null;
    const done = () => {
      if (resolved) {
        return;
      }
      resolved = true;
      audio.removeEventListener("canplaythrough", done);
      audio.removeEventListener("error", done);
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
      resolve();
    };

    audio.preload = "auto";
    audio.addEventListener("canplaythrough", done, { once: true });
    audio.addEventListener("error", done, { once: true });
    audio.src = url;
    audio.load();

    timeoutId = window.setTimeout(done, 1200);
  });

let bootStarted = false;
const boot = async () => {
  if (bootStarted) {
    return;
  }
  bootStarted = true;
  if (bootGuard) {
    bootGuard.bootStarted = true;
  }

  try {
    if (!supportsWebGL()) {
      throw new Error("현재 브라우저/환경에서 WebGL을 사용할 수 없습니다.");
    }

    const missingIds = REQUIRED_DOM_IDS.filter((id) => !document.getElementById(id));
    if (missingIds.length > 0) {
      throw new Error(`필수 DOM ID 누락: ${missingIds.join(", ")}`);
    }

    await Promise.all([
      ...uiAssetUrls.map(preloadImage),
      ...audioAssetUrls.map(preloadAudio)
    ]);

    const mount = document.getElementById("app");
    const chat = new Chat();
    const game = new Game(mount, { chat });
    game.init();
    window.__reclaimGame = game;
    if (bootGuard) {
      bootGuard.bootReady = true;
      bootGuard.error = "";
    }
  } catch (error) {
    const detail = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error("[boot] failed:", error);
    if (bootGuard) {
      bootGuard.bootReady = false;
      bootGuard.error = detail;
    }
    showBootError("RECLAIM FPS 시작 실패", detail);
  }
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    void boot();
  });
} else {
  void boot();
}
