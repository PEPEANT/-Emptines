import { GAME_CONSTANTS } from "../../config/gameConstants.js";

export const BASE_VOID_PACK = {
  id: "base-void",
  name: "Base Void",
  world: {
    skyColor: 0xa2d9ff,
    fogNear: 550,
    fogFar: 4200,
    sky: {
      scale: 450000,
      turbidity: 2.9,
      rayleigh: 2.4,
      mieCoefficient: 0.005,
      mieDirectionalG: 0.79
    },
    lights: {
      hemisphere: {
        skyColor: 0xbce7ff,
        groundColor: 0x75b160,
        intensity: 1.22
      },
      sun: {
        color: 0xffffff,
        intensity: 1.26,
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
        color: 0xb9e6ff,
        intensity: 0.42,
        position: [-72, 56, -32]
      }
    },
    ground: {
      textureUrl: "/assets/graphics/world/textures/ground.svg",
      repeatX: 600,
      repeatY: 600,
      size: 200000,
      color: 0x8ecf7f,
      roughness: 0.97,
      metalness: 0,
      emissive: 0x1d5f31,
      emissiveIntensity: 0.09
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
      color: 0xbcc6d6,
      roughness: 0.4,
      metalness: 0.05,
      emissive: 0x2f425e,
      emissiveIntensity: 0.16
    },
    sleeve: {
      color: 0x4e6889,
      roughness: 0.55,
      metalness: 0.08,
      emissive: 0x1e2c3f,
      emissiveIntensity: 0.2
    },
    rightPalmPosition: [0.24, -0.34, -0.46],
    rightSleevePosition: [0.26, -0.27, -0.58],
    leftPalmPosition: [-0.24, -0.34, -0.46],
    leftSleevePosition: [-0.26, -0.27, -0.58],
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