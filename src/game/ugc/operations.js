const OPERATION_TYPES = Object.freeze({
  CUT: "cut",
  ROTATE_90: "rotate90",
  SNAP_ATTACH: "snap_attach",
  REPARENT: "reparent"
});

function normalizeAxis(value) {
  const axis = String(value ?? "").toLowerCase();
  if (axis === "x" || axis === "y" || axis === "z") {
    return axis;
  }
  return "y";
}

function normalizeFace(value) {
  const face = String(value ?? "").toLowerCase();
  const allowed = new Set(["px", "nx", "py", "ny", "pz", "nz"]);
  return allowed.has(face) ? face : "py";
}

function toOperationId() {
  return `op_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function toTrimmedString(value) {
  return String(value ?? "").trim();
}

function toFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export function createOperation(type, payload = {}, meta = {}) {
  const normalizedType = toTrimmedString(type);
  if (!normalizedType) {
    throw new Error("operation type is required");
  }

  return {
    id: toOperationId(),
    type: normalizedType,
    payload: payload && typeof payload === "object" ? { ...payload } : {},
    meta: meta && typeof meta === "object" ? { ...meta } : {},
    createdAt: new Date().toISOString()
  };
}

export function appendOperationLog(creation, operation) {
  const source = creation && typeof creation === "object" ? creation : {};
  const next = {
    ...source,
    operationLog: Array.isArray(source.operationLog) ? source.operationLog.slice() : []
  };
  next.operationLog.push(operation);
  next.updatedAt = new Date().toISOString();
  return next;
}

export function createCutOperation({ partId, axis = "y", ratio = 0.5 } = {}) {
  return createOperation(OPERATION_TYPES.CUT, {
    partId: toTrimmedString(partId),
    axis: normalizeAxis(axis),
    ratio: Math.min(0.99, Math.max(0.01, toFiniteNumber(ratio, 0.5)))
  });
}

export function createRotate90Operation({ partId, axis = "y", steps = 1 } = {}) {
  return createOperation(OPERATION_TYPES.ROTATE_90, {
    partId: toTrimmedString(partId),
    axis: normalizeAxis(axis),
    steps: Math.max(-3, Math.min(3, Math.trunc(toFiniteNumber(steps, 1)) || 1))
  });
}

export function createSnapAttachOperation({ partId, targetPartId, targetFace = "py" } = {}) {
  return createOperation(OPERATION_TYPES.SNAP_ATTACH, {
    partId: toTrimmedString(partId),
    targetPartId: toTrimmedString(targetPartId),
    targetFace: normalizeFace(targetFace)
  });
}

export function createReparentOperation({ partId, parentId } = {}) {
  return createOperation(OPERATION_TYPES.REPARENT, {
    partId: toTrimmedString(partId),
    parentId: toTrimmedString(parentId) || null
  });
}

export const UGC_OPERATION_TYPES = OPERATION_TYPES;
