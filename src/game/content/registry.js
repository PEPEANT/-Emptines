import { BASE_VOID_PACK } from "./packs/baseVoidPack.js";

const contentPackRegistry = new Map([[BASE_VOID_PACK.id, BASE_VOID_PACK]]);

function isValidContentPack(pack) {
  return (
    pack &&
    typeof pack === "object" &&
    typeof pack.id === "string" &&
    pack.id.trim().length > 0 &&
    pack.world &&
    pack.hands &&
    pack.network
  );
}

export function registerContentPack(pack) {
  if (!isValidContentPack(pack)) {
    throw new Error("Invalid content pack format.");
  }

  const next = { ...pack, id: pack.id.trim() };
  contentPackRegistry.set(next.id, next);
  return next;
}

export function getContentPack(id = BASE_VOID_PACK.id) {
  const key = String(id ?? BASE_VOID_PACK.id).trim();
  return contentPackRegistry.get(key) ?? BASE_VOID_PACK;
}

export function listContentPacks() {
  return Array.from(contentPackRegistry.values());
}

export { BASE_VOID_PACK };