import { access, copyFile, readFile, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { loadRuntimeConfig } from "../server/config/runtimeConfig.js";

const SURFACE_PAINT_CORE_PAYLOAD_VERSION = 1;

function hasFlag(flagSet, ...names) {
  return names.some((name) => flagSet.has(name));
}

function printHelp() {
  console.log(`Usage: node scripts/reset-world-state.mjs [options]

Options:
  --promos      Remove promo objects and promo-only painted surfaces (default)
  --surfaces    Remove all saved painted surfaces
  --layout      Remove saved platforms, ropes, and persisted host custom blocks
  --media       Reset saved billboard/portal media
  --chat        Remove saved chat history
  --all         Clear promos, surfaces, layout, media, and chat
  --help        Show this help

Examples:
  node scripts/reset-world-state.mjs
  node scripts/reset-world-state.mjs --promos
  node scripts/reset-world-state.mjs --all
`);
}

async function pathExists(filePath) {
  try {
    await access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function normalizeSurfaceList(rawValue) {
  return Array.isArray(rawValue) ? rawValue : [];
}

function normalizeSurfacePaintCore(rawValue, fallback = []) {
  if (Array.isArray(rawValue)) {
    return rawValue;
  }
  if (rawValue && typeof rawValue === "object" && Array.isArray(rawValue.surfaces)) {
    return rawValue.surfaces;
  }
  return Array.isArray(fallback) ? fallback : [];
}

function normalizeObject(rawValue, fallback = {}) {
  return rawValue && typeof rawValue === "object" ? rawValue : fallback;
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if (hasFlag(args, "--help", "-h", "/?")) {
    printHelp();
    return;
  }

  const clearAll = hasFlag(args, "--all");
  const explicitModeSelected = hasFlag(
    args,
    "--promos",
    "--surfaces",
    "--layout",
    "--media",
    "--chat",
    "--all"
  );
  const clearPromos = clearAll || hasFlag(args, "--promos") || !explicitModeSelected;
  const clearSurfaces = clearAll || hasFlag(args, "--surfaces");
  const clearLayout = clearAll || hasFlag(args, "--layout");
  const clearMedia = clearAll || hasFlag(args, "--media");
  const clearChat = clearAll || hasFlag(args, "--chat");

  const config = loadRuntimeConfig(process.env);
  const storePath = String(config.surfacePaintStorePath ?? "").trim();
  if (!storePath) {
    throw new Error("surface paint store path is empty");
  }
  if (!(await pathExists(storePath))) {
    throw new Error(`store file not found: ${storePath}`);
  }

  const raw = await readFile(storePath, "utf8");
  const parsed = JSON.parse(raw);
  const next = normalizeObject(parsed, {});
  const beforeSurfaces = normalizeSurfacePaintCore(next.surfacePaintCore, normalizeSurfaceList(next.surfaces));
  const beforePromoObjects = normalizeSurfaceList(next.promoObjects);
  const beforePlatforms = normalizeSurfaceList(next.platforms);
  const beforeRopes = normalizeSurfaceList(next.ropes);
  const beforeHostCustomBlocks = normalizeSurfaceList(next.hostCustomBlocks);
  const beforeObjectPositions = normalizeObject(next.objectPositions, {});
  const beforeChatHistory = normalizeSurfaceList(next.chatHistory);
  const now = Date.now();

  const backupStamp = new Date(now).toISOString().replace(/[:.]/g, "-");
  const backupPath = `${storePath}.bak-${backupStamp}`;
  await copyFile(storePath, backupPath);

  let surfaces = beforeSurfaces.slice();
  let promoObjects = beforePromoObjects.slice();
  let platforms = beforePlatforms.slice();
  let ropes = beforeRopes.slice();
  let hostCustomBlocks = beforeHostCustomBlocks.slice();
  let objectPositions = { ...beforeObjectPositions };
  let chatHistory = beforeChatHistory.slice();

  let removedPromoObjects = 0;
  let removedPromoSurfaces = 0;
  let removedSurfaces = 0;

  if (clearPromos) {
    removedPromoObjects = promoObjects.length;
    promoObjects = [];
    const keptSurfaces = [];
    for (const entry of surfaces) {
      const surfaceId = String(entry?.surfaceId ?? "").trim().toLowerCase();
      if (surfaceId.startsWith("po_")) {
        removedPromoSurfaces += 1;
        continue;
      }
      keptSurfaces.push(entry);
    }
    surfaces = keptSurfaces;
  }

  if (clearSurfaces) {
    removedSurfaces = surfaces.length;
    surfaces = [];
  }

  if (clearLayout) {
    platforms = [];
    ropes = [];
    hostCustomBlocks = [];
    objectPositions = {};
    next.platformRevision = now;
    next.ropeRevision = now;
    next.objectRevision = now;
  }

  if (clearMedia) {
    next.portalDisplays = {
      portal1: {
        title: "OX 퀴즈 대회",
        imageDataUrl: "",
        updatedAt: now
      },
      portal2: {
        title: "포탈 2",
        imageDataUrl: "",
        updatedAt: now
      }
    };
    next.mainPortalAd = {
      mode: "ad",
      imageDataUrl: "",
      updatedAt: now
    };
    next.leftBillboard = {
      mode: "ad",
      imageDataUrl: "",
      videoDataUrl: "",
      updatedAt: now
    };
    next.rightBillboard = {
      mode: "ad",
      videoId: "",
      videoDataUrl: "",
      updatedAt: now
    };
  }

  if (clearChat) {
    chatHistory = [];
  }

  next.savedAt = now;
  next.surfacePaintCore = {
    payloadVersion: SURFACE_PAINT_CORE_PAYLOAD_VERSION,
    surfaces
  };
  delete next.surfaces;
  next.promoObjects = promoObjects;
  next.platforms = platforms;
  next.ropes = ropes;
  next.hostCustomBlocks = hostCustomBlocks;
  next.objectPositions = objectPositions;
  next.chatHistory = chatHistory;

  await writeFile(storePath, `${JSON.stringify(next, null, 2)}\n`, "utf8");

  console.log(`[reset] store: ${storePath}`);
  console.log(`[reset] backup: ${backupPath}`);
  if (clearPromos) {
    console.log(
      `[reset] promos cleared: ${removedPromoObjects}, promo surfaces removed: ${removedPromoSurfaces}`
    );
  }
  if (clearSurfaces) {
    console.log(`[reset] surfaces cleared: ${removedSurfaces}`);
  }
  if (clearLayout) {
    console.log(
      `[reset] layout cleared: platforms=${beforePlatforms.length}, ropes=${beforeRopes.length}, hostCustomBlocks=${beforeHostCustomBlocks.length}, legacyObjectPositions=${Object.keys(beforeObjectPositions).length}`
    );
  }
  if (clearMedia) {
    console.log("[reset] billboard/portal media reset");
  }
  if (clearChat) {
    console.log(`[reset] chat cleared: ${beforeChatHistory.length}`);
  }
}

main().catch((error) => {
  console.error(`[reset] ${error?.message ?? error}`);
  process.exitCode = 1;
});
