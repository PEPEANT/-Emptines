const DEFAULT_SCHEMA_VERSION = "ugc.creation.v1";

function toTrimmedString(value, fallback = "") {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function toFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeVector3(value, fallback = { x: 0, y: 0, z: 0 }) {
  const source = value && typeof value === "object" ? value : fallback;
  return {
    x: toFiniteNumber(source.x, fallback.x),
    y: toFiniteNumber(source.y, fallback.y),
    z: toFiniteNumber(source.z, fallback.z)
  };
}

function normalizeStatus(value) {
  const normalized = toTrimmedString(value, "draft").toLowerCase();
  if (normalized === "draft" || normalized === "review" || normalized === "published") {
    return normalized;
  }
  return "draft";
}

export function createPart(part = {}) {
  return {
    id: toTrimmedString(part.id),
    parentId: toTrimmedString(part.parentId) || null,
    localPosition: normalizeVector3(part.localPosition, { x: 0, y: 0, z: 0 }),
    localRotation: normalizeVector3(part.localRotation, { x: 0, y: 0, z: 0 }),
    localScale: normalizeVector3(part.localScale, { x: 1, y: 1, z: 1 }),
    meta: part.meta && typeof part.meta === "object" && !Array.isArray(part.meta) ? { ...part.meta } : {}
  };
}

export function createCreationV1(input = {}) {
  const now = new Date().toISOString();
  const parts = Array.isArray(input.parts) ? input.parts.map((part) => createPart(part)) : [];
  const operationLog = Array.isArray(input.operationLog) ? input.operationLog.slice() : [];

  return {
    schemaVersion: DEFAULT_SCHEMA_VERSION,
    id: toTrimmedString(input.id),
    owner: toTrimmedString(input.owner),
    version: Math.max(1, Math.trunc(toFiniteNumber(input.version, 1))),
    status: normalizeStatus(input.status),
    createdAt: toTrimmedString(input.createdAt, now),
    updatedAt: toTrimmedString(input.updatedAt, now),
    parts,
    operationLog
  };
}

export function validateCreationV1(creation) {
  const errors = [];
  const candidate = creation && typeof creation === "object" ? creation : null;
  if (!candidate) {
    return { ok: false, errors: ["creation must be an object"] };
  }
  if (candidate.schemaVersion !== DEFAULT_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be '${DEFAULT_SCHEMA_VERSION}'`);
  }
  if (!toTrimmedString(candidate.id)) {
    errors.push("id is required");
  }
  if (!toTrimmedString(candidate.owner)) {
    errors.push("owner is required");
  }
  if (!Array.isArray(candidate.parts)) {
    errors.push("parts must be an array");
  }
  if (!Array.isArray(candidate.operationLog)) {
    errors.push("operationLog must be an array");
  }
  return {
    ok: errors.length === 0,
    errors
  };
}

export const CREATION_V1_SCHEMA_ID = DEFAULT_SCHEMA_VERSION;
