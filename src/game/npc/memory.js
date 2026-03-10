export const NPC_MEMORY_SCHEMA_VERSION = 2;
export const NPC_MEMORY_STORAGE_KEY = "emptines_npc_memory_v2";

function createNpcMemoryRecord() {
  return {
    seenTopics: [],
    visitCounts: {},
    lastNodeId: "",
    lastTopicId: "",
    interactions: 0,
    updatedAt: 0
  };
}

export function createNpcMemoryStore() {
  return {
    schemaVersion: NPC_MEMORY_SCHEMA_VERSION,
    byNpc: {}
  };
}

export function loadNpcMemoryStore(storage = globalThis?.localStorage) {
  if (!storage || typeof storage.getItem !== "function") {
    return createNpcMemoryStore();
  }
  try {
    const raw = storage.getItem(NPC_MEMORY_STORAGE_KEY);
    if (!raw) {
      return createNpcMemoryStore();
    }
    const parsed = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed !== "object" ||
      Number(parsed.schemaVersion) !== NPC_MEMORY_SCHEMA_VERSION ||
      !parsed.byNpc ||
      typeof parsed.byNpc !== "object"
    ) {
      return createNpcMemoryStore();
    }
    return {
      schemaVersion: NPC_MEMORY_SCHEMA_VERSION,
      byNpc: { ...parsed.byNpc }
    };
  } catch {
    return createNpcMemoryStore();
  }
}

export function saveNpcMemoryStore(store, storage = globalThis?.localStorage) {
  if (!storage || typeof storage.setItem !== "function") {
    return;
  }
  try {
    storage.setItem(NPC_MEMORY_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Ignore storage failures. Dialogue still works without persistence.
  }
}

export function ensureNpcMemoryRecord(store, npcId) {
  if (!store || typeof store !== "object") {
    return createNpcMemoryRecord();
  }
  const key = String(npcId ?? "").trim();
  if (!key) {
    return createNpcMemoryRecord();
  }
  if (!store.byNpc || typeof store.byNpc !== "object") {
    store.byNpc = {};
  }
  const current = store.byNpc[key];
  if (!current || typeof current !== "object") {
    store.byNpc[key] = createNpcMemoryRecord();
  }
  const record = store.byNpc[key];
  if (!Array.isArray(record.seenTopics)) {
    record.seenTopics = [];
  }
  if (!record.visitCounts || typeof record.visitCounts !== "object") {
    record.visitCounts = {};
  }
  record.lastNodeId = String(record.lastNodeId ?? "").trim();
  record.lastTopicId = String(record.lastTopicId ?? "").trim();
  record.interactions = Math.max(0, Number(record.interactions) || 0);
  record.updatedAt = Number(record.updatedAt) || 0;
  return record;
}

export function recordNpcDialogueVisit(store, npcId, node) {
  const record = ensureNpcMemoryRecord(store, npcId);
  const nodeId = String(node?.id ?? "").trim();
  const topicId = String(node?.topicId ?? nodeId).trim();
  if (topicId && !record.seenTopics.includes(topicId)) {
    record.seenTopics.push(topicId);
  }
  if (nodeId) {
    record.visitCounts[nodeId] = Math.max(0, Number(record.visitCounts[nodeId]) || 0) + 1;
    record.lastNodeId = nodeId;
  }
  if (topicId) {
    record.lastTopicId = topicId;
  }
  record.interactions += 1;
  record.updatedAt = Date.now();
  return record;
}

export function selectNpcReplyText(node, memoryRecord) {
  const replies = Array.isArray(node?.replies) ? node.replies.filter(Boolean) : [];
  if (!replies.length) {
    return "";
  }
  const nodeId = String(node?.id ?? "").trim();
  const visitCount = Math.max(0, Number(memoryRecord?.visitCounts?.[nodeId]) || 0);
  const interactionCount = Math.max(0, Number(memoryRecord?.interactions) || 0);
  const index = (visitCount + interactionCount) % replies.length;
  return String(replies[index] ?? replies[0] ?? "").trim();
}

export function buildNpcReplyText(node, memoryRecord) {
  const body = selectNpcReplyText(node, memoryRecord) || String(node?.prompt ?? "").trim();
  if (!body) {
    return "";
  }

  const nodeId = String(node?.id ?? "").trim();
  const topicId = String(node?.topicId ?? nodeId).trim();
  const visitCount = Math.max(0, Number(memoryRecord?.visitCounts?.[nodeId]) || 0);
  const lastTopicId = String(memoryRecord?.lastTopicId ?? "").trim();
  const interactions = Math.max(0, Number(memoryRecord?.interactions) || 0);

  let lead = "";
  if (visitCount > 0) {
    lead = "이 질문은 전에 한 번 열어봤지. 이번엔 조금 더 깊게 말해볼게.";
  } else if (interactions > 0 && lastTopicId && lastTopicId !== topicId) {
    lead = "좋아. 방금 보던 흐름에서 이어서 설명할게.";
  }
  return lead ? `${lead} ${body}` : body;
}

export function formatNpcSources(node) {
  const sources = Array.isArray(node?.sources) ? node.sources.filter(Boolean) : [];
  if (!sources.length) {
    return "";
  }
  return `출처: ${sources.join(", ")}`;
}
