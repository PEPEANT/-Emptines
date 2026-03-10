export { buildNpcDefinitionIndex, createNpcDefinition } from "./schema.js";
export {
  buildNpcReplyText,
  NPC_MEMORY_SCHEMA_VERSION,
  NPC_MEMORY_STORAGE_KEY,
  createNpcMemoryStore,
  ensureNpcMemoryRecord,
  formatNpcSources,
  loadNpcMemoryStore,
  recordNpcDialogueVisit,
  saveNpcMemoryStore,
  selectNpcReplyText
} from "./memory.js";
export { BASE_VOID_NPC_DEFINITIONS } from "./definitions/baseVoid.js";
