import { GAME_CONSTANTS } from "../../config/gameConstants.js";

export const BASE_VOID_PACK = {
  id: "base-void",
  name: "Base Void",
  world: {
    skyColor: 0x73c2ff,
    fogNear: 550,
    fogFar: 4200,
    sky: {
      scale: 450000,
      turbidity: 2.7,
      rayleigh: 2.55,
      mieCoefficient: 0.005,
      mieDirectionalG: 0.78
    },
    clouds: {
      enabled: true,
      count: 26,
      area: 9000,
      minHeight: 120,
      maxHeight: 260,
      minScale: 28,
      maxScale: 66,
      color: 0xffffff,
      opacity: 0.86,
      driftMin: 0.4,
      driftMax: 1.1
    },
    lights: {
      hemisphere: {
        skyColor: 0xc8ebff,
        groundColor: 0x6bb255,
        intensity: 1.26
      },
      sun: {
        color: 0xffffff,
        intensity: 1.3,
        position: [70, 130, 44],
        shadowMobileSize: 1024,
        shadowDesktopSize: 1536,
        shadowBounds: 300,
        shadowNear: 1,
        shadowFar: 500,
        shadowBias: -0.00018,
        shadowNormalBias: 0.02
      },
      fill: {
        color: 0xc7ebff,
        intensity: 0.5,
        position: [-72, 56, -32]
      }
    },
    ground: {
      textureUrl: "/assets/graphics/world/textures/ground.svg",
      repeatX: 600,
      repeatY: 600,
      size: 200000,
      color: 0x4cbc55,
      roughness: 0.97,
      metalness: 0,
      emissive: 0x1f7b32,
      emissiveIntensity: 0.12
    },
    originMarker: {
      radiusTop: 0.4,
      radiusBottom: 0.4,
      height: 1.6,
      radialSegments: 14,
      position: [0, 0.8, -5],
      material: {
        color: 0x5e6f83,
        roughness: 0.32,
        metalness: 0.1,
        emissive: 0x2a3a52,
        emissiveIntensity: 0.2
      }
    }
  },
  hands: {
    skin: {
      color: 0xe4bda0,
      roughness: 0.46,
      metalness: 0.03,
      emissive: 0x6e5040,
      emissiveIntensity: 0.05
    },
    sleeve: {
      color: 0x4e6f8e,
      roughness: 0.62,
      metalness: 0.08,
      emissive: 0x1f3347,
      emissiveIntensity: 0.13
    },
    pose: {
      shoulderX: 0.24,
      shoulderY: -0.2,
      shoulderZ: -0.58,
      elbowY: -0.3,
      elbowZ: -0.45,
      handY: -0.4,
      handZ: -0.33,
      upperArmRoll: 0.42,
      forearmRoll: 0.22,
      bendX: 0.16
    },
    groupRotationX: -0.03,
    swayAmplitude: 0.012,
    swayFrequency: 0.0042
  },
  network: {
    syncInterval: GAME_CONSTANTS.REMOTE_SYNC_INTERVAL,
    remoteLerpSpeed: GAME_CONSTANTS.REMOTE_LERP_SPEED,
    staleTimeoutMs: GAME_CONSTANTS.REMOTE_STALE_TIMEOUT_MS
  }
};
