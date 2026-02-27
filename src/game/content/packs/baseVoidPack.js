import { GAME_CONSTANTS } from "../../config/gameConstants.js";

export const BASE_VOID_PACK = {
  id: "base-void",
  name: "Base Void",
  world: {
    skyColor: 0x9edbff,
    fogDensity: 0.00006,
    fogNear: 680,
    fogFar: 5200,
    sky: {
      scale: 450000,
      turbidity: 1.9,
      rayleigh: 3.3,
      mieCoefficient: 0.0032,
      mieDirectionalG: 0.84
    },
    clouds: {
      enabled: true,
      count: 32,
      area: 10000,
      minHeight: 140,
      maxHeight: 320,
      minScale: 30,
      maxScale: 82,
      color: 0xf8fdff,
      opacity: 0.88,
      driftMin: 0.28,
      driftMax: 0.78,
      emissive: 0x3a5b6c,
      emissiveIntensity: 0.08
    },
    lights: {
      hemisphere: {
        skyColor: 0xe2f5ff,
        groundColor: 0xa7e67f,
        intensity: 1.36
      },
      sun: {
        color: 0xffffff,
        intensity: 1.24,
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
        color: 0xd2f0ff,
        intensity: 0.64,
        position: [-72, 56, -32]
      }
    },
    ground: {
      textureUrl: "/assets/graphics/world/textures/ground.svg",
      repeatX: 600,
      repeatY: 600,
      size: 200000,
      color: 0x66d66d,
      roughness: 0.92,
      metalness: 0,
      emissive: 0x43a74c,
      emissiveIntensity: 0.2,
      undersideColor: 0x73df7a,
      undersideEmissive: 0x4ec059,
      undersideEmissiveIntensity: 0.34,
      undersideOffsetY: -0.12
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
    },
    postProcessing: {
      bloom: {
        enabled: true,
        mobileEnabled: false,
        strength: 0.22,
        radius: 0.62,
        threshold: 0.86
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
