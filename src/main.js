import { Game } from "./game/Game.js";

const uiAssetUrls = [
  "/assets/graphics/ui/menu-bg.svg",
  "/assets/graphics/ui/logo.svg",
  "/assets/graphics/ui/panel.svg",
  "/assets/graphics/ui/crosshair.svg",
  "/assets/graphics/ui/hitmarker.svg",
  "/assets/graphics/ui/icons/play.svg",
  "/assets/graphics/ui/icons/pause.svg",
  "/assets/graphics/ui/icons/reload.svg"
];

const preloadImage = (url) =>
  new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.src = url;
  });

const boot = async () => {
  await Promise.all(uiAssetUrls.map(preloadImage));

  const game = new Game(document.getElementById("app"));
  game.init();
};

boot();
