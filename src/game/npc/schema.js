function normalizeStringArray(values) {
  if (!Array.isArray(values)) {
    return Object.freeze([]);
  }
  return Object.freeze(
    values
      .map((value) => String(value ?? "").trim())
      .filter(Boolean)
  );
}

function normalizeNpcOption(option, fallbackId) {
  const safeOption = option && typeof option === "object" ? option : {};
  const id = String(safeOption.id ?? fallbackId).trim() || fallbackId;
  return Object.freeze({
    id,
    label: String(safeOption.label ?? "").trim() || id,
    nextNodeId: String(safeOption.nextNodeId ?? "").trim(),
    action: String(safeOption.action ?? "").trim(),
    closeAfterSelect: Boolean(safeOption.closeAfterSelect),
    primary: Boolean(safeOption.primary)
  });
}

function normalizeNpcNode(node, fallbackId) {
  const safeNode = node && typeof node === "object" ? node : {};
  const id = String(safeNode.id ?? fallbackId).trim() || fallbackId;
  const replies = normalizeStringArray(safeNode.replies);
  const options = Array.isArray(safeNode.options)
    ? Object.freeze(safeNode.options.map((option, index) => normalizeNpcOption(option, `${id}_option_${index + 1}`)))
    : Object.freeze([]);
  return Object.freeze({
    id,
    topicId: String(safeNode.topicId ?? id).trim() || id,
    title: String(safeNode.title ?? "").trim() || id,
    prompt: String(safeNode.prompt ?? "").trim(),
    replies,
    sources: normalizeStringArray(safeNode.sources),
    options,
    chatEcho: safeNode.chatEcho !== false,
    playGreetingVideo: Boolean(safeNode.playGreetingVideo)
  });
}

function normalizeNpcAppearance(appearance = {}) {
  return Object.freeze({
    bodyColor: appearance.bodyColor ?? 0x4f667a,
    headColor: appearance.headColor ?? 0x84a4c2,
    beamColor: appearance.beamColor ?? 0x68d8ff,
    padColor: appearance.padColor ?? 0x9ad6ff,
    ringColor: appearance.ringColor ?? 0x9cefff,
    titleLabel: String(appearance.titleLabel ?? "").trim(),
    titleLabelColor: appearance.titleLabelColor ?? 0xe8f7ff
  });
}

function normalizeNpcPatrolOffsets(values) {
  if (!Array.isArray(values)) {
    return Object.freeze([]);
  }
  return Object.freeze(
    values
      .map((value) => {
        const source = Array.isArray(value) ? value : [0, 0, 0];
        return Object.freeze([
          Number(source[0]) || 0,
          Number(source[1]) || 0,
          Number(source[2]) || 0
        ]);
      })
      .slice(0, 8)
  );
}

function normalizeNpcBehavior(behavior = {}) {
  const mode = String(behavior.mode ?? "static").trim().toLowerCase();
  const normalizedMode = mode === "roam" ? "roam" : "static";
  const stopDistance = Math.max(2.2, Number(behavior.stopDistance) || 4.8);
  return Object.freeze({
    mode: normalizedMode,
    canApproachPlayer: Boolean(behavior.canApproachPlayer) && normalizedMode === "roam",
    roamSpeed: Math.max(0.1, Number(behavior.roamSpeed) || 0.92),
    approachSpeed: Math.max(0.1, Number(behavior.approachSpeed) || 0.62),
    stopDistance,
    maxApproachDistance: Math.max(stopDistance + 1, Number(behavior.maxApproachDistance) || 15),
    idleApproachDelay: Math.max(1.2, Number(behavior.idleApproachDelay) || 3.4),
    cityEntryGrace: Math.max(2.5, Number(behavior.cityEntryGrace) || 8),
    returnDelay: Math.max(0.4, Number(behavior.returnDelay) || 1.8),
    patrolWaitMin: Math.max(0.2, Number(behavior.patrolWaitMin) || 1.1),
    patrolWaitMax: Math.max(
      Math.max(0.2, Number(behavior.patrolWaitMin) || 1.1),
      Number(behavior.patrolWaitMax) || 3.2
    ),
    yawSlerpSpeed: Math.max(1, Number(behavior.yawSlerpSpeed) || 4),
    patrolOffsets: normalizeNpcPatrolOffsets(behavior.patrolOffsets)
  });
}

export function createNpcDefinition(definition) {
  const safeDefinition = definition && typeof definition === "object" ? definition : {};
  const id = String(safeDefinition.id ?? "").trim();
  if (!id) {
    throw new Error("NPC definition requires an id");
  }
  const dialogue = safeDefinition.dialogue && typeof safeDefinition.dialogue === "object"
    ? safeDefinition.dialogue
    : {};
  const nodes = Array.isArray(dialogue.nodes)
    ? dialogue.nodes.map((node, index) => normalizeNpcNode(node, `${id}_node_${index + 1}`))
    : [];
  const nodeLookup = Object.freeze(
    nodes.reduce((lookup, node) => {
      lookup[node.id] = node;
      return lookup;
    }, {})
  );
  const rootNodeId = String(dialogue.rootNodeId ?? nodes[0]?.id ?? "").trim();
  if (!rootNodeId || !nodeLookup[rootNodeId]) {
    throw new Error(`NPC "${id}" requires a valid dialogue.rootNodeId`);
  }
  return Object.freeze({
    id,
    displayName: String(safeDefinition.displayName ?? id).trim(),
    role: String(safeDefinition.role ?? "guide").trim() || "guide",
    zone: String(safeDefinition.zone ?? "city").trim() || "city",
    allowedFlowStages: normalizeStringArray(safeDefinition.allowedFlowStages),
    interactionRadius: Math.max(1.5, Number(safeDefinition.interactionRadius) || 4.8),
    scale: Math.max(0.5, Number(safeDefinition.scale) || 1),
    appearance: normalizeNpcAppearance(safeDefinition.appearance),
    behavior: normalizeNpcBehavior(safeDefinition.behavior),
    dialogue: Object.freeze({
      rootNodeId,
      nodes: Object.freeze(nodes),
      nodeLookup
    })
  });
}

export function buildNpcDefinitionIndex(definitions) {
  const entries = Array.isArray(definitions) ? definitions : [];
  return new Map(entries.map((definition) => [definition.id, createNpcDefinition(definition)]));
}
