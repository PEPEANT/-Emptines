import "./styles/main.css";
import { createGame } from "./game/index.js";

function revealBootUi() {
  document.body?.classList.remove("app-booting");
}

function supportsWebGL() {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(
      canvas.getContext("webgl2") ||
        canvas.getContext("webgl") ||
        canvas.getContext("experimental-webgl")
    );
  } catch {
    return false;
  }
}

function showBootError(message) {
  revealBootUi();
  const root = document.createElement("div");
  root.id = "boot-error";
  root.textContent = message;
  document.body.appendChild(root);
}

function boot() {
  const existingGame = window.__emptinesGame;
  if (existingGame && typeof existingGame.destroy === "function") {
    existingGame.destroy();
  }
  if (!supportsWebGL()) {
    showBootError("이 브라우저에서는 WebGL을 사용할 수 없습니다.");
    return;
  }

  const mount = document.getElementById("app");
  if (!mount) {
    showBootError("#app 마운트 요소를 찾을 수 없습니다.");
    return;
  }

  try {
    const game = createGame(mount, { contentPackId: "base-void" });
    game.init();
    window.__emptinesGame = game;
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        revealBootUi();
      });
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    showBootError(`시작에 실패했습니다: ${detail}`);
    console.error(error);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}

window.addEventListener("beforeunload", () => {
  const game = window.__emptinesGame;
  if (game && typeof game.destroy === "function") {
    game.destroy();
  }
});

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    const game = window.__emptinesGame;
    if (game && typeof game.destroy === "function") {
      game.destroy();
    }
  });
}
