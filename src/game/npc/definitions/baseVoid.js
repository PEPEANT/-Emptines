import {
  createBridgeGatekeeperDialogue,
  createCityAiGuideDialogue
} from "../dialogue/simulacCity.js";

export const BASE_VOID_NPC_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: "bridge_gatekeeper",
    displayName: "차연",
    role: "gatekeeper",
    zone: "bridge",
    allowedFlowStages: ["bridge_approach"],
    interactionRadius: 6.6,
    scale: 1.34,
    appearance: {
      bodyColor: 0x516578,
      headColor: 0x84a4c2,
      beamColor: 0x6ad7ff,
      padColor: 0x9ad6ff,
      ringColor: 0x9cefff,
      titleLabel: "차연"
    },
    behavior: {
      mode: "static",
      canApproachPlayer: false
    },
    dialogue: createBridgeGatekeeperDialogue()
  }),
  Object.freeze({
    id: "city_ai_guide",
    displayName: "",
    role: "ai_guide",
    zone: "city",
    allowedFlowStages: ["city_live"],
    interactionRadius: 6.4,
    scale: 1.06,
    appearance: {
      bodyColor: 0x5a6270,
      headColor: 0xb7cad9,
      beamColor: 0x86d7ff,
      padColor: 0xbfe7ff,
      ringColor: 0xd6f2ff,
      titleLabel: ""
    },
    behavior: {
      mode: "static",
      canApproachPlayer: false
    },
    dialogue: createCityAiGuideDialogue()
  })
]);
