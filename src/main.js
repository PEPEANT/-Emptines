import "./styles/main.css";
import { Game } from "./game/Game.js";

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
  const root = document.createElement("div");
  root.id = "boot-error";
  root.textContent = message;
  document.body.appendChild(root);
}

function boot() {
  if (!supportsWebGL()) {
    showBootError("WebGL is not available in this browser.");
    return;
  }

  const mount = document.getElementById("app");
  if (!mount) {
    showBootError("Missing #app mount element.");
    return;
  }

  try {
    const game = new Game(mount);
    game.init();
    window.__emptinesGame = game;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    showBootError(`Boot failed: ${detail}`);
    console.error(error);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}