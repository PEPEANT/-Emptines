import { GAME_CONSTANTS } from "../../../config/gameConstants.js";

export const BASE_VOID_PACK = {
  id: "base-void",
  name: "Base Void",
  world: {
    skyColor: 0x7ec5fa,
    fogDensity: 0.00006,
    fogNear: 680,
    fogFar: 5200,
    sky: {
      scale: 450000,
      turbidity: 2.2,
      rayleigh: 2.65,
      mieCoefficient: 0.0042,
      mieDirectionalG: 0.82,
      textureUrl: "/assets/graphics/world/sky/oss-sky/venice_sunset_1k.hdr",
      textureBackgroundIntensity: 0.82,
      textureEnvironmentIntensity: 0.5
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
      opacity: 0.82,
      driftMin: 0.28,
      driftMax: 0.78,
      mobileCountScale: 0.55,
      emissive: 0x3a5b6c,
      emissiveIntensity: 0.08
    },
    lights: {
      hemisphere: {
        skyColor: 0xcdeaff,
        groundColor: 0xa7e67f,
        intensity: 1.18
      },
      sun: {
        color: 0xffffff,
        intensity: 1.08,
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
        color: 0xc5e8ff,
        intensity: 0.46,
        position: [-72, 56, -32]
      }
    },
    ground: {
      textureUrl: "/assets/graphics/world/textures/cc0-grass/grass_color.jpg",
      normalTextureUrl: "/assets/graphics/world/textures/cc0-grass/grass_normal_gl.jpg",
      roughnessTextureUrl: "/assets/graphics/world/textures/cc0-grass/grass_roughness.jpg",
      aoTextureUrl: "/assets/graphics/world/textures/cc0-grass/grass_ao.jpg",
      repeatX: 430,
      repeatY: 430,
      size: 200000,
      color: 0x66d66d,
      roughness: 0.92,
      metalness: 0,
      emissive: 0x43a74c,
      emissiveIntensity: 0.2,
      normalScale: [0.88, 0.88],
      aoIntensity: 0.5,
      undersideColor: 0x73df7a,
      undersideEmissive: 0x4ec059,
      undersideEmissiveIntensity: 0.34,
      undersideOffsetY: -0.12
    },
    ocean: {
      enabled: true,
      width: 120000,
      depth: 220000,
      shorelineX: 12000,
      positionY: 0.05,
      positionZ: 0,
      normalTextureUrl: "/assets/graphics/world/textures/oss-water/waternormals.jpg",
      normalRepeatX: 20,
      normalRepeatY: 20,
      color: 0x2f8ed9,
      sunColor: 0xffffff,
      opacity: 0.82,
      distortionScale: 2.2,
      timeScale: 0.33,
      bobAmplitude: 0.03,
      bobFrequency: 0.35
    },
    beach: {
      enabled: true,
      textureUrl: "/assets/graphics/world/textures/cc0-sand/sand_color.jpg",
      normalTextureUrl: "/assets/graphics/world/textures/cc0-sand/sand_normal_gl.jpg",
      roughnessTextureUrl: "/assets/graphics/world/textures/cc0-sand/sand_roughness.jpg",
      aoTextureUrl: "/assets/graphics/world/textures/cc0-sand/sand_ao.jpg",
      shorelineX: 12000,
      width: 7800,
      depth: 220000,
      positionY: 0.025,
      repeatX: 56,
      repeatY: 950,
      color: 0xd9c08a,
      roughness: 0.93,
      metalness: 0,
      normalScale: [0.65, 0.65],
      aoIntensity: 0.32,
      foamWidth: 220,
      foamOpacity: 0.46,
      foamColor: 0xe8f7ff
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
      exposure: 0.88,
      bloom: {
        enabled: true,
        mobileEnabled: false,
        strength: 0.13,
        radius: 0.56,
        threshold: 0.9
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
