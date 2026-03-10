import {
  createBridgeGatekeeperDialogue,
  createCityArchivistDialogue,
  createCityCuratorDialogue
} from "../dialogue/simulacCity.js";

export const BASE_VOID_NPC_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: "bridge_gatekeeper",
    displayName: "문지기 서하",
    role: "gatekeeper",
    zone: "bridge",
    allowedFlowStages: ["bridge_approach"],
    interactionRadius: 5.4,
    scale: 1.34,
    appearance: {
      bodyColor: 0x516578,
      headColor: 0x84a4c2,
      beamColor: 0x6ad7ff,
      padColor: 0x9ad6ff,
      ringColor: 0x9cefff,
      titleLabel: "NPC 서하"
    },
    behavior: {
      mode: "static",
      canApproachPlayer: false
    },
    dialogue: createBridgeGatekeeperDialogue()
  }),
  Object.freeze({
    id: "city_archivist",
    displayName: "아카이비스트 윤",
    role: "archivist",
    zone: "city",
    allowedFlowStages: ["city_live"],
    interactionRadius: 5.8,
    scale: 1.08,
    appearance: {
      bodyColor: 0x55616f,
      headColor: 0xa7c9de,
      beamColor: 0x86d7ff,
      padColor: 0xbfe7ff,
      ringColor: 0xd6f2ff,
      titleLabel: "NPC 윤"
    },
    behavior: {
      mode: "static",
      canApproachPlayer: false
    },
    dialogue: createCityArchivistDialogue()
  }),
  Object.freeze({
    id: "city_curator",
    displayName: "큐레이터 노바",
    role: "curator",
    zone: "city",
    allowedFlowStages: ["city_live"],
    interactionRadius: 6.2,
    scale: 1.04,
    appearance: {
      bodyColor: 0x65586f,
      headColor: 0xd5c1df,
      beamColor: 0xf0b9ff,
      padColor: 0xf4d4ff,
      ringColor: 0xffe7ff,
      titleLabel: "NPC 노바"
    },
    behavior: {
      mode: "roam",
      canApproachPlayer: true,
      roamSpeed: 1.12,
      approachSpeed: 0.68,
      stopDistance: 4.9,
      maxApproachDistance: 48,
      idleApproachDelay: 3.8,
      cityEntryGrace: 9.5,
      returnDelay: 1.8,
      patrolWaitMin: 1.4,
      patrolWaitMax: 3.8,
      yawSlerpSpeed: 4.4,
      patrolOffsets: [
        [0, 0, 0],
        [-9, 0, 3],
        [-4, 0, 10],
        [7, 0, 8],
        [10, 0, -2],
        [1, 0, -8]
      ]
    },
    dialogue: createCityCuratorDialogue()
  })
]);
