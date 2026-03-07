import * as THREE from "three";
import { io } from "socket.io-client";
import { Sky } from "three/addons/objects/Sky.js";
import { Water } from "three/addons/objects/Water.js";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { HUD } from "../ui/HUD.js";
import { GAME_CONSTANTS } from "../config/gameConstants.js";
import { getContentPack } from "../content/registry.js";
import { isLikelyTouchDevice } from "../utils/device.js";
import { lerpAngle } from "../utils/math.js";
import { disposeMeshTree } from "../utils/threeUtils.js";
import { RUNTIME_TUNING } from "./config/runtimeTuning.js";

function parseVec3(raw, fallback) {
  const base = Array.isArray(fallback) ? fallback : [0, 0, 0];
  const value = Array.isArray(raw) ? raw : base;
  return new THREE.Vector3(
    Number(value[0] ?? base[0]) || 0,
    Number(value[1] ?? base[1]) || 0,
    Number(value[2] ?? base[2]) || 0
  );
}

function parseSeconds(raw, fallback, min = 0.1) {
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(min, value);
}

const INTRO_BOOT_VIDEO_URL = new URL("../../../mp4/grok-video.0.mp4", import.meta.url).href;
const NPC_GREETING_INTRO_VIDEO_URL = new URL("../../../mp4/chroma_02.webm", import.meta.url).href;
const NPC_GREETING_FOLLOWUP_VIDEO_URL = new URL("../../../mp4/grok-video.webm", import.meta.url).href;
const SPAWN_PORTAL_VEIL_REVEAL_VIDEO_URL = new URL("../../../mp4/grok-video00.mp4", import.meta.url).href;
const ENTRY_BGM_URL = new URL("../../../mp3/TSUKUYOMI.mp3", import.meta.url).href;
const AD_BILLBOARD_IMAGE_URL = new URL("../../../png/AD.41415786.1.png", import.meta.url).href;
const PORTAL_TOP_AD_IMAGE_URL = new URL("../../../png/Gemini01.png", import.meta.url).href;
const FUTURE_CITY_FIXED_BILLBOARD_IMAGE_URLS = Object.freeze([
  new URL("../../../png/claude.jpg", import.meta.url).href,
  new URL("../../../png/DC.png", import.meta.url).href,
  new URL("../../../png/Gemini.png", import.meta.url).href,
  new URL("../../../png/Onenal.png", import.meta.url).href,
  new URL("../../../png/Slngula.jpg", import.meta.url).href,
  new URL("../../../png/grok.png", import.meta.url).href
]);
const FUTURE_CITY_OSS_MODEL_FILES = Object.freeze([
  "bank.glb",
  "restaurant.glb",
  "store.glb",
  "pharmacy.glb",
  "police.glb",
  "bar.glb",
  "store.glb"
]);
const RIGHT_BILLBOARD_VIDEO_PATHS = Object.freeze({
  GROK01: "mp4/av/grok-video_01.mp4",
  GROK02: "mp4/av/grok-video_02.mp4",
  GROK03: "mp4/av/grok-video_03.mp4",
  GROK04: "mp4/av/grok-video_04.mp4",
  YTDown1: "mp4/av/YTDown1.mp4",
  YTDown2: "mp4/av/YTDown2.mp4",
  YTDown3: "mp4/av/YTDown3.mp4",
  YTDown4: "mp4/av/YTDown4.mp4",
  YTDown6: "mp4/av/YTDown6.mp4",
  YTDown7: "mp4/av/YTDown7.mp4",
  YTDown8: "mp4/av/YTDown8.mp4"
});
const RIGHT_BILLBOARD_VIDEO_ID_ALIASES = Object.freeze({
  "grok-video_01": "GROK01",
  "grok-video_02": "GROK02",
  "grok-video_03": "GROK03",
  "grok-video_04": "GROK04"
});
const RIGHT_BILLBOARD_VIDEO_ID_LOOKUP = Object.freeze(
  Object.entries(RIGHT_BILLBOARD_VIDEO_PATHS).reduce((lookup, [id]) => {
    lookup[String(id).toLowerCase()] = id;
    return lookup;
  }, { ...RIGHT_BILLBOARD_VIDEO_ID_ALIASES })
);
const MAX_LEFT_BILLBOARD_IMAGE_CHARS = 4_200_000;
const MAX_MAIN_PORTAL_AD_IMAGE_CHARS = 4_200_000;
const MAX_PORTAL_DISPLAY_TITLE_CHARS = 40;
const MAX_PORTAL_DISPLAY_LINE_CHARS = 72;
const MAX_BILLBOARD_VIDEO_DATA_URL_CHARS = 30_000_000;
const MAX_BILLBOARD_VIDEO_BYTES = 20 * 1024 * 1024;
const DEFAULT_PORTAL_TARGET_URL = "https://singularity-ox.onrender.com/?v=08d5432";
const A_ZONE_FIXED_PORTAL_TARGET_URL = "https://singularity-ox.onrender.com/?v=08d5432";
const HALL_FIXED_PORTAL_TARGET_URL =
  "https://performance-i3w5.onrender.com/performance/?host=0&room=event01&from=emptines";
const ROOM_ZONE_IDS = Object.freeze(["lobby", "fps", "ox"]);
const ROOM_ZONE_LABELS = Object.freeze({
  lobby: "대기방",
  fps: "FPS 존",
  ox: "OX 존"
});
const A_ZONE_FIXED_PORTAL_IMAGE_URL = new URL("../../../png/REC_FPS.png", import.meta.url).href;
const HALL_FIXED_PORTAL_IMAGE_URL = new URL("../../../png/PER.png", import.meta.url).href;
const PORTAL_DISPLAY_DEFAULTS = Object.freeze({
  portal1: Object.freeze({
    mode: "text",
    title: "OX 퀴즈 대회",
    line2: "포탈 1 링크는 패널에서 변경",
    line3: "",
    imageUrl: PORTAL_TOP_AD_IMAGE_URL
  }),
  portal2: Object.freeze({
    mode: "text",
    title: "포탈 2",
    line2: "포탈 2 링크는 패널에서 변경",
    line3: "",
    imageUrl: A_ZONE_FIXED_PORTAL_IMAGE_URL
  }),
  hall: Object.freeze({
    mode: "time",
    title: "공연장",
    line2: "",
    line3: "",
    imageUrl: HALL_FIXED_PORTAL_IMAGE_URL
  })
});
const BOX_FACE_KEYS = ["px", "nx", "py", "ny", "pz", "nz"];
const HOST_CONTROLLED_BRIDGE_SURFACE_ID_PATTERN = /^bridge_panel_\d+:(?:px|nx|py|ny|pz|nz)$/;
const NPC_GREETING_SESSION_KEY = "emptines_npc_greeting_seen_v1";
const CITY_AD_BILLBOARD_BASE_PREFIX = "city_ad_board_";
const OBJECT_EDITOR_SETTINGS_STORAGE_KEY = "objectEditorSettings_v1";
const OBJECT_POSITIONS_STORAGE_KEY = "objPositions_v1";
const HOST_LINK_FIXED_NAME = "HOST";
const PORTAL_MOVABLE_IDS = Object.freeze({
  ox: "portal_ox",
  fps: "portal_fps",
  hall: "portal_hall"
});
const A_ZONE_PORTAL_ENABLED = false;
const HALL_VENUE_BACKDROP_ENABLED = false;
const OBJECT_EDITOR_ROTATE_STEP_RAD = Math.PI / 36; // 5deg
const OBJECT_EDITOR_ROTATE_SNAP_STEP_RAD = Math.PI / 12; // 15deg
const OBJECT_EDITOR_MIN_LIMIT = 1;
const OBJECT_EDITOR_MAX_LIMIT = 10000;
const OBJECT_EDITOR_MIN_SCALE = 0.25;
const OBJECT_EDITOR_MAX_SCALE = 8;
const HOST_CUSTOM_BLOCK_POOL_SIZE = 24;
const HOST_CUSTOM_BLOCK_ID_PATTERN = /^host_custom_block_\d+$/;
const HOST_CUSTOM_BLOCK_MIN_SIZE = 0.5;
const HOST_CUSTOM_BLOCK_MAX_SIZE = 8;
const HOST_CUSTOM_BLOCK_DEFAULT_SIZE = 2.5;
const PROMO_OWNER_KEY_STORAGE_KEY = "promoOwnerKey_v1";
const PROMO_MIN_SCALE = 0.35;
const PROMO_MAX_SCALE = 2.85;
const PROMO_DEFAULT_SCALE = 2.2;
const PROMO_MAX_MEDIA_BYTES = 6 * 1024 * 1024;
const PROMO_LINK_INTERACT_RADIUS = 4.2;
const PROMO_BLOCK_WIDTH = 2.8;
const PROMO_BLOCK_HEIGHT = 2.2;
const PROMO_BLOCK_DEPTH = 1.8;
const PROMO_BLOCK_BASE_RADIUS = Math.hypot(PROMO_BLOCK_WIDTH * 0.5, PROMO_BLOCK_DEPTH * 0.5);
const PLAYER_PLACEABLE_BLOCK_BASE_COLOR = 0xf2f3f5;
const PLAYER_PLACEABLE_BLOCK_EDGE_COLOR = 0xffffff;
const PLAYER_PLACEABLE_BLOCK_EMISSIVE_COLOR = 0x20242a;
const PLAYER_PLACEABLE_BLOCK_EMISSIVE_INTENSITY = 0.02;
const PLAYER_PLACEABLE_BLOCKED_MESSAGE =
  "포탈존 , 스폰지점 , 다리 , 중앙 에서는 설치가 불가능합니다";
const PROMO_BLOCKED_CENTER_RADIUS = 11.5;
const PROMO_BLOCKED_PORTAL_RADIUS_PADDING = 1.9;

function resolveRuntimeAssetUrl(relativePath) {
  const normalized = String(relativePath ?? "").trim().replace(/^\/+/, "");
  if (!normalized) {
    return "";
  }

  if (typeof window !== "undefined") {
    try {
      return new URL(normalized, window.location.href).toString();
    } catch {
      // fall through
    }
  }

  return `/${normalized}`;
}

export class GameRuntime {
  constructor(mount, options = {}) {
    this.mount = mount;
    this.clock = new THREE.Clock();
    this.mobileEnabled = isLikelyTouchDevice();
    this.hud = new HUD();

    this.contentPack = options.contentPack ?? getContentPack(options.contentPackId);
    this.worldContent = this.contentPack.world;
    this.handContent = this.contentPack.hands;
    this.networkContent = this.contentPack.network;
    this.remoteLerpSpeed =
      Number(this.networkContent.remoteLerpSpeed) || GAME_CONSTANTS.REMOTE_LERP_SPEED;
    this.remoteStaleTimeoutMs =
      Number(this.networkContent.staleTimeoutMs) || GAME_CONSTANTS.REMOTE_STALE_TIMEOUT_MS;

    const initialDevicePixelRatio = window.devicePixelRatio || 1;
    const initialPixelRatio = Math.min(initialDevicePixelRatio, 1.5);
    this.maxPixelRatio = initialPixelRatio;
    this.currentPixelRatio = initialPixelRatio;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(this.worldContent.skyColor);
    const fogDensity = Number(this.worldContent.fogDensity) || 0;
    this.scene.fog =
      fogDensity > 0
        ? new THREE.FogExp2(this.worldContent.skyColor, fogDensity)
        : new THREE.Fog(this.worldContent.skyColor, this.worldContent.fogNear, this.worldContent.fogFar);

    this.camera = new THREE.PerspectiveCamera(
      GAME_CONSTANTS.DEFAULT_FOV,
      window.innerWidth / window.innerHeight,
      0.1,
      1200
    );

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.mobileEnabled,
      powerPreference: "high-performance"
    });
    this.renderer.setPixelRatio(this.currentPixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    const rendererExposure = Number(this.worldContent?.postProcessing?.exposure);
    this.renderer.toneMappingExposure = Number.isFinite(rendererExposure) ? rendererExposure : 1.08;
    this.renderer.shadowMap.enabled = !this.mobileEnabled;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.textureLoader = new THREE.TextureLoader();
    this.gltfLoader = new GLTFLoader();

    this.playerPosition = new THREE.Vector3(0, GAME_CONSTANTS.PLAYER_HEIGHT, 0);
    this.verticalVelocity = 0;
    this.onGround = true;
    this.yaw = 0;
    this.pitch = 0;

    this.pointerLocked = false;
    this.pointerLockSupported =
      "pointerLockElement" in document &&
      typeof this.renderer.domElement.requestPointerLock === "function";

    this.keys = new Set();
    this.moveForwardVec = new THREE.Vector3();
    this.moveRightVec = new THREE.Vector3();
    this.moveVec = new THREE.Vector3();
    this.playerCollisionRadius = RUNTIME_TUNING.PLAYER_COLLISION_RADIUS;
    this.playerBoundsHalfExtent = Math.max(4, GAME_CONSTANTS.WORLD_LIMIT - this.playerCollisionRadius);

    this.skyDome = null;
    this.skyBackgroundTexture = null;
    this.skyEnvironmentTexture = null;
    this.skyTextureRequestId = 0;
    this.skySun = new THREE.Vector3();
    this.cloudLayer = null;
    this.cloudParticles = [];
    this.sunLight = null;
    this.ground = null;
    this.groundUnderside = null;
    this.boundaryGroup = null;
    this.chalkLayer = null;
    this.chalkStampGeometry = null;
    this.chalkStampTexture = null;
    this.chalkMaterials = new Map();
    this.chalkMarks = [];
    this.chalkPointer = new THREE.Vector2(0, 0);
    this.chalkRaycaster = new THREE.Raycaster();
    this.chalkGroundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.chalkHitPoint = new THREE.Vector3();
    this.chalkLastStamp = null;
    this.chalkDrawingActive = false;
    this.chalkPalette = [];
    this.selectedChalkColor = "#f5f7ff";
    this.activeTool = "move";
    this.hasChalk = false;
    this.chalkTableWorldPos = null;
    this.chalkTablePickupRadius = 2.8;
    this.chalkTableChalkGroup = null;
    this.chalkPickupEl = null;
    this.paintableSurfaceMeshes = [];
    this.paintableSurfaceMap = new Map();
    this.surfacePaintState = new Map();
    this.surfacePaintUpdatedAt = new Map();
    this.cityWindowTextureCache = new Map();
    this.cityAdBillboardTexture = null;
    this.futureCityBackdropTextureCache = new Map();
    this.futureCityFixedBillboardTextureCache = new Map();
    this.ossModelTemplateCache = new Map();
    this.ossModelLoadPromiseCache = new Map();
    this.staticWorldColliders = [];
    this.movableObjects = [];
    this.objEditorActive = false;
    this.objEditorSelected = null;
    this.objEditorDragging = false;
    this.objEditorDragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.objEditorDragOffset = new THREE.Vector3();
    this.objEditorRaycaster = new THREE.Raycaster();
    this.objEditorMouseNdc = new THREE.Vector2(0, 0);
    this.objEditorDragHitPoint = new THREE.Vector3();
    this.objEditorDragTargetWorld = new THREE.Vector3();
    this.securityTestState = {
      enabled: false,
      updatedAt: 0
    };
    this.securityTestSetInFlight = false;
    this.securityTestLabelGroup = null;
    this.securityTestObjectLabels = new Map();
    this.securityTestBounds = new THREE.Box3();
    this.securityTestBoundsCenter = new THREE.Vector3();
    this.securityTestBoundsSize = new THREE.Vector3();
    this.securityTestLabelRefreshClock = 0;
    this.securityTestLabelRefreshInterval = 0.24;

    this.jumpPlatforms = [];
    this.jumpPlatformMeshes = [];
    this.platformSpatialCellSize = 10;
    this.platformSpatialIndex = new Map();
    this.platformCollisionCandidateBuffer = [];
    this.platformCollisionCandidateSeen = new Set();
    this.platformCollisionMaxHalfExtent = 0.5;
    this.flyModeActive = false;
    this.platformEditorPreviewMesh = null;
    this.editorPreviewDirection = new THREE.Vector3();
    this.editorPreviewPosition = new THREE.Vector3();
    this.platformEditorBaseSize = { w: 3, h: 0.3, d: 3 };
    this.ropeEditorBaseHeight = 4;
    this.objectEditorSettingsStorageKey = OBJECT_EDITOR_SETTINGS_STORAGE_KEY;
    this.objectPositionsStorageKey = OBJECT_POSITIONS_STORAGE_KEY;
    this.objectEditorSettings = {
      platformLimit: 400,
      ropeLimit: 200,
      platformScale: 1,
      ropeScale: 1,
      updatedAt: Date.now()
    };
    this.editorSettingsSetInFlight = false;
    this.platformSaveInFlight = false;
    this.platformSavePending = false;
    this.platformSavePendingForceFlush = false;
    this.platformStateRevision = 0;
    this.platformStateDirty = false;
    this.platformStateAutosaveClock = 0;
    this.platformStateAutosaveInterval = this.mobileEnabled ? 0.36 : 0.24;
    this.ropeSaveInFlight = false;
    this.ropeSavePending = false;
    this.ropeSavePendingForceFlush = false;
    this.ropeStateRevision = 0;
    this.ropeStateDirty = false;
    this.ropeStateAutosaveClock = 0;
    this.ropeStateAutosaveInterval = this.mobileEnabled ? 0.38 : 0.26;
    this.objectStateSaveInFlight = false;
    this.objectStateSavePending = false;
    this.objectStateSavePendingForceFlush = false;
    this.objectStateRevision = 0;
    this.objectStateDirty = false;
    this.objectStateAutosaveClock = 0;
    this.objectStateAutosaveInterval = this.mobileEnabled ? 0.32 : 0.22;
    this.platformEditorSize = { ...this.platformEditorBaseSize };
    this.platformEditorDist = 4;
    this.hostCustomPaintBlockCount = HOST_CUSTOM_BLOCK_POOL_SIZE;
    this.jumpRopes = [];
    this.jumpRopeMeshes = [];
    this.climbingRope = null;
    this.editorMode = "platform";
    this.ropeEditorHeight = this.ropeEditorBaseHeight;
    this.ropeEditorPreviewMesh = null;
    this.promoOwnerKeyStorageKey = PROMO_OWNER_KEY_STORAGE_KEY;
    this.promoOwnerKey = this.getOrCreatePromoOwnerKey();
    this.promoObjects = new Map();
    this.promoObjectVisuals = new Map();
    this.promoCollisionBoxes = [];
    this.promoPlatformCandidateBuffer = [];
    this.promoSetInFlight = false;
    this.promoRemoveInFlight = false;
    this.promoPendingMedia = {
      dataUrl: "",
      kind: "none",
      name: ""
    };
    this.promoMediaRemoved = false;
    this.promoPanelMobileOpen = false;
    this.promoPanelDesktopOpen = false;
    this.promoDrawContext = null;
    this.promoDrawCanvasInitialized = false;
    this.promoDrawPointerId = null;
    this.promoDrawDrawing = false;
    this.promoDrawLastX = 0;
    this.promoDrawLastY = 0;
    this.promoDrawBackgroundColor = "#707782";
    this.promoAllowOthersDrawDraft = null;
    this.nearestPromoLinkObject = null;
    this.promoLinkPromptUpdateClock = 0;
    this.promoLinkPromptUpdateInterval = this.mobileEnabled ? 0.24 : 0.12;
    this.promoPlacementPreviewActive = false;
    this.promoPlacementPreviewMesh = null;
    this.promoPlacementPreviewCurrentScale = PROMO_DEFAULT_SCALE;
    this.promoPlacementPreviewBlockReason = "";
    this.promoPlacementPreviewTransform = null;
    this.runtimePolicyState = {
      promoMode: "",
      surfacePaintMode: "",
      persistentStateAvailable: null,
      persistentStateReason: "",
      coreMemory: null,
      surfacePaintCoreMemory: null
    };
    this.surfacePaintPolicyState = {
      bridgePanelsNz: {
        surfacePattern: "bridge_panel_*:*",
        allowOthersDraw: false,
        updatedAt: 0
      }
    };
    this.surfacePaintPolicySetInFlight = false;
    this.hostCustomBlockPlacementPreviewActive = false;
    this.hostCustomBlockPlacementPreviewMesh = null;
    this.hostCustomBlockPlacementPreviewTargetId = "";
    this.hostCustomBlockPlacementPreviewTransform = null;
    this.surfacePaintRaycaster = new THREE.Raycaster();
    this.surfacePaintAimPoint = new THREE.Vector2(0, 0);
    this.surfacePaintTarget = null;
    this.surfacePaintProbeIntervalIdle = this.mobileEnabled ? 0.6 : 0.45;
    this.surfacePaintProbeIntervalActive = this.mobileEnabled ? 0.24 : 0.16;
    this.surfacePaintProbeClock = this.surfacePaintProbeIntervalIdle;
    this.surfacePaintPromptEl = null;
    this.surfacePainterEl = null;
    this.surfacePainterPanelEl = null;
    this.surfacePainterTitleEl = null;
    this.surfacePainterCanvasEl = null;
    this.surfacePainterContext = null;
    this.surfacePainterColorInputEl = null;
    this.surfacePainterBgColorInputEl = null;
    this.surfacePainterSizeInputEl = null;
    this.surfacePainterExportBtnEl = null;
    this.surfacePainterImportBtnEl = null;
    this.surfacePainterImportInputEl = null;
    this.surfacePainterClearBtnEl = null;
    this.surfacePainterCancelBtnEl = null;
    this.surfacePainterSaveBtnEl = null;
    this.surfacePainterPromoRepositionBtnEl = null;
    this.surfacePainterPromoRemoveBtnEl = null;
    this.surfacePainterPromoScaleDownBtnEl = null;
    this.surfacePainterPromoScaleUpBtnEl = null;
    this.surfacePainterPromoShareToggleBtnEl = null;
    this.surfacePainterActionsToggleBtnEl = null;
    this.surfacePainterEraserBtnEl = null;
    this.surfacePainterFillBtnEl = null;
    this.surfacePainterOpen = false;
    this.surfacePainterActionsCollapsed = false;
    this.surfacePainterDrawing = false;
    this.surfacePainterPointerId = null;
    this.surfacePainterTouchId = null;
    this.surfacePainterLastX = 0;
    this.surfacePainterLastY = 0;
    this.surfacePainterTargetId = "";
    this.surfacePainterSaveInFlight = false;
    this.surfacePaintSendInFlight = false;
    this.surfacePaintRetryQueue = new Map();
    this.surfacePaintRetryInFlight = false;
    this.surfacePaintRetryTimer = null;
    this.surfacePaintRetryDelayMs = 1700;
    this.surfacePaintLinkWarningShown = false;
    this.socketEndpointValidationError = "";
    this.socketEndpointLinkRequired = false;
    this.surfacePainterEraserEnabled = false;
    this.surfacePainterFillModeEnabled = false;
    this.surfacePainterCanvasLoadNonce = 0;
    this.surfacePainterCanvasBgColor = "#ffffff";
    this.surfacePaintProbeWorldPosition = new THREE.Vector3();
    this.surfacePaintProbeCameraLocal = new THREE.Vector3();
    this.surfacePaintProbeForwardVector = new THREE.Vector3();
    this.plazaBillboardAdTexture = null;
    this.plazaBillboardLeftCustomTexture = null;
    this.plazaBillboardLeftVideoEl = null;
    this.plazaBillboardLeftVideoTexture = null;
    this.leftBillboardActiveVideoDataUrl = "";
    this.plazaBillboardLeftScreenMaterial = null;
    this.plazaBillboardRightScreenMaterial = null;
    this.plazaBillboardRightVideoEl = null;
    this.plazaBillboardRightVideoTexture = null;
    this.rightBillboardActiveVideoId = "";
    this.rightBillboardActiveVideoDataUrl = "";
    this.mainPortalAdState = {
      mode: "ad",
      imageDataUrl: "",
      updatedAt: Date.now()
    };
    this.portalDisplayStates = {
      portal1: this.normalizePortalDisplayState("portal1"),
      portal2: this.normalizePortalDisplayState("portal2"),
      hall: this.normalizePortalDisplayState("hall")
    };
    this.portalDisplayHandles = {
      portal1: this.createPortalDisplayHandle("portal1"),
      portal2: this.createPortalDisplayHandle("portal2"),
      hall: this.createPortalDisplayHandle("hall")
    };
    this.portalDisplaySetInFlight = {
      portal1: false,
      portal2: false,
      hall: false
    };
    this.hostPortalDisplayPendingImageDataUrls = {
      portal1: "",
      portal2: "",
      hall: ""
    };
    this.mainPortalAdSetInFlight = false;
    this.hostMainPortalAdPendingDataUrl = "";
    this.portalTopAdBaseTexture = null;
    this.portalTopAdCustomTexture = null;
    this.portalTopAdScreenMaterial = null;
    this.portalTopAdUpdateGeometry = null;
    this.portalTopAdLoadNonce = 0;
    this.leftBillboardState = {
      mode: "ad",
      imageDataUrl: "",
      videoDataUrl: "",
      updatedAt: Date.now()
    };
    this.leftBillboardSetInFlight = false;
    this.rightBillboardState = {
      mode: "ad",
      videoId: "",
      videoDataUrl: "",
      updatedAt: Date.now()
    };
    this.rightBillboardResetInFlight = false;
    this.billboardVideoSetInFlight = false;
    this.hostBillboardVideoPendingDataUrl = "";
    this.hostBillboardVideoPendingName = "";
    this.beach = null;
    this.shoreFoam = null;
    this.shoreWetBand = null;
    this.oceanBase = null;
    this.ocean = null;
    this.handView = null;
    this.handSwayAmplitude = Number(this.handContent.swayAmplitude) || 0.012;
    this.handSwayFrequency = Number(this.handContent.swayFrequency) || 0.0042;
    this.composer = null;
    this.bloomPass = null;

    this.dynamicResolution = {
      enabled: this.mobileEnabled,
      minRatio: this.mobileEnabled
        ? GAME_CONSTANTS.DYNAMIC_RESOLUTION.mobileMinRatio
        : GAME_CONSTANTS.DYNAMIC_RESOLUTION.desktopMinRatio,
      sampleTime: 0,
      frameCount: 0,
      cooldown: 0
    };
    this.graphicsPanelOpen = false;
    this.graphicsQualityStorageKey = "graphicsQuality_v1";
    this.graphicsQuality = this.loadGraphicsQualityPreference();

    this.fpsState = {
      sampleTime: 0,
      frameCount: 0,
      fps: 0
    };
    this.hudRefreshClock = 0;
    this.mobileUiRefreshClock = 0;
    this.spatialAudioMixClock = 0;
    this.spatialAudioMixInterval = 0.12;
    this.chalkPickupPromptClock = 0;
    this.chalkPickupPromptInterval = this.mobileEnabled ? 0.14 : 0.1;
    this.ropeProximityClock = 0;
    this.ropeProximityInterval = this.mobileEnabled ? 0.14 : 0.1;

    this.socket = null;
    this.socketEndpoint = null;
    this.socketLinkGateVersion = "2026-03-03-allowlist-v1";
    this.socketLinkGateMode = "player";
    this.networkConnected = false;
    this.localPlayerId = null;
    this.queryParams =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search)
        : new URLSearchParams();
    this.localPlayerName = this.formatPlayerName(this.queryParams.get("name") ?? "PLAYER");
    this.hostClaimKey = String(
      this.queryParams.get("hostKey") ?? this.queryParams.get("host_key") ?? ""
    ).trim();
    const hostQueryValue = String(
      this.queryParams.get("host") ?? this.queryParams.get("isHost") ?? ""
    )
      .trim()
      .toLowerCase();
    const hostFlagEnabled =
      hostQueryValue === "1" || hostQueryValue === "true" || hostQueryValue === "yes";
    this.isHostEntryLink = hostFlagEnabled || Boolean(this.hostClaimKey);
    this.hostEntryFixedName = HOST_LINK_FIXED_NAME;
    if (this.isHostEntryLink) {
      this.localPlayerName = this.hostEntryFixedName;
      this.socketLinkGateMode = "host";
    }
    // Auto-claim only for explicit host links (or when hostKey is present).
    this.autoHostClaimEnabled = hostFlagEnabled || Boolean(this.hostClaimKey);
    this.requestedEntryZone = this.normalizeRoomZone(
      this.queryParams.get("zone") ?? this.queryParams.get("z") ?? "",
      ""
    );
    this.returnEntryPortal = this.resolveReturnEntryPortalHint();
    this.localRoomZone = "lobby";
    this.entryZoneSwitchRequested = false;
    // Auto-fullscreen is disabled to avoid interrupting host control popups.
    this.autoFullscreenEnabled = false;
    this.fullscreenRestorePending = false;
    this.autoHostClaimLastAttemptMs = 0;
    this.roomHostId = null;
    this.isRoomHost = false;
    this.portalTargetSetInFlight = false;
    this.aZonePortalTargetSetInFlight = false;
    this.hostPortalTargetCandidate = this.resolveRequestedPortalTargetCandidate();
    this.hostPortalTargetSynced = false;
    this.hostAZonePortalTargetCandidate = "";
    this.hostAZonePortalTargetSynced = false;
    this.pendingPlayerNameSync = false;
    this.pendingAuthoritativeStateSync = false;
    this.authoritativeStateSyncInFlight = false;
    this.lastAuthoritativeStateSyncAt = 0;
    this.remotePlayers = new Map();
    this.remoteSyncClock = 0;
    this.remoteUpdateClock = 0;
    this.remoteUpdateTurningInterval = this.mobileEnabled ? 0.05 : 0.033;
    this.remoteUpdateTurningPeerThreshold = this.mobileEnabled ? 6 : 10;
    this.localInputSeq = 0;
    this.lastAckInputSeq = 0;
    this.pendingInputQueue = [];
    this.pendingJumpInput = false;
    this.lastSentInput = null;
    this.inputHeartbeatSeconds = 0.22;
    this.inputSendBaseInterval = 1 / 20;
    this.netPingTimer = null;
    this.netPingNonce = 0;
    this.netPingPending = new Map();
    this.clientRttMs = 0;
    this.clientRttSmoothedMs = 0;
    this.movementSubstepMaxMobile = 1 / 72;
    this.movementSubstepMaxDesktop = 1 / 90;
    this.movementSubstepMaxCountMobile = 10;
    this.movementSubstepMaxCountDesktop = 8;
    this.authoritativeCorrectionStepCapMobile = 0.22;
    this.authoritativeCorrectionStepCapDesktop = 0.36;
    this.remoteLabelDistanceSq =
      Math.pow(Number(RUNTIME_TUNING.REMOTE_LABEL_MAX_DISTANCE) || 42, 2);
    this.remoteMeshDistanceSq =
      Math.pow(Number(RUNTIME_TUNING.REMOTE_MESH_MAX_DISTANCE) || 145, 2);
    this.remoteFarDistanceSq =
      Math.pow(Number(RUNTIME_TUNING.REMOTE_FAR_DISTANCE) || 70, 2);
    this.remoteHardCap = Math.max(16, Number(RUNTIME_TUNING.REMOTE_HARD_CAP) || 180);
    this.baseRemoteLabelDistanceSq = this.remoteLabelDistanceSq;
    this.baseRemoteMeshDistanceSq = this.remoteMeshDistanceSq;
    this.baseRemoteFarDistanceSq = this.remoteFarDistanceSq;
    this.baseRemoteHardCap = this.remoteHardCap;
    this.isLowSpecMobile = false;
    this.elapsedSeconds = 0;
    this.localSyncMinYaw = 0.012;
    this.localSyncMinPitch = 0.012;
    this.chatBubbleLifetimeMs = 4200;
    this.chatBubbleFadeMs = 700;
    this.localChatLabel = null;
    this.localChatExpireAt = 0;
    this.loopRafCallback = () => this.loop();
    this.lastActiveMoveInputAt = 0;
    this.cloudUpdateClock = 0;
    this.cloudUpdateInterval = this.mobileEnabled ? 0.05 : 1 / 30;
    this.cloudUpdateTurningInterval = this.mobileEnabled ? 0.08 : 1 / 24;
    this.oceanUpdateClock = 0;
    this.oceanUpdateInterval = this.mobileEnabled ? 0.05 : 1 / 30;
    this.oceanUpdateTurningInterval = this.mobileEnabled ? 0.08 : 1 / 24;
    this.chatLogMaxEntries = RUNTIME_TUNING.CHAT_LOG_MAX_ENTRIES;
    this.chatTitleEl = document.getElementById("chat-title");
    this.chatLogEl = document.getElementById("chat-log");
    this.chatLiveFeedEl = document.getElementById("chat-live-feed");
    this.chatLiveLogEl = document.getElementById("chat-live-log");
    this.chatControlsEl = document.getElementById("chat-controls");
    this.chatToggleBtnEl = document.getElementById("chat-toggle");
    this.chatExpandBtnEl = document.getElementById("chat-expand");
    this.hostChatToggleBtnEl = document.getElementById("host-chat-toggle");
    this.hostControlsToggleBtnEl = document.getElementById("host-controls-toggle");
    this.chatInputEl = document.getElementById("chat-input");
    this.chatSendBtnEl = document.getElementById("chat-send");
    this.toolHotbarEl = document.getElementById("tool-hotbar");
    this.chalkColorsEl = document.getElementById("chalk-colors");
    this.chalkColorButtons = [];
    this.toolButtons = [];
    this.mobileUiEl = document.getElementById("mobile-ui");
    this.mobileActionsEl = document.getElementById("mobile-actions");
    this.mobileMovePadEl = document.getElementById("mobile-move-pad");
    this.mobileMoveStickEl = document.getElementById("mobile-move-stick");
    this.mobilePromoPlaceBtnEl = document.getElementById("mobile-promo-place");
    this.mobileJumpBtnEl = document.getElementById("mobile-jump");
    this.mobileSprintBtnEl = document.getElementById("mobile-sprint");
    this.mobileChatBtnEl = document.getElementById("mobile-chat");
    this.mobilePaintBtnEl = document.getElementById("mobile-paint");
    this.mobilePromoScaleWrapEl = document.getElementById("mobile-promo-scale-wrap");
    this.mobilePromoScaleInputEl = document.getElementById("mobile-promo-scale");
    this.mobilePromoScaleValueEl = document.getElementById("mobile-promo-scale-value");
    this.mobileRotateOverlayEl = document.getElementById("mobile-rotate-overlay");
    this.fullscreenToggleBtnEl = document.getElementById("fullscreen-toggle");
    this.graphicsToggleBtnEl = document.getElementById("graphics-toggle");
    this.graphicsControlsEl = document.getElementById("graphics-controls");
    this.graphicsQualitySelectEl = document.getElementById("graphics-quality-select");
    this.playerRosterEl = document.getElementById("player-roster");
    this.playerRosterCountEl = document.getElementById("player-roster-count");
    this.playerRosterListEl = document.getElementById("player-roster-list");
    this.hostControlsEl = document.getElementById("host-controls");
    this.hostOpenPortalBtnEl = document.getElementById("host-open-portal");
    this.hostScheduleControlsEl = document.getElementById("host-schedule-controls");
    this.hostDelayButtons = Array.from(document.querySelectorAll(".host-delay-btn[data-delay-min]"));
    this.hostDelayMinutesInputEl = document.getElementById("host-delay-minutes");
    this.hostDelayUnitSelectEl = document.getElementById("host-delay-unit");
    this.hostApplyDelayBtnEl = document.getElementById("host-apply-delay");
    this.hostPortalTargetInputEl = document.getElementById("host-portal-target");
    this.hostPortalTargetApplyBtnEl = document.getElementById("host-portal-target-apply");
    this.hostAZonePortalTargetInputEl = document.getElementById("host-a-zone-portal-target");
    this.hostAZonePortalTargetApplyBtnEl = document.getElementById("host-a-zone-portal-target-apply");
    this.hostPortal1NameInputEl = document.getElementById("host-portal-1-name");
    this.hostPortal1ModeSelectEl = document.getElementById("host-portal-1-mode");
    this.hostPortal1Line2InputEl = document.getElementById("host-portal-1-line2");
    this.hostPortal1Line3InputEl = document.getElementById("host-portal-1-line3");
    this.hostPortal1ImageFileInputEl = document.getElementById("host-portal-1-image-file");
    this.hostPortal1ApplyBtnEl = document.getElementById("host-portal-1-apply");
    this.hostPortal1ResetBtnEl = document.getElementById("host-portal-1-reset");
    this.hostPortal2NameInputEl = document.getElementById("host-portal-2-name");
    this.hostPortal2ImageFileInputEl = document.getElementById("host-portal-2-image-file");
    this.hostPortal2ApplyBtnEl = document.getElementById("host-portal-2-apply");
    this.hostPortal2ResetBtnEl = document.getElementById("host-portal-2-reset");
    this.hostMainPortalAdFileInputEl = document.getElementById("host-main-portal-ad-file");
    this.hostMainPortalAdApplyBtnEl = document.getElementById("host-main-portal-ad-apply");
    this.hostMainPortalAdResetBtnEl = document.getElementById("host-main-portal-ad-reset");
    this.hostHallPortalModeSelectEl = document.getElementById("host-hall-portal-mode");
    this.hostHallPortalTitleInputEl = document.getElementById("host-hall-portal-title");
    this.hostHallPortalLine2InputEl = document.getElementById("host-hall-portal-line2");
    this.hostHallPortalLine3InputEl = document.getElementById("host-hall-portal-line3");
    this.hostHallPortalApplyBtnEl = document.getElementById("host-hall-portal-apply");
    this.hostHallPortalResetBtnEl = document.getElementById("host-hall-portal-reset");
    this.hostLeftImageFileInputEl = document.getElementById("host-left-image-file");
    this.hostResetLeftImageBtnEl = document.getElementById("host-left-image-reset");
    this.hostMusicFileInputEl = document.getElementById("host-music-file");
    this.hostMusicPlayBtnEl = document.getElementById("host-music-play");
    this.hostMusicStopBtnEl = document.getElementById("host-music-stop");
    this.hostRightVideoSelectEl = document.getElementById("host-right-video");
    this.hostRightVideoQuickButtons = Array.from(
      document.querySelectorAll(".host-video-quick-btn[data-video-id]")
    );
    this.hostPlayRightVideoBtnEl = document.getElementById("host-right-play");
    this.hostResetRightVideoBtnEl = document.getElementById("host-right-reset");
    this.hostBillboardVideoFileInputEl = document.getElementById("host-billboard-video-file");
    this.hostBillboardVideoPlayLeftBtnEl = document.getElementById("host-billboard-video-play-left");
    this.hostBillboardVideoPlayRightBtnEl = document.getElementById("host-billboard-video-play-right");
    this.hostBillboardVideoPlayBothBtnEl = document.getElementById("host-billboard-video-play-both");
    this.hostSecurityTestToggleBtnEl = document.getElementById("host-security-test-toggle");
    this.hostMusicSetInFlight = false;
    this.playerRosterVisible = false;
    this.roomPlayerSnapshot = [];
    this.hostControlsOpen = true;
    this.portalForceOpenInFlight = false;
    this.portalCloseInFlight = false;
    this.portalScheduleSetInFlight = false;
    this.portalSchedule = {
      mode: "idle",
      startAtMs: 0,
      openUntilMs: 0,
      remainingSec: 0,
      finalCountdownSeconds: 10,
      updatedAt: Date.now()
    };
    this.authoritativeSyncGraceUntil = 0;
    this.chatOpen = false;
    this.lastLocalChatEcho = "";
    this.lastLocalChatEchoAt = 0;
    this.chatLiveOpen = true;
    this.chatLiveMaxEntries = Math.max(6, Math.min(18, this.chatLogMaxEntries));
    this.chatLiveLineLifetimeMs = 15_000;
    this.chatLiveLineFadeMs = 650;
    this.chatMessageSeq = 0;
    this.lastChatSendAt = 0;
    this.chatSendMinIntervalMs = 700;
    this.chatSendWindowMs = 10_000;
    this.chatSendMaxPerWindow = 8;
    this.chatSendWindowStartAt = 0;
    this.chatSendWindowCount = 0;
    this.chatSameTextStreakMax = 2;
    this.chatLastNormalizedText = "";
    this.chatSameTextStreak = 0;
    this.chatRateLimitNoticeCooldownMs = 1_800;
    this.lastChatRateLimitNoticeAt = 0;
    this.chatSeenMessageIds = new Map();
    this.chatSeenMessageIdTtlMs = 2 * 60 * 1000;
    this.chatHistoryRequestMinIntervalMs = 600;
    this.lastChatHistoryRequestAt = 0;
    this.chatHistoryLoaded = false;
    this.chatHistoryExpanded = false;
    this.toolUiEl = document.getElementById("tool-ui");
    this.chatUiEl = document.getElementById("chat-ui");
    this.hubFlowUiEl = document.getElementById("hub-flow-ui");
    this.hubPhaseTitleEl = document.getElementById("hub-phase-title");
    this.hubPhaseSubtitleEl = document.getElementById("hub-phase-subtitle");
    this.nicknameGateEl = document.getElementById("nickname-gate");
    this.nicknameFormEl = document.getElementById("nickname-form");
    this.nicknameInputEl = document.getElementById("nickname-input");
    this.nicknameErrorEl = document.getElementById("nickname-error");
    this.npcChoiceGateEl = document.getElementById("npc-choice-gate");
    this.npcChoiceNicknameBtnEl = document.getElementById("npc-choice-nickname");
    this.npcChoiceGuideBtnEl = document.getElementById("npc-choice-guide");
    this.npcChoicePlayBtnEl = document.getElementById("npc-choice-play");
    this.introVideoOverlayEl = document.getElementById("intro-video-overlay");
    this.introVideoEl = document.getElementById("intro-video");
    this.portalTransitionEl = document.getElementById("portal-transition");
    this.portalTransitionTextEl = document.getElementById("portal-transition-text");
    this.hallPortalCountdownEl = document.getElementById("hall-portal-countdown");
    this.hallPortalCountdownLastText = "";
    this.boundaryWarningEl = document.getElementById("boundary-warning");
    this.surfacePaintPromptEl = document.getElementById("surface-paint-prompt");
    this.surfacePainterEl = document.getElementById("surface-painter");
    this.surfacePainterPanelEl = document.getElementById("surface-painter-panel");
    this.surfacePainterTitleEl = document.getElementById("surface-painter-title");
    this.surfacePainterCanvasEl = document.getElementById("surface-painter-canvas");
    this.surfacePainterColorInputEl = document.getElementById("surface-painter-color");
    this.surfacePainterBgColorInputEl = document.getElementById("surface-painter-bg");
    this.surfacePainterSizeInputEl = document.getElementById("surface-painter-size");
    this.surfacePainterExportBtnEl = document.getElementById("surface-painter-export");
    this.surfacePainterImportBtnEl = document.getElementById("surface-painter-import");
    this.surfacePainterImportInputEl = document.getElementById("surface-painter-import-file");
    this.surfacePainterClearBtnEl = document.getElementById("surface-painter-clear");
    this.surfacePainterCancelBtnEl = document.getElementById("surface-painter-cancel");
    this.surfacePainterSaveBtnEl = document.getElementById("surface-painter-save");
    this.surfacePainterPromoRepositionBtnEl = document.getElementById("surface-painter-promo-reposition");
    this.surfacePainterPromoRemoveBtnEl = document.getElementById("surface-painter-promo-remove");
    this.surfacePainterPromoScaleDownBtnEl = document.getElementById("surface-painter-promo-scale-down");
    this.surfacePainterPromoScaleUpBtnEl = document.getElementById("surface-painter-promo-scale-up");
    this.surfacePainterPromoShareToggleBtnEl = document.getElementById("surface-painter-promo-share-toggle");
    this.surfacePainterActionsToggleBtnEl = document.getElementById("surface-painter-actions-toggle");
    this.surfacePainterEraserBtnEl = document.getElementById("surface-painter-eraser");
    this.surfacePainterFillBtnEl = document.getElementById("surface-painter-fill");
    this.surfacePainterContext = this.surfacePainterCanvasEl?.getContext?.("2d") ?? null;
    this.promoPanelEl = document.getElementById("promo-panel");
    this.promoPanelCloseBtnEl = document.getElementById("promo-panel-close");
    this.promoScaleInputEl = document.getElementById("promo-scale");
    this.promoScaleValueEl = document.getElementById("promo-scale-value");
    this.promoTypeSelectEl = document.getElementById("promo-shape");
    this.promoLinkInputEl = document.getElementById("promo-link-url");
    this.promoAllowOthersDrawRowEl = document.getElementById("promo-allow-others-draw-row");
    this.promoAllowOthersDrawEl = document.getElementById("promo-allow-others-draw");
    this.promoAllowOthersDrawStatusEl = document.getElementById("promo-allow-others-draw-status");
    this.promoDrawCanvasEl = document.getElementById("promo-draw-canvas");
    this.promoDrawColorInputEl = document.getElementById("promo-draw-color");
    this.promoDrawBgInputEl = document.getElementById("promo-draw-bg");
    this.promoDrawBgLabelEl = document.getElementById("promo-draw-bg-label");
    this.promoDrawSizeInputEl = document.getElementById("promo-draw-size");
    this.promoDrawClearBtnEl = document.getElementById("promo-draw-clear-btn");
    this.promoDrawApplyBtnEl = document.getElementById("promo-draw-apply-btn");
    this.promoDrawHelpEl = document.getElementById("promo-draw-help");
    this.promoMediaPickBtnEl = document.getElementById("promo-media-pick-btn");
    this.promoMediaFolderBtnEl = document.getElementById("promo-media-folder-btn");
    this.promoMediaClearBtnEl = document.getElementById("promo-media-clear-btn");
    this.promoMediaPreviewEl = document.getElementById("promo-media-preview");
    this.promoMediaPreviewImageEl = document.getElementById("promo-media-preview-image");
    this.promoMediaPreviewVideoEl = document.getElementById("promo-media-preview-video");
    this.promoMediaFileInputEl = document.getElementById("promo-media-file");
    this.promoMediaFolderInputEl = document.getElementById("promo-media-folder");
    this.promoMediaNameEl = document.getElementById("promo-media-name");
    this.promoMediaHelpEl = document.getElementById("promo-media-help");
    this.promoPlaceBtnEl = document.getElementById("promo-place-btn");
    this.promoSaveBtnEl = document.getElementById("promo-save-btn");
    this.promoRemoveBtnEl = document.getElementById("promo-remove-btn");
    this.promoStatusEl = document.getElementById("promo-panel-status");
    this.promoLinkPromptEl = document.getElementById("promo-link-prompt");
    this.promoLinkPromptTextEl = document.getElementById("promo-link-prompt-text");
    this.promoOpenLinkBtnEl = document.getElementById("promo-open-link-btn");

    this.platformEditorEl = document.getElementById("platform-editor");
    this.platformEditorSaveBtnEl = document.getElementById("platform-editor-save");
    this.platformEditorDeleteOneBtnEl = document.getElementById("platform-editor-delete-one");
    this.platformEditorClearBtnEl = document.getElementById("platform-editor-clear");
    this.platformEditorCountEl = document.getElementById("platform-editor-count");
    this.ropeEditorCountEl = document.getElementById("rope-editor-count");
    this.editorPlatformLimitInputEl = document.getElementById("editor-platform-limit");
    this.editorRopeLimitInputEl = document.getElementById("editor-rope-limit");
    this.editorPlatformScaleInputEl = document.getElementById("editor-platform-scale");
    this.editorRopeScaleInputEl = document.getElementById("editor-rope-scale");
    this.editorPlatformScaleValueEl = document.getElementById("editor-platform-scale-value");
    this.editorRopeScaleValueEl = document.getElementById("editor-rope-scale-value");
    this.editorSettingsApplyBtnEl = document.getElementById("editor-settings-apply");
    this.ropeClimbPromptEl = document.getElementById("rope-climb-prompt");
    this.editorModePlatformBtnEl = document.getElementById("editor-mode-platform");
    this.editorModeRopeBtnEl = document.getElementById("editor-mode-rope");
    this.editorModeObjBtnEl = document.getElementById("editor-mode-obj");
    this.hostGrayObjectWidthInputEl = document.getElementById("host-gray-object-width");
    this.hostGrayObjectHeightInputEl = document.getElementById("host-gray-object-height");
    this.hostGrayObjectDepthInputEl = document.getElementById("host-gray-object-depth");
    this.hostGrayObjectAddBtnEl = document.getElementById("host-gray-object-add");
    this.hostGrayObjectDeleteBtnEl = document.getElementById("host-gray-object-delete");
    this.objEditorBarEl = document.getElementById("obj-editor-bar");
    this.objEditorInfoEl = document.getElementById("obj-editor-info");

    const hubFlowConfig = this.worldContent?.hubFlow ?? {};
    const bridgeConfig = hubFlowConfig?.bridge ?? {};
    const cityConfig = hubFlowConfig?.city ?? {};
    const portalConfig = hubFlowConfig?.portal ?? {};
    this.hubFlowEnabled = Boolean(hubFlowConfig?.enabled);
    this.flowStage = this.hubFlowEnabled ? "boot_intro" : "city_live";
    this.bootIntroPending = this.hubFlowEnabled;
    this.bootIntroVideoPlaying = false;
    this.entryMusicAudioEl = null;
    this.entryMusicStarted = false;
    this.entryMusicUnlockHandler = null;
    this.entryMusicBaseVolume = 0.62;
    this.sharedMusicAudioEl = null;
    this.sharedMusicUnlockHandler = null;
    this.sharedMusicBaseVolume = 0.72;
    this.sharedMusicState = {
      mode: "idle",
      dataUrl: "",
      name: "",
      startAtMs: 0,
      updatedAt: Date.now()
    };
    this.entryMusicMinDistance = 8;
    this.entryMusicMaxDistance = 260;
    this.entryMusicRolloff = 1.15;
    this.entryMusicSourcePosition = new THREE.Vector3(0, 4.2, 16);
    this.rightBillboardBaseVolume = 0.9;
    this.rightBillboardMinDistance = 5;
    this.rightBillboardMaxDistance = 180;
    this.rightBillboardRolloff = 1.35;
    this.rightBillboardSourcePosition = new THREE.Vector3(0, 7, 18.8);
    this.flowClock = 0;
    this.hubIntroDuration = parseSeconds(hubFlowConfig?.introSeconds, 4.8, 0.8);
    this.bridgeApproachSpawn = parseVec3(
      bridgeConfig?.approachSpawn,
      [0, GAME_CONSTANTS.PLAYER_HEIGHT, -98]
    );
    this.bridgeSpawn = parseVec3(
      bridgeConfig?.spawn,
      [0, GAME_CONSTANTS.PLAYER_HEIGHT, -86]
    );
    this.bridgeNpcPosition = parseVec3(bridgeConfig?.npcPosition, [0, 0, -82]);
    this.bridgeNpcTriggerRadius = Math.max(2.5, Number(bridgeConfig?.npcTriggerRadius) || 5);
    this.bridgeMirrorPosition = parseVec3(bridgeConfig?.mirrorPosition, [0, 1.72, -76]);
    this.bridgeMirrorLookSeconds = parseSeconds(bridgeConfig?.mirrorLookSeconds, 1.5, 0.4);
    this.mirrorLookClock = 0;
    this.bridgeNpcPlayApproved = false;
    this.bridgeNpcPromptCooldownUntil = 0;
    this.bridgeNpcChoiceCooldownUntil = 0;
    this.bridgeCityEntry = parseVec3(
      bridgeConfig?.cityEntry,
      [0, GAME_CONSTANTS.PLAYER_HEIGHT, -18]
    );
    this.bridgeBoundaryRadius = Math.max(1.4, Number(bridgeConfig?.boundaryRadius) || 3.2);
    this.citySpawn = parseVec3(
      cityConfig?.spawn,
      [0, GAME_CONSTANTS.PLAYER_HEIGHT, -8]
    );
    this.cityLookTarget = parseVec3(
      cityConfig?.lookTarget,
      [this.citySpawn.x, GAME_CONSTANTS.PLAYER_HEIGHT, this.citySpawn.z + 52]
    );
    this.entryMusicSourcePosition.set(this.citySpawn.x, 4.2, this.citySpawn.z + 18);
    this.bridgeWidth = Math.max(4, Number(bridgeConfig?.width) || 10);
    this.bridgeGateHalfWidth = Math.max(1.5, this.bridgeWidth * 0.28);
    this.bridgeGateTriggerDepth = Math.max(0.5, Number(bridgeConfig?.gateTriggerDepth) || 0.8);
    this.bridgeDeckColor = bridgeConfig?.deckColor ?? 0x4f5660;
    this.bridgeRailColor = bridgeConfig?.railColor ?? 0x8fa2b8;
    this.portalFloorPosition = parseVec3(portalConfig?.position, [0, 0.08, 22]);
    this.portalRadius = Math.max(2.2, Number(portalConfig?.radius) || 4.4);
    const portalYawDegreesRaw = Number(portalConfig?.yawDegrees);
    const portalYawDegrees = Number.isFinite(portalYawDegreesRaw) ? portalYawDegreesRaw : 0;
    this.portalYawRadians = (portalYawDegrees * Math.PI) / 180;
    this.shrinePortalPosition = parseVec3(
      bridgeConfig?.shrinePortalPosition,
      [this.bridgeMirrorPosition.x, 0.08, this.bridgeMirrorPosition.z + 4.8]
    );
    this.portalCooldownSeconds = parseSeconds(portalConfig?.cooldownSeconds, 60, 8);
    this.portalWarningSeconds = parseSeconds(portalConfig?.warningSeconds, 16, 4);
    this.portalOpenSeconds = parseSeconds(portalConfig?.openSeconds, 24, 5);
    this.portalTargetUrl = this.resolvePortalTargetUrl(portalConfig?.targetUrl ?? "");
    this.aZonePortalTargetUrl = this.normalizePortalTargetUrl(
      portalConfig?.aZoneTargetUrl ?? A_ZONE_FIXED_PORTAL_TARGET_URL,
      A_ZONE_FIXED_PORTAL_TARGET_URL
    );
    this.hallPortalTargetUrl = this.normalizePortalTargetUrl(
      portalConfig?.hallTargetUrl ?? HALL_FIXED_PORTAL_TARGET_URL,
      this.normalizePortalTargetUrl(HALL_FIXED_PORTAL_TARGET_URL, "")
    );
    this.hostAZonePortalTargetCandidate = this.aZonePortalTargetUrl;
    this.hostAZonePortalTargetSynced = true;
    this.portalPrewarmLastAt = new Map();
    this.portalPrewarmMinIntervalMs = 2 * 60 * 1000;
    this.portalPrewarmKickTimer = null;
    this.aZonePortalFloorPosition = new THREE.Vector3(-60, 0.08, 0);
    this.aZonePortalRadius = Math.max(2.2, this.portalRadius * 0.88);
    this.hallPortalFloorPosition = parseVec3(portalConfig?.hallPosition, [0, 0.08, 22]);
    this.hallPortalRadius = Math.max(2.2, Number(portalConfig?.hallRadius) || this.portalRadius * 0.92);
    this.portalPhase = this.hubFlowEnabled ? "open" : "idle";
    this.portalPhaseClock = 0;
    this.portalTransitioning = false;
    this.portalZoneSwitchInFlight = false;
    this.portalTransferReturnStage = null;
    this.portalTransferBlockedUntil = 0;
    this.portalPulseClock = 0;
    this.portalBillboardUpdateClock = 0;
    this.portalBillboardUpdateInterval = 0.4;
    this.waterDeltaSmoothed = 1 / 60;
    this.boundaryReturnDelaySeconds = 1.8;
    this.boundaryReturnNoticeSeconds = 1.2;
    this.boundaryHardLimitPadding = 18;
    this.boundaryOutClock = 0;
    this.boundaryNoticeClock = 0;
    this.lastSafePosition = new THREE.Vector3(0, GAME_CONSTANTS.PLAYER_HEIGHT, 0);
    this.lastLookInputAtMs = 0;
    this.dynamicResolutionInputQuietMs = this.mobileEnabled ? 180 : 140;
    this.hubFlowGroup = null;
    this.portalGroup = null;
    this.portalRing = null;
    this.portalCore = null;
    this.portalCoreGlow = null;
    this.portalReplicaGroup = null;
    this.portalReplicaRing = null;
    this.portalReplicaCore = null;
    this.portalReplicaCoreGlow = null;
    this.portalBillboardGroup = null;
    this.portalTopAdBaseTexture = null;
    this.portalTopAdScreenMaterial = null;
    this.portalTopAdUpdateGeometry = null;
    this.portalTopAdLoadNonce = 0;
    this.spawnPortalVeilGroup = null;
    this.spawnPortalVeilWorldZ = this.bridgeNpcPosition.z;
    this.spawnPortalVeilMaterial = null;
    this.spawnPortalVeilBaseTexture = null;
    this.spawnPortalVeilTexture = null;
    this.spawnPortalVeilVideoEl = null;
    this.spawnPortalVeilVideoTexture = null;
    this.spawnPortalVeilRevealStarted = false;
    this.aZonePortalGroup = null;
    this.aZonePortalRing = null;
    this.aZonePortalCore = null;
    this.aZonePortalCoreGlow = null;
    this.aZonePortalBillboardGroup = null;
    this.hallPortalGroup = null;
    this.hallPortalRing = null;
    this.hallPortalCore = null;
    this.hallPortalCoreGlow = null;
    this.hallPortalBillboardGroup = null;
    this.hallVenueGroup = null;
    this.portalOxAnchorEntry = null;
    this.portalFpsAnchorEntry = null;
    this.portalHallAnchorEntry = null;
    this.portalAnchorSyncTemp = new THREE.Vector3();
    this.portalBillboardCanvas = null;
    this.portalBillboardContext = null;
    this.portalBillboardTexture = null;
    this.portalBillboardPalette = {
      bgFrom: "rgba(27, 11, 29, 0.56)",
      bgTo: "rgba(46, 14, 45, 0.64)",
      border: "rgba(255, 148, 226, 0.82)",
      stripe: "rgba(208, 102, 178, 0.16)",
      shadow: "rgba(255, 156, 228, 0.72)",
      line1: "#ffe7f8",
      line2: "#ffc7ee",
      line3: "#f6b8e7"
    };
    this.portalBillboardCache = {
      line1: "",
      line2: "",
      line3: ""
    };
    this.npcGuideGroup = null;
    this.npcTemplePortalCore = null;
    this.npcTemplePortalGlow = null;
    this.npcGreetingScreen = null;
    this.npcGreetingVideoEl = null;
    this.npcGreetingVideoTexture = null;
    this.npcGreetingPlayed = false;
    this.npcGreetingMidpointTriggered = false;
    this.npcWelcomeBubbleLabel = null;
    this.mirrorGateGroup = null;
    this.mirrorGatePanel = null;
    this.bridgeBoundaryMarker = null;
    this.bridgeBoundaryRing = null;
    this.bridgeBoundaryHalo = null;
    this.bridgeBoundaryBeam = null;
    this.bridgeBoundaryDingClock = 0;
    this.bridgeBoundaryDingTriggered = false;
    this.hubFlowUiBound = false;
    this.cityIntroStart = new THREE.Vector3();
    this.cityIntroEnd = new THREE.Vector3();
    this.tempVecA = new THREE.Vector3();
    this.tempVecB = new THREE.Vector3();
    this.flowHeadlineCache = {
      title: "",
      subtitle: ""
    };
    this.mobileMovePointerId = null;
    this.mobileMoveVector = new THREE.Vector2(0, 0);
    this.mobileMoveStickRadius = 34;
    this.mobileLookTouchId = null;
    this.mobileLookLastX = 0;
    this.mobileLookLastY = 0;
    this.pendingMouseLookDeltaX = 0;
    this.pendingMouseLookDeltaY = 0;
    this.mobileJumpQueued = false;
    this.mobileSprintHeld = false;

    this.applyDeviceRuntimeProfile();

    this._initialized = false;
  }

  init() {
    if (this._initialized) {
      return;
    }
    if (!this.mount) {
      throw new Error("Game mount element not found (#app).");
    }

    this._initialized = true;
    this.mount.appendChild(this.renderer.domElement);
    this.scene.add(this.camera);
    this.syncBodyUiModeClass();
    this.resolveUiElements();
    this.updateFullscreenToggleState();
    this.setupToolState();
    this.setChatOpen(false);
    this.setChatLiveOpen(true);
    // Keep gates closed on initial boot until an explicit interaction opens them.
    this.hideNicknameGate();
    this.hideNpcChoiceGate();
    this.syncGraphicsControlsUi();
    this.loadSavedObjectEditorSettings();
    this.applyObjectEditorSettings(this.objectEditorSettings, { persistLocal: false, syncUi: true });
    this.syncPromoPanelUi();

    this.setupWorld();
    this.setupHubFlowWorld();
    this.setupPostProcessing();
    this.bindEvents();
    this.bindHubFlowUiEvents();
    this.connectNetwork();
    this.schedulePortalPrewarm({ immediate: false });

    this.camera.rotation.order = "YXZ";
    this.applyInitialFlowSpawn();
    this.camera.position.copy(this.playerPosition);
    this.lastSafePosition.copy(this.playerPosition);
    this.syncGameplayUiForFlow();
    this.syncMobileUiState();

    this.hud.update({
      status: this.getStatusText(),
      players: 1,
      x: this.playerPosition.x,
      z: this.playerPosition.z,
      fps: 0
    });
    this.updateRoomPlayerSnapshot([]);
    this.loadSavedPlatforms();
    this.loadSavedRopes();
    this.loadSavedObjectPositions();
    this.refreshSecurityTestObjectLabels();

    this.loop();
  }

  setupWorld() {
    const world = this.worldContent;
    const lights = world.lights;
    const sunConfig = lights.sun;

    const hemi = new THREE.HemisphereLight(
      lights.hemisphere.skyColor,
      lights.hemisphere.groundColor,
      lights.hemisphere.intensity
    );
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(sunConfig.color, sunConfig.intensity);
    sun.position.fromArray(sunConfig.position);
    sun.castShadow = !this.mobileEnabled;
    sun.shadow.mapSize.set(
      this.mobileEnabled ? sunConfig.shadowMobileSize : sunConfig.shadowDesktopSize,
      this.mobileEnabled ? sunConfig.shadowMobileSize : sunConfig.shadowDesktopSize
    );
    sun.shadow.camera.left = -sunConfig.shadowBounds;
    sun.shadow.camera.right = sunConfig.shadowBounds;
    sun.shadow.camera.top = sunConfig.shadowBounds;
    sun.shadow.camera.bottom = -sunConfig.shadowBounds;
    sun.shadow.camera.near = sunConfig.shadowNear;
    sun.shadow.camera.far = sunConfig.shadowFar;
    sun.shadow.bias = sunConfig.shadowBias;
    sun.shadow.normalBias = sunConfig.shadowNormalBias;
    this.scene.add(sun);
    this.sunLight = sun;

    const fill = new THREE.DirectionalLight(lights.fill.color, lights.fill.intensity);
    fill.position.fromArray(lights.fill.position);
    this.scene.add(fill);

    this.setupSky(sun.position.clone().normalize());
    this.setupCloudLayer();

    const maxAnisotropy = this.renderer.capabilities.getMaxAnisotropy();
    const anisotropy = this.mobileEnabled ? Math.min(2, maxAnisotropy) : maxAnisotropy;
    const ground = world.ground;
    const configureGroundTexture = (texture, colorSpace = null) => {
      if (!texture) {
        return null;
      }
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(ground.repeatX, ground.repeatY);
      if (colorSpace) {
        texture.colorSpace = colorSpace;
      }
      texture.anisotropy = anisotropy;
      return texture;
    };

    const loadGroundTexture = (url, colorSpace = null) => {
      if (!url) {
        return null;
      }
      return configureGroundTexture(this.textureLoader.load(url), colorSpace);
    };

    const groundMap = loadGroundTexture(ground.textureUrl, THREE.SRGBColorSpace);
    const groundNormalMap = loadGroundTexture(ground.normalTextureUrl);
    const groundRoughnessMap = loadGroundTexture(ground.roughnessTextureUrl);
    const groundAoMap = loadGroundTexture(ground.aoTextureUrl);

    const groundGeometry = new THREE.PlaneGeometry(ground.size, ground.size, 1, 1);
    const uv = groundGeometry.getAttribute("uv");
    if (uv) {
      groundGeometry.setAttribute("uv2", new THREE.Float32BufferAttribute(Array.from(uv.array), 2));
    }

    const normalScale = Array.isArray(ground.normalScale)
      ? new THREE.Vector2(
          Number(ground.normalScale[0]) || 1,
          Number(ground.normalScale[1]) || Number(ground.normalScale[0]) || 1
        )
      : new THREE.Vector2(1, 1);
    this.ground = new THREE.Mesh(
      groundGeometry,
      new THREE.MeshStandardMaterial({
        color: ground.color,
        map: groundMap ?? null,
        normalMap: groundNormalMap ?? null,
        normalScale,
        roughnessMap: groundRoughnessMap ?? null,
        aoMap: groundAoMap ?? null,
        aoMapIntensity: Number(ground.aoIntensity) || 0.5,
        roughness: ground.roughness,
        metalness: ground.metalness,
        side: THREE.FrontSide,
        emissive: ground.emissive,
        emissiveIntensity: ground.emissiveIntensity
      })
    );
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);

    this.groundUnderside = new THREE.Mesh(
      groundGeometry.clone(),
      new THREE.MeshStandardMaterial({
        color: ground.undersideColor ?? ground.color,
        map: groundMap ?? null,
        roughness: 1,
        metalness: 0,
        side: THREE.BackSide,
        emissive: ground.undersideEmissive ?? ground.emissive,
        emissiveIntensity:
          Number(ground.undersideEmissiveIntensity) || Math.max(0.2, Number(ground.emissiveIntensity))
      })
    );
    this.groundUnderside.rotation.x = -Math.PI / 2;
    this.groundUnderside.position.y = Number(ground.undersideOffsetY) || -0.1;
    this.groundUnderside.receiveShadow = false;
    this.scene.add(this.groundUnderside);

    this.setupBoundaryWalls(world.boundary);
    this.setupChalkLayer(world.chalk);
    this.setupBeachLayer(world.beach, world.ocean);
    this.setupOceanLayer(world.ocean);

    const marker = world.originMarker;
    if (marker && marker.enabled !== false) {
      const originMarker = new THREE.Mesh(
        new THREE.CylinderGeometry(
          marker.radiusTop,
          marker.radiusBottom,
          marker.height,
          marker.radialSegments
        ),
        new THREE.MeshStandardMaterial({
          color: marker.material.color,
          roughness: marker.material.roughness,
          metalness: marker.material.metalness,
          emissive: marker.material.emissive,
          emissiveIntensity: marker.material.emissiveIntensity
        })
      );
      originMarker.position.fromArray(marker.position);
      originMarker.castShadow = true;
      this.scene.add(originMarker);
    }
  }

  clearHubFlowWorld() {
    this.showDefaultBillboardAdOnRight();
    this.plazaBillboardAdTexture = null;
    this.plazaBillboardLeftScreenMaterial = null;
    this.plazaBillboardRightScreenMaterial = null;
    if (this.futureCityBackdropTextureCache.size > 0) {
      for (const texture of this.futureCityBackdropTextureCache.values()) {
        texture?.dispose?.();
      }
      this.futureCityBackdropTextureCache.clear();
    }
    if (this.futureCityFixedBillboardTextureCache.size > 0) {
      for (const texture of this.futureCityFixedBillboardTextureCache.values()) {
        texture?.dispose?.();
      }
      this.futureCityFixedBillboardTextureCache.clear();
    }
    this.staticWorldColliders.length = 0;
    this.movableObjects.length = 0;
    this.clearSecurityTestObjectLabels();
    this.objEditorDragging = false;
    this.clearObjEditorSelection();

    if (this.npcGreetingVideoEl) {
      this.npcGreetingVideoEl.onended = null;
      this.npcGreetingVideoEl.onerror = null;
      this.npcGreetingVideoEl.ontimeupdate = null;
      this.npcGreetingVideoEl.pause();
      this.npcGreetingVideoEl.removeAttribute("src");
      this.npcGreetingVideoEl.load();
      this.npcGreetingVideoEl = null;
    }
    if (this.npcGreetingVideoTexture) {
      this.npcGreetingVideoTexture.dispose();
      this.npcGreetingVideoTexture = null;
    }
    this.npcGreetingScreen = null;
    this.npcGreetingPlayed = false;
    this.npcGreetingMidpointTriggered = false;
    if (this.npcWelcomeBubbleLabel) {
      this.disposeTextLabel(this.npcWelcomeBubbleLabel);
      this.npcWelcomeBubbleLabel = null;
    }
    if (this.portalBillboardTexture) {
      this.portalBillboardTexture.dispose?.();
      this.portalBillboardTexture = null;
    }
    if (this.portalTopAdCustomTexture) {
      this.portalTopAdCustomTexture.dispose?.();
      this.portalTopAdCustomTexture = null;
    }
    this.disposePortalDisplayCustomTexture("portal1");
    this.disposePortalDisplayCustomTexture("portal2");
    this.disposePortalDisplayCustomTexture("hall");
    const spawnPortalVeilTexturesToDispose = new Set();
    if (this.spawnPortalVeilTexture) {
      spawnPortalVeilTexturesToDispose.add(this.spawnPortalVeilTexture);
    }
    if (this.spawnPortalVeilVideoTexture) {
      spawnPortalVeilTexturesToDispose.add(this.spawnPortalVeilVideoTexture);
    }
    if (this.spawnPortalVeilBaseTexture) {
      spawnPortalVeilTexturesToDispose.add(this.spawnPortalVeilBaseTexture);
    }
    if (this.spawnPortalVeilVideoEl) {
      this.spawnPortalVeilVideoEl.onended = null;
      this.spawnPortalVeilVideoEl.onerror = null;
      this.spawnPortalVeilVideoEl.pause();
      this.spawnPortalVeilVideoEl.removeAttribute("src");
      this.spawnPortalVeilVideoEl.load();
      this.spawnPortalVeilVideoEl = null;
    }
    for (const texture of spawnPortalVeilTexturesToDispose) {
      texture?.dispose?.();
    }
    this.spawnPortalVeilTexture = null;
    this.spawnPortalVeilVideoTexture = null;
    this.spawnPortalVeilBaseTexture = null;
    this.portalBillboardCanvas = null;
    this.portalBillboardContext = null;
    this.portalBillboardGroup = null;
    this.portalTopAdBaseTexture = null;
    this.portalTopAdScreenMaterial = null;
    this.portalTopAdUpdateGeometry = null;
    this.portalTopAdLoadNonce = 0;
    this.portalDisplayHandles = {
      portal1: this.createPortalDisplayHandle("portal1"),
      portal2: this.createPortalDisplayHandle("portal2"),
      hall: this.createPortalDisplayHandle("hall")
    };
    this.portalBillboardPalette = {
      bgFrom: "rgba(27, 11, 29, 0.56)",
      bgTo: "rgba(46, 14, 45, 0.64)",
      border: "rgba(255, 148, 226, 0.82)",
      stripe: "rgba(208, 102, 178, 0.16)",
      shadow: "rgba(255, 156, 228, 0.72)",
      line1: "#ffe7f8",
      line2: "#ffc7ee",
      line3: "#f6b8e7"
    };
    this.spawnPortalVeilGroup = null;
    this.spawnPortalVeilMaterial = null;
    this.spawnPortalVeilWorldZ = this.bridgeNpcPosition.z;
    this.spawnPortalVeilRevealStarted = false;
    this.aZonePortalGroup = null;
    this.aZonePortalRing = null;
    this.aZonePortalCore = null;
    this.aZonePortalCoreGlow = null;
    this.aZonePortalBillboardGroup = null;
    this.hallPortalGroup = null;
    this.hallPortalRing = null;
    this.hallPortalCore = null;
    this.hallPortalCoreGlow = null;
    this.hallPortalBillboardGroup = null;
    this.hallVenueGroup = null;
    this.portalOxAnchorEntry = null;
    this.portalFpsAnchorEntry = null;
    this.portalHallAnchorEntry = null;
    this.portalCoreGlow = null;
    this.portalReplicaCoreGlow = null;
    this.npcTemplePortalCore = null;
    this.npcTemplePortalGlow = null;
    this.portalBillboardUpdateClock = 0;
    this.portalBillboardCache = {
      line1: "",
      line2: "",
      line3: ""
    };

    if (!this.hubFlowGroup) {
      return;
    }
    this.scene.remove(this.hubFlowGroup);
    disposeMeshTree(this.hubFlowGroup);
    this.hubFlowGroup = null;
    this.portalGroup = null;
    this.portalRing = null;
    this.portalCore = null;
    this.portalCoreGlow = null;
    this.portalReplicaGroup = null;
    this.portalReplicaRing = null;
    this.portalReplicaCore = null;
    this.portalReplicaCoreGlow = null;
    this.portalBillboardGroup = null;
    this.spawnPortalVeilGroup = null;
    this.spawnPortalVeilMaterial = null;
    this.spawnPortalVeilWorldZ = this.bridgeNpcPosition.z;
    this.spawnPortalVeilBaseTexture = null;
    this.spawnPortalVeilTexture = null;
    this.spawnPortalVeilVideoEl = null;
    this.spawnPortalVeilVideoTexture = null;
    this.spawnPortalVeilRevealStarted = false;
    this.aZonePortalGroup = null;
    this.aZonePortalRing = null;
    this.aZonePortalCore = null;
    this.aZonePortalCoreGlow = null;
    this.aZonePortalBillboardGroup = null;
    this.hallPortalGroup = null;
    this.hallPortalRing = null;
    this.hallPortalCore = null;
    this.hallPortalCoreGlow = null;
    this.hallPortalBillboardGroup = null;
    this.hallVenueGroup = null;
    this.portalOxAnchorEntry = null;
    this.portalFpsAnchorEntry = null;
    this.portalHallAnchorEntry = null;
    this.npcGuideGroup = null;
    this.npcTemplePortalCore = null;
    this.npcTemplePortalGlow = null;
    this.npcGreetingScreen = null;
    this.npcWelcomeBubbleLabel = null;
    this.mirrorGateGroup = null;
    this.mirrorGatePanel = null;
    this.bridgeBoundaryMarker = null;
    this.bridgeBoundaryRing = null;
    this.bridgeBoundaryHalo = null;
    this.bridgeBoundaryBeam = null;
  }

  setupHubFlowWorld() {
    this.clearHubFlowWorld();
    this.paintableSurfaceMeshes.length = 0;
    this.paintableSurfaceMap.clear();
    this.surfacePaintTarget = null;
    if (!this.hubFlowEnabled) {
      return;
    }

    const group = new THREE.Group();

    const bridgeDirection = new THREE.Vector3(
      this.bridgeCityEntry.x - this.bridgeSpawn.x,
      0,
      this.bridgeCityEntry.z - this.bridgeSpawn.z
    );
    let bridgeLength = bridgeDirection.length();
    if (bridgeLength < 22) {
      bridgeLength = 66;
      bridgeDirection.set(0, 0, 1);
    } else {
      bridgeDirection.normalize();
    }

    const bridgeYaw = Math.atan2(bridgeDirection.x, bridgeDirection.z);
    const cityPlazaCenterZ = this.citySpawn.z + 4;
    const plazaRadius = this.mobileEnabled ? 24.8 : 25.4;
    const plazaRingRadius = Math.max(21.8, plazaRadius - (this.mobileEnabled ? 0.7 : 0.85));
    const bridgeSpawnOverhang = this.mobileEnabled ? 15 : 18;
    const targetBridgeCityEdgeZ = cityPlazaCenterZ - plazaRadius + 0.6;
    const bridgeCityOverhang = THREE.MathUtils.clamp(
      targetBridgeCityEdgeZ - this.bridgeCityEntry.z,
      -18,
      this.mobileEnabled ? 2 : 3
    );
    const bridgeCenterShift = (bridgeCityOverhang - bridgeSpawnOverhang) * 0.5;
    const bridgeCenter = new THREE.Vector3(
      (this.bridgeSpawn.x + this.bridgeCityEntry.x) * 0.5 + bridgeDirection.x * bridgeCenterShift,
      0.15,
      (this.bridgeSpawn.z + this.bridgeCityEntry.z) * 0.5 + bridgeDirection.z * bridgeCenterShift
    );
    const bridgeDeckLength = bridgeLength + bridgeSpawnOverhang + bridgeCityOverhang;
    const bridgeGroup = new THREE.Group();
    bridgeGroup.position.copy(bridgeCenter);
    bridgeGroup.rotation.y = bridgeYaw;

    const bridgeDeckMaterial = new THREE.MeshStandardMaterial({
      color: this.bridgeDeckColor,
      roughness: 0.7,
      metalness: 0.12,
      emissive: 0x171d23,
      emissiveIntensity: 0.1
    });
    const bridgeDeck = new THREE.Mesh(
      new THREE.BoxGeometry(this.bridgeWidth, 0.32, bridgeDeckLength),
      bridgeDeckMaterial
    );
    bridgeDeck.castShadow = !this.mobileEnabled;
    bridgeDeck.receiveShadow = true;
    bridgeGroup.add(bridgeDeck);

    const bridgeRailMaterial = new THREE.MeshStandardMaterial({
      color: this.bridgeRailColor,
      roughness: 0.36,
      metalness: 0.58,
      emissive: 0x2a3e52,
      emissiveIntensity: 0.24
    });
    const postSpacing = 8;
    const postCount = Math.max(2, Math.floor(bridgeDeckLength / postSpacing));
    for (let pi = 0; pi <= postCount; pi++) {
      const zOff = -bridgeDeckLength * 0.5 + (pi / postCount) * bridgeDeckLength;
      for (const sx of [-1, 1]) {
        const post = new THREE.Mesh(
          new THREE.BoxGeometry(0.13, 1.22, 0.13),
          bridgeRailMaterial
        );
        post.position.set(sx * this.bridgeWidth * 0.52, 0.77, zOff);
        post.castShadow = !this.mobileEnabled;
        bridgeGroup.add(post);
      }
    }
    for (const sx of [-1, 1]) {
      const railBeam = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.12, bridgeDeckLength + 0.12),
        bridgeRailMaterial
      );
      railBeam.position.set(sx * this.bridgeWidth * 0.52, 1.38, 0);
      railBeam.castShadow = !this.mobileEnabled;
      bridgeGroup.add(railBeam);
    }

    const cityGroup = new THREE.Group();
    cityGroup.position.set(this.citySpawn.x, 0, cityPlazaCenterZ);
    const cityTerraceRise = this.mobileEnabled ? 0.26 : 0.34;
    const cityTerraceFrontZ = 40;
    const cityTerraceDepth = this.mobileEnabled ? 92 : 108;
    const cityTerraceCenterZ = cityTerraceFrontZ + cityTerraceDepth * 0.5;
    const cityTerraceWidth = this.mobileEnabled ? 116 : 132;
    const liftRearCityY = (value) => cityTerraceRise + (Number(value) || 0);
    this.addFutureCityBackdrop(group, bridgeDirection);

    const plaza = new THREE.Mesh(
      new THREE.CylinderGeometry(plazaRadius, plazaRadius, 0.22, this.mobileEnabled ? 26 : 42),
      new THREE.MeshStandardMaterial({
        color: 0x39434d,
        roughness: 0.82,
        metalness: 0.05,
        emissive: 0x1b242f,
        emissiveIntensity: 0.11
      })
    );
    plaza.position.y = 0.11;
    plaza.receiveShadow = true;
    cityGroup.add(plaza);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(plazaRingRadius, 0.38, 20, this.mobileEnabled ? 44 : 80),
      new THREE.MeshStandardMaterial({
        color: 0x81a8ce,
        roughness: 0.3,
        metalness: 0.54,
        emissive: 0x34506d,
        emissiveIntensity: 0.22
      })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.24;
    cityGroup.add(ring);

    const cityTerraceMaterial = new THREE.MeshStandardMaterial({
      color: 0x44515f,
      roughness: 0.84,
      metalness: 0.08,
      emissive: 0x202b38,
      emissiveIntensity: 0.12
    });
    const cityTerrace = new THREE.Mesh(
      new THREE.BoxGeometry(cityTerraceWidth, cityTerraceRise, cityTerraceDepth),
      cityTerraceMaterial
    );
    cityTerrace.position.set(0, cityTerraceRise * 0.5, cityTerraceCenterZ);
    cityTerrace.receiveShadow = true;
    cityGroup.add(cityTerrace);

    const cityTerraceTop = new THREE.Mesh(
      new THREE.BoxGeometry(cityTerraceWidth * 0.92, 0.05, cityTerraceDepth - 2.8),
      new THREE.MeshStandardMaterial({
        color: 0x2e3945,
        roughness: 0.46,
        metalness: 0.16,
        emissive: 0x172534,
        emissiveIntensity: 0.12
      })
    );
    cityTerraceTop.position.set(0, cityTerraceRise + 0.025, cityTerraceCenterZ + 0.8);
    cityTerraceTop.receiveShadow = true;
    cityGroup.add(cityTerraceTop);

    const cityTerraceFrontTrim = new THREE.Mesh(
      new THREE.BoxGeometry(cityTerraceWidth * 0.72, 0.05, 0.34),
      new THREE.MeshStandardMaterial({
        color: 0x8bc2ea,
        roughness: 0.26,
        metalness: 0.54,
        emissive: 0x31567d,
        emissiveIntensity: 0.28
      })
    );
    cityTerraceFrontTrim.position.set(0, cityTerraceRise + 0.03, cityTerraceFrontZ + 0.18);
    cityTerraceFrontTrim.receiveShadow = true;
    cityGroup.add(cityTerraceFrontTrim);

    // Side district expansion: extend roads and pads on both sides of the city center.
    const sideRoadMaterial = new THREE.MeshStandardMaterial({
      color: 0x333d48,
      roughness: 0.8,
      metalness: 0.08,
      emissive: 0x1a2430,
      emissiveIntensity: 0.1
    });
    const sideRoad = new THREE.Mesh(
      new THREE.BoxGeometry(58, 0.2, 7.4),
      sideRoadMaterial
    );
    sideRoad.position.set(-29, 0.1, 0);
    sideRoad.receiveShadow = true;
    cityGroup.add(sideRoad);

    const sideRoadRight = new THREE.Mesh(
      new THREE.BoxGeometry(58, 0.2, 7.4),
      sideRoadMaterial
    );
    sideRoadRight.position.set(29, 0.1, 0);
    sideRoadRight.receiveShadow = true;
    cityGroup.add(sideRoadRight);

    const sideRoadStripe = new THREE.Mesh(
      new THREE.BoxGeometry(54, 0.03, 0.34),
      new THREE.MeshStandardMaterial({
        color: 0x6b8eae,
        roughness: 0.34,
        metalness: 0.24,
        emissive: 0x2a445e,
        emissiveIntensity: 0.18
      })
    );
    sideRoadStripe.position.set(-29, 0.215, 0);
    sideRoadStripe.receiveShadow = true;
    cityGroup.add(sideRoadStripe);

    const sideRoadStripeRight = sideRoadStripe.clone();
    sideRoadStripeRight.position.set(29, 0.215, 0);
    sideRoadStripeRight.receiveShadow = true;
    cityGroup.add(sideRoadStripeRight);

    const sideFloor = new THREE.Mesh(
      new THREE.BoxGeometry(30, 0.24, 24),
      new THREE.MeshStandardMaterial({
        color: 0x3a4551,
        roughness: 0.78,
        metalness: 0.08,
        emissive: 0x1e2a38,
        emissiveIntensity: 0.12
      })
    );
    sideFloor.position.set(-60, 0.12, 0);
    sideFloor.receiveShadow = true;
    cityGroup.add(sideFloor);

    const sideFloorRight = sideFloor.clone();
    sideFloorRight.position.set(60, 0.12, 0);
    sideFloorRight.receiveShadow = true;
    cityGroup.add(sideFloorRight);

    const cityZoneConfig = {
      A: { centerX: -60, objectEnabled: true },
      B: { centerX: 60, objectEnabled: true }
    };
    // Push the skyline back so the center lane reads like an approach into the city.
    const cityBuildingRearOffsetZ = 118;
    const toRearCityZ = (value) => (Number(value) || 0) + cityBuildingRearOffsetZ;

    const zoneABorder = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.12, 28),
      new THREE.MeshStandardMaterial({
        color: 0x5c6d80,
        roughness: 0.84,
        metalness: 0.08,
        emissive: 0x273748,
        emissiveIntensity: 0.16
      })
    );
    zoneABorder.position.set(0, 0.13, 0);
    zoneABorder.receiveShadow = true;
    cityGroup.add(zoneABorder);

    const mapToCityZone = (
      rawX,
      rawZ,
      {
        zone = "B",
        xScale = 0.3,
        zScale = 0.44,
        xClamp = 11.2,
        zClamp = 10.8,
        zOffset = 0
      } = {}
    ) => {
      const sourceX = Number(rawX) || 0;
      const sourceZ = Number(rawZ) || 0;
      const targetZone = zone === "A" ? cityZoneConfig.A : cityZoneConfig.B;
      const sideSign = zone === "A" ? -1 : 1;
      const spreadX = THREE.MathUtils.clamp(Math.abs(sourceX) * xScale, 0, xClamp);
      const mappedX = targetZone.centerX + spreadX * sideSign;
      const mappedZ = THREE.MathUtils.clamp(sourceZ * zScale + zOffset, -zClamp, zClamp);
      return { x: mappedX, z: mappedZ };
    };
    const resolveCityZoneFromX = (value) => ((Number(value) || 0) < 0 ? "A" : "B");
    const cityGroupWorldX = cityGroup.position.x;
    const cityGroupWorldZ = cityGroup.position.z;
    const registerCityBuildingCollider = (localX, localZ, width, depth, minY = -2, maxY = 180) => {
      return this.registerStaticWorldBoxCollider(
        cityGroupWorldX + (Number(localX) || 0),
        cityGroupWorldZ + (Number(localZ) || 0),
        width,
        depth,
        minY,
        maxY
      );
    };
    const occupiedCityRects = [];
    const reserveCityRect = (localX, localZ, width, depth, padding = 1.1) => {
      const halfW = Math.max(0.2, (Number(width) || 0) * 0.5 + Math.max(0, Number(padding) || 0));
      const halfD = Math.max(0.2, (Number(depth) || 0) * 0.5 + Math.max(0, Number(padding) || 0));
      occupiedCityRects.push({
        minX: (Number(localX) || 0) - halfW,
        maxX: (Number(localX) || 0) + halfW,
        minZ: (Number(localZ) || 0) - halfD,
        maxZ: (Number(localZ) || 0) + halfD
      });
    };
    const canPlaceCityRect = (localX, localZ, width, depth, padding = 1.1) => {
      const halfW = Math.max(0.2, (Number(width) || 0) * 0.5 + Math.max(0, Number(padding) || 0));
      const halfD = Math.max(0.2, (Number(depth) || 0) * 0.5 + Math.max(0, Number(padding) || 0));
      const probe = {
        minX: (Number(localX) || 0) - halfW,
        maxX: (Number(localX) || 0) + halfW,
        minZ: (Number(localZ) || 0) - halfD,
        maxZ: (Number(localZ) || 0) + halfD
      };
      for (const existing of occupiedCityRects) {
        const separated =
          probe.maxX <= existing.minX ||
          probe.minX >= existing.maxX ||
          probe.maxZ <= existing.minZ ||
          probe.minZ >= existing.maxZ;
        if (!separated) {
          return false;
        }
      }
      return true;
    };
    const tryReserveCityRect = (localX, localZ, width, depth, padding = 1.1) => {
      if (!canPlaceCityRect(localX, localZ, width, depth, padding)) {
        return false;
      }
      reserveCityRect(localX, localZ, width, depth, padding);
      return true;
    };
    const getZoneXBounds = (zone) => {
      if (zone === "A") {
        return { minX: cityZoneConfig.A.centerX - 15, maxX: cityZoneConfig.A.centerX + 15 };
      }
      return { minX: cityZoneConfig.B.centerX - 15, maxX: cityZoneConfig.B.centerX + 15 };
    };
    const tryReserveCityRectWithJitter = (
      localX,
      localZ,
      width,
      depth,
      {
        zone = "B",
        xBounds = null,
        padding = 1.1,
        attempts = 12,
        step = 2.6,
        zLimit = 30
      } = {}
    ) => {
      const zoneBounds = getZoneXBounds(zone);
      const bounds = {
        minX: Number(xBounds?.minX),
        maxX: Number(xBounds?.maxX)
      };
      if (!Number.isFinite(bounds.minX) || !Number.isFinite(bounds.maxX) || bounds.minX >= bounds.maxX) {
        bounds.minX = zoneBounds.minX;
        bounds.maxX = zoneBounds.maxX;
      }
      const baseX = THREE.MathUtils.clamp(Number(localX) || 0, bounds.minX, bounds.maxX);
      const baseZ = THREE.MathUtils.clamp(Number(localZ) || 0, -zLimit, zLimit);
      if (tryReserveCityRect(baseX, baseZ, width, depth, padding)) {
        return { x: baseX, z: baseZ };
      }

      const safeAttempts = Math.max(2, Math.trunc(Number(attempts) || 0));
      for (let attempt = 0; attempt < safeAttempts; attempt += 1) {
        const ring = 1 + Math.floor(attempt / 6);
        const angle = (attempt / safeAttempts) * Math.PI * 2 + ((baseX + baseZ) * 0.017);
        const radius = step * ring;
        const probeX = THREE.MathUtils.clamp(baseX + Math.cos(angle) * radius, bounds.minX, bounds.maxX);
        const probeZ = THREE.MathUtils.clamp(baseZ + Math.sin(angle) * radius, -zLimit, zLimit);
        if (tryReserveCityRect(probeX, probeZ, width, depth, padding)) {
          return { x: probeX, z: probeZ };
        }
      }

      return null;
    };
    // Keep A/B zone core pads clear so gates and route lines stay visible.
    reserveCityRect(cityZoneConfig.A.centerX, 0, 12, 14, 1.5);
    reserveCityRect(cityZoneConfig.B.centerX, 0, 12, 14, 1.5);
    const bridgeEntryLocalX = this.bridgeCityEntry.x - cityGroupWorldX;
    const bridgeEntryLocalZ = this.bridgeCityEntry.z - cityGroupWorldZ;
    const isFarFromBridgeGate = (localX, localZ, minDistance = 16) => {
      const dx = (Number(localX) || 0) - bridgeEntryLocalX;
      const dz = (Number(localZ) || 0) - bridgeEntryLocalZ;
      return Math.hypot(dx, dz) >= Math.max(2, Number(minDistance) || 0);
    };

    const towerPositions = [
      [-22, 6.4, -10],
      [22, 7.8, -8],
      [-18, 9.2, -22],
      [19, 8.8, -20],
      // Keep the portal sightline clear by avoiding a center-axis tower.
      [14, 11.6, -24],
      [-25, 6.8, 2],
      [25, 7.1, 3],
      [-30, 7.4, -14],
      [30, 8.1, -13],
      [-28, 9.8, -30],
      [28, 10.2, -29],
      [-31, 7.2, 10],
      [31, 7.6, 11],
      [-12, 8.4, 9],
      [12, 8.2, 8]
    ];
    const towerMats = [
      this.createCityWindowMaterial({
        style: "slate",
        repeatX: 1.1,
        repeatY: 3.2,
        roughness: 0.6,
        metalness: 0.12,
        emissive: 0x1a3048,
        emissiveIntensity: 0.42
      }),
      this.createCityWindowMaterial({
        style: "cyan",
        repeatX: 1.2,
        repeatY: 3.6,
        roughness: 0.58,
        metalness: 0.14,
        emissive: 0x183a50,
        emissiveIntensity: 0.45
      }),
      this.createCityWindowMaterial({
        style: "amber",
        repeatX: 1.15,
        repeatY: 3.4,
        roughness: 0.62,
        metalness: 0.12,
        emissive: 0x2a2010,
        emissiveIntensity: 0.42
      })
    ];
    for (let ti = 0; ti < towerPositions.length; ti++) {
      const [x, h, z] = towerPositions[ti];
      const zoneKey = resolveCityZoneFromX(x);
      if (!cityZoneConfig[zoneKey]?.objectEnabled) {
        continue;
      }
      const tower = this.createPaintableBoxMesh(
        new THREE.BoxGeometry(4.6, h, 4.6),
        towerMats[ti % 3],
        `city_tower_${ti}`
      );
      const mapped = mapToCityZone(x, z, {
        zone: zoneKey,
        xScale: 0.56,
        zScale: 0.7,
        xClamp: 19.5,
        zClamp: 24
      });
      const placed = tryReserveCityRectWithJitter(mapped.x, mapped.z, 4.8, 4.8, {
        zone: zoneKey,
        padding: 1.1,
        attempts: 10,
        step: 2.8,
        zLimit: 30
      });
      if (!placed) {
        continue;
      }
      const placedTowerZ = toRearCityZ(placed.z);
      tower.position.set(placed.x, liftRearCityY(h * 0.5), placedTowerZ);
      tower.castShadow = false;
      tower.receiveShadow = true;
      cityGroup.add(tower);
      const towerColliderIndex = registerCityBuildingCollider(
        placed.x,
        placedTowerZ,
        4.8,
        4.8,
        -2,
        liftRearCityY(h + 4)
      );
      this.registerMovableObject(tower, `city_tower_${ti}`, towerColliderIndex);
    }

    const skylineMaterialPresets = [
      {
        style: "slate",
        repeatX: 2.15,
        repeatY: 7.6,
        roughness: 0.56,
        metalness: 0.16,
        emissive: 0x31506a,
        emissiveIntensity: 0.62
      },
      {
        style: "cyan",
        repeatX: 2.2,
        repeatY: 8.1,
        roughness: 0.54,
        metalness: 0.18,
        emissive: 0x2a5878,
        emissiveIntensity: 0.68
      },
      {
        style: "amber",
        repeatX: 2.05,
        repeatY: 7.5,
        roughness: 0.58,
        metalness: 0.14,
        emissive: 0x5a4220,
        emissiveIntensity: 0.58
      }
    ];
    const skylineMats = skylineMaterialPresets.map((preset) => this.createCityWindowMaterial(preset));
    const skylineCapMats = [
      new THREE.MeshStandardMaterial({
        color: 0x7adce8, roughness: 0.20, metalness: 0.50,
        emissive: 0x30a0b0, emissiveIntensity: 0.38
      }),
      new THREE.MeshStandardMaterial({
        color: 0xe0b84a, roughness: 0.24, metalness: 0.42,
        emissive: 0x8a5c10, emissiveIntensity: 0.30
      }),
      new THREE.MeshStandardMaterial({
        color: 0x7adce8, roughness: 0.20, metalness: 0.50,
        emissive: 0x30a0b0, emissiveIntensity: 0.38
      }),
    ];
    const skylineRoofMaterial = new THREE.MeshStandardMaterial({
      color: 0x98b3c8,
      roughness: 0.62,
      metalness: 0.24,
      emissive: 0x44698e,
      emissiveIntensity: 0.46
    });
    const bridgeLocalTarget = new THREE.Vector3(
      this.bridgeApproachSpawn.x - cityGroupWorldX,
      0,
      this.bridgeApproachSpawn.z - cityGroupWorldZ
    );
    const buildCityAdBoard = ({
      boardWidth,
      boardHeight,
      boardThickness,
      frameThickness,
      position,
      facingDirection,
      surfaceBaseId = "",
      sharedScreenMaterials = null,
      glowOpacity = 0.2,
      parentGroup = cityGroup
    }) => {
      const boardGroup = new THREE.Group();
      boardGroup.position.copy(position);

      const direction = facingDirection.clone();
      direction.y = 0;
      if (direction.lengthSq() < 0.0001) {
        direction.set(0, 0, 1);
      } else {
        direction.normalize();
      }
      boardGroup.rotation.y = Math.atan2(direction.x, direction.z);

      const frameMesh = new THREE.Mesh(
        new THREE.BoxGeometry(
          boardWidth + frameThickness * 2,
          boardHeight + frameThickness * 2,
          boardThickness + 0.05
        ),
        new THREE.MeshStandardMaterial({
          color: 0x10161d,
          roughness: 0.28,
          metalness: 0.58,
          emissive: 0x1e3348,
          emissiveIntensity: 0.26
        })
      );
      frameMesh.position.z = -0.015;
      frameMesh.castShadow = false;
      frameMesh.receiveShadow = true;

      let screenMesh;
      if (surfaceBaseId) {
        screenMesh = this.createPaintableBoxMesh(
          new THREE.BoxGeometry(boardWidth, boardHeight, boardThickness),
          this.createCityAdBillboardMaterial(),
          surfaceBaseId
        );
      } else {
        const materials = Array.isArray(sharedScreenMaterials)
          ? sharedScreenMaterials
          : this.createCityAdBillboardMaterial();
        screenMesh = new THREE.Mesh(
          new THREE.BoxGeometry(boardWidth, boardHeight, boardThickness),
          materials
        );
      }
      screenMesh.position.z = 0.02;
      screenMesh.castShadow = false;
      screenMesh.receiveShadow = true;
      screenMesh.userData.paintPreferredFace = "pz";

      const glowPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(boardWidth + frameThickness * 1.2, boardHeight + frameThickness * 1.2),
        new THREE.MeshBasicMaterial({
          color: 0x35daff,
          transparent: true,
          opacity: glowOpacity,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide
        })
      );
      glowPlane.position.z = boardThickness * 0.5 + 0.03;
      glowPlane.renderOrder = 10;

      boardGroup.add(frameMesh, screenMesh, glowPlane);
      parentGroup.add(boardGroup);
      return { boardGroup, screenMesh };
    };
    const createFloatingTowerBillboard = (
      towerIndex,
      towerX,
      towerZ,
      footprint,
      towerHeight,
      parentGroup = cityGroup,
      baseY = 0
    ) => {
      const toCenter = new THREE.Vector3(-towerX, 0, -towerZ);
      if (toCenter.lengthSq() < 0.0001) {
        toCenter.set(0, 0, 1);
      } else {
        toCenter.normalize();
      }
      const surfaceBaseId = `${CITY_AD_BILLBOARD_BASE_PREFIX}${towerIndex}`;
      const boardThickness = 0.08;
      const frameThickness = 0.26;

      const toBridge = bridgeLocalTarget
        .clone()
        .sub(new THREE.Vector3(towerX, 0, towerZ));
      if (toBridge.lengthSq() < 0.0001) {
        toBridge.set(0, 0, -1);
      } else {
        toBridge.normalize();
      }

      const upperBoardWidth = THREE.MathUtils.clamp(footprint * 1.2, 6.2, 9.2);
      const upperBoardHeight = THREE.MathUtils.clamp(footprint * 0.78, 3.6, 5.4);
      const upperFloatHeight = Math.max(3.2, footprint * 0.56);
      const upperBoardY = baseY + towerHeight + upperFloatHeight;
      const upperOffset = footprint * 0.52;
      const upperBoard = buildCityAdBoard({
        boardWidth: upperBoardWidth,
        boardHeight: upperBoardHeight,
        boardThickness,
        frameThickness,
        position: new THREE.Vector3(
          towerX + toBridge.x * upperOffset,
          upperBoardY,
          towerZ + toBridge.z * upperOffset
        ),
        // Keep rooftop billboards facing the front spawn approach.
        facingDirection: toBridge,
        surfaceBaseId,
        glowOpacity: 0.22,
        parentGroup
      });
      upperBoard.boardGroup.rotation.x = -0.12;
    };
    // Clone the plaza tower pattern into a larger skyline ring so it reads from mid-distance.
    for (let i = 0; i < towerPositions.length; i += 1) {
      const [x, h, z] = towerPositions[i];
      const megaX = x * 2.7;
      const megaZ = z * 2.7;
      const zoneKey = resolveCityZoneFromX(megaX);
      if (!cityZoneConfig[zoneKey]?.objectEnabled) {
        continue;
      }
      const megaHeight = Math.max(30, h * 4.2 + (i % 3) * 4.5);
      const footprint = 8.4 + (i % 2) * 1.8;
      const podiumHeight = Math.max(6, megaHeight * 0.18);
      const shaftHeight = megaHeight;
      const crownHeight = Math.max(4.8, megaHeight * 0.16);
      const totalTowerHeight = podiumHeight + shaftHeight + crownHeight;
      const placed = tryReserveCityRectWithJitter(
        megaX,
        megaZ,
        footprint * 1.24,
        footprint * 1.22,
        {
          zone: zoneKey,
          xBounds: zoneKey === "A"
            ? { minX: cityZoneConfig.A.centerX - 44, maxX: cityZoneConfig.A.centerX - 18 }
            : { minX: cityZoneConfig.B.centerX + 18, maxX: cityZoneConfig.B.centerX + 44 },
          padding: 1.8,
          attempts: 14,
          step: 4.4,
          zLimit: 42
        }
      );
      if (!placed) {
        continue;
      }
      const placedMegaX = placed.x;
      const placedMegaZ = toRearCityZ(placed.z);

      const skylinePreset = skylineMaterialPresets[i % skylineMaterialPresets.length];
      const wallMaterial = skylineMats[i % skylineMats.length].clone();
      const roofMaterial = skylineRoofMaterial.clone();
      const podiumMaterial = this.createCityWindowMaterial({
        style: skylinePreset.style,
        repeatX: Math.max(1.3, skylinePreset.repeatX * 0.92),
        repeatY: 2.8 + (i % 2) * 0.35,
        roughness: 0.5,
        metalness: 0.2,
        emissive: skylinePreset.emissive,
        emissiveIntensity: skylinePreset.emissiveIntensity + 0.1
      });
      const megaTowerGroup = new THREE.Group();
      megaTowerGroup.name = `city_mega_tower_${i}`;

      const podium = new THREE.Mesh(
        new THREE.BoxGeometry(footprint * 1.22, podiumHeight, footprint * 1.2),
        [
          podiumMaterial,
          podiumMaterial,
          roofMaterial, // +Y
          roofMaterial, // -Y
          podiumMaterial,
          podiumMaterial
        ]
      );
      podium.position.set(placedMegaX, liftRearCityY(podiumHeight * 0.5), placedMegaZ);
      podium.castShadow = false;
      podium.receiveShadow = true;
      megaTowerGroup.add(podium);

      const podiumCornice = new THREE.Mesh(
        new THREE.BoxGeometry(footprint * 1.28, 0.28, footprint * 1.26),
        new THREE.MeshStandardMaterial({
          color: 0x8ba6bc,
          roughness: 0.46,
          metalness: 0.38,
          emissive: 0x35526d,
          emissiveIntensity: 0.26
        })
      );
      podiumCornice.position.set(
        placedMegaX,
        liftRearCityY(podiumHeight + 0.14),
        placedMegaZ
      );
      podiumCornice.castShadow = false;
      podiumCornice.receiveShadow = true;
      megaTowerGroup.add(podiumCornice);
      const megaColliderIndex = registerCityBuildingCollider(
        placedMegaX,
        placedMegaZ,
        footprint * 1.24,
        footprint * 1.22,
        -2,
        liftRearCityY(totalTowerHeight + 6)
      );

      const megaTower = new THREE.Mesh(
        new THREE.BoxGeometry(footprint, shaftHeight, footprint * 0.97),
        [
          wallMaterial, // +X
          wallMaterial, // -X
          roofMaterial, // +Y
          roofMaterial, // -Y
          wallMaterial, // +Z
          wallMaterial  // -Z
        ]
      );
      megaTower.position.set(placedMegaX, liftRearCityY(podiumHeight + shaftHeight * 0.5), placedMegaZ);
      megaTower.castShadow = false;
      megaTower.receiveShadow = true;
      megaTowerGroup.add(megaTower);

      const upperShaft = new THREE.Mesh(
        new THREE.BoxGeometry(footprint * 0.76, crownHeight, footprint * 0.72),
        [
          wallMaterial.clone(),
          wallMaterial.clone(),
          roofMaterial,
          roofMaterial,
          wallMaterial.clone(),
          wallMaterial.clone()
        ]
      );
      upperShaft.position.set(
        placedMegaX,
        liftRearCityY(podiumHeight + shaftHeight + crownHeight * 0.5 + 0.12),
        placedMegaZ
      );
      upperShaft.castShadow = false;
      upperShaft.receiveShadow = true;
      megaTowerGroup.add(upperShaft);

      const towerCap = new THREE.Mesh(
        new THREE.CylinderGeometry(
          footprint * 0.24,
          footprint * 0.29,
          1.7,
          this.mobileEnabled ? 9 : 14
        ),
        skylineCapMats[i % 3]
      );
      towerCap.position.set(placedMegaX, liftRearCityY(totalTowerHeight + 0.86), placedMegaZ);
      towerCap.castShadow = false;
      towerCap.receiveShadow = true;
      megaTowerGroup.add(towerCap);

      const edgeStripMaterial = new THREE.MeshBasicMaterial({
        color: i % 2 === 0 ? 0x6fe8ff : 0x79ffca,
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
        toneMapped: false
      });
      const edgeHeight = shaftHeight * 0.9;
      const edgeY = liftRearCityY(podiumHeight + edgeHeight * 0.5 + 0.36);
      const edgeOffsetX = footprint * 0.48;
      const edgeOffsetZ = footprint * 0.46;
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const edgeStrip = new THREE.Mesh(
            new THREE.BoxGeometry(
              Math.max(0.08, footprint * 0.032),
              edgeHeight,
              Math.max(0.08, footprint * 0.032)
            ),
            edgeStripMaterial
          );
          edgeStrip.position.set(placedMegaX + sx * edgeOffsetX, edgeY, placedMegaZ + sz * edgeOffsetZ);
          edgeStrip.renderOrder = 6;
          megaTowerGroup.add(edgeStrip);
        }
      }

      createFloatingTowerBillboard(
        i,
        placedMegaX,
        placedMegaZ,
        footprint,
        totalTowerHeight,
        megaTowerGroup,
        cityTerraceRise
      );
      cityGroup.add(megaTowerGroup);
      this.registerMovableObject(megaTowerGroup, `city_mega_tower_${i}`, megaColliderIndex);
    }

    const plazaPaintMat = new THREE.MeshStandardMaterial({
      color: 0xb9c2cc,
      roughness: 0.66,
      metalness: 0.08,
      emissive: 0x1c252f,
      emissiveIntensity: 0.1
    });
    const plazaPaintableCount = this.mobileEnabled ? 7 : 14;
    const plazaPaintableRadius = 17.8;
    for (let index = 0; index < plazaPaintableCount; index += 1) {
      const angle = (index / plazaPaintableCount) * Math.PI * 2 + Math.PI * 0.125;
      const footprint = index % 3 === 0 ? 2.4 : 1.9;
      const height = index % 2 === 0 ? 3.4 : 2.9;
      const rawX = Math.cos(angle) * plazaPaintableRadius;
      const rawZ = Math.sin(angle) * plazaPaintableRadius;
      const zoneKey = resolveCityZoneFromX(rawX);
      if (!cityZoneConfig[zoneKey]?.objectEnabled) {
        continue;
      }
      const kiosk = this.createPaintableBoxMesh(
        new THREE.BoxGeometry(footprint, height, footprint),
        plazaPaintMat,
        `city_kiosk_${index}`
      );
      const mapped = mapToCityZone(rawX, rawZ, {
        zone: zoneKey,
        xScale: 0.62,
        zScale: 0.68,
        xClamp: 22,
        zClamp: 18,
        zOffset: index % 2 === 0 ? -3.8 : 3.8
      });
      const placed = tryReserveCityRectWithJitter(
        mapped.x,
        mapped.z,
        footprint + 0.5,
        footprint + 0.5,
        {
          zone: zoneKey,
          padding: 1.15,
          attempts: 12,
          step: 2.2,
          zLimit: 30
        }
      );
      if (!placed) {
        continue;
      }
      const placedKioskZ = toRearCityZ(placed.z);
      kiosk.position.set(placed.x, liftRearCityY(height * 0.5), placedKioskZ);
      kiosk.castShadow = false;
      kiosk.receiveShadow = true;
      cityGroup.add(kiosk);
      const kioskColliderIndex = registerCityBuildingCollider(
        placed.x,
        placedKioskZ,
        footprint + 0.5,
        footprint + 0.5,
        -2,
        liftRearCityY(height + 3)
      );
      this.registerMovableObject(kiosk, `city_kiosk_${index}`, kioskColliderIndex);
    }

    const districtPaintMat = new THREE.MeshStandardMaterial({
      color: 0xacb6c2,
      roughness: 0.68,
      metalness: 0.08,
      emissive: 0x1d2731,
      emissiveIntensity: 0.1
    });
    const districtPaintableCount = this.mobileEnabled ? 6 : 12;
    const districtPaintableRadius = 29.5;
    for (let index = 0; index < districtPaintableCount; index += 1) {
      const angle = (index / districtPaintableCount) * Math.PI * 2 + Math.PI * 0.18;
      const footprint = index % 2 === 0 ? 3.3 : 2.7;
      const depth = index % 3 === 0 ? 3.6 : 2.9;
      const height = 4.2 + (index % 4) * 0.9;
      const rawX = Math.cos(angle) * districtPaintableRadius;
      const rawZ = Math.sin(angle) * districtPaintableRadius;
      const zoneKey = resolveCityZoneFromX(rawX);
      if (!cityZoneConfig[zoneKey]?.objectEnabled) {
        continue;
      }
      const block = this.createPaintableBoxMesh(
        new THREE.BoxGeometry(footprint, height, depth),
        districtPaintMat,
        `city_block_${index}`
      );
      const mapped = mapToCityZone(rawX, rawZ, {
        zone: zoneKey,
        xScale: 0.72,
        zScale: 0.72,
        xClamp: 24,
        zClamp: 24,
        zOffset: index % 2 === 0 ? -5.6 : 5.6
      });
      const placed = tryReserveCityRectWithJitter(
        mapped.x,
        mapped.z,
        footprint + 0.6,
        depth + 0.6,
        {
          zone: zoneKey,
          padding: 1.2,
          attempts: 14,
          step: 2.6,
          zLimit: 32
        }
      );
      if (!placed) {
        continue;
      }
      const placedDistrictZ = toRearCityZ(placed.z);
      block.position.set(placed.x, liftRearCityY(height * 0.5), placedDistrictZ);
      block.castShadow = false;
      block.receiveShadow = true;
      cityGroup.add(block);
      const blockColliderIndex = registerCityBuildingCollider(
        placed.x,
        placedDistrictZ,
        footprint + 0.6,
        depth + 0.6,
        -2,
        liftRearCityY(height + 4)
      );
      this.registerMovableObject(block, `city_block_${index}`, blockColliderIndex);
    }

    const outerDistrictPaintMat = new THREE.MeshStandardMaterial({
      color: 0x9ea9b5,
      roughness: 0.7,
      metalness: 0.07,
      emissive: 0x1a232d,
      emissiveIntensity: 0.1
    });
    const outerDistrictCount = this.mobileEnabled ? 5 : 10;
    const outerDistrictRadius = 41;
    for (let index = 0; index < outerDistrictCount; index += 1) {
      const angle = (index / outerDistrictCount) * Math.PI * 2 + Math.PI * 0.07;
      const width = index % 2 === 0 ? 4.8 : 3.8;
      const depth = index % 3 === 0 ? 5.2 : 4.1;
      const height = 6.2 + (index % 5) * 1.1;
      const rawX = Math.cos(angle) * outerDistrictRadius;
      const rawZ = Math.sin(angle) * outerDistrictRadius;
      const zoneKey = resolveCityZoneFromX(rawX);
      if (!cityZoneConfig[zoneKey]?.objectEnabled) {
        continue;
      }
      const block = this.createPaintableBoxMesh(
        new THREE.BoxGeometry(width, height, depth),
        outerDistrictPaintMat,
        `city_outer_block_${index}`
      );
      const mapped = mapToCityZone(rawX, rawZ, {
        zone: zoneKey,
        xScale: 0.82,
        zScale: 0.84,
        xClamp: 26,
        zClamp: 28,
        zOffset: index % 2 === 0 ? -8.2 : 8.2
      });
      const placed = tryReserveCityRectWithJitter(
        mapped.x,
        mapped.z,
        width + 0.7,
        depth + 0.7,
        {
          zone: zoneKey,
          padding: 1.35,
          attempts: 14,
          step: 2.9,
          zLimit: 34
        }
      );
      if (!placed) {
        continue;
      }
      const placedOuterDistrictZ = toRearCityZ(placed.z);
      block.position.set(placed.x, liftRearCityY(height * 0.5), placedOuterDistrictZ);
      block.castShadow = false;
      block.receiveShadow = true;
      cityGroup.add(block);
      const outerBlockColliderIndex = registerCityBuildingCollider(
        placed.x,
        placedOuterDistrictZ,
        width + 0.7,
        depth + 0.7,
        -2,
        liftRearCityY(height + 4)
      );
      this.registerMovableObject(block, `city_outer_block_${index}`, outerBlockColliderIndex);
    }

    const bridgeDistrictPaintMat = new THREE.MeshStandardMaterial({
      color: PLAYER_PLACEABLE_BLOCK_BASE_COLOR,
      roughness: 0.68,
      metalness: 0.08,
      emissive: PLAYER_PLACEABLE_BLOCK_EMISSIVE_COLOR,
      emissiveIntensity: PLAYER_PLACEABLE_BLOCK_EMISSIVE_INTENSITY
    });
    const bridgeDistrictCandidates = this.mobileEnabled
      ? [
          [-86, -34, 3.9, 4.8, 5.6],
          [-72, -29, 3.5, 4.2, 5.1],
          [72, -29, 3.5, 4.2, 5.1],
          [86, -34, 3.9, 4.8, 5.6]
        ]
      : [
          [-94, -38, 4.4, 5.4, 6.4],
          [-82, -32, 3.8, 4.7, 5.8],
          [-70, -28, 3.5, 4.1, 5.2],
          [-58, -24, 3.2, 3.9, 4.8],
          [58, -24, 3.2, 3.9, 4.8],
          [70, -28, 3.5, 4.1, 5.2],
          [82, -32, 3.8, 4.7, 5.8],
          [94, -38, 4.4, 5.4, 6.4]
        ];
    let bridgeDistrictIndex = 0;
    for (const candidate of bridgeDistrictCandidates) {
      const [localX, localZ, width, depth, height] = candidate;
      const zoneKey = resolveCityZoneFromX(localX);
      if (!cityZoneConfig[zoneKey]?.objectEnabled) {
        continue;
      }
      if (!isFarFromBridgeGate(localX, localZ, 16.5)) {
        continue;
      }
      if (!tryReserveCityRect(localX, localZ, width + 0.7, depth + 0.7, 1.35)) {
        continue;
      }

      const bridgeBlock = this.createPaintableBoxMesh(
        new THREE.BoxGeometry(width, height, depth),
        bridgeDistrictPaintMat,
        `city_bridge_block_${bridgeDistrictIndex}`
      );
      const bridgeBlockZ = toRearCityZ(localZ);
      bridgeBlock.position.set(localX, liftRearCityY(height * 0.5), bridgeBlockZ);
      bridgeBlock.castShadow = false;
      bridgeBlock.receiveShadow = true;
      cityGroup.add(bridgeBlock);
      const bridgeBlockColliderIndex = registerCityBuildingCollider(
        localX,
        bridgeBlockZ,
        width + 0.7,
        depth + 0.7,
        -2,
        liftRearCityY(height + 4)
      );
      this.registerMovableObject(
        bridgeBlock,
        `city_bridge_block_${bridgeDistrictIndex}`,
        bridgeBlockColliderIndex
      );
      bridgeDistrictIndex += 1;
    }

    const bridgePaintMat = new THREE.MeshStandardMaterial({
      color: PLAYER_PLACEABLE_BLOCK_BASE_COLOR,
      roughness: 0.66,
      metalness: 0.06,
      emissive: PLAYER_PLACEABLE_BLOCK_EMISSIVE_COLOR,
      emissiveIntensity: PLAYER_PLACEABLE_BLOCK_EMISSIVE_INTENSITY
    });
    const bridgePanelOffsets = this.mobileEnabled
      ? [-24, -12, 0, 12, 24]
      : [-36, -24, -12, 0, 12, 24, 36];
    let bridgePanelIndex = 0;
    for (const offsetZ of bridgePanelOffsets) {
      for (const side of [-1, 1]) {
        const panelHeight = bridgePanelIndex % 2 === 0 ? 2.6 : 3.0;
        const panel = this.createPaintableBoxMesh(
          new THREE.BoxGeometry(1.7, panelHeight, 0.24),
          bridgePaintMat,
          `bridge_panel_${bridgePanelIndex}`
        );
        panel.position.set(side * this.bridgeWidth * 0.62, panelHeight * 0.5 + 0.28, offsetZ);
        panel.castShadow = false;
        panel.receiveShadow = true;
        bridgeGroup.add(panel);
        bridgePanelIndex += 1;
      }
    }

    const hostCustomBlockMaterial = bridgePaintMat.clone();
    for (let index = 0; index < this.hostCustomPaintBlockCount; index += 1) {
      const blockId = `host_custom_block_${index}`;
      const customBlock = this.createPaintableBoxMesh(
        new THREE.BoxGeometry(1, 1, 1),
        hostCustomBlockMaterial,
        blockId
      );
      const stashY = -920 - index * 2.8;
      customBlock.position.set(0, stashY, 0);
      customBlock.scale.set(1, 1, 1);
      customBlock.visible = false;
      customBlock.castShadow = false;
      customBlock.receiveShadow = true;
      cityGroup.add(customBlock);
      const customColliderIndex = registerCityBuildingCollider(
        0,
        0,
        0.2,
        0.2,
        -1100,
        -900
      );
      const customEntry = this.registerMovableObject(customBlock, blockId, customColliderIndex);
      if (customEntry) {
        customEntry.isHostCustomPaintBlock = true;
        customEntry.defaultVisible = false;
        customEntry.defaultScale = customBlock.scale.clone();
        customEntry.defaultPosition = customBlock.position.clone();
        this.parkMovableObjectCollider(customEntry);
      }
    }

    const cityAxisGroup = new THREE.Group();
    const axisRoadMaterial = new THREE.MeshStandardMaterial({
      color: 0x313b47,
      roughness: 0.78,
      metalness: 0.08,
      emissive: 0x18222e,
      emissiveIntensity: 0.14
    });
    const axisTrimMaterial = new THREE.MeshStandardMaterial({
      color: 0x88a8c4,
      roughness: 0.34,
      metalness: 0.46,
      emissive: 0x2d4b66,
      emissiveIntensity: 0.22
    });
    const axisRailMaterial = new THREE.MeshStandardMaterial({
      color: 0x5a6978,
      roughness: 0.42,
      metalness: 0.36,
      emissive: 0x23364a,
      emissiveIntensity: 0.18
    });
    const axisGlowMaterial = new THREE.MeshBasicMaterial({
      color: 0x7fe4ff,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const createAxisGuideSign = ({ x = 0, z = 0, line1 = "", line2 = "", accent = 0x8fdcff }) => {
      const signGroup = new THREE.Group();
      signGroup.position.set(x, cityTerraceRise, z);
      signGroup.rotation.y = Math.PI;

      const panelWidth = 4.9;
      const panelHeight = 1.12;
      const postHeight = 1.08;
      const postOffsetX = 1.52;
      const accentColor = new THREE.Color(accent);
      const accentCss = `#${accentColor.getHexString()}`;
      const canvas = document.createElement("canvas");
      canvas.width = 1024;
      canvas.height = 256;
      const context = canvas.getContext("2d");
      if (context) {
        const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
        gradient.addColorStop(0, "rgba(8, 16, 26, 0.98)");
        gradient.addColorStop(1, "rgba(14, 28, 40, 0.98)");
        context.fillStyle = gradient;
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.strokeStyle = accentCss;
        context.lineWidth = 12;
        context.strokeRect(12, 12, canvas.width - 24, canvas.height - 24);
        context.fillStyle = accentCss;
        context.fillRect(0, canvas.height - 28, canvas.width, 10);
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillStyle = "#e8f6ff";
        context.font = '700 92px "Segoe UI", "Malgun Gothic", sans-serif';
        context.fillText(line1, canvas.width * 0.5, 102);
        context.fillStyle = "#9fdfff";
        context.font = '600 40px "Segoe UI", "Malgun Gothic", sans-serif';
        context.fillText(line2, canvas.width * 0.5, 178);
      }
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = false;

      for (const side of [-1, 1]) {
        const post = new THREE.Mesh(
          new THREE.BoxGeometry(0.14, postHeight, 0.14),
          axisRailMaterial
        );
        post.position.set(side * postOffsetX, postHeight * 0.5, -0.02);
        post.castShadow = !this.mobileEnabled;
        post.receiveShadow = true;
        signGroup.add(post);
      }

      const frame = new THREE.Mesh(
        new THREE.BoxGeometry(panelWidth + 0.18, panelHeight + 0.18, 0.14),
        new THREE.MeshStandardMaterial({
          color: 0x10161d,
          roughness: 0.28,
          metalness: 0.5,
          emissive: 0x22384d,
          emissiveIntensity: 0.24
        })
      );
      frame.position.set(0, postHeight + 0.44, 0);
      frame.castShadow = !this.mobileEnabled;
      frame.receiveShadow = true;

      const glow = new THREE.Mesh(
        new THREE.PlaneGeometry(panelWidth + 0.26, panelHeight + 0.26),
        new THREE.MeshBasicMaterial({
          color: accent,
          transparent: true,
          opacity: 0.12,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          toneMapped: false,
          side: THREE.DoubleSide
        })
      );
      glow.position.set(0, postHeight + 0.44, 0.06);
      glow.renderOrder = 11;

      const panel = new THREE.Mesh(
        new THREE.PlaneGeometry(panelWidth, panelHeight),
        new THREE.MeshBasicMaterial({
          map: texture,
          transparent: true,
          toneMapped: false,
          side: THREE.DoubleSide
        })
      );
      panel.position.set(0, postHeight + 0.44, 0.09);
      panel.renderOrder = 12;

      signGroup.add(frame, glow, panel);
      cityAxisGroup.add(signGroup);
    };

    const axisForecourt = new THREE.Mesh(
      new THREE.BoxGeometry(24, 0.08, 16),
      axisRoadMaterial
    );
    axisForecourt.position.set(0, 0.04, 12);
    axisForecourt.receiveShadow = true;
    cityAxisGroup.add(axisForecourt);

    const axisForecourtTrim = new THREE.Mesh(
      new THREE.BoxGeometry(12.4, 0.03, 0.42),
      axisTrimMaterial
    );
    axisForecourtTrim.position.set(0, 0.091, 18.8);
    axisForecourtTrim.receiveShadow = true;
    cityAxisGroup.add(axisForecourtTrim);

    const stairCount = 6;
    const stepDepth = 4.7;
    const stairFrontZ = 19.6;
    const stairWidthBase = 22.4;
    for (let stepIndex = 0; stepIndex < stairCount; stepIndex += 1) {
      const stepHeight = cityTerraceRise * ((stepIndex + 1) / stairCount);
      const step = new THREE.Mesh(
        new THREE.BoxGeometry(stairWidthBase + stepIndex * 2.1, stepHeight, stepDepth),
        axisRoadMaterial
      );
      step.position.set(0, stepHeight * 0.5, stairFrontZ + stepIndex * (stepDepth - 0.18));
      step.receiveShadow = true;
      cityAxisGroup.add(step);
    }

    const axisLanding = new THREE.Mesh(
      new THREE.BoxGeometry(31, cityTerraceRise, 15.5),
      axisRoadMaterial
    );
    axisLanding.position.set(0, cityTerraceRise * 0.5, 50);
    axisLanding.receiveShadow = true;
    cityAxisGroup.add(axisLanding);

    const axisRoad = new THREE.Mesh(
      new THREE.BoxGeometry(24, 0.08, 76),
      axisRoadMaterial
    );
    axisRoad.position.set(0, cityTerraceRise + 0.04, 82);
    axisRoad.receiveShadow = true;
    cityAxisGroup.add(axisRoad);

    const axisCenterStripe = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.02, 70),
      axisTrimMaterial
    );
    axisCenterStripe.position.set(0, cityTerraceRise + 0.091, 82);
    axisCenterStripe.receiveShadow = true;
    cityAxisGroup.add(axisCenterStripe);

    for (const side of [-1, 1]) {
      const axisShoulder = new THREE.Mesh(
        new THREE.BoxGeometry(1.35, 0.12, 74),
        axisTrimMaterial
      );
      axisShoulder.position.set(side * 11.4, cityTerraceRise + 0.06, 82);
      axisShoulder.receiveShadow = true;
      cityAxisGroup.add(axisShoulder);

      const axisGlowRail = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.26, 74),
        axisGlowMaterial
      );
      axisGlowRail.position.set(side * 10.72, cityTerraceRise + 0.18, 82);
      axisGlowRail.renderOrder = 7;
      cityAxisGroup.add(axisGlowRail);

      const stairRail = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.8, 34),
        axisRailMaterial
      );
      stairRail.position.set(side * 13.6, 0.4, 35.6);
      stairRail.castShadow = !this.mobileEnabled;
      stairRail.receiveShadow = true;
      cityAxisGroup.add(stairRail);

      const stairRailGlow = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.22, 34),
        axisGlowMaterial
      );
      stairRailGlow.position.set(side * 13.28, 0.62, 35.6);
      stairRailGlow.renderOrder = 7;
      cityAxisGroup.add(stairRailGlow);

      for (let postIndex = 0; postIndex < 5; postIndex += 1) {
        const post = new THREE.Mesh(
          new THREE.BoxGeometry(0.22, 1.02, 0.22),
          axisRailMaterial
        );
        post.position.set(side * 13.55, 0.51, 41 + postIndex * 5.4);
        post.castShadow = !this.mobileEnabled;
        post.receiveShadow = true;
        cityAxisGroup.add(post);
      }
    }

    createAxisGuideSign({
      x: -11.2,
      z: 51.6,
      line1: "LIVE",
      line2: "performance portal",
      accent: 0x8feebf
    });
    createAxisGuideSign({
      x: 0,
      z: 54.2,
      line1: "CITY CORE",
      line2: "enter the upper district",
      accent: 0x8fdcff
    });
    createAxisGuideSign({
      x: 11.2,
      z: 51.6,
      line1: "OX 퀴즈 대회",
      line2: "portal 1",
      accent: 0xb1d7ff
    });

    cityGroup.add(cityAxisGroup);

    this.addPlazaBillboards(cityGroup);
    if (this.isChalkFeatureEnabled()) {
      this.addChalkTable(cityGroup);
    } else {
      this.chalkTableWorldPos = null;
      this.chalkTableChalkGroup = null;
      this.chalkPickupEl?.classList.add("hidden");
    }

    const npcGuide = new THREE.Group();
    npcGuide.position.set(this.bridgeNpcPosition.x, 0, this.bridgeNpcPosition.z);
    const npcTempleGate = this.createKoreanTempleGateMesh({
      includePortal: true,
      trackPortalRefs: true
    });
    npcTempleGate.position.set(0, 0, 0.34);
    const spawnPortalVeil = new THREE.Group();
    spawnPortalVeil.position.set(0, this.mobileEnabled ? 8.4 : 10.8, npcTempleGate.position.z - 0.03);
    const veilWidth = this.mobileEnabled ? 84 : 122;
    const veilHeight = this.mobileEnabled ? 48 : 70;
    const veilTexture = this.createSpawnPortalVeilTexture();
    const veilMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: veilTexture,
      roughness: 0.62,
      metalness: 0.1,
      emissive: 0x000000,
      emissiveIntensity: 0,
      depthWrite: true,
      side: THREE.DoubleSide
    });
    const veilCore = new THREE.Mesh(
      new THREE.PlaneGeometry(veilWidth, veilHeight),
      veilMaterial
    );
    veilCore.renderOrder = 18;
    spawnPortalVeil.add(veilCore);

    const npcBody = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.32, 0.86, 4, 8),
      new THREE.MeshStandardMaterial({
        color: 0x516578,
        roughness: 0.44,
        metalness: 0.18,
        emissive: 0x2a4159,
        emissiveIntensity: 0.26
      })
    );
    npcBody.position.y = 0.92;
    npcBody.castShadow = !this.mobileEnabled;
    npcBody.receiveShadow = true;

    const npcHead = new THREE.Mesh(
      new THREE.SphereGeometry(0.24, 14, 14),
      new THREE.MeshStandardMaterial({
        color: 0x84a4c2,
        roughness: 0.3,
        metalness: 0.18,
        emissive: 0x3d6184,
        emissiveIntensity: 0.32
      })
    );
    npcHead.position.y = 1.65;
    npcHead.castShadow = !this.mobileEnabled;
    npcHead.receiveShadow = true;

    const npcPad = new THREE.Mesh(
      new THREE.RingGeometry(0.82, 1.18, this.mobileEnabled ? 24 : 36),
      new THREE.MeshBasicMaterial({
        color: 0x9ad6ff,
        transparent: true,
        opacity: 0.78,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    npcPad.rotation.x = -Math.PI / 2;
    npcPad.position.y = 0.04;

    const npcHoloFloor = new THREE.Mesh(
      new THREE.CircleGeometry(2.12, this.mobileEnabled ? 28 : 48),
      new THREE.MeshBasicMaterial({
        color: 0x67dfff,
        transparent: true,
        opacity: 0.18,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    npcHoloFloor.rotation.x = -Math.PI / 2;
    npcHoloFloor.position.y = 0.028;

    const npcHoloRing = new THREE.Mesh(
      new THREE.RingGeometry(1.34, 2.18, this.mobileEnabled ? 28 : 52),
      new THREE.MeshBasicMaterial({
        color: 0x9cefff,
        transparent: true,
        opacity: 0.42,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    npcHoloRing.rotation.x = -Math.PI / 2;
    npcHoloRing.position.y = 0.032;

    const npcHoloBeam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.56, 1.16, 2.34, this.mobileEnabled ? 12 : 18, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0x6ad7ff,
        transparent: true,
        opacity: 0.14,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    npcHoloBeam.position.y = 1.2;

    const npcHoloFrame = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.PlaneGeometry(1.56, 2.52)),
      new THREE.LineBasicMaterial({
        color: 0xa2f0ff,
        transparent: true,
        opacity: 0.88,
        blending: THREE.AdditiveBlending
      })
    );
    npcHoloFrame.position.set(0, 1.48, -0.45);
    npcHoloFrame.rotation.y = Math.PI;
    npcHoloFrame.renderOrder = 13;
    npcHoloFrame.frustumCulled = false;

    npcGuide.add(
      npcTempleGate,
      spawnPortalVeil,
      npcHoloFloor,
      npcHoloRing,
      npcHoloBeam,
      npcBody,
      npcHead,
      npcPad,
      npcHoloFrame
    );
    const npcGreetingScreen = this.createNpcGreetingScreen();
    npcGuide.add(npcGreetingScreen);
    this.npcWelcomeBubbleLabel = null;

    const mirrorGate = new THREE.Group();
    mirrorGate.position.set(this.bridgeMirrorPosition.x, 0, this.bridgeMirrorPosition.z);
    mirrorGate.visible = false;
    const bridgeTempleGate = this.createKoreanTempleGateMesh();
    bridgeTempleGate.position.set(0, 0, 0.12);
    mirrorGate.add(bridgeTempleGate);

    const bridgeFarEndTempleGate = this.createKoreanTempleGateMesh();
    const farEndGateBackOffset = this.mobileEnabled ? 7.2 : 9.6;
    bridgeFarEndTempleGate.position.set(
      this.bridgeApproachSpawn.x - bridgeDirection.x * farEndGateBackOffset,
      0,
      this.bridgeApproachSpawn.z - bridgeDirection.z * farEndGateBackOffset
    );
    bridgeFarEndTempleGate.rotation.y = bridgeYaw;

    const cityEntryTempleGate = this.createKoreanTempleGateMesh();
    const cityEntryGatePullback = this.mobileEnabled ? 2.2 : 2.8;
    cityEntryTempleGate.position.set(
      this.bridgeCityEntry.x - bridgeDirection.x * cityEntryGatePullback,
      0,
      this.bridgeCityEntry.z - bridgeDirection.z * cityEntryGatePullback
    );
    cityEntryTempleGate.rotation.y = bridgeYaw;

    const portalGroup = new THREE.Group();
    portalGroup.position.copy(this.portalFloorPosition);
    portalGroup.position.y = 0;
    const portalFacingDirection = new THREE.Vector3(
      this.citySpawn.x - portalGroup.position.x,
      0,
      this.citySpawn.z - portalGroup.position.z
    );
    if (portalFacingDirection.lengthSq() < 0.0001) {
      portalGroup.rotation.y = this.portalYawRadians;
    } else {
      portalFacingDirection.normalize();
      portalGroup.rotation.y = Math.atan2(portalFacingDirection.x, portalFacingDirection.z);
      this.portalYawRadians = portalGroup.rotation.y;
    }

    const portalBase = new THREE.Mesh(
      new THREE.TorusGeometry(this.portalRadius * 0.92, 0.24, 18, this.mobileEnabled ? 28 : 56),
      new THREE.MeshStandardMaterial({
        color: 0x406484,
        roughness: 0.24,
        metalness: 0.44,
        emissive: 0x1e3d5a,
        emissiveIntensity: 0.2
      })
    );
    portalBase.rotation.x = Math.PI / 2;
    portalBase.position.y = 0.2;
    portalGroup.add(portalBase);

    const portalRing = new THREE.Mesh(
      new THREE.TorusGeometry(this.portalRadius, 0.34, 26, this.mobileEnabled ? 44 : 72),
      new THREE.MeshStandardMaterial({
        color: 0x2eea72,
        roughness: 0.14,
        metalness: 0.4,
        emissive: 0x00ee55,
        emissiveIntensity: 0.18,
        transparent: true,
        opacity: 0.64
      })
    );
    portalRing.position.y = 2.45;
    portalGroup.add(portalRing);

    const portalCore = new THREE.Mesh(
      new THREE.CircleGeometry(this.portalRadius * 0.84, this.mobileEnabled ? 28 : 50),
      new THREE.MeshBasicMaterial({
        color: 0x00ee55,
        transparent: true,
        opacity: 0.2,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    portalCore.position.y = 2.45;
    const portalCoreGlow = new THREE.Mesh(
      new THREE.CircleGeometry(this.portalRadius * 0.72, this.mobileEnabled ? 24 : 44),
      new THREE.MeshBasicMaterial({
        color: 0x00ee55,
        transparent: true,
        opacity: 0.34,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    portalCoreGlow.position.y = 2.45;
    portalCoreGlow.renderOrder = 12;
    portalGroup.add(portalCore, portalCoreGlow);
    const portalBillboard = this.createPortalTimeBillboard({
      dynamic: false,
      topAdImageUrl: PORTAL_DISPLAY_DEFAULTS.portal1.imageUrl,
      line1: PORTAL_DISPLAY_DEFAULTS.portal1.title,
      line2: PORTAL_DISPLAY_DEFAULTS.portal1.line2,
      line3: PORTAL_DISPLAY_DEFAULTS.portal1.line3,
      rotationY: 0,
      onBillboardReady: (payload = {}) => {
        this.registerPortalDisplayHandle("portal1", payload);
      },
      palette: {
        bgFrom: "rgba(6, 16, 28, 0.50)",
        bgTo: "rgba(8, 24, 39, 0.58)",
        border: "rgba(122, 191, 235, 0.72)",
        stripe: "rgba(88, 150, 198, 0.12)",
        shadow: "rgba(90, 199, 255, 0.65)",
        line1: "#d8f2ff",
        line2: "#9de7ff",
        line3: "#8bd6f5"
      }
    });
    portalGroup.add(portalBillboard);

    const aZonePortalRadius = Math.max(2.4, Number(this.aZonePortalRadius) || this.portalRadius * 0.88);
    const aZonePortalGroup = new THREE.Group();
    const aZonePortalLocalX = cityZoneConfig.A.centerX;
    const aZonePortalLocalZ = 0;
    aZonePortalGroup.position.set(
      cityGroup.position.x + aZonePortalLocalX,
      0,
      cityGroup.position.z + aZonePortalLocalZ
    );
    this.aZonePortalFloorPosition.set(
      aZonePortalGroup.position.x,
      this.portalFloorPosition.y,
      aZonePortalGroup.position.z
    );
    this.aZonePortalRadius = aZonePortalRadius;
    const aZoneFacingDirection = new THREE.Vector3(
      this.citySpawn.x - aZonePortalGroup.position.x,
      0,
      this.citySpawn.z - aZonePortalGroup.position.z
    );
    if (aZoneFacingDirection.lengthSq() < 0.0001) {
      aZoneFacingDirection.set(1, 0, 0);
    } else {
      aZoneFacingDirection.normalize();
    }
    aZonePortalGroup.rotation.y =
      Math.atan2(aZoneFacingDirection.x, aZoneFacingDirection.z);

    const aZonePortalBase = new THREE.Mesh(
      new THREE.TorusGeometry(aZonePortalRadius * 0.9, 0.22, 18, this.mobileEnabled ? 26 : 52),
      new THREE.MeshStandardMaterial({
        color: 0x39617b,
        roughness: 0.26,
        metalness: 0.42,
        emissive: 0x18435a,
        emissiveIntensity: 0.2
      })
    );
    aZonePortalBase.rotation.x = Math.PI / 2;
    aZonePortalBase.position.y = 0.2;
    aZonePortalGroup.add(aZonePortalBase);

    const aZonePortalRing = new THREE.Mesh(
      new THREE.TorusGeometry(aZonePortalRadius, 0.32, 24, this.mobileEnabled ? 42 : 68),
      new THREE.MeshStandardMaterial({
        color: 0x35ef8d,
        roughness: 0.14,
        metalness: 0.38,
        emissive: 0x00ee55,
        emissiveIntensity: 0.82,
        transparent: true,
        opacity: 0.9
      })
    );
    aZonePortalRing.position.y = 2.42;
    aZonePortalGroup.add(aZonePortalRing);

    const aZonePortalCore = new THREE.Mesh(
      new THREE.CircleGeometry(aZonePortalRadius * 0.82, this.mobileEnabled ? 28 : 50),
      new THREE.MeshBasicMaterial({
        color: 0x00ee55,
        transparent: true,
        opacity: 0.65,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    aZonePortalCore.position.y = 2.42;
    const aZonePortalCoreGlow = new THREE.Mesh(
      new THREE.CircleGeometry(aZonePortalRadius * 0.7, this.mobileEnabled ? 24 : 44),
      new THREE.MeshBasicMaterial({
        color: 0x00ee55,
        transparent: true,
        opacity: 0.42,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    aZonePortalCoreGlow.position.y = 2.42;
    aZonePortalCoreGlow.renderOrder = 12;
    aZonePortalGroup.add(aZonePortalCore, aZonePortalCoreGlow);

    const aZonePortalBillboard = this.createPortalTimeBillboard({
      dynamic: false,
      topAdImageUrl: PORTAL_DISPLAY_DEFAULTS.portal2.imageUrl,
      line1: PORTAL_DISPLAY_DEFAULTS.portal2.title,
      line2: PORTAL_DISPLAY_DEFAULTS.portal2.line2,
      line3: PORTAL_DISPLAY_DEFAULTS.portal2.line3,
      rotationY: 0,
      onBillboardReady: (payload = {}) => {
        this.registerPortalDisplayHandle("portal2", payload);
      },
      palette: {
        bgFrom: "rgba(6, 16, 28, 0.50)",
        bgTo: "rgba(8, 24, 39, 0.58)",
        border: "rgba(122, 191, 235, 0.72)",
        stripe: "rgba(88, 150, 198, 0.12)",
        shadow: "rgba(90, 199, 255, 0.65)",
        line1: "#d8f2ff",
        line2: "#9de7ff",
        line3: "#8bd6f5"
      }
    });
    aZonePortalGroup.add(aZonePortalBillboard);

    const hallPortalRadius = Math.max(2.2, Number(this.hallPortalRadius) || this.portalRadius * 0.92);
    const hallPortalGroup = new THREE.Group();
    hallPortalGroup.position.set(this.hallPortalFloorPosition.x, 0, this.hallPortalFloorPosition.z);
    this.hallPortalFloorPosition.set(
      hallPortalGroup.position.x,
      this.portalFloorPosition.y,
      hallPortalGroup.position.z
    );
    this.hallPortalRadius = hallPortalRadius;
    const hallFacingDirection = new THREE.Vector3(
      this.citySpawn.x - hallPortalGroup.position.x,
      0,
      this.citySpawn.z - hallPortalGroup.position.z
    );
    if (hallFacingDirection.lengthSq() < 0.0001) {
      hallFacingDirection.set(0, 0, -1);
    } else {
      hallFacingDirection.normalize();
    }
    hallPortalGroup.rotation.y = Math.atan2(hallFacingDirection.x, hallFacingDirection.z);

    const hallPortalBase = new THREE.Mesh(
      new THREE.TorusGeometry(hallPortalRadius * 0.9, 0.22, 18, this.mobileEnabled ? 26 : 52),
      new THREE.MeshStandardMaterial({
        color: 0x6a4b84,
        roughness: 0.24,
        metalness: 0.4,
        emissive: 0x3b2462,
        emissiveIntensity: 0.24
      })
    );
    hallPortalBase.rotation.x = Math.PI / 2;
    hallPortalBase.position.y = 0.2;
    hallPortalGroup.add(hallPortalBase);

    const hallPortalRing = new THREE.Mesh(
      new THREE.TorusGeometry(hallPortalRadius, 0.32, 24, this.mobileEnabled ? 42 : 68),
      new THREE.MeshStandardMaterial({
        color: 0xff6ec7,
        roughness: 0.14,
        metalness: 0.34,
        emissive: 0xff2fa8,
        emissiveIntensity: 0.72,
        transparent: true,
        opacity: 0.88
      })
    );
    hallPortalRing.position.y = 2.42;
    hallPortalGroup.add(hallPortalRing);

    const hallPortalCore = new THREE.Mesh(
      new THREE.CircleGeometry(hallPortalRadius * 0.82, this.mobileEnabled ? 28 : 50),
      new THREE.MeshBasicMaterial({
        color: 0xff6ec7,
        transparent: true,
        opacity: 0.58,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    hallPortalCore.position.y = 2.42;
    const hallPortalCoreGlow = new THREE.Mesh(
      new THREE.CircleGeometry(hallPortalRadius * 0.7, this.mobileEnabled ? 24 : 44),
      new THREE.MeshBasicMaterial({
        color: 0xff3fba,
        transparent: true,
        opacity: 0.38,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    hallPortalCoreGlow.position.y = 2.42;
    hallPortalCoreGlow.renderOrder = 12;
    hallPortalGroup.add(hallPortalCore, hallPortalCoreGlow);

    const hallPortalBillboard = this.createPortalTimeBillboard({
      dynamic: true,
      topAdImageUrl: HALL_FIXED_PORTAL_IMAGE_URL,
      billboardBaseYOffset: 1.35,
      topAdPanelYOffset: 1.65,
      topAdScale: 1.36,
      rotationY: 0,
      onBillboardReady: (payload = {}) => {
        this.registerPortalDisplayHandle("hall", payload);
      },
      onTopAdReady: (payload = {}) => {
        this.portalTopAdBaseTexture = payload?.texture ?? null;
        this.portalTopAdScreenMaterial = payload?.material ?? null;
        this.portalTopAdUpdateGeometry =
          typeof payload?.updateGeometry === "function" ? payload.updateGeometry : null;
        this.portalTopAdLoadNonce = 0;
        this.applyMainPortalAdState(this.mainPortalAdState, { force: true });
      },
      palette: {
        bgFrom: "rgba(27, 11, 29, 0.56)",
        bgTo: "rgba(46, 14, 45, 0.64)",
        border: "rgba(255, 148, 226, 0.82)",
        stripe: "rgba(208, 102, 178, 0.16)",
        shadow: "rgba(255, 156, 228, 0.72)",
        line1: "#ffe7f8",
        line2: "#ffc7ee",
        line3: "#f6b8e7"
      }
    });
    hallPortalGroup.add(hallPortalBillboard);

    // Keep the old concert hall mesh parked and hidden so the center axis stays open.
    const hallVenueCenter = new THREE.Vector3(0, -220, 0);
    const hallVenueGroup = new THREE.Group();
    hallVenueGroup.position.copy(hallVenueCenter);
    hallVenueGroup.visible = HALL_VENUE_BACKDROP_ENABLED;

    const hallVenueWallMat = new THREE.MeshStandardMaterial({
      color: 0x3e4554,
      roughness: 0.7,
      metalness: 0.12,
      emissive: 0x1f2a3b,
      emissiveIntensity: 0.12
    });
    const hallVenueRoofMat = new THREE.MeshStandardMaterial({
      color: 0x7f4567,
      roughness: 0.42,
      metalness: 0.18,
      emissive: 0x3d2136,
      emissiveIntensity: 0.2
    });
    const hallVenueTrimMat = new THREE.MeshStandardMaterial({
      color: 0x8998ad,
      roughness: 0.48,
      metalness: 0.26,
      emissive: 0x364961,
      emissiveIntensity: 0.18
    });
    const hallVenueGlassMat = new THREE.MeshStandardMaterial({
      color: 0x7fd9ff,
      roughness: 0.18,
      metalness: 0.34,
      emissive: 0x2f97be,
      emissiveIntensity: 0.3,
      transparent: true,
      opacity: 0.72
    });

    const hallVenueBase = new THREE.Mesh(
      new THREE.BoxGeometry(31.5, 0.7, 27),
      hallVenueTrimMat
    );
    hallVenueBase.position.set(0, 0.35, 0.2);
    hallVenueBase.castShadow = !this.mobileEnabled;
    hallVenueBase.receiveShadow = true;

    const hallVenueMain = new THREE.Mesh(
      new THREE.BoxGeometry(24.8, 11.6, 18.2),
      hallVenueWallMat
    );
    hallVenueMain.position.set(0, 6.1, 2.2);
    hallVenueMain.castShadow = !this.mobileEnabled;
    hallVenueMain.receiveShadow = true;

    const hallVenueWingLeft = new THREE.Mesh(
      new THREE.BoxGeometry(7.4, 8.2, 12.4),
      hallVenueWallMat
    );
    hallVenueWingLeft.position.set(-14.2, 4.3, 0.8);
    hallVenueWingLeft.castShadow = !this.mobileEnabled;
    hallVenueWingLeft.receiveShadow = true;

    const hallVenueWingRight = hallVenueWingLeft.clone();
    hallVenueWingRight.position.x = 14.2;

    const hallVenueRoof = new THREE.Mesh(
      new THREE.CylinderGeometry(14.2, 15.6, 3.8, 4),
      hallVenueRoofMat
    );
    hallVenueRoof.rotation.y = Math.PI * 0.25;
    hallVenueRoof.position.set(0, 12.5, 2.3);
    hallVenueRoof.castShadow = !this.mobileEnabled;
    hallVenueRoof.receiveShadow = true;

    const hallVenueCanopy = new THREE.Mesh(
      new THREE.BoxGeometry(11.2, 0.9, 4.6),
      hallVenueTrimMat
    );
    hallVenueCanopy.position.set(0, 4.2, -8.5);
    hallVenueCanopy.castShadow = !this.mobileEnabled;
    hallVenueCanopy.receiveShadow = true;

    const hallVenueDoor = new THREE.Mesh(
      new THREE.BoxGeometry(4.1, 5.3, 0.28),
      hallVenueGlassMat
    );
    hallVenueDoor.position.set(0, 2.95, -8.95);
    hallVenueDoor.castShadow = false;
    hallVenueDoor.receiveShadow = true;

    const hallVenueSign = new THREE.Mesh(
      new THREE.PlaneGeometry(9.8, 2.1),
      new THREE.MeshBasicMaterial({
        color: 0xffd1f0,
        transparent: true,
        opacity: 0.78,
        side: THREE.DoubleSide
      })
    );
    hallVenueSign.position.set(0, 8.8, -8.92);
    hallVenueSign.renderOrder = 18;

    const hallVenueFrame = new THREE.Mesh(
      new THREE.BoxGeometry(11.2, 0.34, 0.34),
      hallVenueTrimMat
    );
    hallVenueFrame.position.set(0, 10.02, -8.82);
    hallVenueFrame.castShadow = false;
    hallVenueFrame.receiveShadow = true;

    hallVenueGroup.add(
      hallVenueBase,
      hallVenueMain,
      hallVenueWingLeft,
      hallVenueWingRight,
      hallVenueRoof,
      hallVenueCanopy,
      hallVenueDoor,
      hallVenueSign,
      hallVenueFrame
    );

    const registerHallVenueCollider = (localX, localZ, width, depth, minY = -2, maxY = 40) => {
      return this.registerStaticWorldBoxCollider(
        hallVenueCenter.x + (Number(localX) || 0),
        hallVenueCenter.z + (Number(localZ) || 0),
        width,
        depth,
        minY,
        maxY
      );
    };
    if (HALL_VENUE_BACKDROP_ENABLED) {
      registerHallVenueCollider(0, 2.2, 24.8, 18.2, 0, 17);
      registerHallVenueCollider(-14.2, 0.8, 7.4, 12.4, 0, 13);
      registerHallVenueCollider(14.2, 0.8, 7.4, 12.4, 0, 13);
      registerHallVenueCollider(0, -8.5, 11.2, 4.6, 0.5, 7);
    }

    // Portal anchors are movable objects. Their collider slot exists only so
    // they can reuse object-state persistence/edit flows without affecting collisions.
    const portalAnchorColliderY = -1200;
    const portalAnchorColliderMaxY = -1100;
    const oxPortalAnchorColliderIndex = this.registerStaticWorldBoxCollider(
      portalGroup.position.x,
      portalGroup.position.z,
      0.2,
      0.2,
      portalAnchorColliderY,
      portalAnchorColliderMaxY
    );
    const fpsPortalAnchorColliderIndex = this.registerStaticWorldBoxCollider(
      aZonePortalGroup.position.x,
      aZonePortalGroup.position.z,
      0.2,
      0.2,
      portalAnchorColliderY,
      portalAnchorColliderMaxY
    );
    const hallPortalAnchorColliderIndex = this.registerStaticWorldBoxCollider(
      hallPortalGroup.position.x,
      hallPortalGroup.position.z,
      0.2,
      0.2,
      portalAnchorColliderY,
      portalAnchorColliderMaxY
    );
    const oxPortalAnchorEntry = this.registerMovableObject(
      portalGroup,
      PORTAL_MOVABLE_IDS.ox,
      oxPortalAnchorColliderIndex,
      { disableColliderSync: true, editorLocked: true }
    );
    const fpsPortalAnchorEntry = this.registerMovableObject(
      aZonePortalGroup,
      PORTAL_MOVABLE_IDS.fps,
      fpsPortalAnchorColliderIndex,
      { disableColliderSync: true, editorLocked: true }
    );
    const hallPortalAnchorEntry = this.registerMovableObject(
      hallPortalGroup,
      PORTAL_MOVABLE_IDS.hall,
      hallPortalAnchorColliderIndex,
      { disableColliderSync: true, editorLocked: true }
    );

    this.hubFlowGroup = group;
    this.portalGroup = portalGroup;
    this.portalRing = portalRing;
    this.portalCore = portalCore;
    this.portalCoreGlow = portalCoreGlow;
    this.portalReplicaGroup = null;
    this.portalReplicaRing = null;
    this.portalReplicaCore = null;
    this.portalReplicaCoreGlow = null;
    this.portalBillboardGroup = portalBillboard;
    this.spawnPortalVeilGroup = spawnPortalVeil;
    this.spawnPortalVeilMaterial = veilMaterial;
    this.spawnPortalVeilWorldZ = npcGuide.position.z + npcTempleGate.position.z;
    this.spawnPortalVeilRevealStarted = false;
    this.npcGreetingMidpointTriggered = false;
    this.aZonePortalGroup = aZonePortalGroup;
    this.aZonePortalRing = aZonePortalRing;
    this.aZonePortalCore = aZonePortalCore;
    this.aZonePortalCoreGlow = aZonePortalCoreGlow;
    this.aZonePortalBillboardGroup = aZonePortalBillboard;
    this.hallPortalGroup = hallPortalGroup;
    this.hallPortalRing = hallPortalRing;
    this.hallPortalCore = hallPortalCore;
    this.hallPortalCoreGlow = hallPortalCoreGlow;
    this.hallPortalBillboardGroup = hallPortalBillboard;
    this.hallVenueGroup = hallVenueGroup;
    this.portalOxAnchorEntry = oxPortalAnchorEntry;
    this.portalFpsAnchorEntry = fpsPortalAnchorEntry;
    this.portalHallAnchorEntry = hallPortalAnchorEntry;
    this.npcGuideGroup = npcGuide;
    this.mirrorGateGroup = mirrorGate;
    this.mirrorGatePanel = null;
    this.bridgeBoundaryMarker = null;
    this.bridgeBoundaryRing = null;
    this.bridgeBoundaryHalo = null;
    this.bridgeBoundaryBeam = null;
    portalGroup.visible = true;
    aZonePortalGroup.visible = A_ZONE_PORTAL_ENABLED;
    hallPortalGroup.visible = true;
    const hubChildren = [
      bridgeGroup,
      cityGroup,
      npcGuide,
      mirrorGate,
      bridgeFarEndTempleGate,
      cityEntryTempleGate
    ];
    hubChildren.push(portalGroup, hallPortalGroup);
    if (A_ZONE_PORTAL_ENABLED) {
      hubChildren.push(aZonePortalGroup);
    }
    hubChildren.push(hallVenueGroup);
    group.add(...hubChildren);
    this.scene.add(group);
    this.loadSavedObjectPositions();
    this.syncPortalAnchorsFromMovableObjects({ force: true });
    if (this.socket && this.networkConnected) {
      this.requestObjectState();
    }
    this.refreshSecurityTestObjectLabels();
    this.setMirrorGateVisible(this.flowStage === "bridge_mirror");
    this.updateBridgeBoundaryMarker(0);
    this.updatePortalVisual();
    this.updateNpcTemplePortalVisual();
    this.updateSpawnPortalVeilVisibility();
  }

  createKoreanTempleGateMesh(options = {}) {
    const includePortal = Boolean(options?.includePortal);
    const trackPortalRefs = Boolean(options?.trackPortalRefs);
    const gateScale = Math.max(0.4, Number(options?.scale) || 2.45);
    const portalScale = Math.max(0.4, Number(options?.portalScale) || 2.25);
    const gateGroup = new THREE.Group();
    const gateWoodMat = new THREE.MeshStandardMaterial({
      color: 0xa0622e,
      roughness: 0.54,
      metalness: 0.08,
      emissive: 0x6a3f24,
      emissiveIntensity: 0.28
    });
    const gateStoneMat = new THREE.MeshStandardMaterial({
      color: 0x8fa2b2,
      roughness: 0.82,
      metalness: 0.04,
      emissive: 0x5f7080,
      emissiveIntensity: 0.22
    });
    const gateRoofMat = new THREE.MeshStandardMaterial({
      color: 0x556e82,
      roughness: 0.5,
      metalness: 0.16,
      emissive: 0x2f4858,
      emissiveIntensity: 0.28
    });
    const gateTrimMat = new THREE.MeshStandardMaterial({
      color: 0xbf3545,
      roughness: 0.42,
      metalness: 0.12,
      emissive: 0x8d2531,
      emissiveIntensity: 0.32
    });
    const gateAccentMat = new THREE.MeshStandardMaterial({
      color: 0x2e8060,
      roughness: 0.42,
      metalness: 0.14,
      emissive: 0x1f5c47,
      emissiveIntensity: 0.28
    });
    const gatePlaqueMat = new THREE.MeshStandardMaterial({
      color: 0x2e4a6a,
      roughness: 0.4,
      metalness: 0.18,
      emissive: 0x1e3050,
      emissiveIntensity: 0.30
    });

    for (const side of [-1, 1]) {
      const pillarBase = new THREE.Mesh(
        new THREE.CylinderGeometry(0.34, 0.4, 0.24, this.mobileEnabled ? 12 : 18),
        gateStoneMat
      );
      pillarBase.position.set(side * 1.6, 0.12, 0);
      pillarBase.receiveShadow = true;
      gateGroup.add(pillarBase);

      const pillar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.19, 0.22, 3.56, this.mobileEnabled ? 10 : 14),
        gateWoodMat
      );
      pillar.position.set(side * 1.6, 1.9, 0);
      pillar.castShadow = !this.mobileEnabled;
      pillar.receiveShadow = true;
      gateGroup.add(pillar);

      const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.24, 0.54), gateTrimMat);
      bracket.position.set(side * 1.18, 3.24, 0);
      bracket.castShadow = !this.mobileEnabled;
      bracket.receiveShadow = true;
      gateGroup.add(bracket);
    }

    const lowerBeam = new THREE.Mesh(new THREE.BoxGeometry(4.12, 0.24, 0.34), gateAccentMat);
    lowerBeam.position.set(0, 3.32, 0);
    lowerBeam.castShadow = !this.mobileEnabled;
    lowerBeam.receiveShadow = true;

    const mainBeam = new THREE.Mesh(new THREE.BoxGeometry(4.48, 0.3, 0.44), gateWoodMat);
    mainBeam.position.set(0, 3.66, 0);
    mainBeam.castShadow = !this.mobileEnabled;
    mainBeam.receiveShadow = true;

    const roofCore = new THREE.Mesh(new THREE.BoxGeometry(5.1, 0.2, 1.5), gateRoofMat);
    roofCore.position.set(0, 4.2, 0);
    roofCore.castShadow = !this.mobileEnabled;
    roofCore.receiveShadow = true;

    const roofFront = new THREE.Mesh(new THREE.BoxGeometry(5.26, 0.16, 0.76), gateRoofMat);
    roofFront.position.set(0, 4.03, -0.72);
    roofFront.rotation.x = 0.24;
    roofFront.castShadow = !this.mobileEnabled;
    roofFront.receiveShadow = true;

    const roofBack = new THREE.Mesh(new THREE.BoxGeometry(5.26, 0.16, 0.76), gateRoofMat);
    roofBack.position.set(0, 4.03, 0.72);
    roofBack.rotation.x = -0.24;
    roofBack.castShadow = !this.mobileEnabled;
    roofBack.receiveShadow = true;

    const eaveTrimFront = new THREE.Mesh(new THREE.BoxGeometry(5.18, 0.08, 0.18), gateTrimMat);
    eaveTrimFront.position.set(0, 3.92, -1.04);
    eaveTrimFront.castShadow = !this.mobileEnabled;
    eaveTrimFront.receiveShadow = true;

    const eaveTrimBack = new THREE.Mesh(new THREE.BoxGeometry(5.18, 0.08, 0.18), gateTrimMat);
    eaveTrimBack.position.set(0, 3.92, 1.04);
    eaveTrimBack.castShadow = !this.mobileEnabled;
    eaveTrimBack.receiveShadow = true;

    const gatePlaque = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.56, 0.08), gatePlaqueMat);
    gatePlaque.position.set(0, 3.24, -0.26);
    gatePlaque.castShadow = !this.mobileEnabled;
    gatePlaque.receiveShadow = true;

    gateGroup.add(
      lowerBeam,
      mainBeam,
      roofCore,
      roofFront,
      roofBack,
      eaveTrimFront,
      eaveTrimBack,
      gatePlaque
    );

    if (includePortal) {
      const portalRingRadius = 1.06 * portalScale;
      const portalRingTube = 0.1 * portalScale;
      const portalCoreRadius = 0.98 * portalScale;
      const portalGlowRadius = 0.78 * portalScale;
      const portalRing = new THREE.Mesh(
        new THREE.TorusGeometry(portalRingRadius, portalRingTube, 20, this.mobileEnabled ? 28 : 44),
        new THREE.MeshStandardMaterial({
          color: 0x0abf4d,
          roughness: 0.22,
          metalness: 0.32,
          emissive: 0x00ee55,
          emissiveIntensity: 0.58,
          transparent: true,
          opacity: 0.88
        })
      );
      portalRing.position.set(0, 1.92, -0.04);
      portalRing.castShadow = !this.mobileEnabled;
      portalRing.receiveShadow = true;

      const portalCore = new THREE.Mesh(
        new THREE.CircleGeometry(portalCoreRadius, this.mobileEnabled ? 24 : 40),
        new THREE.MeshStandardMaterial({
          color: 0x00ee55,
          roughness: 0.16,
          metalness: 0.08,
          emissive: 0x00ee55,
          emissiveIntensity: 0.95,
          side: THREE.DoubleSide
        })
      );
      portalCore.position.set(0, 1.92, -0.04);
      portalCore.castShadow = false;
      portalCore.receiveShadow = true;

      const portalGlow = new THREE.Mesh(
        new THREE.CircleGeometry(portalGlowRadius, this.mobileEnabled ? 22 : 36),
        new THREE.MeshBasicMaterial({
          color: 0x00ee55,
          transparent: true,
          opacity: 0.65,
          side: THREE.DoubleSide,
          depthWrite: false,
          blending: THREE.AdditiveBlending
        })
      );
      portalGlow.position.set(0, 1.92, -0.036);
      portalGlow.renderOrder = 14;

      gateGroup.add(portalRing, portalCore, portalGlow);
      if (trackPortalRefs) {
        this.npcTemplePortalCore = portalCore;
        this.npcTemplePortalGlow = portalGlow;
      }
    }

    gateGroup.scale.setScalar(gateScale);

    return gateGroup;
  }

  addPlazaBillboards(cityGroup) {
    if (!cityGroup) {
      return;
    }

    const maxAnisotropy = this.renderer?.capabilities?.getMaxAnisotropy?.() ?? 1;
    const adTexture = this.textureLoader.load(AD_BILLBOARD_IMAGE_URL);
    adTexture.colorSpace = THREE.SRGBColorSpace;
    adTexture.anisotropy = this.mobileEnabled ? Math.min(2, maxAnisotropy) : Math.min(8, maxAnisotropy);
    this.plazaBillboardAdTexture = adTexture;

    const supportMaterial = new THREE.MeshStandardMaterial({
      color: 0x2f3946,
      roughness: 0.52,
      metalness: 0.24,
      emissive: 0x121a23,
      emissiveIntensity: 0.15
    });
    const frameMaterial = new THREE.MeshStandardMaterial({
      color: 0x0f141b,
      roughness: 0.32,
      metalness: 0.42,
      emissive: 0x213041,
      emissiveIntensity: 0.22
    });
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: 0x5ecbff,
      transparent: true,
      opacity: 0.1,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false
    });
    const boardScale = this.mobileEnabled ? 1.02 : 1.18;
    const columnHeight = 8.6 * boardScale;
    const columnWidth = 0.44 * boardScale;
    const frameWidth = 8.6 * boardScale;
    const frameHeight = 5.1 * boardScale;
    const frameDepth = 0.52 * boardScale;
    const screenWidth = 7.8 * boardScale;
    const screenHeight = 4.3 * boardScale;
    const glowWidth = 8.2 * boardScale;
    const glowHeight = 4.7 * boardScale;
    const columnOffsetX = 3.6 * boardScale;
    const frameY = 7.2 * boardScale;
    const frameZ = -0.22 * boardScale;
    const placements = [
      // Keep the center lane open by moving the large ad boards to the side terraces.
      { x: -33.5, z: 42.5, yaw: Math.PI * 0.75 },
      { x: 33.5, z: 42.5, yaw: -Math.PI * 0.75 }
    ];

    placements.forEach((placement, index) => {
      const board = new THREE.Group();
      board.position.set(placement.x, 0, placement.z);
      board.rotation.y = placement.yaw;

      const leftColumn = new THREE.Mesh(
        new THREE.BoxGeometry(columnWidth, columnHeight, columnWidth),
        supportMaterial
      );
      leftColumn.position.set(-columnOffsetX, columnHeight * 0.5, frameZ);
      leftColumn.castShadow = !this.mobileEnabled;
      leftColumn.receiveShadow = true;

      const rightColumn = leftColumn.clone();
      rightColumn.position.x = columnOffsetX;

      const frame = new THREE.Mesh(
        new THREE.BoxGeometry(frameWidth, frameHeight, frameDepth),
        frameMaterial
      );
      frame.position.set(0, frameY, frameZ);
      frame.castShadow = !this.mobileEnabled;
      frame.receiveShadow = true;

      const screenMaterial = new THREE.MeshBasicMaterial({
        map: adTexture,
        color: 0xffffff,
        toneMapped: false
      });
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(screenWidth, screenHeight), screenMaterial);
      screen.position.set(0, frameY, 0.09 * boardScale);
      screen.renderOrder = 15;

      const glow = new THREE.Mesh(new THREE.PlaneGeometry(glowWidth, glowHeight), glowMaterial);
      glow.position.set(0, frameY, 0.07 * boardScale);
      glow.renderOrder = 14;

      board.add(leftColumn, rightColumn, frame, glow, screen);
      cityGroup.add(board);
      if (index === 0) {
        this.plazaBillboardRightScreenMaterial = screenMaterial;
        this.rightBillboardSourcePosition.set(
          this.citySpawn.x + placement.x,
          frameY,
          this.citySpawn.z + 4 + placement.z
        );
      } else if (index === 1) {
        this.plazaBillboardLeftScreenMaterial = screenMaterial;
      }
    });

    this.applyLeftBillboardState(this.leftBillboardState, { force: true });
    this.applyRightBillboardState(this.rightBillboardState, { force: true });
  }

  normalizeRightBillboardVideoId(rawVideoId) {
    const text = String(rawVideoId ?? "").trim().toLowerCase();
    if (!text) {
      return "";
    }
    return RIGHT_BILLBOARD_VIDEO_ID_LOOKUP[text] ?? "";
  }

  normalizeBillboardVideoDataUrl(rawDataUrl) {
    const value = String(rawDataUrl ?? "").trim();
    if (!value || value.length > MAX_BILLBOARD_VIDEO_DATA_URL_CHARS) {
      return "";
    }
    if (!/^data:video\/[a-z0-9.+-]+;base64,/i.test(value)) {
      return "";
    }
    return value;
  }

  normalizeBillboardVideoTarget(rawTarget) {
    const target = String(rawTarget ?? "").trim().toLowerCase();
    if (target === "left" || target === "right" || target === "both") {
      return target;
    }
    return "";
  }

  normalizePortalDisplayKey(rawPortalKey) {
    const key = String(rawPortalKey ?? "").trim().toLowerCase();
    return key === "portal1" || key === "portal2" || key === "hall" ? key : "";
  }

  getPortalDisplayDefaults(rawPortalKey) {
    const portalKey = this.normalizePortalDisplayKey(rawPortalKey);
    if (portalKey && PORTAL_DISPLAY_DEFAULTS[portalKey]) {
      return PORTAL_DISPLAY_DEFAULTS[portalKey];
    }
    return PORTAL_DISPLAY_DEFAULTS.portal1;
  }

  createPortalDisplayHandle(rawPortalKey) {
    const defaults = this.getPortalDisplayDefaults(rawPortalKey);
    return {
      portalKey: this.normalizePortalDisplayKey(rawPortalKey) || "portal1",
      defaultTitle: defaults.title,
      defaultLine2: defaults.line2,
      defaultLine3: defaults.line3,
      defaultImageUrl: defaults.imageUrl,
      baseTexture: null,
      material: null,
      updateGeometry: null,
      redrawLines: null,
      customTexture: null,
      loadNonce: 0,
      lineCache: {
        line1: "",
        line2: "",
        line3: ""
      }
    };
  }

  normalizePortalDisplayTitle(rawTitle, fallback = "") {
    const value = String(rawTitle ?? "")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, MAX_PORTAL_DISPLAY_TITLE_CHARS);
    if (value) {
      return value;
    }
    return String(fallback ?? "")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, MAX_PORTAL_DISPLAY_TITLE_CHARS);
  }

  normalizePortalDisplayLine(rawLine, fallback = "") {
    const value = String(rawLine ?? "")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, MAX_PORTAL_DISPLAY_LINE_CHARS);
    if (value) {
      return value;
    }
    return String(fallback ?? "")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, MAX_PORTAL_DISPLAY_LINE_CHARS);
  }

  normalizePortalDisplayMode(rawMode, fallback = "text") {
    const value = String(rawMode ?? "").trim().toLowerCase();
    if (value === "time") {
      return "time";
    }
    if (value === "text") {
      return "text";
    }
    return fallback === "time" ? "time" : "text";
  }

  normalizePortalDisplayImageDataUrl(rawImageDataUrl) {
    const value = String(rawImageDataUrl ?? "").trim();
    if (!value || value.length > MAX_MAIN_PORTAL_AD_IMAGE_CHARS) {
      return "";
    }
    if (!value.startsWith("data:image/")) {
      return "";
    }
    return value;
  }

  normalizePortalDisplayState(rawPortalKey, rawState = {}) {
    const defaults = this.getPortalDisplayDefaults(rawPortalKey);
    return {
      mode: this.normalizePortalDisplayMode(rawState?.mode, defaults.mode),
      title: this.normalizePortalDisplayTitle(rawState?.title ?? rawState?.name ?? "", defaults.title),
      line2: this.normalizePortalDisplayLine(rawState?.line2 ?? "", defaults.line2),
      line3: this.normalizePortalDisplayLine(rawState?.line3 ?? "", defaults.line3),
      imageDataUrl: this.normalizePortalDisplayImageDataUrl(
        rawState?.imageDataUrl ?? rawState?.dataUrl ?? ""
      ),
      updatedAt: Math.max(0, Math.trunc(Number(rawState?.updatedAt) || Date.now()))
    };
  }

  getPortalDisplayState(rawPortalKey) {
    const portalKey = this.normalizePortalDisplayKey(rawPortalKey);
    if (!portalKey) {
      return this.normalizePortalDisplayState("portal1");
    }
    return this.normalizePortalDisplayState(portalKey, this.portalDisplayStates?.[portalKey]);
  }

  disposePortalDisplayCustomTexture(rawPortalKey) {
    const portalKey = this.normalizePortalDisplayKey(rawPortalKey);
    if (!portalKey) {
      return;
    }
    const handle = this.portalDisplayHandles?.[portalKey];
    if (!handle?.customTexture) {
      return;
    }
    handle.customTexture.dispose?.();
    handle.customTexture = null;
  }

  registerPortalDisplayHandle(rawPortalKey, payload = {}) {
    const portalKey = this.normalizePortalDisplayKey(rawPortalKey);
    if (!portalKey) {
      return;
    }
    const defaults = this.getPortalDisplayDefaults(portalKey);
    const previousHandle = this.portalDisplayHandles?.[portalKey];
    const nextHandle = previousHandle ?? this.createPortalDisplayHandle(portalKey);
    nextHandle.defaultTitle = defaults.title;
    nextHandle.defaultLine2 = defaults.line2;
    nextHandle.defaultLine3 = defaults.line3;
    nextHandle.defaultImageUrl = defaults.imageUrl;
    nextHandle.baseTexture = payload?.topAdBaseTexture ?? nextHandle.baseTexture ?? null;
    nextHandle.material = payload?.topAdMaterial ?? nextHandle.material ?? null;
    nextHandle.updateGeometry =
      typeof payload?.updateTopAdGeometry === "function"
        ? payload.updateTopAdGeometry
        : nextHandle.updateGeometry;
    nextHandle.redrawLines =
      typeof payload?.redrawLines === "function" ? payload.redrawLines : nextHandle.redrawLines;
    this.portalDisplayHandles[portalKey] = nextHandle;
    this.applyPortalDisplayState(portalKey, this.portalDisplayStates?.[portalKey] ?? {}, {
      force: true
    });
  }

  updatePortalDisplayGeometryFromTexture(rawPortalKey, texture) {
    const portalKey = this.normalizePortalDisplayKey(rawPortalKey);
    if (!portalKey) {
      return;
    }
    const handle = this.portalDisplayHandles?.[portalKey];
    if (!handle?.updateGeometry || !texture?.image) {
      return;
    }
    const width = Number(texture.image.width) || 0;
    const height = Number(texture.image.height) || 0;
    if (width > 0 && height > 0) {
      handle.updateGeometry(width / height);
    }
  }

  applyPortalDisplayTexture(rawPortalKey, rawImageDataUrl) {
    const portalKey = this.normalizePortalDisplayKey(rawPortalKey);
    if (!portalKey) {
      return;
    }
    const handle = this.portalDisplayHandles?.[portalKey];
    if (!handle?.material) {
      return;
    }

    const imageDataUrl = this.normalizePortalDisplayImageDataUrl(rawImageDataUrl);
    handle.loadNonce = Math.max(0, Math.trunc(Number(handle.loadNonce) || 0)) + 1;
    const loadNonce = handle.loadNonce;

    if (!imageDataUrl) {
      this.disposePortalDisplayCustomTexture(portalKey);
      handle.material.map = handle.baseTexture ?? null;
      handle.material.needsUpdate = true;
      this.updatePortalDisplayGeometryFromTexture(portalKey, handle.baseTexture);
      return;
    }

    const texture = this.textureLoader.load(
      imageDataUrl,
      (loadedTexture) => {
        if (loadNonce !== handle.loadNonce) {
          texture.dispose();
          return;
        }
        loadedTexture.colorSpace = THREE.SRGBColorSpace;
        loadedTexture.minFilter = THREE.LinearMipmapLinearFilter;
        loadedTexture.magFilter = THREE.LinearFilter;
        loadedTexture.generateMipmaps = true;
        const maxAnisotropy = Math.max(1, this.renderer?.capabilities?.getMaxAnisotropy?.() || 1);
        loadedTexture.anisotropy = this.mobileEnabled
          ? Math.min(2, maxAnisotropy)
          : Math.min(8, maxAnisotropy);
        loadedTexture.needsUpdate = true;
        if (handle.customTexture && handle.customTexture !== loadedTexture) {
          handle.customTexture.dispose?.();
        }
        handle.customTexture = loadedTexture;
        handle.material.map = loadedTexture;
        handle.material.needsUpdate = true;
        this.updatePortalDisplayGeometryFromTexture(portalKey, loadedTexture);
      },
      undefined,
      () => {
        if (loadNonce !== handle.loadNonce) {
          texture.dispose();
          return;
        }
        texture.dispose();
        this.applyPortalDisplayTexture(portalKey, "");
      }
    );
  }

  applyPortalDisplayLines(rawPortalKey, rawState = {}, { force = false } = {}) {
    const portalKey = this.normalizePortalDisplayKey(rawPortalKey);
    if (!portalKey) {
      return;
    }
    if (portalKey === "hall") {
      this.updatePortalTimeBillboard(0, true);
      return;
    }
    const handle = this.portalDisplayHandles?.[portalKey];
    if (!handle?.redrawLines) {
      return;
    }
    const state = this.normalizePortalDisplayState(portalKey, rawState);
    const line1 = state.title;
    const line2 =
      state.mode === "time"
        ? `현재시간 : ${this.formatPortalClockTimeText(Date.now())}`
        : state.line2;
    const line3 = state.mode === "time" ? "" : state.line3;
    if (
      !force &&
      handle.lineCache.line1 === line1 &&
      handle.lineCache.line2 === line2 &&
      handle.lineCache.line3 === line3
    ) {
      return;
    }
    handle.redrawLines({ line1, line2, line3 });
    handle.lineCache = { line1, line2, line3 };
  }

  applyPortalDisplayState(rawPortalKey, rawState = {}, { force = false } = {}) {
    const portalKey = this.normalizePortalDisplayKey(rawPortalKey);
    if (!portalKey) {
      return false;
    }
    const previous = this.getPortalDisplayState(portalKey);
    const next = this.normalizePortalDisplayState(portalKey, rawState);
    if (
      !force &&
      previous.mode === next.mode &&
      previous.title === next.title &&
      previous.line2 === next.line2 &&
      previous.line3 === next.line3 &&
      previous.imageDataUrl === next.imageDataUrl
    ) {
      return false;
    }
    this.portalDisplayStates[portalKey] = next;
    this.applyPortalDisplayLines(portalKey, next, { force: true });
    this.applyPortalDisplayTexture(portalKey, next.imageDataUrl);
    return true;
  }

  applyPortalDisplayCollection(rawCollection = {}, { force = false } = {}) {
    const collection = rawCollection && typeof rawCollection === "object" ? rawCollection : {};
    this.applyPortalDisplayState("portal1", collection.portal1 ?? {}, { force });
    this.applyPortalDisplayState("portal2", collection.portal2 ?? {}, { force });
    this.applyPortalDisplayState("hall", collection.hall ?? {}, { force });
  }

  normalizeMainPortalAdState(rawState = {}) {
    const imageDataUrl = String(rawState?.imageDataUrl ?? rawState?.dataUrl ?? "").trim();
    const hasValidImage =
      imageDataUrl.length > 0 &&
      imageDataUrl.length <= MAX_MAIN_PORTAL_AD_IMAGE_CHARS &&
      imageDataUrl.startsWith("data:image/");
    const modeRaw = String(rawState?.mode ?? "ad").trim().toLowerCase();
    const mode = modeRaw === "image" && hasValidImage ? "image" : "ad";
    return {
      mode,
      imageDataUrl: mode === "image" ? imageDataUrl : "",
      updatedAt: Math.max(0, Math.trunc(Number(rawState?.updatedAt) || Date.now()))
    };
  }

  updatePortalTopAdGeometryFromTexture(texture) {
    if (!this.portalTopAdUpdateGeometry || !texture?.image) {
      return;
    }
    const width = Number(texture.image.width) || 0;
    const height = Number(texture.image.height) || 0;
    if (width > 0 && height > 0) {
      this.portalTopAdUpdateGeometry(width / height);
    }
  }

  applyMainPortalAdTexture(rawImageDataUrl) {
    if (!this.portalTopAdScreenMaterial) {
      return;
    }

    const imageDataUrl = String(rawImageDataUrl ?? "").trim();
    this.portalTopAdLoadNonce += 1;

    if (!imageDataUrl) {
      if (this.portalTopAdCustomTexture) {
        this.portalTopAdCustomTexture.dispose();
        this.portalTopAdCustomTexture = null;
      }
      if (this.portalTopAdBaseTexture) {
        this.portalTopAdScreenMaterial.map = this.portalTopAdBaseTexture;
        this.portalTopAdScreenMaterial.needsUpdate = true;
        this.updatePortalTopAdGeometryFromTexture(this.portalTopAdBaseTexture);
      }
      return;
    }

    const loadNonce = this.portalTopAdLoadNonce;
    const texture = this.textureLoader.load(
      imageDataUrl,
      () => {
        if (loadNonce !== this.portalTopAdLoadNonce) {
          texture.dispose();
          return;
        }
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = true;
        const maxAnisotropy = Math.max(1, this.renderer?.capabilities?.getMaxAnisotropy?.() || 1);
        texture.anisotropy = this.mobileEnabled
          ? Math.min(2, maxAnisotropy)
          : Math.min(8, maxAnisotropy);
        texture.needsUpdate = true;

        if (this.portalTopAdCustomTexture && this.portalTopAdCustomTexture !== texture) {
          this.portalTopAdCustomTexture.dispose();
        }
        this.portalTopAdCustomTexture = texture;
        this.portalTopAdScreenMaterial.map = texture;
        this.portalTopAdScreenMaterial.needsUpdate = true;
        this.updatePortalTopAdGeometryFromTexture(texture);
      },
      undefined,
      () => {
        if (loadNonce !== this.portalTopAdLoadNonce) {
          texture.dispose();
          return;
        }
        texture.dispose();
        this.applyMainPortalAdTexture("");
      }
    );
  }

  applyMainPortalAdState(rawState = {}, { force = false } = {}) {
    const next = this.normalizeMainPortalAdState(rawState);
    const previous = this.normalizeMainPortalAdState(this.mainPortalAdState);
    if (
      !force &&
      previous.mode === next.mode &&
      previous.imageDataUrl === next.imageDataUrl
    ) {
      return false;
    }

    this.mainPortalAdState = next;
    if (next.mode === "image" && next.imageDataUrl) {
      this.applyMainPortalAdTexture(next.imageDataUrl);
      return true;
    }
    this.applyMainPortalAdTexture("");
    return true;
  }

  normalizeRightBillboardState(rawState = {}) {
    const videoId = this.normalizeRightBillboardVideoId(rawState?.videoId ?? rawState?.id ?? "");
    const videoDataUrl = this.normalizeBillboardVideoDataUrl(rawState?.videoDataUrl ?? rawState?.dataUrl ?? "");
    const modeRaw = String(rawState?.mode ?? "ad").trim().toLowerCase();
    let mode = "ad";
    if (modeRaw === "video_data" && videoDataUrl) {
      mode = "video_data";
    } else if (modeRaw === "video" && videoId) {
      mode = "video";
    }
    return {
      mode,
      videoId: mode === "video" ? videoId : "",
      videoDataUrl: mode === "video_data" ? videoDataUrl : "",
      updatedAt: Math.max(0, Math.trunc(Number(rawState?.updatedAt) || Date.now()))
    };
  }

  normalizeLeftBillboardState(rawState = {}) {
    const imageDataUrl = String(rawState?.imageDataUrl ?? rawState?.dataUrl ?? "").trim();
    const videoDataUrl = this.normalizeBillboardVideoDataUrl(rawState?.videoDataUrl ?? "");
    const hasValidImage =
      imageDataUrl.length > 0 &&
      imageDataUrl.length <= MAX_LEFT_BILLBOARD_IMAGE_CHARS &&
      imageDataUrl.startsWith("data:image/");
    const modeRaw = String(rawState?.mode ?? "ad").trim().toLowerCase();
    let mode = "ad";
    if (modeRaw === "image" && hasValidImage) {
      mode = "image";
    } else if (modeRaw === "video_data" && videoDataUrl) {
      mode = "video_data";
    }
    return {
      mode,
      imageDataUrl: mode === "image" ? imageDataUrl : "",
      videoDataUrl: mode === "video_data" ? videoDataUrl : "",
      updatedAt: Math.max(0, Math.trunc(Number(rawState?.updatedAt) || Date.now()))
    };
  }

  applyLeftBillboardState(rawState = {}, { force = false } = {}) {
    const next = this.normalizeLeftBillboardState(rawState);
    const previous = this.normalizeLeftBillboardState(this.leftBillboardState);
    if (
      !force &&
      previous.mode === next.mode &&
      previous.imageDataUrl === next.imageDataUrl &&
      previous.videoDataUrl === next.videoDataUrl
    ) {
      return false;
    }

    this.leftBillboardState = next;
    if (next.mode === "image" && next.imageDataUrl) {
      this.setLeftBillboardImage(next.imageDataUrl);
      return true;
    }
    if (next.mode === "video_data" && next.videoDataUrl) {
      this.startLeftBillboardVideoDataPlayback(next.videoDataUrl);
      return true;
    }

    this.resetLeftBillboardImage();
    return true;
  }

  getRightBillboardVideoUrl(rawVideoId) {
    const videoId = this.normalizeRightBillboardVideoId(rawVideoId);
    if (!videoId) {
      return "";
    }
    const relativePath = RIGHT_BILLBOARD_VIDEO_PATHS[videoId];
    return resolveRuntimeAssetUrl(relativePath);
  }

  stopLeftBillboardVideoPlayback() {
    this.leftBillboardActiveVideoDataUrl = "";
    if (this.plazaBillboardLeftVideoEl) {
      const video = this.plazaBillboardLeftVideoEl;
      this.plazaBillboardLeftVideoEl = null;
      video.onended = null;
      video.onerror = null;
      video.pause();
      video.removeAttribute("src");
      video.load();
    }
    if (this.plazaBillboardLeftVideoTexture) {
      this.plazaBillboardLeftVideoTexture.dispose();
      this.plazaBillboardLeftVideoTexture = null;
    }
  }

  stopRightBillboardVideoPlayback() {
    this.rightBillboardActiveVideoId = "";
    this.rightBillboardActiveVideoDataUrl = "";
    if (this.plazaBillboardRightVideoEl) {
      const video = this.plazaBillboardRightVideoEl;
      this.plazaBillboardRightVideoEl = null;
      video.onended = null;
      video.onerror = null;
      video.pause();
      video.removeAttribute("src");
      video.load();
    }

    if (this.plazaBillboardRightVideoTexture) {
      this.plazaBillboardRightVideoTexture.dispose();
      this.plazaBillboardRightVideoTexture = null;
    }
  }

  showDefaultBillboardAdOnRight() {
    this.stopRightBillboardVideoPlayback();
    if (!this.plazaBillboardRightScreenMaterial) {
      return;
    }
    if (!this.plazaBillboardAdTexture) {
      return;
    }

    this.plazaBillboardRightScreenMaterial.map = this.plazaBillboardAdTexture;
    this.plazaBillboardRightScreenMaterial.needsUpdate = true;
  }

  setLeftBillboardImage(rawUrl) {
    if (!this.plazaBillboardLeftScreenMaterial) return;
    const url = String(rawUrl ?? "").trim();
    if (!url) {
      this.resetLeftBillboardImage();
      return;
    }
    this.stopLeftBillboardVideoPlayback();
    // Dispose previous custom texture
    this.plazaBillboardLeftCustomTexture?.dispose();
    this.plazaBillboardLeftCustomTexture = null;

    const texture = this.textureLoader.load(
      url,
      () => {
        // success — texture applied in onLoad
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.needsUpdate = true;
      },
      undefined,
      () => {
        // error — revert to ad
        texture.dispose();
        if (this.plazaBillboardLeftCustomTexture === texture) {
          this.plazaBillboardLeftCustomTexture = null;
          this.resetLeftBillboardImage();
        }
      }
    );
    texture.colorSpace = THREE.SRGBColorSpace;
    this.plazaBillboardLeftCustomTexture = texture;
    this.plazaBillboardLeftScreenMaterial.map = texture;
    this.plazaBillboardLeftScreenMaterial.needsUpdate = true;
  }

  resetLeftBillboardImage() {
    this.stopLeftBillboardVideoPlayback();
    this.plazaBillboardLeftCustomTexture?.dispose();
    this.plazaBillboardLeftCustomTexture = null;
    if (!this.plazaBillboardLeftScreenMaterial) return;
    this.plazaBillboardLeftScreenMaterial.map = this.plazaBillboardAdTexture ?? null;
    this.plazaBillboardLeftScreenMaterial.needsUpdate = true;
  }

  startLeftBillboardVideoDataPlayback(rawVideoDataUrl) {
    const videoDataUrl = this.normalizeBillboardVideoDataUrl(rawVideoDataUrl);
    if (!videoDataUrl || !this.plazaBillboardLeftScreenMaterial) {
      this.resetLeftBillboardImage();
      return false;
    }

    if (
      this.leftBillboardActiveVideoDataUrl === videoDataUrl &&
      this.plazaBillboardLeftVideoEl &&
      !this.plazaBillboardLeftVideoEl.ended
    ) {
      return true;
    }

    this.plazaBillboardLeftCustomTexture?.dispose();
    this.plazaBillboardLeftCustomTexture = null;
    this.stopLeftBillboardVideoPlayback();

    const video = document.createElement("video");
    video.preload = "metadata";
    video.playsInline = true;
    video.muted = true;
    video.loop = true;
    video.crossOrigin = "anonymous";
    video.disablePictureInPicture = true;
    video.setAttribute("playsinline", "true");
    video.setAttribute("webkit-playsinline", "true");
    video.setAttribute("disableremoteplayback", "true");
    video.src = videoDataUrl;
    video.currentTime = 0;

    const texture = new THREE.VideoTexture(video);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;

    this.plazaBillboardLeftVideoEl = video;
    this.plazaBillboardLeftVideoTexture = texture;
    this.leftBillboardActiveVideoDataUrl = videoDataUrl;

    video.addEventListener(
      "canplay",
      () => {
        if (this.plazaBillboardLeftVideoEl !== video) return;
        if (this.plazaBillboardLeftScreenMaterial) {
          this.plazaBillboardLeftScreenMaterial.map = texture;
          this.plazaBillboardLeftScreenMaterial.needsUpdate = true;
        }
      },
      { once: true }
    );

    const finishPlayback = () => {
      if (this.plazaBillboardLeftVideoEl !== video) {
        return;
      }
      this.handleLeftBillboardVideoDataFinished(videoDataUrl);
    };
    video.onended = null;
    video.onerror = finishPlayback;

    video.play().catch(() => {
      finishPlayback();
    });
    return true;
  }

  startRightBillboardVideoPlayback(rawVideoId) {
    const videoId = this.normalizeRightBillboardVideoId(rawVideoId);
    if (!videoId || !this.plazaBillboardRightScreenMaterial) {
      this.showDefaultBillboardAdOnRight();
      return false;
    }

    const sourceUrl = this.getRightBillboardVideoUrl(videoId);
    if (!sourceUrl) {
      this.showDefaultBillboardAdOnRight();
      return false;
    }

    if (
      this.rightBillboardActiveVideoId === videoId &&
      this.plazaBillboardRightVideoEl &&
      !this.plazaBillboardRightVideoEl.ended
    ) {
      return true;
    }

    this.stopRightBillboardVideoPlayback();

    const video = document.createElement("video");
    video.preload = "metadata";
    video.playsInline = true;
    video.muted = false;
    video.loop = false;
    video.crossOrigin = "anonymous";
    video.disablePictureInPicture = true;
    video.setAttribute("playsinline", "true");
    video.setAttribute("webkit-playsinline", "true");
    video.setAttribute("disableremoteplayback", "true");
    video.src = sourceUrl;
    video.currentTime = 0;

    const texture = new THREE.VideoTexture(video);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;

    this.plazaBillboardRightVideoEl = video;
    this.plazaBillboardRightVideoTexture = texture;
    this.rightBillboardActiveVideoId = videoId;
    this.rightBillboardActiveVideoDataUrl = "";

    // Keep showing the AD image until video has enough data to display,
    // so joining players see the AD briefly instead of a black frame.
    video.addEventListener(
      "canplay",
      () => {
        if (this.plazaBillboardRightVideoEl !== video) return;
        if (this.plazaBillboardRightScreenMaterial) {
          this.plazaBillboardRightScreenMaterial.map = texture;
          this.plazaBillboardRightScreenMaterial.needsUpdate = true;
        }
      },
      { once: true }
    );

    const finishPlayback = () => {
      if (this.plazaBillboardRightVideoEl !== video) {
        return;
      }
      this.handleRightBillboardVideoFinished(videoId);
    };
    video.onended = finishPlayback;
    video.onerror = finishPlayback;

    video.play().then(
      () => {
        this.updateSpatialAudioMix();
      },
      () => {
        video.muted = true;
        video.play().then(
          () => {
            this.updateSpatialAudioMix();
          },
          () => {
            finishPlayback();
          }
        );
      }
    );
    return true;
  }

  applyRightBillboardState(rawState = {}, { force = false } = {}) {
    const next = this.normalizeRightBillboardState(rawState);
    const previous = this.normalizeRightBillboardState(this.rightBillboardState);
    if (
      !force &&
      previous.mode === next.mode &&
      previous.videoId === next.videoId &&
      previous.videoDataUrl === next.videoDataUrl
    ) {
      return false;
    }

    this.rightBillboardState = next;
    this.syncRightBillboardHostUi();
    if (next.mode === "video" && next.videoId) {
      this.startRightBillboardVideoPlayback(next.videoId);
      return true;
    }
    if (next.mode === "video_data" && next.videoDataUrl) {
      this.startRightBillboardVideoDataPlayback(next.videoDataUrl);
      return true;
    }

    this.showDefaultBillboardAdOnRight();
    return true;
  }

  syncRightBillboardHostUi() {
    const state = this.normalizeRightBillboardState(this.rightBillboardState);
    const activeVideoId = state.mode === "video" ? state.videoId : "";
    const select = this.hostRightVideoSelectEl;
    if (select && activeVideoId) {
      const hasOption = Array.from(select.options ?? []).some(
        (option) => String(option.value ?? "") === activeVideoId
      );
      if (hasOption && select.value !== activeVideoId) {
        select.value = activeVideoId;
      }
    }
    for (const button of this.hostRightVideoQuickButtons ?? []) {
      const buttonVideoId = this.normalizeRightBillboardVideoId(button.dataset.videoId ?? "");
      button.classList.toggle("active", Boolean(activeVideoId && buttonVideoId === activeVideoId));
    }
  }

  handleRightBillboardVideoFinished(rawVideoId) {
    const finishedVideoId = this.normalizeRightBillboardVideoId(rawVideoId);
    const current = this.normalizeRightBillboardState(this.rightBillboardState);
    if (
      current.mode !== "video" ||
      !current.videoId ||
      (finishedVideoId && current.videoId !== finishedVideoId)
    ) {
      return;
    }

    const fallbackState = {
      mode: "ad",
      videoId: "",
      videoDataUrl: "",
      updatedAt: Date.now()
    };
    this.applyRightBillboardState(fallbackState, { force: true });
    this.requestRightBillboardReset({ announceErrors: false });
  }

  handleLeftBillboardVideoDataFinished(rawVideoDataUrl) {
    const finishedVideoDataUrl = this.normalizeBillboardVideoDataUrl(rawVideoDataUrl);
    const current = this.normalizeLeftBillboardState(this.leftBillboardState);
    if (
      current.mode !== "video_data" ||
      !current.videoDataUrl ||
      (finishedVideoDataUrl && current.videoDataUrl !== finishedVideoDataUrl)
    ) {
      return;
    }

    const fallbackState = {
      mode: "ad",
      imageDataUrl: "",
      videoDataUrl: "",
      updatedAt: Date.now()
    };
    this.applyLeftBillboardState(fallbackState, { force: true });
    if (this.isRoomHost || this.canUseOfflineHostMode()) {
      this.requestLeftBillboardReset({ announceErrors: false });
    }
  }

  handleRightBillboardVideoDataFinished(rawVideoDataUrl) {
    const finishedVideoDataUrl = this.normalizeBillboardVideoDataUrl(rawVideoDataUrl);
    const current = this.normalizeRightBillboardState(this.rightBillboardState);
    if (
      current.mode !== "video_data" ||
      !current.videoDataUrl ||
      (finishedVideoDataUrl && current.videoDataUrl !== finishedVideoDataUrl)
    ) {
      return;
    }

    const fallbackState = {
      mode: "ad",
      videoId: "",
      videoDataUrl: "",
      updatedAt: Date.now()
    };
    this.applyRightBillboardState(fallbackState, { force: true });
    if (this.isRoomHost || this.canUseOfflineHostMode()) {
      this.requestRightBillboardReset({ announceErrors: false });
    }
  }

  getPortalDisplayLabel(rawPortalKey) {
    const portalKey = this.normalizePortalDisplayKey(rawPortalKey);
    if (portalKey === "hall") {
      return "공연장 포탈";
    }
    if (portalKey === "portal2") {
      return "포탈 2";
    }
    return "포탈 1";
  }

  handleHostPortalDisplayFileSelected(rawPortalKey, file) {
    const portalKey = this.normalizePortalDisplayKey(rawPortalKey);
    if (!portalKey) {
      return;
    }
    if (!file) {
      this.hostPortalDisplayPendingImageDataUrls[portalKey] = "";
      return;
    }
    if (file.type && !String(file.type).toLowerCase().startsWith("image/")) {
      this.hostPortalDisplayPendingImageDataUrls[portalKey] = "";
      this.appendChatLine("", `${this.getPortalDisplayLabel(portalKey)} 이미지는 이미지 파일만 업로드할 수 있습니다.`, "system");
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = this.normalizePortalDisplayImageDataUrl(event?.target?.result ?? "");
      if (!dataUrl) {
        this.hostPortalDisplayPendingImageDataUrls[portalKey] = "";
        this.appendChatLine("", `${this.getPortalDisplayLabel(portalKey)}용 유효한 이미지 파일을 다시 선택하세요.`, "system");
        return;
      }
      this.hostPortalDisplayPendingImageDataUrls[portalKey] = dataUrl;
      this.appendChatLine("", `${this.getPortalDisplayLabel(portalKey)} 이미지가 준비되었습니다. 저장을 누르면 즉시 반영됩니다.`, "system");
    };
    reader.onerror = () => {
      this.hostPortalDisplayPendingImageDataUrls[portalKey] = "";
      this.appendChatLine("", `${this.getPortalDisplayLabel(portalKey)} 이미지 파일을 읽지 못했습니다.`, "system");
    };
    reader.readAsDataURL(file);
  }

  requestPortalDisplaySet(rawPortalKey, payload = {}, { announceErrors = true } = {}) {
    const portalKey = this.normalizePortalDisplayKey(rawPortalKey);
    if (!portalKey) {
      return;
    }
    const current = this.getPortalDisplayState(portalKey);
    const hasTitle = Object.prototype.hasOwnProperty.call(payload ?? {}, "title");
    const hasMode = Object.prototype.hasOwnProperty.call(payload ?? {}, "mode");
    const hasLine2 = Object.prototype.hasOwnProperty.call(payload ?? {}, "line2");
    const hasLine3 = Object.prototype.hasOwnProperty.call(payload ?? {}, "line3");
    const hasImageDataUrl = Object.prototype.hasOwnProperty.call(payload ?? {}, "imageDataUrl");
    const next = this.normalizePortalDisplayState(portalKey, {
      mode: hasMode ? payload?.mode : current.mode,
      title: hasTitle ? payload?.title : current.title,
      line2: hasLine2 ? payload?.line2 : current.line2,
      line3: hasLine3 ? payload?.line3 : current.line3,
      imageDataUrl: hasImageDataUrl ? payload?.imageDataUrl : current.imageDataUrl,
      updatedAt: Date.now()
    });
    const localHostMode = this.canUseOfflineHostMode();
    const label = this.getPortalDisplayLabel(portalKey);

    if (!this.socket || !this.networkConnected) {
      if (localHostMode) {
        this.hostPortalDisplayPendingImageDataUrls[portalKey] = "";
        this.applyPortalDisplayState(portalKey, next, { force: true });
      } else if (announceErrors) {
        this.appendChatLine("", `서버 연결 후 ${label} 표시를 저장할 수 있습니다.`, "system");
      }
      return;
    }
    if (!this.isRoomHost) {
      if (announceErrors) {
        this.appendChatLine("", `${label} 표시 변경은 방장만 가능합니다.`, "system");
      }
      return;
    }
    if (this.portalDisplaySetInFlight?.[portalKey]) {
      return;
    }

    this.portalDisplaySetInFlight[portalKey] = true;
    this.syncHostControls();
    this.socket.emit(
      "portal:display:set",
      {
        portalKey,
        mode: next.mode,
        title: next.title,
        line2: next.line2,
        line3: next.line3,
        ...(hasImageDataUrl ? { imageDataUrl: next.imageDataUrl } : {})
      },
      (response = {}) => {
        this.portalDisplaySetInFlight[portalKey] = false;
        this.syncHostControls();
        if (!response?.ok) {
          if (announceErrors) {
            const reason = String(response?.error ?? "").trim() || "알 수 없는 오류";
            this.appendChatLine("", `${label} 저장 실패: ${reason}`, "system");
          }
          return;
        }
        this.hostPortalDisplayPendingImageDataUrls[portalKey] = "";
        this.applyPortalDisplayState(portalKey, response?.state ?? next, { force: true });
        this.appendChatLine("", `${label} 표시 저장 완료`, "system");
      }
    );
  }

  requestPortalDisplayReset(rawPortalKey, { announceErrors = true } = {}) {
    const portalKey = this.normalizePortalDisplayKey(rawPortalKey);
    if (!portalKey) {
      return;
    }
    const localHostMode = this.canUseOfflineHostMode();
    const label = this.getPortalDisplayLabel(portalKey);
    if (!this.socket || !this.networkConnected) {
      if (localHostMode) {
        this.hostPortalDisplayPendingImageDataUrls[portalKey] = "";
        this.applyPortalDisplayState(portalKey, this.normalizePortalDisplayState(portalKey), {
          force: true
        });
      } else if (announceErrors) {
        this.appendChatLine("", `서버 연결 후 ${label} 표시를 초기화할 수 있습니다.`, "system");
      }
      return;
    }
    if (!this.isRoomHost) {
      if (announceErrors) {
        this.appendChatLine("", `${label} 표시 초기화는 방장만 가능합니다.`, "system");
      }
      return;
    }
    if (this.portalDisplaySetInFlight?.[portalKey]) {
      return;
    }

    this.portalDisplaySetInFlight[portalKey] = true;
    this.syncHostControls();
    this.socket.emit("portal:display:reset", { portalKey }, (response = {}) => {
      this.portalDisplaySetInFlight[portalKey] = false;
      this.syncHostControls();
      if (!response?.ok) {
        if (announceErrors) {
          const reason = String(response?.error ?? "").trim() || "알 수 없는 오류";
          this.appendChatLine("", `${label} 초기화 실패: ${reason}`, "system");
        }
        return;
      }
      this.hostPortalDisplayPendingImageDataUrls[portalKey] = "";
      this.applyPortalDisplayState(portalKey, response?.state ?? {}, { force: true });
      this.appendChatLine("", `${label} 표시를 기본값으로 되돌렸습니다.`, "system");
    });
  }

  handleHostMainPortalAdFileSelected(file) {
    if (!file) {
      this.hostMainPortalAdPendingDataUrl = "";
      return;
    }
    if (file.type && !String(file.type).toLowerCase().startsWith("image/")) {
      this.hostMainPortalAdPendingDataUrl = "";
      this.appendChatLine("", "메인 포탈 광고판은 이미지 파일만 업로드할 수 있습니다.", "system");
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = String(event?.target?.result ?? "").trim();
      const next = this.normalizeMainPortalAdState({
        mode: "image",
        imageDataUrl: dataUrl
      });
      if (next.mode !== "image" || !next.imageDataUrl) {
        this.hostMainPortalAdPendingDataUrl = "";
        this.appendChatLine("", "유효한 이미지(data:image) 파일을 다시 선택하세요.", "system");
        return;
      }
      this.hostMainPortalAdPendingDataUrl = next.imageDataUrl;
      this.appendChatLine("", "메인 포탈 광고판 이미지가 준비되었습니다. '메인 광고 적용'을 누르세요.", "system");
    };
    reader.onerror = () => {
      this.hostMainPortalAdPendingDataUrl = "";
      this.appendChatLine("", "이미지 파일을 읽지 못했습니다.", "system");
    };
    reader.readAsDataURL(file);
  }

  requestMainPortalAdSet(rawImageDataUrl, { announceErrors = true } = {}) {
    const next = this.normalizeMainPortalAdState({
      mode: "image",
      imageDataUrl: rawImageDataUrl,
      updatedAt: Date.now()
    });
    if (next.mode !== "image" || !next.imageDataUrl) {
      if (announceErrors) {
        this.appendChatLine("", "메인 포탈 광고 이미지(data:image)를 확인하세요.", "system");
      }
      return;
    }

    const localHostMode = this.canUseOfflineHostMode();
    if (!this.socket || !this.networkConnected) {
      if (localHostMode) {
        this.applyMainPortalAdState(next, { force: true });
      } else if (announceErrors) {
        this.appendChatLine("", "서버 연결 후 다시 시도하세요.", "system");
      }
      return;
    }
    if (!this.isRoomHost) {
      if (announceErrors) {
        this.appendChatLine("", "메인 포탈 광고판 제어는 방장만 가능합니다.", "system");
      }
      return;
    }
    if (this.mainPortalAdSetInFlight) {
      return;
    }

    this.mainPortalAdSetInFlight = true;
    this.syncHostControls();
    this.socket.emit("portal:ad:set", { imageDataUrl: next.imageDataUrl }, (response = {}) => {
      this.mainPortalAdSetInFlight = false;
      this.syncHostControls();
      if (!response?.ok) {
        if (announceErrors) {
          const reason = String(response?.error ?? "").trim() || "알 수 없는 오류";
          this.appendChatLine("", `메인 포탈 광고판 적용 실패: ${reason}`, "system");
        }
        return;
      }
      this.applyMainPortalAdState(response?.state ?? next, { force: true });
    });
  }

  requestMainPortalAdReset({ announceErrors = true } = {}) {
    const localHostMode = this.canUseOfflineHostMode();
    if (!this.socket || !this.networkConnected) {
      if (localHostMode) {
        this.applyMainPortalAdState(
          {
            mode: "ad",
            imageDataUrl: "",
            updatedAt: Date.now()
          },
          { force: true }
        );
      } else if (announceErrors) {
        this.appendChatLine("", "서버 연결 후 다시 시도하세요.", "system");
      }
      return;
    }
    if (!this.isRoomHost) {
      if (announceErrors) {
        this.appendChatLine("", "메인 포탈 광고판 제어는 방장만 가능합니다.", "system");
      }
      return;
    }
    if (this.mainPortalAdSetInFlight) {
      return;
    }

    this.mainPortalAdSetInFlight = true;
    this.syncHostControls();
    this.socket.emit("portal:ad:reset", {}, (response = {}) => {
      this.mainPortalAdSetInFlight = false;
      this.syncHostControls();
      if (!response?.ok) {
        if (announceErrors) {
          const reason = String(response?.error ?? "").trim() || "알 수 없는 오류";
          this.appendChatLine("", `메인 포탈 광고판 초기화 실패: ${reason}`, "system");
        }
        return;
      }
      this.applyMainPortalAdState(response?.state ?? {}, { force: true });
    });
  }

  requestLeftBillboardImageSet(rawImageDataUrl) {
    const next = this.normalizeLeftBillboardState({
      mode: "image",
      imageDataUrl: rawImageDataUrl,
      updatedAt: Date.now()
    });
    if (next.mode !== "image" || !next.imageDataUrl) {
      this.appendChatLine("", "좌측 전광판 이미지는 data:image 형식만 지원합니다.", "system");
      return;
    }

    const localHostMode = this.canUseOfflineHostMode();
    if (!this.socket || !this.networkConnected) {
      if (localHostMode) {
        this.applyLeftBillboardState(next, { force: true });
        return;
      }
      this.appendChatLine("", "서버 연결 후 다시 시도하세요.", "system");
      return;
    }

    if (!this.isRoomHost) {
      this.appendChatLine("", "좌측 전광판 제어는 방장만 가능합니다.", "system");
      return;
    }

    if (this.leftBillboardSetInFlight) {
      return;
    }
    this.leftBillboardSetInFlight = true;
    this.syncHostControls();

    this.socket.emit("billboard:left:set", { imageDataUrl: next.imageDataUrl }, (response = {}) => {
      this.leftBillboardSetInFlight = false;
      this.syncHostControls();
      if (!response?.ok) {
        const reason = String(response?.error ?? "").trim() || "알 수 없는 오류";
        this.appendChatLine("", `좌측 전광판 이미지 적용 실패: ${reason}`, "system");
        return;
      }
      this.applyLeftBillboardState(response?.state ?? next, { force: true });
    });
  }

  requestLeftBillboardReset({ announceErrors = true } = {}) {
    const localHostMode = this.canUseOfflineHostMode();
    if (!this.socket || !this.networkConnected) {
      if (localHostMode) {
        this.applyLeftBillboardState(
          {
            mode: "ad",
            imageDataUrl: "",
            videoDataUrl: "",
            updatedAt: Date.now()
          },
          { force: true }
        );
      } else if (announceErrors) {
        this.appendChatLine("", "서버 연결 후 다시 시도하세요.", "system");
      }
      return;
    }

    if (!this.isRoomHost) {
      if (announceErrors) {
        this.appendChatLine("", "좌측 전광판 제어는 방장만 가능합니다.", "system");
      }
      return;
    }

    if (this.leftBillboardSetInFlight) {
      return;
    }

    // Apply immediately on host side so the video/image stops without waiting for ack.
    this.applyLeftBillboardState(
      {
        mode: "ad",
        imageDataUrl: "",
        videoDataUrl: "",
        updatedAt: Date.now()
      },
      { force: true }
    );

    this.leftBillboardSetInFlight = true;
    this.syncHostControls();
    let settled = false;
    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      this.leftBillboardSetInFlight = false;
      this.syncHostControls();
    };
    const timeoutId = window.setTimeout(() => {
      finish();
      if (announceErrors) {
        this.appendChatLine("", "좌측 전광판 초기화 응답이 지연되어 로컬에서 먼저 반영했습니다.", "system");
      }
    }, 12000);
    this.socket.emit("billboard:left:reset", {}, (response = {}) => {
      window.clearTimeout(timeoutId);
      finish();
      if (!response?.ok) {
        if (announceErrors) {
          const reason = String(response?.error ?? "").trim() || "알 수 없는 오류";
          this.appendChatLine("", `좌측 전광판 복귀 실패: ${reason}`, "system");
        }
        return;
      }
      this.applyLeftBillboardState(response?.state ?? {}, { force: true });
    });
  }

  requestRightBillboardVideoPlay(rawVideoId) {
    const videoId = this.normalizeRightBillboardVideoId(rawVideoId);
    if (!videoId) {
      this.appendChatLine("", "우측 전광판 영상 ID를 확인하세요.", "system");
      return;
    }

    const localHostMode = this.canUseOfflineHostMode();
    if (!this.socket || !this.networkConnected) {
      if (localHostMode) {
        this.applyRightBillboardState(
          {
            mode: "video",
            videoId,
            updatedAt: Date.now()
          },
          { force: true }
        );
        return;
      }
      this.appendChatLine("", "서버 연결 후 다시 시도하세요.", "system");
      return;
    }

    if (!this.isRoomHost) {
      this.appendChatLine("", "우측 전광판 제어는 방장만 가능합니다.", "system");
      return;
    }

    this.socket.emit("billboard:right:play", { videoId }, (response = {}) => {
      if (!response?.ok) {
        const reason = String(response?.error ?? "").trim() || "알 수 없는 오류";
        this.appendChatLine("", `우측 전광판 재생 실패: ${reason}`, "system");
        return;
      }
      this.applyRightBillboardState(response?.state ?? {}, { force: Boolean(response?.changed) });
    });
  }

  requestBillboardVideoDataSet(rawVideoDataUrl, rawTarget) {
    const target = this.normalizeBillboardVideoTarget(rawTarget);
    if (!target) {
      this.appendChatLine("", "전광판 대상(왼쪽/오른쪽/양쪽)을 선택하세요.", "system");
      return;
    }
    const videoDataUrl = this.normalizeBillboardVideoDataUrl(rawVideoDataUrl);
    if (!videoDataUrl) {
      this.appendChatLine("", "MP4 파일을 다시 선택하세요.", "system");
      return;
    }

    const localHostMode = this.canUseOfflineHostMode();
    if (!this.socket || !this.networkConnected) {
      if (localHostMode) {
        const updatedAt = Date.now();
        if (target === "left" || target === "both") {
          this.applyLeftBillboardState(
            {
              mode: "video_data",
              imageDataUrl: "",
              videoDataUrl,
              updatedAt
            },
            { force: true }
          );
        }
        if (target === "right" || target === "both") {
          this.applyRightBillboardState(
            {
              mode: "video_data",
              videoId: "",
              videoDataUrl,
              updatedAt
            },
            { force: true }
          );
        }
        return;
      }
      this.appendChatLine("", "서버 연결 후 다시 시도하세요.", "system");
      return;
    }

    if (!this.isRoomHost) {
      this.appendChatLine("", "전광판 제어는 방장만 가능합니다.", "system");
      return;
    }
    if (this.billboardVideoSetInFlight) {
      return;
    }

    this.billboardVideoSetInFlight = true;
    this.syncHostControls();
    this.socket.emit(
      "billboard:video:set",
      { videoDataUrl, target },
      (response = {}) => {
        this.billboardVideoSetInFlight = false;
        this.syncHostControls();
        if (!response?.ok) {
          const reason = String(response?.error ?? "").trim() || "알 수 없는 오류";
          this.appendChatLine("", `실시간 MP4 적용 실패: ${reason}`, "system");
          return;
        }
        if (response?.leftState && typeof response.leftState === "object") {
          this.applyLeftBillboardState(response.leftState, { force: true });
        }
        if (response?.rightState && typeof response.rightState === "object") {
          this.applyRightBillboardState(response.rightState, { force: true });
        }
      }
    );
  }

  handleHostBillboardVideoFileSelected(file) {
    if (!file) {
      return;
    }
    const fileName = String(file.name ?? "").trim();
    const lowerName = fileName.toLowerCase();
    const fileType = String(file.type ?? "").trim().toLowerCase();
    const isVideoFile =
      fileType.startsWith("video/") || lowerName.endsWith(".mp4") || lowerName.endsWith(".webm");
    if (!isVideoFile) {
      this.hostBillboardVideoPendingDataUrl = "";
      this.hostBillboardVideoPendingName = "";
      this.appendChatLine("", "영상 파일(mp4/webm)만 업로드할 수 있습니다.", "system");
      return;
    }
    const fileSize = Number(file.size) || 0;
    if (fileSize <= 0 || fileSize > MAX_BILLBOARD_VIDEO_BYTES) {
      this.hostBillboardVideoPendingDataUrl = "";
      this.hostBillboardVideoPendingName = "";
      this.appendChatLine("", "영상이 너무 큽니다. 20MB 이하 파일을 선택하세요.", "system");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = this.normalizeBillboardVideoDataUrl(String(event?.target?.result ?? ""));
      if (!dataUrl) {
        this.hostBillboardVideoPendingDataUrl = "";
        this.hostBillboardVideoPendingName = "";
        this.appendChatLine("", "영상 파일을 읽지 못했습니다.", "system");
        return;
      }
      this.hostBillboardVideoPendingDataUrl = dataUrl;
      this.hostBillboardVideoPendingName = fileName || "video.mp4";
      this.appendChatLine(
        "",
        `실시간 영상 선택됨: ${this.hostBillboardVideoPendingName} (버튼으로 왼/오/양쪽 적용)`,
        "system"
      );
    };
    reader.onerror = () => {
      this.hostBillboardVideoPendingDataUrl = "";
      this.hostBillboardVideoPendingName = "";
      this.appendChatLine("", "영상 파일을 읽지 못했습니다.", "system");
    };
    reader.readAsDataURL(file);
  }

  requestRightBillboardReset({ announceErrors = true } = {}) {
    const localHostMode = this.canUseOfflineHostMode();
    if (!this.socket || !this.networkConnected) {
      if (localHostMode) {
        this.applyRightBillboardState(
          {
            mode: "ad",
            videoId: "",
            videoDataUrl: "",
            updatedAt: Date.now()
          },
          { force: true }
        );
      } else if (announceErrors) {
        this.appendChatLine("", "서버 연결 후 다시 시도하세요.", "system");
      }
      return;
    }

    if (!this.isRoomHost) {
      if (announceErrors) {
        this.appendChatLine("", "우측 전광판 제어는 방장만 가능합니다.", "system");
      }
      return;
    }

    if (this.rightBillboardResetInFlight) {
      return;
    }

    // Apply immediately on host side so right video stops without waiting for ack.
    this.applyRightBillboardState(
      {
        mode: "ad",
        videoId: "",
        videoDataUrl: "",
        updatedAt: Date.now()
      },
      { force: true }
    );

    this.rightBillboardResetInFlight = true;
    this.syncHostControls();
    let settled = false;
    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      this.rightBillboardResetInFlight = false;
      this.syncHostControls();
    };
    const timeoutId = window.setTimeout(() => {
      finish();
      if (announceErrors) {
        this.appendChatLine("", "우측 전광판 초기화 응답이 지연되어 로컬에서 먼저 반영했습니다.", "system");
      }
    }, 12000);
    this.socket.emit("billboard:right:reset", {}, (response = {}) => {
      window.clearTimeout(timeoutId);
      finish();
      if (!response?.ok) {
        if (announceErrors) {
          const reason = String(response?.error ?? "").trim() || "알 수 없는 오류";
          this.appendChatLine("", `우측 전광판 복귀 실패: ${reason}`, "system");
        }
        return;
      }
      this.applyRightBillboardState(response?.state ?? {}, { force: Boolean(response?.changed) });
    });
  }

  normalizeSharedMusicState(rawState = {}) {
    const modeRaw = String(rawState?.mode ?? "idle").trim().toLowerCase();
    const mode = modeRaw === "playing" ? "playing" : "idle";
    const dataUrlRaw = String(rawState?.dataUrl ?? "").trim();
    const dataUrl =
      mode === "playing" && /^data:audio\/[a-z0-9.+-]+;base64,/i.test(dataUrlRaw) ? dataUrlRaw : "";
    const name = String(rawState?.name ?? "").trim().slice(0, 120);
    const startAtMs = Math.max(0, Math.trunc(Number(rawState?.startAtMs) || 0));
    const updatedAt = Math.max(0, Math.trunc(Number(rawState?.updatedAt) || Date.now()));

    if (mode !== "playing" || !dataUrl) {
      return {
        mode: "idle",
        dataUrl: "",
        name: "",
        startAtMs: 0,
        updatedAt
      };
    }

    return {
      mode: "playing",
      dataUrl,
      name,
      startAtMs,
      updatedAt
    };
  }

  detachSharedMusicUnlockListeners() {
    if (!this.sharedMusicUnlockHandler) {
      return;
    }
    const handler = this.sharedMusicUnlockHandler;
    this.sharedMusicUnlockHandler = null;
    window.removeEventListener("pointerdown", handler);
    window.removeEventListener("keydown", handler);
    window.removeEventListener("touchstart", handler);
  }

  attachSharedMusicUnlockListeners() {
    if (this.sharedMusicUnlockHandler) {
      return;
    }
    const handler = () => {
      this.detachSharedMusicUnlockListeners();
      this.startSharedMusicPlaybackFromState(this.sharedMusicState);
    };
    this.sharedMusicUnlockHandler = handler;
    window.addEventListener("pointerdown", handler, { passive: true });
    window.addEventListener("keydown", handler);
    window.addEventListener("touchstart", handler, { passive: true });
  }

  stopSharedMusicPlayback() {
    this.detachSharedMusicUnlockListeners();
    if (!this.sharedMusicAudioEl) {
      return;
    }
    this.sharedMusicAudioEl.pause();
    this.sharedMusicAudioEl.removeAttribute("src");
    this.sharedMusicAudioEl.load();
    this.sharedMusicAudioEl = null;
  }

  startSharedMusicPlaybackFromState(state) {
    const next = this.normalizeSharedMusicState(state);
    if (next.mode !== "playing" || !next.dataUrl) {
      this.stopSharedMusicPlayback();
      return;
    }

    const hasSameSource = String(this.sharedMusicAudioEl?.src ?? "") === next.dataUrl;
    if (!hasSameSource) {
      this.stopSharedMusicPlayback();
      const audio = new Audio(next.dataUrl);
      audio.preload = "auto";
      audio.loop = true;
      audio.volume = this.sharedMusicBaseVolume;
      this.sharedMusicAudioEl = audio;
    }

    const audio = this.sharedMusicAudioEl;
    if (!audio) {
      return;
    }

    const applyOffset = () => {
      if (!Number.isFinite(audio.duration) || audio.duration <= 0.1) {
        return;
      }
      const elapsedSec = Math.max(0, (Date.now() - next.startAtMs) / 1000);
      const syncTime = elapsedSec % audio.duration;
      if (Math.abs((audio.currentTime || 0) - syncTime) > 1.1) {
        try {
          audio.currentTime = syncTime;
        } catch {
          // Some browsers block seek before enough buffering.
        }
      }
    };
    if (audio.readyState >= 1) {
      applyOffset();
    } else {
      audio.addEventListener("loadedmetadata", applyOffset, { once: true });
    }

    audio.play().then(
      () => {
        this.updateSpatialAudioMix();
        this.detachSharedMusicUnlockListeners();
      },
      () => {
        this.attachSharedMusicUnlockListeners();
      }
    );
  }

  applySharedMusicState(rawState = {}, { announce = false } = {}) {
    const next = this.normalizeSharedMusicState(rawState);
    const previous = this.normalizeSharedMusicState(this.sharedMusicState);
    if (
      previous.mode === next.mode &&
      previous.dataUrl === next.dataUrl &&
      previous.startAtMs === next.startAtMs &&
      previous.updatedAt === next.updatedAt
    ) {
      return false;
    }

    this.sharedMusicState = next;
    if (next.mode === "playing") {
      this.startSharedMusicPlaybackFromState(next);
      if (announce) {
        const label = next.name ? ` (${next.name})` : "";
        this.appendChatLine("", `호스트가 음악 재생 시작${label}`, "system");
      }
    } else {
      this.stopSharedMusicPlayback();
      if (announce) {
        this.appendChatLine("", "호스트가 음악 재생을 중지했습니다.", "system");
      }
    }
    return true;
  }

  readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        resolve(String(reader.result ?? ""));
      };
      reader.onerror = () => {
        reject(new Error("file read failed"));
      };
      reader.readAsDataURL(file);
    });
  }

  async requestHostSharedMusicPlay() {
    const file = this.hostMusicFileInputEl?.files?.[0];
    if (!file) {
      this.appendChatLine("", "먼저 MP3 파일을 선택하세요.", "system");
      this.hostMusicFileInputEl?.focus?.();
      return;
    }

    if (!this.socket || !this.networkConnected) {
      this.appendChatLine("", "서버 연결 후 다시 시도하세요.", "system");
      return;
    }
    if (!this.isRoomHost) {
      this.appendChatLine("", "음악 제어는 방장만 가능합니다.", "system");
      return;
    }
    if (this.hostMusicSetInFlight) {
      return;
    }

    const type = String(file.type ?? "").toLowerCase();
    const lowerName = String(file.name ?? "").toLowerCase();
    if (!type.startsWith("audio/") && !lowerName.endsWith(".mp3")) {
      this.appendChatLine("", "오디오 파일(mp3)을 선택하세요.", "system");
      return;
    }

    const maxBytes = 8 * 1024 * 1024;
    if ((Number(file.size) || 0) > maxBytes) {
      this.appendChatLine("", "파일이 너무 큽니다. 8MB 이하 mp3를 사용하세요.", "system");
      return;
    }

    this.hostMusicSetInFlight = true;
    this.syncHostControls();

    let dataUrl = "";
    try {
      dataUrl = await this.readFileAsDataUrl(file);
    } catch {
      this.hostMusicSetInFlight = false;
      this.syncHostControls();
      this.appendChatLine("", "파일 읽기 실패", "system");
      return;
    }

    if (!/^data:audio\/[a-z0-9.+-]+;base64,/i.test(dataUrl)) {
      this.hostMusicSetInFlight = false;
      this.syncHostControls();
      this.appendChatLine("", "지원되지 않는 오디오 형식입니다.", "system");
      return;
    }

    this.socket.emit(
      "music:host:set",
      {
        name: String(file.name ?? "").trim().slice(0, 120),
        dataUrl
      },
      (response = {}) => {
        this.hostMusicSetInFlight = false;
        this.syncHostControls();
        if (!response?.ok) {
          const reason = String(response?.error ?? "").trim() || "알 수 없는 오류";
          this.appendChatLine("", `음악 업로드 실패: ${reason}`, "system");
          return;
        }
        this.applySharedMusicState(response?.state ?? {}, { announce: false });
        this.appendChatLine("", "룸 음악 재생 시작", "system");
      }
    );
  }

  requestHostSharedMusicStop() {
    if (!this.socket || !this.networkConnected) {
      this.appendChatLine("", "서버 연결 후 다시 시도하세요.", "system");
      return;
    }
    if (!this.isRoomHost) {
      this.appendChatLine("", "음악 제어는 방장만 가능합니다.", "system");
      return;
    }
    if (this.hostMusicSetInFlight) {
      return;
    }

    this.hostMusicSetInFlight = true;
    this.syncHostControls();
    this.socket.emit("music:host:stop", {}, (response = {}) => {
      this.hostMusicSetInFlight = false;
      this.syncHostControls();
      if (!response?.ok) {
        const reason = String(response?.error ?? "").trim() || "알 수 없는 오류";
        this.appendChatLine("", `음악 정지 실패: ${reason}`, "system");
        return;
      }
      this.applySharedMusicState(response?.state ?? {}, { announce: false });
      this.appendChatLine("", "룸 음악 정지", "system");
    });
  }

  addChalkTable(cityGroup) {
    if (!cityGroup || !this.isChalkFeatureEnabled()) return;
    // Table placed 6 units right of city group center (world ≈ 6, 0, -5)
    const localX = 6;
    const localZ = -1;
    const cityGroupWorldZ = this.citySpawn.z + 4;
    this.chalkTableWorldPos = new THREE.Vector3(
      this.citySpawn.x + localX,
      0,
      cityGroupWorldZ + localZ
    );
    this.chalkPickupEl = document.getElementById("chalk-pickup-prompt");

    const tableGroup = new THREE.Group();
    tableGroup.position.set(localX, 0, localZ);

    const woodMat = new THREE.MeshStandardMaterial({
      color: 0x8b6340, roughness: 0.74, metalness: 0.02,
      emissive: 0x3a2010, emissiveIntensity: 0.07
    });
    const legMat = new THREE.MeshStandardMaterial({
      color: 0x6e4e2a, roughness: 0.80, metalness: 0.02,
      emissive: 0x281808, emissiveIntensity: 0.05
    });

    const top = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.07, 0.85), woodMat);
    top.position.y = 0.78;
    top.castShadow = true;
    top.receiveShadow = true;
    tableGroup.add(top);

    for (const [lx, lz] of [[-0.76, -0.37], [0.76, -0.37], [-0.76, 0.37], [0.76, 0.37]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.78, 0.065), legMat);
      leg.position.set(lx, 0.39, lz);
      leg.castShadow = true;
      tableGroup.add(leg);
    }

    // Chalk sticks on table
    const chalkGroup = new THREE.Group();
    const chalkColors = [0xf5f7ff, 0xffd86a, 0x7ec9ff, 0xff9cc5, 0xa9f89f];
    for (let i = 0; i < chalkColors.length; i++) {
      const cm = new THREE.MeshStandardMaterial({
        color: chalkColors[i], roughness: 0.92, metalness: 0,
        emissive: chalkColors[i], emissiveIntensity: 0.06
      });
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.12, 8), cm);
      stick.rotation.z = Math.PI / 2;
      stick.rotation.y = (Math.random() - 0.5) * 0.4;
      stick.position.set(-0.28 + i * 0.14, 0.825, (Math.random() - 0.5) * 0.08);
      stick.castShadow = true;
      chalkGroup.add(stick);
    }
    tableGroup.add(chalkGroup);
    this.chalkTableChalkGroup = chalkGroup;

    cityGroup.add(tableGroup);
  }

  addFutureCityBackdrop(rootGroup, forwardDirection) {
    if (!rootGroup) {
      return;
    }
    const baseTexture = this.getFutureCityBackdropTexture("base");
    const glowTexture = this.getFutureCityBackdropTexture("glow");
    if (!baseTexture) {
      return;
    }

    const forward = (forwardDirection instanceof THREE.Vector3
      ? forwardDirection.clone()
      : new THREE.Vector3(0, 0, 1));
    forward.y = 0;
    if (forward.lengthSq() < 0.0001) {
      forward.set(0, 0, 1);
    } else {
      forward.normalize();
    }
    const right = new THREE.Vector3(forward.z, 0, -forward.x).normalize();
    const spawnBase = this.bridgeApproachSpawn?.clone?.() ?? new THREE.Vector3(0, 0, -98);
    spawnBase.y = 0;

    const centerDistance = this.mobileEnabled ? 228 : 248;
    const center = spawnBase.clone().addScaledVector(forward, centerDistance);
    const skylineHeight = this.mobileEnabled ? 92 : 118;
    const skylineY = this.mobileEnabled ? 20 : 28;
    const baseYaw = Math.atan2(forward.x, forward.z) + Math.PI;

    const segments = [
      {
        width: this.mobileEnabled ? 320 : 420,
        xOffset: 0,
        zOffset: 0,
        yawOffset: 0,
        opacity: 0.88
      },
      {
        width: this.mobileEnabled ? 250 : 330,
        xOffset: this.mobileEnabled ? -190 : -270,
        zOffset: 18,
        yawOffset: 0.24,
        opacity: 0.8
      },
      {
        width: this.mobileEnabled ? 250 : 330,
        xOffset: this.mobileEnabled ? 190 : 270,
        zOffset: 18,
        yawOffset: -0.24,
        opacity: 0.8
      }
    ];

    const backdropGroup = new THREE.Group();
    backdropGroup.name = "future_city_backdrop";

    for (const segment of segments) {
      const segmentCenter = center
        .clone()
        .addScaledVector(right, segment.xOffset)
        .addScaledVector(forward, segment.zOffset);

      const basePlane = new THREE.Mesh(
        new THREE.PlaneGeometry(segment.width, skylineHeight),
        new THREE.MeshBasicMaterial({
          map: baseTexture,
          transparent: true,
          opacity: segment.opacity,
          side: THREE.DoubleSide,
          depthWrite: false,
          fog: false,
          toneMapped: false
        })
      );
      basePlane.position.set(segmentCenter.x, skylineY, segmentCenter.z);
      basePlane.rotation.y = baseYaw + segment.yawOffset;
      basePlane.frustumCulled = false;
      basePlane.renderOrder = 2;

      if (glowTexture) {
        const glowPlane = new THREE.Mesh(
          new THREE.PlaneGeometry(segment.width * 1.03, skylineHeight * 1.04),
          new THREE.MeshBasicMaterial({
            map: glowTexture,
            transparent: true,
            opacity: segment.opacity * 0.72,
            side: THREE.DoubleSide,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            fog: false,
            toneMapped: false
          })
        );
        glowPlane.position.copy(basePlane.position);
        glowPlane.position.y += 0.2;
        glowPlane.rotation.copy(basePlane.rotation);
        glowPlane.frustumCulled = false;
        glowPlane.renderOrder = 3;
        backdropGroup.add(glowPlane);
      }

      backdropGroup.add(basePlane);
    }

    const floorGlow = new THREE.Mesh(
      new THREE.CircleGeometry(this.mobileEnabled ? 128 : 162, this.mobileEnabled ? 28 : 44),
      new THREE.MeshBasicMaterial({
        color: 0x45dbff,
        transparent: true,
        opacity: 0.08,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
        toneMapped: false
      })
    );
    floorGlow.rotation.x = -Math.PI / 2;
    floorGlow.position.copy(center);
    floorGlow.position.y = 0.07;
    floorGlow.position.addScaledVector(forward, -16);
    floorGlow.frustumCulled = false;
    floorGlow.renderOrder = 1;

    backdropGroup.add(floorGlow);
    this.addFutureCityBillboardDistrict(backdropGroup, center, forward, right);
    rootGroup.add(backdropGroup);
  }

  getFutureCityFixedBillboardTexture(imageUrl) {
    const normalized = String(imageUrl ?? "").trim();
    if (!normalized) {
      return null;
    }
    const cached = this.futureCityFixedBillboardTextureCache.get(normalized);
    if (cached) {
      return cached;
    }

    const texture = this.textureLoader.load(normalized, (loadedTexture) => {
      const width = Math.trunc(Number(loadedTexture?.image?.width) || 0);
      const height = Math.trunc(Number(loadedTexture?.image?.height) || 0);
      const canUseMipmaps =
        Boolean(this.renderer?.capabilities?.isWebGL2) ||
        (THREE.MathUtils.isPowerOfTwo(width) && THREE.MathUtils.isPowerOfTwo(height));
      loadedTexture.generateMipmaps = canUseMipmaps;
      loadedTexture.minFilter = canUseMipmaps
        ? THREE.LinearMipmapLinearFilter
        : THREE.LinearFilter;
      loadedTexture.magFilter = THREE.LinearFilter;
      loadedTexture.anisotropy = Math.min(8, this.renderer?.capabilities?.getMaxAnisotropy?.() || 1);
      loadedTexture.needsUpdate = true;
    });
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.anisotropy = Math.min(8, this.renderer?.capabilities?.getMaxAnisotropy?.() || 1);
    texture.needsUpdate = true;
    this.futureCityFixedBillboardTextureCache.set(normalized, texture);
    return texture;
  }

  createFutureCityFixedBillboardScreenMaterial(imageUrl, emissiveIntensity = 0.9) {
    const map = this.getFutureCityFixedBillboardTexture(imageUrl);
    return new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.18,
      metalness: 0.08,
      map,
      emissive: 0xffffff,
      emissiveMap: map,
      emissiveIntensity: THREE.MathUtils.clamp(Number(emissiveIntensity) || 0.9, 0.24, 1.4),
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -2,
      fog: false,
      toneMapped: false
    });
  }

  loadOssNeonTownModelTemplate(modelFile) {
    const normalizedFile = String(modelFile ?? "").trim();
    if (!normalizedFile) {
      return Promise.resolve(null);
    }
    const cachedTemplate = this.ossModelTemplateCache.get(normalizedFile);
    if (cachedTemplate) {
      return Promise.resolve(cachedTemplate);
    }
    const inflight = this.ossModelLoadPromiseCache.get(normalizedFile);
    if (inflight) {
      return inflight;
    }

    const encodedName = normalizedFile.split("/").map((part) => encodeURIComponent(part)).join("/");
    const modelUrl = resolveRuntimeAssetUrl(
      `assets/graphics/world/models/oss-neontown/GLTF/${encodedName}`
    );

    const promise = new Promise((resolve) => {
      this.gltfLoader.load(
        modelUrl,
        (gltf) => {
          const scene = gltf?.scene ?? gltf?.scenes?.[0] ?? null;
          if (!scene) {
            resolve(null);
            return;
          }
          scene.updateMatrixWorld(true);
          scene.traverse((child) => {
            if (!child?.isMesh) {
              return;
            }
            child.castShadow = false;
            child.receiveShadow = true;
            if (Array.isArray(child.material)) {
              for (const mat of child.material) {
                if (mat && "emissiveIntensity" in mat) {
                  mat.emissiveIntensity = Math.max(0.08, Number(mat.emissiveIntensity) || 0.08);
                }
              }
            } else if (child.material && "emissiveIntensity" in child.material) {
              child.material.emissiveIntensity = Math.max(
                0.08,
                Number(child.material.emissiveIntensity) || 0.08
              );
            }
          });
          this.ossModelTemplateCache.set(normalizedFile, scene);
          resolve(scene);
        },
        undefined,
        () => {
          resolve(null);
        }
      );
    });
    this.ossModelLoadPromiseCache.set(normalizedFile, promise);
    promise.finally(() => {
      if (this.ossModelLoadPromiseCache.get(normalizedFile) === promise) {
        this.ossModelLoadPromiseCache.delete(normalizedFile);
      }
    });
    return promise;
  }

  placeFutureCityOssBuilding(
    parentGroup,
    modelFile,
    worldPosition,
    facingDirection,
    targetWidth,
    targetDepth,
    targetHeight
  ) {
    if (!parentGroup || !worldPosition) {
      return;
    }

    this.loadOssNeonTownModelTemplate(modelFile).then((template) => {
      if (!template || !parentGroup.parent) {
        return;
      }

      const wrapper = new THREE.Group();
      wrapper.position.copy(worldPosition);

      const direction = (facingDirection instanceof THREE.Vector3
        ? facingDirection.clone()
        : new THREE.Vector3(0, 0, 1));
      direction.y = 0;
      if (direction.lengthSq() < 0.0001) {
        direction.set(0, 0, 1);
      } else {
        direction.normalize();
      }
      wrapper.rotation.y = Math.atan2(direction.x, direction.z) + Math.PI;

      const model = template.clone(true);
      const localBounds = new THREE.Box3().setFromObject(model);
      const size = localBounds.getSize(new THREE.Vector3());
      const center = localBounds.getCenter(new THREE.Vector3());
      const safeWidth = Math.max(0.2, Number(targetWidth) || 0.2);
      const safeDepth = Math.max(0.2, Number(targetDepth) || 0.2);
      const safeHeight = Math.max(0.4, Number(targetHeight) || 0.4);
      const scaleX = safeWidth / Math.max(0.01, size.x);
      const scaleY = safeHeight / Math.max(0.01, size.y);
      const scaleZ = safeDepth / Math.max(0.01, size.z);
      const fitScale = THREE.MathUtils.clamp(Math.min(scaleX, scaleY, scaleZ), 0.05, 60);

      model.scale.setScalar(fitScale);
      model.position.set(
        -center.x * fitScale,
        -localBounds.min.y * fitScale,
        -center.z * fitScale
      );
      model.updateMatrixWorld(true);
      wrapper.add(model);
      parentGroup.add(wrapper);
    });
  }

  addFutureCityBillboardDistrict(parentGroup, center, forward, right) {
    if (!parentGroup || !center || !forward || !right) {
      return;
    }

    const assetUrls = FUTURE_CITY_FIXED_BILLBOARD_IMAGE_URLS.filter((url) => String(url ?? "").trim());
    if (!assetUrls.length) {
      return;
    }

    const districtGroup = new THREE.Group();
    districtGroup.name = "future_city_billboard_district";
    const toPlayer = forward.clone().multiplyScalar(-1).normalize();
    const baseCenter = center.clone().addScaledVector(forward, this.mobileEnabled ? -46 : -40);
    const topBillboardForwardOffset = this.mobileEnabled ? 9 : 14;
    const styleCycle = ["cyan", "slate", "amber"];
    const spawnFacingTarget = this.bridgeApproachSpawn?.clone?.() ?? new THREE.Vector3(0, 0, -98);
    spawnFacingTarget.y = 0;

    for (let index = 0; index < assetUrls.length; index += 1) {
      const imageUrl = assetUrls[index];
      const columnOffset = index - (assetUrls.length - 1) * 0.5;
      const rowSign = index % 2 === 0 ? -1 : 1;
      const laneDepth = Math.floor(index / 3) * (this.mobileEnabled ? 7 : 10);
      const anchor = baseCenter
        .clone()
        .addScaledVector(right, columnOffset * (this.mobileEnabled ? 54 : 72))
        .addScaledVector(forward, rowSign * (this.mobileEnabled ? 14 : 20) + laneDepth);

      const footprint = (this.mobileEnabled ? 9.8 : 12.4) + (index % 3) * (this.mobileEnabled ? 1.1 : 1.5);
      const shaftHeight = (this.mobileEnabled ? 34 : 46) + (index % 4) * (this.mobileEnabled ? 4.2 : 6.2);
      const podiumHeight = Math.max(4.8, shaftHeight * 0.2);
      const crownHeight = Math.max(4.2, shaftHeight * 0.15);
      const totalHeight = podiumHeight + shaftHeight + crownHeight;
      this.registerStaticWorldBoxCollider(
        anchor.x,
        anchor.z,
        footprint * 1.26,
        footprint * 1.2,
        -2,
        totalHeight + 8
      );
      const ossModelFile =
        FUTURE_CITY_OSS_MODEL_FILES[index % FUTURE_CITY_OSS_MODEL_FILES.length] || "store.glb";
      this.placeFutureCityOssBuilding(
        districtGroup,
        ossModelFile,
        anchor.clone(),
        toPlayer,
        footprint * 1.2,
        footprint * 1.16,
        totalHeight * 0.9
      );
      const style = styleCycle[index % styleCycle.length];

      const wallMaterial = this.createCityWindowMaterial({
        style,
        repeatX: 1.6 + (index % 3) * 0.18,
        repeatY: 6.6 + (index % 4) * 0.64,
        roughness: 0.52,
        metalness: 0.18,
        emissive: 0x274057,
        emissiveIntensity: 0.26
      });
      const podiumMaterial = this.createCityWindowMaterial({
        style,
        repeatX: 1.45 + (index % 3) * 0.12,
        repeatY: 2.5 + (index % 2) * 0.3,
        roughness: 0.48,
        metalness: 0.2,
        emissive: 0x34526f,
        emissiveIntensity: 0.32
      });
      const roofMaterial = new THREE.MeshStandardMaterial({
        color: 0x748898,
        roughness: 0.62,
        metalness: 0.2,
        emissive: 0x27415a,
        emissiveIntensity: 0.22
      });

      const podium = new THREE.Mesh(
        new THREE.BoxGeometry(footprint * 1.24, podiumHeight, footprint * 1.18),
        [
          podiumMaterial.clone(),
          podiumMaterial.clone(),
          roofMaterial,
          roofMaterial,
          podiumMaterial.clone(),
          podiumMaterial.clone()
        ]
      );
      podium.position.set(anchor.x, podiumHeight * 0.5, anchor.z);
      podium.castShadow = false;
      podium.receiveShadow = true;
      districtGroup.add(podium);

      const podiumCornice = new THREE.Mesh(
        new THREE.BoxGeometry(footprint * 1.28, 0.24, footprint * 1.22),
        new THREE.MeshStandardMaterial({
          color: 0x88a2b7,
          roughness: 0.48,
          metalness: 0.32,
          emissive: 0x2f4f6a,
          emissiveIntensity: 0.18
        })
      );
      podiumCornice.position.set(anchor.x, podiumHeight + 0.12, anchor.z);
      podiumCornice.castShadow = false;
      podiumCornice.receiveShadow = true;
      districtGroup.add(podiumCornice);

      const shaft = new THREE.Mesh(
        new THREE.BoxGeometry(footprint, shaftHeight, footprint * 0.96),
        [wallMaterial.clone(), wallMaterial.clone(), roofMaterial, roofMaterial, wallMaterial.clone(), wallMaterial.clone()]
      );
      shaft.position.set(anchor.x, podiumHeight + shaftHeight * 0.5, anchor.z);
      shaft.castShadow = false;
      shaft.receiveShadow = true;
      districtGroup.add(shaft);

      const crown = new THREE.Mesh(
        new THREE.BoxGeometry(footprint * 0.76, crownHeight, footprint * 0.72),
        [wallMaterial.clone(), wallMaterial.clone(), roofMaterial, roofMaterial, wallMaterial.clone(), wallMaterial.clone()]
      );
      crown.position.set(anchor.x, podiumHeight + shaftHeight + crownHeight * 0.5 + 0.12, anchor.z);
      crown.castShadow = false;
      crown.receiveShadow = true;
      districtGroup.add(crown);

      const edgeLightMaterial = new THREE.MeshBasicMaterial({
        color: 0x76e9ff,
        transparent: true,
        opacity: 0.36,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
        toneMapped: false
      });
      const edgeHeight = shaftHeight * 0.9;
      const edgeY = podiumHeight + edgeHeight * 0.5 + 0.24;
      const edgeOffsetX = footprint * 0.48;
      const edgeOffsetZ = footprint * 0.45;
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const edge = new THREE.Mesh(
            new THREE.BoxGeometry(Math.max(0.08, footprint * 0.03), edgeHeight, Math.max(0.08, footprint * 0.03)),
            edgeLightMaterial
          );
          edge.position.set(anchor.x + sx * edgeOffsetX, edgeY, anchor.z + sz * edgeOffsetZ);
          edge.renderOrder = 6;
          districtGroup.add(edge);
        }
      }

      const billboardDirection = spawnFacingTarget.clone().sub(anchor);
      billboardDirection.y = 0;
      if (billboardDirection.lengthSq() < 0.0001) {
        billboardDirection.copy(toPlayer);
        billboardDirection.y = 0;
      }
      if (billboardDirection.lengthSq() < 0.0001) {
        billboardDirection.set(0, 0, -1);
      } else {
        billboardDirection.normalize();
      }
      const billboardYaw = Math.atan2(billboardDirection.x, billboardDirection.z);
      const topBoardWidth = footprint * 1.44;
      const topBoardHeight = topBoardWidth * 0.48;
      const topBoardDepth = 0.18;
      const topFrameDepth = topBoardDepth + 0.06;
      const topBoardGroup = new THREE.Group();
      topBoardGroup.position.set(
        anchor.x + billboardDirection.x * topBillboardForwardOffset,
        totalHeight + topBoardHeight * 0.54 + 0.8,
        anchor.z + billboardDirection.z * topBillboardForwardOffset
      );
      topBoardGroup.rotation.y = billboardYaw;
      topBoardGroup.rotation.x = -0.08;

      const topFrame = new THREE.Mesh(
        new THREE.BoxGeometry(topBoardWidth + 0.34, topBoardHeight + 0.34, topFrameDepth),
        new THREE.MeshStandardMaterial({
          color: 0x0f151c,
          roughness: 0.28,
          metalness: 0.56,
          emissive: 0x1a2e42,
          emissiveIntensity: 0.24
        })
      );
      topFrame.position.z = -0.02;
      topFrame.castShadow = false;
      topFrame.receiveShadow = true;
      const topScreen = new THREE.Mesh(
        new THREE.PlaneGeometry(topBoardWidth, topBoardHeight),
        this.createFutureCityFixedBillboardScreenMaterial(imageUrl, 0.98)
      );
      topScreen.position.z = topBoardDepth * 0.5 + 0.06;
      topScreen.renderOrder = 7;
      const topGlow = new THREE.Mesh(
        new THREE.PlaneGeometry(topBoardWidth + 0.36, topBoardHeight + 0.36),
        new THREE.MeshBasicMaterial({
          color: 0x67f3ff,
          transparent: true,
          opacity: 0.2,
          side: THREE.DoubleSide,
          depthTest: false,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          fog: false,
          toneMapped: false
        })
      );
      topGlow.position.z = topBoardDepth * 0.5 + 0.09;
      topGlow.renderOrder = 8;
      topBoardGroup.add(topFrame, topScreen, topGlow);
      districtGroup.add(topBoardGroup);
    }

    parentGroup.add(districtGroup);
  }

  getFutureCityBackdropTexture(layer = "base") {
    const normalizedLayer = String(layer ?? "base").trim().toLowerCase();
    const targetLayer = normalizedLayer === "glow" ? "glow" : "base";
    const resolutionKey = this.mobileEnabled ? "mobile" : "desktop";
    const cacheKey = `${targetLayer}|${resolutionKey}`;
    const cached = this.futureCityBackdropTextureCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const canvas = document.createElement("canvas");
    canvas.width = this.mobileEnabled ? 1024 : 2048;
    canvas.height = this.mobileEnabled ? 512 : 768;
    const context = canvas.getContext("2d");
    if (!context) {
      return null;
    }

    const width = canvas.width;
    const height = canvas.height;
    const horizonY = Math.round(height * 0.72);

    const rand = (x, y = 0, z = 0) => {
      const value = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453123;
      return value - Math.floor(value);
    };

    if (targetLayer === "base") {
      const skyGlow = context.createLinearGradient(0, Math.round(height * 0.4), 0, height);
      skyGlow.addColorStop(0, "rgba(24, 54, 86, 0)");
      skyGlow.addColorStop(0.56, "rgba(11, 24, 42, 0.34)");
      skyGlow.addColorStop(1, "rgba(5, 12, 24, 0.78)");
      context.fillStyle = skyGlow;
      context.fillRect(0, 0, width, height);
    } else {
      const haze = context.createLinearGradient(0, Math.round(height * 0.46), 0, height);
      haze.addColorStop(0, "rgba(35, 198, 255, 0)");
      haze.addColorStop(0.7, "rgba(27, 160, 224, 0.2)");
      haze.addColorStop(1, "rgba(33, 255, 187, 0.34)");
      context.fillStyle = haze;
      context.fillRect(0, 0, width, height);
    }

    let cursorX = -32;
    let index = 0;
    while (cursorX < width + 32) {
      const towerWidth = 28 + rand(index, 0.2, 0.9) * (this.mobileEnabled ? 34 : 56);
      const towerHeight = height * (0.18 + rand(index, 1.2, 1.9) * 0.52);
      const x = Math.round(cursorX);
      const y = Math.round(horizonY - towerHeight);
      const w = Math.max(14, Math.round(towerWidth));
      const h = Math.max(36, Math.round(towerHeight));
      if (targetLayer === "base") {
        const towerGradient = context.createLinearGradient(x, y, x, y + h);
        towerGradient.addColorStop(0, "rgba(41, 64, 92, 0.86)");
        towerGradient.addColorStop(1, "rgba(11, 18, 34, 0.98)");
        context.fillStyle = towerGradient;
        context.fillRect(x, y, w, h);

        context.fillStyle = "rgba(146, 203, 255, 0.1)";
        context.fillRect(x + 1, y + 1, Math.max(2, Math.round(w * 0.14)), h - 2);
      }

      const windowStepX = this.mobileEnabled ? 7 : 8;
      const windowStepY = this.mobileEnabled ? 8 : 9;
      const windowWidth = this.mobileEnabled ? 2 : 3;
      const lightThreshold = targetLayer === "base" ? 0.86 : 0.78;
      for (let wx = x + 4; wx < x + w - 4; wx += windowStepX) {
        for (let wy = y + 5; wy < y + h - 4; wy += windowStepY) {
          const n = rand(wx * 0.061, wy * 0.037, index * 0.17);
          if (n <= lightThreshold) {
            continue;
          }
          const alpha = targetLayer === "base"
            ? 0.18 + rand(wx * 0.03, wy * 0.04, 1.2) * 0.2
            : 0.22 + rand(wx * 0.03, wy * 0.04, 2.4) * 0.34;
          context.fillStyle = targetLayer === "base"
            ? `rgba(164, 220, 255, ${alpha.toFixed(3)})`
            : `rgba(112, 255, 214, ${alpha.toFixed(3)})`;
          context.fillRect(wx, wy, windowWidth, 2);
        }
      }

      if (targetLayer === "glow" && rand(index, 2.6, 9.2) > 0.68) {
        const spireHeight = Math.round(h * (0.09 + rand(index, 6.1, 4.2) * 0.22));
        const spireX = x + Math.round(w * 0.5);
        context.fillStyle = "rgba(94, 241, 255, 0.34)";
        context.fillRect(spireX, y - spireHeight, 2, spireHeight + 1);
      }

      index += 1;
      cursorX += w + 6 + rand(index, 3.4, 1.6) * 16;
    }

    if (targetLayer === "glow") {
      context.lineCap = "round";
      for (let lane = 0; lane < 6; lane += 1) {
        const laneY = horizonY - 88 - lane * 14;
        const startX = -40 - lane * 20;
        const endX = width + 40 + lane * 22;
        context.strokeStyle = lane % 2 === 0
          ? "rgba(95, 236, 255, 0.2)"
          : "rgba(95, 255, 186, 0.17)";
        context.lineWidth = lane % 2 === 0 ? 2.2 : 1.8;
        context.beginPath();
        context.moveTo(startX, laneY + Math.sin(lane * 0.8) * 4);
        context.quadraticCurveTo(
          width * 0.5,
          laneY - 20 + Math.sin(lane * 1.3) * 8,
          endX,
          laneY + Math.cos(lane * 0.7) * 5
        );
        context.stroke();
      }
    }

    const horizonFog = context.createLinearGradient(0, horizonY - 20, 0, height);
    horizonFog.addColorStop(0, "rgba(80, 198, 255, 0)");
    horizonFog.addColorStop(0.62, targetLayer === "base" ? "rgba(22, 44, 66, 0.32)" : "rgba(53, 210, 255, 0.18)");
    horizonFog.addColorStop(1, targetLayer === "base" ? "rgba(8, 15, 26, 0.66)" : "rgba(27, 245, 169, 0.22)");
    context.fillStyle = horizonFog;
    context.fillRect(0, horizonY - 20, width, height - horizonY + 20);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.anisotropy = Math.min(8, this.renderer?.capabilities?.getMaxAnisotropy?.() || 1);
    texture.needsUpdate = true;
    this.futureCityBackdropTextureCache.set(cacheKey, texture);
    return texture;
  }

  getCityWindowPalette(style = "slate") {
    const key = String(style ?? "").trim().toLowerCase();
    if (key === "cyan") {
      return {
        wall: "#4c6277",
        mullion: "#6d869d",
        glassDark: "#28506f",
        glassMid: "#3d76a1",
        glassLight: "#8ce4ff",
        reflection: "rgba(220, 246, 255, 0.32)"
      };
    }
    if (key === "amber") {
      return {
        wall: "#635d55",
        mullion: "#847c72",
        glassDark: "#403c31",
        glassMid: "#675a4a",
        glassLight: "#f0ca7a",
        reflection: "rgba(255, 244, 214, 0.3)"
      };
    }
    return {
      wall: "#596d80",
      mullion: "#7b98ae",
      glassDark: "#324d65",
      glassMid: "#4d7593",
      glassLight: "#cae6ff",
      reflection: "rgba(224, 244, 255, 0.34)"
    };
  }

  getCityWindowTexture(style = "slate", repeatX = 1, repeatY = 1) {
    const safeRepeatX = THREE.MathUtils.clamp(Number(repeatX) || 1, 0.5, 14);
    const safeRepeatY = THREE.MathUtils.clamp(Number(repeatY) || 1, 0.5, 18);
    const cacheKey = `${String(style ?? "slate").toLowerCase()}|${safeRepeatX.toFixed(2)}|${safeRepeatY.toFixed(2)}`;
    const cached = this.cityWindowTextureCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const palette = this.getCityWindowPalette(style);
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const context = canvas.getContext("2d");
    if (!context) {
      return null;
    }

    context.fillStyle = palette.wall;
    context.fillRect(0, 0, canvas.width, canvas.height);

    const wallShade = context.createLinearGradient(0, 0, 0, canvas.height);
    wallShade.addColorStop(0, "rgba(255, 255, 255, 0.06)");
    wallShade.addColorStop(0.55, "rgba(0, 0, 0, 0.015)");
    wallShade.addColorStop(1, "rgba(0, 0, 0, 0.08)");
    context.fillStyle = wallShade;
    context.fillRect(0, 0, canvas.width, canvas.height);

    const cols = 7;
    const rows = 14;
    const marginX = 14;
    const marginY = 8;
    const gapX = 5;
    const gapY = 4;
    const innerWidth = canvas.width - marginX * 2;
    const innerHeight = canvas.height - marginY * 2;
    const windowWidth = Math.max(6, Math.floor((innerWidth - gapX * (cols - 1)) / cols));
    const windowHeight = Math.max(7, Math.floor((innerHeight - gapY * (rows - 1)) / rows));

    context.fillStyle = palette.mullion;
    context.fillRect(marginX - 3, marginY - 3, innerWidth + 6, innerHeight + 6);
    context.fillStyle = "rgba(255, 255, 255, 0.04)";
    context.fillRect(marginX - 1, marginY - 1, innerWidth + 2, 2);
    context.fillStyle = "rgba(0, 0, 0, 0.12)";
    context.fillRect(marginX - 1, marginY + innerHeight - 1, innerWidth + 2, 2);

    const pseudoRandom = (x, y, seed = 0) => {
      const value = Math.sin((x + 1) * 12.9898 + (y + 1) * 78.233 + seed * 37.719) * 43758.5453;
      return value - Math.floor(value);
    };

    for (let row = 0; row < rows; row += 1) {
      const rowY = marginY + row * (windowHeight + gapY);
      if (row % 4 === 0) {
        context.fillStyle = "rgba(134, 164, 196, 0.06)";
        context.fillRect(marginX, Math.max(marginY, rowY - 1), innerWidth, 2);
      }
      for (let col = 0; col < cols; col += 1) {
        const x = marginX + col * (windowWidth + gapX);
        const y = rowY;
        const n = pseudoRandom(col, row, safeRepeatX + safeRepeatY);
        const litThreshold = row % 3 === 0 ? 0.78 : 0.84;
        const lit = n > litThreshold;
        let fillColor = palette.glassDark;
        if (lit) {
          fillColor = palette.glassLight;
        } else if (n > 0.4) {
          fillColor = palette.glassMid;
        }

        context.fillStyle = fillColor;
        context.fillRect(x, y, windowWidth, windowHeight);

        context.fillStyle = palette.reflection;
        context.fillRect(
          x + 1,
          y + 1,
          Math.max(1, Math.floor(windowWidth * 0.18)),
          Math.max(1, Math.floor(windowHeight * 0.14))
        );

        context.fillStyle = "rgba(0, 0, 0, 0.08)";
        context.fillRect(x, y + windowHeight - 1, windowWidth, 1);
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(safeRepeatX, safeRepeatY);
    texture.anisotropy = Math.min(8, this.renderer?.capabilities?.getMaxAnisotropy?.() || 1);
    texture.needsUpdate = true;
    this.cityWindowTextureCache.set(cacheKey, texture);
    return texture;
  }

  createCityWindowMaterial({
    style = "slate",
    repeatX = 1,
    repeatY = 1,
    roughness = 0.56,
    metalness = 0.14,
    emissive = 0x1a212a,
    emissiveIntensity = 0.12
  } = {}) {
    return new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness,
      metalness,
      emissive,
      emissiveIntensity,
      map: this.getCityWindowTexture(style, repeatX, repeatY)
    });
  }

  getCityAdBillboardTexture() {
    if (this.cityAdBillboardTexture) {
      return this.cityAdBillboardTexture;
    }

    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 512;
    const context = canvas.getContext("2d");
    if (!context) {
      return null;
    }

    const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, "#061420");
    gradient.addColorStop(0.42, "#0d2b43");
    gradient.addColorStop(1, "#1d516f");
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.fillStyle = "rgba(58, 193, 255, 0.22)";
    for (let y = 0; y < canvas.height; y += 8) {
      context.fillRect(0, y, canvas.width, 3);
    }

    context.strokeStyle = "rgba(140, 231, 255, 0.28)";
    context.lineWidth = 2;
    context.strokeRect(34, 34, canvas.width - 68, canvas.height - 68);

    context.fillStyle = "rgba(36, 227, 153, 0.18)";
    context.fillRect(72, 84, 380, 96);
    context.fillRect(72, 304, 300, 64);

    context.fillStyle = "#d8f7ff";
    context.font = "700 72px sans-serif";
    context.fillText("EMPTINES", 84, 160);
    context.font = "700 56px sans-serif";
    context.fillStyle = "#70ffcb";
    context.fillText("LIVE SCREEN", 84, 362);

    context.font = "500 34px sans-serif";
    context.fillStyle = "rgba(225, 248, 255, 0.95)";
    context.fillText("DRAW YOUR AD", 84, 236);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    this.cityAdBillboardTexture = texture;
    return texture;
  }

  createCityAdBillboardMaterial() {
    return new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.26,
      metalness: 0.28,
      emissive: 0x1d4b70,
      emissiveIntensity: 0.36,
      map: this.getCityAdBillboardTexture()
    });
  }

  isCityMainAdBillboardSurface(surfaceId = "") {
    const normalized = String(surfaceId ?? "").trim().toLowerCase();
    return normalized.startsWith(CITY_AD_BILLBOARD_BASE_PREFIX);
  }

  getSurfacePainterTitle(surfaceId = "") {
    const normalized = String(surfaceId ?? "").trim();
    if (!normalized) {
      return "표면 그리기";
    }
    if (this.isCityMainAdBillboardSurface(normalized)) {
      return "광고판 그리기 / CITY AD BOARD";
    }
    return `표면 그리기 / ${normalized.toUpperCase()}`;
  }

  tryPickupChalk() {
    if (!this.isChalkFeatureEnabled()) return;
    if (this.hasChalk || !this.chalkTableWorldPos) return;
    const dx = this.playerPosition.x - this.chalkTableWorldPos.x;
    const dz = this.playerPosition.z - this.chalkTableWorldPos.z;
    if (Math.sqrt(dx * dx + dz * dz) > this.chalkTablePickupRadius) return;
    this.hasChalk = true;
    if (this.chalkTableChalkGroup) this.chalkTableChalkGroup.visible = false;
    this.chalkPickupEl?.classList.add("hidden");
    this.setActiveTool("chalk");
  }

  updateChalkPickupPrompt(delta = 0) {
    if (!this.isChalkFeatureEnabled()) {
      this.chalkPickupPromptClock = this.chalkPickupPromptInterval;
      this.chalkPickupEl?.classList.add("hidden");
      return;
    }
    if (!this.chalkPickupEl || !this.chalkTableWorldPos || this.hasChalk) {
      this.chalkPickupPromptClock = this.chalkPickupPromptInterval;
      this.chalkPickupEl?.classList.add("hidden");
      return;
    }
    this.chalkPickupPromptClock += Math.max(0, Number(delta) || 0);
    if (this.chalkPickupPromptClock < this.chalkPickupPromptInterval) {
      return;
    }
    this.chalkPickupPromptClock = 0;
    const dx = this.playerPosition.x - this.chalkTableWorldPos.x;
    const dz = this.playerPosition.z - this.chalkTableWorldPos.z;
    const near = dx * dx + dz * dz <= this.chalkTablePickupRadius * this.chalkTablePickupRadius
      && this.canUseGameplayControls();
    this.chalkPickupEl.classList.toggle("hidden", !near);
  }

  createPaintableBoxMesh(geometry, baseMaterial, surfaceBaseId) {
    if (!this.isSurfacePaintFeatureEnabled()) {
      return new THREE.Mesh(geometry, baseMaterial.clone());
    }
    const normalizedBaseId = String(surfaceBaseId ?? "").trim().toLowerCase();
    const isAllowedPaintSurface =
      normalizedBaseId.startsWith("bridge_panel_") ||
      normalizedBaseId.startsWith("po_") ||
      normalizedBaseId.startsWith(CITY_AD_BILLBOARD_BASE_PREFIX) ||
      normalizedBaseId.startsWith("host_custom_block_");
    if (!isAllowedPaintSurface) {
      return new THREE.Mesh(geometry, baseMaterial.clone());
    }
    const materials = [];
    for (let index = 0; index < 6; index += 1) {
      materials.push(baseMaterial.clone());
    }
    const mesh = new THREE.Mesh(geometry, materials);
    this.registerPaintableBoxMesh(mesh, surfaceBaseId);
    return mesh;
  }

  getBoxSurfaceDimensions(geometry, faceKey) {
    const params = geometry?.parameters ?? {};
    const width = Math.max(0.25, Number(params.width) || 1);
    const height = Math.max(0.25, Number(params.height) || 1);
    const depth = Math.max(0.25, Number(params.depth) || 1);
    const key = String(faceKey ?? "").trim().toLowerCase();
    if (key === "px" || key === "nx") {
      return { width: depth, height };
    }
    if (key === "py" || key === "ny") {
      return { width, height: depth };
    }
    return { width, height };
  }

  getSurfacePainterCanvasProfile(surfaceId) {
    const normalizedId = String(surfaceId ?? "").trim();
    const entry = this.paintableSurfaceMap.get(normalizedId);
    if (!entry) {
      return { width: 1, height: 1 };
    }
    const stored = entry.surfaceSize;
    const storedWidth = Math.max(0.25, Number(stored?.width) || 0);
    const storedHeight = Math.max(0.25, Number(stored?.height) || 0);
    if (storedWidth > 0 && storedHeight > 0) {
      return { width: storedWidth, height: storedHeight };
    }
    const faceKey = normalizedId.split(":").pop() || "";
    return this.getBoxSurfaceDimensions(entry.mesh?.geometry, faceKey);
  }

  configureSurfacePainterCanvas(surfaceId) {
    const canvas = this.surfacePainterCanvasEl;
    if (!canvas) {
      return;
    }
    const profile = this.getSurfacePainterCanvasProfile(surfaceId);
    const logicalWidth = Math.max(0.25, Number(profile.width) || 1);
    const logicalHeight = Math.max(0.25, Number(profile.height) || 1);
    const aspectRatio = THREE.MathUtils.clamp(logicalWidth / logicalHeight, 0.28, 3.6);
    const area = Math.max(0.25, logicalWidth * logicalHeight);
    const detailScale = THREE.MathUtils.clamp(Math.sqrt(area) / 3, 0.75, 1.8);
    const baseMaxDimension = this.mobileEnabled ? 768 : 1024;
    const maxDimension = Math.round(baseMaxDimension * detailScale);
    const minDimension = this.mobileEnabled ? 256 : 320;
    let pixelWidth = aspectRatio >= 1 ? maxDimension : Math.round(maxDimension * aspectRatio);
    let pixelHeight = aspectRatio >= 1 ? Math.round(maxDimension / aspectRatio) : maxDimension;
    pixelWidth = THREE.MathUtils.clamp(pixelWidth, minDimension, maxDimension);
    pixelHeight = THREE.MathUtils.clamp(pixelHeight, minDimension, maxDimension);
    if (canvas.width !== pixelWidth) {
      canvas.width = pixelWidth;
    }
    if (canvas.height !== pixelHeight) {
      canvas.height = pixelHeight;
    }
    if (this.mobileEnabled) {
      canvas.style.width = "100%";
      canvas.style.maxWidth = "none";
      canvas.style.justifySelf = "stretch";
      canvas.style.alignSelf = "stretch";
      canvas.style.aspectRatio = "auto";
      return;
    }

    const longestEdge = Math.max(logicalWidth, logicalHeight);
    const displayScale = THREE.MathUtils.clamp(Math.pow(longestEdge / 5.5, 0.4), 0.64, 1);
    canvas.style.width = `${Math.round(displayScale * 100)}%`;
    canvas.style.maxWidth = `${Math.round(620 * displayScale)}px`;
    canvas.style.justifySelf = "center";
    canvas.style.alignSelf = "center";
    const ratioWidth = Math.max(1, Math.round(logicalWidth * 100));
    const ratioHeight = Math.max(1, Math.round(logicalHeight * 100));
    canvas.style.aspectRatio = `${ratioWidth} / ${ratioHeight}`;
  }

  registerPaintableBoxMesh(mesh, surfaceBaseId) {
    if (!mesh || !surfaceBaseId) {
      return;
    }
    mesh.userData.paintSurfaceBaseId = String(surfaceBaseId);
    this.paintableSurfaceMeshes.push(mesh);

    for (let materialIndex = 0; materialIndex < BOX_FACE_KEYS.length; materialIndex += 1) {
      const surfaceId = `${surfaceBaseId}:${BOX_FACE_KEYS[materialIndex]}`;
      const materials = Array.isArray(mesh?.material) ? mesh.material : [mesh?.material];
      const baseMap = materials[materialIndex]?.map ?? null;
      this.paintableSurfaceMap.set(surfaceId, {
        mesh,
        materialIndex,
        baseMap,
        surfaceSize: this.getBoxSurfaceDimensions(mesh?.geometry, BOX_FACE_KEYS[materialIndex]),
        revision: 0
      });
      const existing = this.surfacePaintState.get(surfaceId);
      if (existing) {
        this.applySurfacePaintTexture(surfaceId, existing);
      }
    }
  }

  getPromoPaintSurfaceBaseId(ownerKey = "") {
    const safeOwnerKey = String(ownerKey ?? "").trim().replace(/[^a-zA-Z0-9:_-]/g, "").slice(0, 90);
    if (!safeOwnerKey) {
      return "";
    }
    return `po_${safeOwnerKey}`;
  }

  getPromoPaintSurfaceId(ownerKey = "", surfaceSuffix = "") {
    const baseId = this.getPromoPaintSurfaceBaseId(ownerKey);
    if (!baseId) {
      return "";
    }
    const suffix = String(surfaceSuffix ?? "")
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, "")
      .slice(0, 24);
    const scopedBaseId = suffix ? `${baseId}_${suffix}` : baseId;
    return `${scopedBaseId}:pz`;
  }

  registerPromoPaintSurface(mesh, ownerKey, width = 2.6, height = 1.5, surfaceSuffix = "") {
    if (!mesh) {
      return "";
    }
    const baseId = this.getPromoPaintSurfaceBaseId(ownerKey);
    const suffix = String(surfaceSuffix ?? "")
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, "")
      .slice(0, 24);
    const scopedBaseId = suffix ? `${baseId}_${suffix}` : baseId;
    const surfaceId = this.getPromoPaintSurfaceId(ownerKey, suffix);
    if (!baseId || !surfaceId) {
      return "";
    }
    mesh.userData.paintSurfaceBaseId = scopedBaseId;
    mesh.userData.paintPreferredFace = "pz";
    if (!this.paintableSurfaceMeshes.includes(mesh)) {
      this.paintableSurfaceMeshes.push(mesh);
    }
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const baseMap = materials[0]?.map ?? null;
    this.paintableSurfaceMap.set(surfaceId, {
      mesh,
      materialIndex: 0,
      baseMap,
      surfaceSize: {
        width: Math.max(0.25, Number(width) || 2.6),
        height: Math.max(0.25, Number(height) || 1.5)
      },
      revision: 0
    });
    const existing = this.surfacePaintState.get(surfaceId);
    if (existing) {
      this.applySurfacePaintTexture(surfaceId, existing);
    }
    return surfaceId;
  }

  unregisterPromoPaintSurface(surfaceId, mesh) {
    const normalized = String(surfaceId ?? "").trim();
    if (normalized) {
      this.paintableSurfaceMap.delete(normalized);
    }
    if (mesh) {
      const index = this.paintableSurfaceMeshes.indexOf(mesh);
      if (index >= 0) {
        this.paintableSurfaceMeshes.splice(index, 1);
      }
    }
  }

  getSurfacePaintIdFromIntersection(intersection) {
    const baseId = String(intersection?.object?.userData?.paintSurfaceBaseId ?? "").trim();
    if (!baseId) {
      return "";
    }

    const preferredFace = String(intersection?.object?.userData?.paintPreferredFace ?? "")
      .trim()
      .toLowerCase();
    if (preferredFace && BOX_FACE_KEYS.includes(preferredFace)) {
      return `${baseId}:${preferredFace}`;
    }

    const faceIndex = Math.trunc(Number(intersection?.faceIndex) || -1);
    if (faceIndex < 0) {
      return "";
    }

    const materialIndex = Math.floor(faceIndex / 2);
    const faceKey = BOX_FACE_KEYS[materialIndex];
    if (!faceKey) {
      return "";
    }
    return `${baseId}:${faceKey}`;
  }

  getSurfacePaintTarget(maxDistance = null) {
    if (!this.canMovePlayer() || this.surfacePainterOpen) {
      return null;
    }
    if (!this.paintableSurfaceMeshes.length) {
      return null;
    }
    const distanceLimit = Number.isFinite(maxDistance)
      ? Math.max(1, Number(maxDistance) || 0)
      : this.mobileEnabled
        ? 14
        : 6.2;

    this.surfacePaintRaycaster.setFromCamera(this.surfacePaintAimPoint, this.camera);
    const intersections = this.surfacePaintRaycaster.intersectObjects(this.paintableSurfaceMeshes, false);
    let raycastTarget = null;
    for (const intersection of intersections) {
      if (!intersection || !Number.isFinite(intersection.distance)) {
        continue;
      }
      if (intersection.distance > distanceLimit) {
        continue;
      }
      const surfaceId = this.getSurfacePaintIdFromIntersection(intersection);
      if (!surfaceId || !this.paintableSurfaceMap.has(surfaceId)) {
        continue;
      }
      if (!this.canCurrentPlayerEditSurfacePaint(surfaceId)) {
        continue;
      }
      raycastTarget = {
        surfaceId,
        distance: intersection.distance
      };
      break;
    }
    const adBoardTarget = this.getCityAdBillboardProximityTarget(this.mobileEnabled ? 20 : 12.5);
    if (adBoardTarget) {
      if (!this.canCurrentPlayerEditSurfacePaint(adBoardTarget.surfaceId)) {
        return raycastTarget;
      }
      if (raycastTarget) {
        const rayIsBillboard = this.isCityMainAdBillboardSurface(raycastTarget.surfaceId);
        if (rayIsBillboard) {
          return raycastTarget;
        }
      }
      // Prioritize ad boards over nearby building walls so F interaction opens billboard painter reliably.
      return adBoardTarget;
    }
    if (raycastTarget) {
      return raycastTarget;
    }
    if (this.mobileEnabled) {
      return this.getMobileSurfacePaintTargetByProximity(Math.max(distanceLimit, 16));
    }
    return null;
  }

  resolveSurfacePaintFaceFromCamera(mesh) {
    if (!mesh || !this.camera) {
      return "";
    }
    const preferredFace = String(mesh.userData?.paintPreferredFace ?? "").trim().toLowerCase();
    if (preferredFace && BOX_FACE_KEYS.includes(preferredFace)) {
      return preferredFace;
    }
    this.surfacePaintProbeCameraLocal.copy(this.camera.position);
    mesh.worldToLocal(this.surfacePaintProbeCameraLocal);
    const lx = this.surfacePaintProbeCameraLocal.x;
    const ly = this.surfacePaintProbeCameraLocal.y;
    const lz = this.surfacePaintProbeCameraLocal.z;
    const ax = Math.abs(lx);
    const ay = Math.abs(ly);
    const az = Math.abs(lz);
    if (ax >= ay && ax >= az) {
      return lx >= 0 ? "px" : "nx";
    }
    if (ay >= ax && ay >= az) {
      return ly >= 0 ? "py" : "ny";
    }
    return lz >= 0 ? "pz" : "nz";
  }

  getMobileSurfacePaintTargetByProximity(maxDistance = 16) {
    if (!this.mobileEnabled || !this.paintableSurfaceMeshes.length || !this.camera) {
      return null;
    }

    const cameraPos = this.camera.position;
    this.surfacePaintProbeForwardVector
      .set(0, 0, -1)
      .applyQuaternion(this.camera.quaternion)
      .normalize();

    let bestTarget = null;
    let bestScore = Number.POSITIVE_INFINITY;

    for (const mesh of this.paintableSurfaceMeshes) {
      if (!mesh) {
        continue;
      }
      const baseId = String(mesh.userData?.paintSurfaceBaseId ?? "").trim();
      if (!baseId) {
        continue;
      }

      mesh.getWorldPosition(this.surfacePaintProbeWorldPosition);
      const dx = this.surfacePaintProbeWorldPosition.x - cameraPos.x;
      const dy = this.surfacePaintProbeWorldPosition.y - cameraPos.y;
      const dz = this.surfacePaintProbeWorldPosition.z - cameraPos.z;
      const horizontalDistance = Math.hypot(dx, dz);
      if (!Number.isFinite(horizontalDistance) || horizontalDistance > maxDistance) {
        continue;
      }
      const distance = Math.hypot(dx, dy * 0.22, dz);

      const inv = distance > 0.0001 ? 1 / distance : 1;
      const facingDot =
        (dx * this.surfacePaintProbeForwardVector.x +
          dy * this.surfacePaintProbeForwardVector.y +
          dz * this.surfacePaintProbeForwardVector.z) *
        inv;
      if (facingDot < -0.15) {
        continue;
      }

      const faceKey = this.resolveSurfacePaintFaceFromCamera(mesh);
      if (!faceKey) {
        continue;
      }
      const surfaceId = `${baseId}:${faceKey}`;
      if (!this.paintableSurfaceMap.has(surfaceId)) {
        continue;
      }
      if (!this.canCurrentPlayerEditSurfacePaint(surfaceId)) {
        continue;
      }

      const score = distance - facingDot * 1.35;
      if (score >= bestScore) {
        continue;
      }
      bestScore = score;
      bestTarget = {
        surfaceId,
        distance
      };
    }

    return bestTarget;
  }

  getCityAdBillboardProximityTarget(maxDistance = 12.5) {
    if (!this.camera || !this.paintableSurfaceMeshes.length) {
      return null;
    }

    const cameraPos = this.camera.position;
    this.surfacePaintProbeForwardVector
      .set(0, 0, -1)
      .applyQuaternion(this.camera.quaternion)
      .normalize();
    let bestTarget = null;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const mesh of this.paintableSurfaceMeshes) {
      if (!mesh) {
        continue;
      }
      const baseId = String(mesh.userData?.paintSurfaceBaseId ?? "").trim().toLowerCase();
      if (!baseId.startsWith(CITY_AD_BILLBOARD_BASE_PREFIX)) {
        continue;
      }

      mesh.getWorldPosition(this.surfacePaintProbeWorldPosition);
      const dx = this.surfacePaintProbeWorldPosition.x - cameraPos.x;
      const dy = this.surfacePaintProbeWorldPosition.y - cameraPos.y;
      const dz = this.surfacePaintProbeWorldPosition.z - cameraPos.z;
      const horizontalDistance = Math.hypot(dx, dz);
      if (!Number.isFinite(horizontalDistance) || horizontalDistance > maxDistance) {
        continue;
      }
      const distance = Math.hypot(dx, dy, dz);
      const invDistance = distance > 0.0001 ? 1 / distance : 1;
      const facingDot =
        (dx * this.surfacePaintProbeForwardVector.x +
          dy * this.surfacePaintProbeForwardVector.y +
          dz * this.surfacePaintProbeForwardVector.z) *
        invDistance;
      // Prevent unrelated billboard prompts while looking at nearby non-billboard meshes.
      if (facingDot < 0.42) {
        continue;
      }

      const preferredFace = String(mesh.userData?.paintPreferredFace ?? "pz").trim().toLowerCase();
      const faceKey = BOX_FACE_KEYS.includes(preferredFace) ? preferredFace : "pz";
      const surfaceId = `${baseId}:${faceKey}`;
      if (!this.paintableSurfaceMap.has(surfaceId)) {
        continue;
      }

      // Allow selecting rooftop floating billboards while standing near the building base.
      const score = horizontalDistance + Math.abs(dy) * 0.02 - facingDot * 2.4;
      if (score >= bestScore) {
        continue;
      }
      bestScore = score;
      bestTarget = { surfaceId, distance: horizontalDistance };
    }

    return bestTarget;
  }

  updateSurfacePaintPrompt(delta = 0) {
    if (!this.isSurfacePaintFeatureEnabled()) {
      this.surfacePaintTarget = null;
      this.surfacePaintProbeClock = this.surfacePaintProbeIntervalIdle;
      this.surfacePaintPromptEl?.classList.add("hidden");
      if (this.mobilePaintBtnEl) {
        this.mobilePaintBtnEl.classList.add("hidden");
        this.mobilePaintBtnEl.disabled = true;
      }
      return;
    }

    if (this.climbingRope || this.getNearestClimbableRope()) {
      this.surfacePaintTarget = null;
      this.surfacePaintProbeClock = this.surfacePaintProbeIntervalIdle;
      this.surfacePaintPromptEl?.classList.add("hidden");
      if (this.mobilePaintBtnEl) { this.mobilePaintBtnEl.classList.add("hidden"); this.mobilePaintBtnEl.disabled = true; }
      return;
    }
    if (this.chatOpen || this.surfacePainterOpen || !this.canMovePlayer()) {
      this.surfacePaintTarget = null;
      this.surfacePaintProbeClock = this.surfacePaintProbeIntervalIdle;
      this.surfacePaintPromptEl?.classList.add("hidden");
      if (this.mobilePaintBtnEl) {
        this.mobilePaintBtnEl.classList.add("hidden");
        this.mobilePaintBtnEl.disabled = true;
      }
      return;
    }

    this.surfacePaintProbeClock += Math.max(0, Number(delta) || 0);
    const baseProbeInterval = this.surfacePaintTarget
      ? this.surfacePaintProbeIntervalActive
      : this.surfacePaintProbeIntervalIdle;
    const nowMs = typeof performance !== "undefined" ? performance.now() : Date.now();
    const recentLookInputMs = Math.max(0, nowMs - (Number(this.lastLookInputAtMs) || 0));
    const turningProbeMultiplier = recentLookInputMs < this.dynamicResolutionInputQuietMs ? 1.8 : 1;
    const probeInterval = baseProbeInterval * turningProbeMultiplier;
    const shouldProbe =
      this.surfacePaintProbeClock >= probeInterval || !this.surfacePaintTarget;
    if (shouldProbe) {
      this.surfacePaintProbeClock = 0;
      this.surfacePaintTarget = this.getSurfacePaintTarget();
    }

    const visible = Boolean(this.surfacePaintTarget);
    this.surfacePaintPromptEl?.classList.toggle("hidden", !visible || this.mobileEnabled);
    if (this.surfacePaintPromptEl && visible) {
      const targetSurfaceId = String(this.surfacePaintTarget?.surfaceId ?? "");
      const promptText = this.isCityMainAdBillboardSurface(targetSurfaceId)
        ? "<kbd>F</kbd> 광고판 그리기"
        : "<kbd>F</kbd> 표면 그리기";
      if (this.surfacePaintPromptEl.innerHTML !== promptText) {
        this.surfacePaintPromptEl.innerHTML = promptText;
      }
    }
    if (this.mobilePaintBtnEl) {
      const showMobilePaintButton = this.mobileEnabled && visible;
      this.mobilePaintBtnEl.classList.toggle("hidden", !showMobilePaintButton);
      this.mobilePaintBtnEl.disabled = !showMobilePaintButton;
      if (showMobilePaintButton) {
        const targetSurfaceId = String(this.surfacePaintTarget?.surfaceId ?? "");
        this.mobilePaintBtnEl.textContent = this.isCityMainAdBillboardSurface(targetSurfaceId)
          ? "광고판 그리기"
          : "그리기";
      }
    }
  }

  tryOpenSurfacePainterFromInteraction() {
    if (!this.isSurfacePaintFeatureEnabled()) {
      return false;
    }
    if (this.surfacePainterOpen) {
      return false;
    }

    const target =
      this.surfacePaintTarget ??
      this.getSurfacePaintTarget(this.mobileEnabled ? 14 : 6.2);
    const surfaceId = String(target?.surfaceId ?? "").trim();
    if (!surfaceId) {
      return false;
    }
    const policyBlockedReason = this.getSurfacePaintPolicyBlockedReason(surfaceId);
    if (policyBlockedReason) {
      this.appendChatLine("", policyBlockedReason, "system");
      return false;
    }

    this.openSurfacePainter(surfaceId);
    return true;
  }

  clearSurfacePainterCanvas(imageDataUrl = "") {
    if (!this.surfacePainterCanvasEl) {
      return;
    }
    if (!this.surfacePainterContext) {
      this.surfacePainterContext = this.surfacePainterCanvasEl.getContext("2d");
    }
    const context = this.surfacePainterContext;
    if (!context) {
      return;
    }

    const canvas = this.surfacePainterCanvasEl;
    // Cancel any in-flight image restore from a previous open/clear cycle.
    const loadNonce = ++this.surfacePainterCanvasLoadNonce;
    const bgColor = this.normalizeSurfacePainterColor(
      this.surfacePainterBgColorInputEl?.value,
      "#ffffff"
    );
    this.surfacePainterCanvasBgColor = bgColor;
    context.save();
    context.globalCompositeOperation = "source-over";
    context.globalAlpha = 1;
    context.fillStyle = bgColor;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.restore();

    if (!imageDataUrl) {
      return;
    }

    const image = new Image();
    image.onload = () => {
      if (loadNonce !== this.surfacePainterCanvasLoadNonce) {
        return;
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
    };
    image.src = imageDataUrl;
  }

  normalizeSurfacePainterColor(rawValue, fallback = "#ffffff") {
    const value = String(rawValue ?? "").trim().toLowerCase();
    if (/^#[0-9a-f]{6}$/.test(value)) {
      return value;
    }
    if (/^#[0-9a-f]{3}$/.test(value)) {
      return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`;
    }
    const safeFallback = String(fallback ?? "").trim().toLowerCase();
    if (/^#[0-9a-f]{6}$/.test(safeFallback)) {
      return safeFallback;
    }
    return "#ffffff";
  }

  getSurfacePainterColorRgb(rawColor, fallback = "#ffffff") {
    const normalized = this.normalizeSurfacePainterColor(rawColor, fallback);
    return {
      r: parseInt(normalized.slice(1, 3), 16),
      g: parseInt(normalized.slice(3, 5), 16),
      b: parseInt(normalized.slice(5, 7), 16)
    };
  }

  applySurfacePainterBackgroundColor() {
    if (!this.surfacePainterOpen || !this.surfacePainterCanvasEl) {
      return;
    }
    if (!this.surfacePainterContext) {
      this.surfacePainterContext = this.surfacePainterCanvasEl.getContext("2d");
    }
    const context = this.surfacePainterContext;
    if (!context) {
      return;
    }

    const nextColor = this.normalizeSurfacePainterColor(
      this.surfacePainterBgColorInputEl?.value,
      this.surfacePainterCanvasBgColor || "#ffffff"
    );
    const previousColor = this.normalizeSurfacePainterColor(
      this.surfacePainterCanvasBgColor,
      "#ffffff"
    );
    if (nextColor === previousColor) {
      return;
    }

    // Background color changes should apply immediately while preserving drawn strokes.
    this.surfacePainterCanvasLoadNonce += 1;
    const canvas = this.surfacePainterCanvasEl;
    const previousRgb = this.getSurfacePainterColorRgb(previousColor, "#ffffff");
    const nextRgb = this.getSurfacePainterColorRgb(nextColor, previousColor);
    try {
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      for (let index = 0; index < data.length; index += 4) {
        const alpha = data[index + 3];
        if (
          alpha === 255 &&
          data[index] === previousRgb.r &&
          data[index + 1] === previousRgb.g &&
          data[index + 2] === previousRgb.b
        ) {
          data[index] = nextRgb.r;
          data[index + 1] = nextRgb.g;
          data[index + 2] = nextRgb.b;
        }
      }
      context.putImageData(imageData, 0, 0);
    } catch {
      // getImageData can fail on tainted canvas; keep editor usable.
    }
    this.surfacePainterCanvasBgColor = nextColor;
  }

  toggleSurfacePainterFillMode() {
    if (!this.surfacePainterOpen) {
      return;
    }
    this.setSurfacePainterFillModeEnabled(!this.surfacePainterFillModeEnabled);
  }

  getSurfacePainterPngFilename(surfaceId = "") {
    const raw = String(surfaceId ?? "").trim().toLowerCase();
    const normalized = raw.replace(/[^a-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:t]/gi, "-");
    return `surface-${normalized || "paint"}-${stamp}.png`;
  }

  exportSurfacePainterAsPng() {
    this.resolveUiElements();
    if (!this.surfacePainterOpen || !this.surfacePainterCanvasEl) {
      return;
    }

    const canvas = this.surfacePainterCanvasEl;
    const filename = this.getSurfacePainterPngFilename(this.surfacePainterTargetId);
    const triggerDownload = (href, revokeAfter = false) => {
      const link = document.createElement("a");
      link.href = href;
      link.download = filename;
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
      if (revokeAfter) {
        window.setTimeout(() => URL.revokeObjectURL(href), 0);
      }
    };

    if (typeof canvas.toBlob === "function") {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            this.appendChatLine("", "PNG 내보내기에 실패했습니다.", "system");
            return;
          }
          const url = URL.createObjectURL(blob);
          triggerDownload(url, true);
          this.appendChatLine("", `PNG 저장 완료: ${filename}`, "system");
        },
        "image/png",
        1
      );
      return;
    }

    try {
      const dataUrl = canvas.toDataURL("image/png");
      triggerDownload(dataUrl, false);
      this.appendChatLine("", `PNG 저장 완료: ${filename}`, "system");
    } catch {
      this.appendChatLine("", "PNG 내보내기에 실패했습니다.", "system");
    }
  }

  triggerSurfacePainterPngImport() {
    this.resolveUiElements();
    if (!this.surfacePainterOpen) {
      return;
    }
    if (!this.hasHostPrivilege()) {
      this.appendChatLine("", "PNG/JPG 불러오기는 호스트만 가능합니다.", "system");
      return;
    }
    if (!this.surfacePainterImportInputEl) {
      this.appendChatLine("", "이미지 불러오기 입력이 준비되지 않았습니다.", "system");
      return;
    }
    this.surfacePainterImportInputEl.click();
  }

  handleSurfacePainterImportInputChange(event) {
    const input = event?.target;
    const file = input?.files?.[0] ?? null;
    if (input) {
      input.value = "";
    }
    if (!this.surfacePainterOpen) {
      return;
    }
    if (!file) {
      return;
    }
    if (!this.hasHostPrivilege()) {
      this.appendChatLine("", "PNG/JPG 불러오기는 호스트만 가능합니다.", "system");
      return;
    }
    const fileType = String(file.type ?? "").trim().toLowerCase();
    const fileName = String(file.name ?? "").trim().toLowerCase();
    const isPng = fileType === "image/png" || fileName.endsWith(".png");
    const isJpeg =
      fileType === "image/jpeg" ||
      fileType === "image/jpg" ||
      fileName.endsWith(".jpg") ||
      fileName.endsWith(".jpeg");
    if (!isPng && !isJpeg) {
      this.appendChatLine("", "PNG 또는 JPG 파일만 불러올 수 있습니다.", "system");
      return;
    }
    if (Number(file.size) > 10 * 1024 * 1024) {
      this.appendChatLine("", "이미지 파일이 너무 큽니다. 10MB 이하로 선택하세요.", "system");
      return;
    }
    const reader = new FileReader();
    const loadNonce = ++this.surfacePainterCanvasLoadNonce;
    reader.onload = () => {
      const dataUrl = String(reader.result ?? "").trim();
      if (!/^data:image\/(png|jpe?g);base64,/i.test(dataUrl)) {
        this.appendChatLine("", "이미지 데이터를 읽지 못했습니다.", "system");
        return;
      }
      const image = new Image();
      image.onload = () => {
        if (loadNonce !== this.surfacePainterCanvasLoadNonce) {
          return;
        }
        if (!this.surfacePainterCanvasEl) {
          return;
        }
        if (!this.surfacePainterContext) {
          this.surfacePainterContext = this.surfacePainterCanvasEl.getContext("2d");
        }
        const context = this.surfacePainterContext;
        if (!context) {
          return;
        }
        const canvas = this.surfacePainterCanvasEl;
        const bgColor = this.normalizeSurfacePainterColor(
          this.surfacePainterBgColorInputEl?.value,
          this.surfacePainterCanvasBgColor || "#ffffff"
        );
        this.surfacePainterCanvasBgColor = bgColor;
        context.save();
        context.globalCompositeOperation = "source-over";
        context.globalAlpha = 1;
        context.fillStyle = bgColor;
        context.fillRect(0, 0, canvas.width, canvas.height);

        const sourceWidth = Math.max(1, Number(image.width) || 1);
        const sourceHeight = Math.max(1, Number(image.height) || 1);
        const scale = Math.min(canvas.width / sourceWidth, canvas.height / sourceHeight);
        const drawWidth = Math.max(1, Math.round(sourceWidth * scale));
        const drawHeight = Math.max(1, Math.round(sourceHeight * scale));
        const offsetX = Math.round((canvas.width - drawWidth) * 0.5);
        const offsetY = Math.round((canvas.height - drawHeight) * 0.5);
        context.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
        context.restore();
        this.appendChatLine("", `이미지 불러오기 완료: ${String(file.name ?? "").trim()}`, "system");
      };
      image.onerror = () => {
        this.appendChatLine("", "이미지를 캔버스로 불러오지 못했습니다.", "system");
      };
      image.src = dataUrl;
    };
    reader.onerror = () => {
      this.appendChatLine("", "이미지 파일 읽기에 실패했습니다.", "system");
    };
    reader.readAsDataURL(file);
  }

  openSurfacePainter(surfaceId) {
    this.resolveUiElements();
    const normalizedId = String(surfaceId ?? "").trim();
    if (!normalizedId || !this.paintableSurfaceMap.has(normalizedId)) {
      return;
    }
    if (!this.surfacePainterEl || !this.surfacePainterCanvasEl) {
      return;
    }
    if (!this.surfacePainterContext) {
      this.surfacePainterContext = this.surfacePainterCanvasEl.getContext("2d");
    }

    this.configureSurfacePainterCanvas(normalizedId);
    this.surfacePainterContext = this.surfacePainterCanvasEl.getContext("2d");
    this.surfacePainterOpen = true;
    this.surfacePainterDrawing = false;
    this.surfacePainterPointerId = null;
    this.surfacePainterTouchId = null;
    this.surfacePainterTargetId = normalizedId;
    this.surfacePainterSaveInFlight = false;
    this.surfacePainterActionsCollapsed = false;
    this.updateSurfacePainterSaveAvailability();
    this.updateSurfacePainterActionsUi();
    this.setSurfacePainterEraserEnabled(false);
    this.setSurfacePainterFillModeEnabled(false);

    this.keys.clear();
    this.resetMobileControlInputState();
    this.chalkDrawingActive = false;
    this.chalkLastStamp = null;
    this.setChatOpen(false);
    if (document.pointerLockElement === this.renderer.domElement) {
      document.exitPointerLock?.();
    }

    const existing = String(this.surfacePaintState.get(normalizedId) ?? "");
    this.clearSurfacePainterCanvas(existing);
    this.surfacePainterEl.classList.remove("hidden");
    // Block action buttons briefly to prevent tap-through from the opener button
    const _spActions = document.getElementById("surface-painter-actions");
    if (_spActions) {
      _spActions.style.pointerEvents = "none";
      setTimeout(() => { _spActions.style.pointerEvents = ""; }, 450);
    }
    this.updateSurfacePainterActionsUi();
    this.syncMobileUiState();
  }

  closeSurfacePainter() {
    if (!this.surfacePainterOpen) {
      return;
    }
    this.surfacePainterOpen = false;
    this.surfacePainterDrawing = false;
    if (
      this.surfacePainterPointerId !== null &&
      this.surfacePainterCanvasEl &&
      typeof this.surfacePainterCanvasEl.releasePointerCapture === "function"
    ) {
      try {
        this.surfacePainterCanvasEl.releasePointerCapture(this.surfacePainterPointerId);
      } catch {
        // ignore stale capture errors
      }
    }
    this.surfacePainterPointerId = null;
    this.surfacePainterTouchId = null;
    this.surfacePainterTargetId = "";
    this.surfacePainterCanvasLoadNonce += 1;
    this.surfacePainterActionsCollapsed = false;
    this.setSurfacePainterFillModeEnabled(false);
    this.resetMobileControlInputState();
    this.surfacePainterEl?.classList.add("hidden");
    this.updateSurfacePainterSaveAvailability();
    this.updateSurfacePainterActionsUi();
    this.updateSurfacePaintPrompt();
    this.syncMobileUiState();
  }

  getSurfacePainterCanvasPoint(clientX, clientY) {
    const canvas = this.surfacePainterCanvasEl;
    if (!canvas) {
      return null;
    }
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return null;
    }
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = THREE.MathUtils.clamp((clientX - rect.left) * scaleX, 0, canvas.width);
    const y = THREE.MathUtils.clamp((clientY - rect.top) * scaleY, 0, canvas.height);
    return { x, y };
  }

  getSurfacePainterBrushColor() {
    if (this.surfacePainterEraserEnabled) {
      return String(this.surfacePainterBgColorInputEl?.value ?? "#ffffff");
    }
    return String(this.surfacePainterColorInputEl?.value ?? "#111111");
  }

  setSurfacePainterFillModeEnabled(enabled) {
    this.surfacePainterFillModeEnabled = Boolean(enabled);
    if (this.surfacePainterFillBtnEl) {
      this.surfacePainterFillBtnEl.classList.toggle("active", this.surfacePainterFillModeEnabled);
      this.surfacePainterFillBtnEl.setAttribute(
        "aria-pressed",
        this.surfacePainterFillModeEnabled ? "true" : "false"
      );
    }
  }

  setSurfacePainterEraserEnabled(enabled) {
    this.surfacePainterEraserEnabled = Boolean(enabled);
    if (this.surfacePainterEraserBtnEl) {
      this.surfacePainterEraserBtnEl.classList.toggle("active", this.surfacePainterEraserEnabled);
      this.surfacePainterEraserBtnEl.setAttribute(
        "aria-pressed",
        this.surfacePainterEraserEnabled ? "true" : "false"
      );
    }
  }

  getSurfacePainterTargetIds(surfaceId) {
    const normalized = String(surfaceId ?? "").trim();
    if (!normalized) {
      return [];
    }
    if (this.isCityMainAdBillboardSurface(normalized)) {
      const separatorIndex = normalized.indexOf(":");
      const baseId = separatorIndex > 0 ? normalized.slice(0, separatorIndex) : normalized;
      const billboardFaces = ["pz", "nz"];
      const targetIds = [];
      for (const faceKey of billboardFaces) {
        const faceId = `${baseId}:${faceKey}`;
        if (this.paintableSurfaceMap.has(faceId)) {
          targetIds.push(faceId);
        }
      }
      return targetIds.length > 0 ? targetIds : [normalized];
    }
    return [normalized];
  }

  getSurfacePainterBrushSize() {
    const raw = Number(this.surfacePainterSizeInputEl?.value);
    if (!Number.isFinite(raw)) {
      return 8;
    }
    return THREE.MathUtils.clamp(raw, 2, 28);
  }

  drawSurfacePainterSegment(fromX, fromY, toX, toY) {
    if (!this.surfacePainterContext) {
      return;
    }
    const context = this.surfacePainterContext;
    context.save();
    context.globalCompositeOperation = "source-over";
    context.strokeStyle = this.getSurfacePainterBrushColor();
    context.lineWidth = this.getSurfacePainterBrushSize();
    context.lineCap = "round";
    context.lineJoin = "round";
    context.beginPath();
    context.moveTo(fromX, fromY);
    context.lineTo(toX, toY);
    context.stroke();
    context.restore();
  }

  beginSurfacePainterStrokeAt(clientX, clientY, pointerId, capturePointer = false) {
    if (!this.surfacePainterOpen || !this.surfacePainterCanvasEl) {
      return;
    }
    const point = this.getSurfacePainterCanvasPoint(clientX, clientY);
    if (!point) {
      return;
    }
    // User started editing; ignore any late async image draw callbacks.
    this.surfacePainterCanvasLoadNonce += 1;
    if (this.surfacePainterFillModeEnabled) {
      this.fillSurfacePainterRegionAtPoint(point.x, point.y);
      return;
    }

    this.surfacePainterDrawing = true;
    this.surfacePainterPointerId = pointerId;
    this.surfacePainterLastX = point.x;
    this.surfacePainterLastY = point.y;
    if (capturePointer) {
      this.surfacePainterCanvasEl.setPointerCapture?.(pointerId);
    }
    this.drawSurfacePainterSegment(point.x, point.y, point.x, point.y);
  }

  continueSurfacePainterStrokeAt(clientX, clientY, pointerId) {
    if (!this.surfacePainterDrawing) {
      return;
    }
    if (pointerId !== this.surfacePainterPointerId) {
      return;
    }

    const point = this.getSurfacePainterCanvasPoint(clientX, clientY);
    if (!point) {
      return;
    }
    this.drawSurfacePainterSegment(
      this.surfacePainterLastX,
      this.surfacePainterLastY,
      point.x,
      point.y
    );
    this.surfacePainterLastX = point.x;
    this.surfacePainterLastY = point.y;
  }

  endSurfacePainterStroke(pointerId, releasePointer = false) {
    if (!this.surfacePainterDrawing) {
      return;
    }
    if (pointerId !== this.surfacePainterPointerId) {
      return;
    }

    if (releasePointer) {
      this.surfacePainterCanvasEl?.releasePointerCapture?.(pointerId);
    }
    this.surfacePainterDrawing = false;
    this.surfacePainterPointerId = null;
  }

  resetSurfacePaintTexture(surfaceId) {
    const entry = this.paintableSurfaceMap.get(surfaceId);
    if (!entry) {
      return false;
    }
    const mesh = entry.mesh;
    const materialIndex = Math.trunc(Number(entry.materialIndex));
    const materials = Array.isArray(mesh?.material) ? mesh.material : [mesh?.material];
    const material = materials[materialIndex];
    if (!material) {
      return false;
    }

    entry.revision = Math.max(0, Math.trunc(Number(entry.revision) || 0)) + 1;
    const baseMap = entry.baseMap ?? null;
    const previous = material.map ?? null;
    material.map = baseMap;
    material.needsUpdate = true;
    if (previous && previous !== baseMap) {
      previous.dispose?.();
    }
    return true;
  }

  applySurfacePaintTexture(surfaceId, imageDataUrl) {
    const entry = this.paintableSurfaceMap.get(surfaceId);
    if (!entry) {
      return false;
    }
    const mesh = entry.mesh;
    const materialIndex = Math.trunc(Number(entry.materialIndex));
    const materials = Array.isArray(mesh?.material) ? mesh.material : [mesh?.material];
    const material = materials[materialIndex];
    if (!material) {
      return false;
    }

    const nextRevision = Math.max(0, Math.trunc(Number(entry.revision) || 0)) + 1;
    entry.revision = nextRevision;
    this.textureLoader.load(
      imageDataUrl,
      (texture) => {
        if ((this.paintableSurfaceMap.get(surfaceId)?.revision ?? -1) !== nextRevision) {
          texture.dispose?.();
          return;
        }
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = false;
        const previous = material.map;
        material.map = texture;
        material.needsUpdate = true;
        if (previous && previous !== texture && previous !== (entry.baseMap ?? null)) {
          previous.dispose?.();
        }
      },
      undefined,
      () => {}
    );
    return true;
  }

  applySurfacePaintUpdate(payload = {}) {
    const surfaceId = String(payload?.surfaceId ?? "").trim();
    const imageDataUrl = String(payload?.imageDataUrl ?? payload?.dataUrl ?? "").trim();
    if (!surfaceId || !/^data:image\/webp;base64,/i.test(imageDataUrl)) {
      return false;
    }
    const updatedAt = Math.max(0, Math.trunc(Number(payload?.updatedAt) || Date.now()));
    const previousUpdatedAt = Math.max(0, Math.trunc(Number(this.surfacePaintUpdatedAt.get(surfaceId)) || 0));
    if (previousUpdatedAt > 0 && updatedAt > 0 && updatedAt < previousUpdatedAt) {
      return false;
    }
    this.surfacePaintState.set(surfaceId, imageDataUrl);
    this.surfacePaintUpdatedAt.set(surfaceId, updatedAt);
    this.applySurfacePaintTexture(surfaceId, imageDataUrl);
    return true;
  }

  applySurfacePaintSnapshot(payload = {}) {
    const surfaces = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.surfaces)
        ? payload.surfaces
        : [];

    const nextState = new Map();
    const nextUpdatedAt = new Map();
    for (const item of surfaces) {
      const surfaceId = String(item?.surfaceId ?? "").trim();
      const imageDataUrl = String(item?.imageDataUrl ?? item?.dataUrl ?? "").trim();
      if (!surfaceId || !/^data:image\/webp;base64,/i.test(imageDataUrl)) {
        continue;
      }
      const updatedAt = Math.max(0, Math.trunc(Number(item?.updatedAt) || Date.now()));
      nextState.set(surfaceId, imageDataUrl);
      nextUpdatedAt.set(surfaceId, updatedAt);
    }

    const previousState = this.surfacePaintState;
    for (const [surfaceId] of previousState) {
      if (!nextState.has(surfaceId)) {
        this.resetSurfacePaintTexture(surfaceId);
      }
    }

    this.surfacePaintState = nextState;
    this.surfacePaintUpdatedAt = nextUpdatedAt;
    for (const [surfaceId, imageDataUrl] of nextState) {
      const previousImage = previousState.get(surfaceId) ?? "";
      if (previousImage !== imageDataUrl) {
        this.applySurfacePaintTexture(surfaceId, imageDataUrl);
      }
    }
  }

  doesSurfacePainterPixelMatch(data, offset, targetColor, tolerance = 18) {
    return (
      Math.abs(data[offset] - targetColor.r) <= tolerance &&
      Math.abs(data[offset + 1] - targetColor.g) <= tolerance &&
      Math.abs(data[offset + 2] - targetColor.b) <= tolerance &&
      Math.abs(data[offset + 3] - targetColor.a) <= tolerance
    );
  }

  fillSurfacePainterRegionAtPoint(canvasX, canvasY) {
    if (!this.surfacePainterOpen || !this.surfacePainterCanvasEl) {
      return false;
    }
    if (!this.surfacePainterContext) {
      this.surfacePainterContext = this.surfacePainterCanvasEl.getContext("2d");
    }
    const context = this.surfacePainterContext;
    const canvas = this.surfacePainterCanvasEl;
    if (!context || !canvas) {
      return false;
    }

    const startX = THREE.MathUtils.clamp(Math.floor(Number(canvasX) || 0), 0, canvas.width - 1);
    const startY = THREE.MathUtils.clamp(Math.floor(Number(canvasY) || 0), 0, canvas.height - 1);
    const fillRgb = this.getSurfacePainterColorRgb(this.getSurfacePainterBrushColor(), "#111111");
    try {
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      const startOffset = (startY * canvas.width + startX) * 4;
      const tolerance = 18;
      const targetColor = {
        r: data[startOffset],
        g: data[startOffset + 1],
        b: data[startOffset + 2],
        a: data[startOffset + 3]
      };
      const replacementColor = {
        r: fillRgb.r,
        g: fillRgb.g,
        b: fillRgb.b,
        a: 255
      };
      if (this.doesSurfacePainterPixelMatch(data, startOffset, replacementColor, tolerance)) {
        return false;
      }

      const stack = [startX, startY];
      while (stack.length > 0) {
        const y = stack.pop();
        const x = stack.pop();
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
          continue;
        }
        if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) {
          continue;
        }
        const offset = (y * canvas.width + x) * 4;
        if (!this.doesSurfacePainterPixelMatch(data, offset, targetColor, tolerance)) {
          continue;
        }
        data[offset] = replacementColor.r;
        data[offset + 1] = replacementColor.g;
        data[offset + 2] = replacementColor.b;
        data[offset + 3] = replacementColor.a;
        stack.push(x - 1, y, x + 1, y, x, y - 1, x, y + 1);
      }

      context.putImageData(imageData, 0, 0);
      return true;
    } catch {
      return false;
    }
  }

  normalizeSurfacePaintPolicyState(rawPolicies = null) {
    const source = rawPolicies && typeof rawPolicies === "object" ? rawPolicies : {};
    const bridgePanelsNzSource =
      source.bridgePanelsNz && typeof source.bridgePanelsNz === "object"
        ? source.bridgePanelsNz
        : source.bridge_panels_nz && typeof source.bridge_panels_nz === "object"
          ? source.bridge_panels_nz
          : {};
    const bridgePanel12NzSource =
      source.bridgePanel12Nz && typeof source.bridgePanel12Nz === "object"
        ? source.bridgePanel12Nz
        : source.bridge_panel_12_nz && typeof source.bridge_panel_12_nz === "object"
          ? source.bridge_panel_12_nz
          : {};
    const fallback = this.surfacePaintPolicyState?.bridgePanelsNz ?? {};
    return {
      bridgePanelsNz: {
        surfacePattern: "bridge_panel_*:*",
        allowOthersDraw: Boolean(
          bridgePanelsNzSource.allowOthersDraw ??
          bridgePanel12NzSource.allowOthersDraw ??
            bridgePanel12NzSource.allow_others_draw ??
            fallback.allowOthersDraw
        ),
        updatedAt: Math.max(
          0,
          Math.trunc(
            Number(bridgePanelsNzSource.updatedAt) ||
            Number(bridgePanel12NzSource.updatedAt) ||
              Number(bridgePanel12NzSource.updated_at) ||
              Number(fallback.updatedAt) ||
              Date.now()
          )
        )
      }
    };
  }

  applySurfacePaintPolicyState(rawPolicies = null) {
    this.surfacePaintPolicyState = this.normalizeSurfacePaintPolicyState(rawPolicies);
    this.updateSurfacePainterSaveAvailability();
  }

  isHostControlledSurfaceId(surfaceId = "") {
    return HOST_CONTROLLED_BRIDGE_SURFACE_ID_PATTERN.test(
      String(surfaceId ?? "").trim().toLowerCase()
    );
  }

  getHostControlledSurfaceAllowOthersDraw(surfaceId = "") {
    if (!this.isHostControlledSurfaceId(surfaceId)) {
      return true;
    }
    return Boolean(this.surfacePaintPolicyState?.bridgePanelsNz?.allowOthersDraw);
  }

  getSurfacePaintPolicyBlockedReason(surfaceId = "") {
    const normalizedId = String(surfaceId ?? "").trim().toLowerCase();
    if (!this.isHostControlledSurfaceId(normalizedId)) {
      return "";
    }
    if (this.hasHostPrivilege()) {
      return "";
    }
    return this.getHostControlledSurfaceAllowOthersDraw(normalizedId)
      ? ""
      : "이 표면은 호스트만 수정할 수 있습니다.";
  }

  canCurrentPlayerEditSurfacePaint(surfaceId = "") {
    return !this.getSurfacePaintPolicyBlockedReason(surfaceId);
  }

  isSurfacePaintOnlineReady() {
    return Boolean(this.socket && this.networkConnected && this.socketEndpoint);
  }

  getSurfacePainterPromoOwnerKey(surfaceId = this.surfacePainterTargetId) {
    const normalized = String(surfaceId ?? "").trim();
    if (!normalized.startsWith("po_")) {
      return "";
    }
    const baseId = normalized.split(":")[0] ?? "";
    if (!baseId.startsWith("po_")) {
      return "";
    }
    const ownerWithSuffix = baseId.slice(3);
    return ownerWithSuffix.replace(/_q[0-3]$/i, "");
  }

  getSurfacePainterPromoTarget() {
    const ownerKey = this.getSurfacePainterPromoOwnerKey();
    if (!ownerKey) {
      return null;
    }
    return this.promoObjects.get(ownerKey) ?? null;
  }

  isPromoEditLockEnabled(rawAllowOthersDraw = false) {
    return !Boolean(rawAllowOthersDraw);
  }

  getPromoEditLockStatusText(rawAllowOthersDraw = false, { draft = false } = {}) {
    const locked = this.isPromoEditLockEnabled(rawAllowOthersDraw);
    if (draft) {
      return locked
        ? "현재 설정: 다른사람 수정 금지. 저장/배치 시 반영됩니다."
        : "현재 설정: 다른사람 수정 허용. 저장/배치 시 반영됩니다.";
    }
    return locked
      ? "현재 상태: 다른사람 수정 금지. 다른 사람은 수정할 수 없습니다."
      : "현재 상태: 다른사람 수정 허용. 다른 사람도 수정할 수 있습니다.";
  }

  canCurrentPlayerEditPromoSurface(ownerKey = this.getSurfacePainterPromoOwnerKey()) {
    const targetOwnerKey = String(ownerKey ?? "").trim();
    if (!targetOwnerKey) {
      return true;
    }
    if (targetOwnerKey === String(this.promoOwnerKey ?? "")) {
      return true;
    }
    const promoTarget = this.promoObjects.get(targetOwnerKey);
    return Boolean(promoTarget?.allowOthersDraw);
  }

  getSurfacePainterPromoBlockedReason() {
    const ownerKey = this.getSurfacePainterPromoOwnerKey();
    if (!ownerKey) {
      return "홍보 오브젝트 표면에서만 사용 가능합니다.";
    }
    const policyBlockedReason = this.getPromoActionBlockedReason();
    if (policyBlockedReason) {
      return policyBlockedReason;
    }
    if (ownerKey !== String(this.promoOwnerKey ?? "")) {
      return "내 오브젝트에서만 사용할 수 있습니다.";
    }
    if (this.promoSetInFlight || this.promoRemoveInFlight) {
      return "오브젝트 반영 중입니다.";
    }
    return "";
  }

  requestPromoRepositionFromSurfacePainter() {
    const blockedReason = this.getSurfacePainterPromoBlockedReason();
    if (blockedReason) {
      this.appendChatLine("", blockedReason, "system");
      return;
    }
    this.requestPromoUpsert({ placeInFront: true, preserveExistingStyle: true });
  }

  requestPromoRemoveFromSurfacePainter({ startPlacementPreview = false } = {}) {
    const blockedReason = this.getSurfacePainterPromoBlockedReason();
    if (blockedReason) {
      this.appendChatLine("", blockedReason, "system");
      return;
    }
    this.closeSurfacePainter();
    this.requestPromoRemove({ startPlacementPreviewOnSuccess: Boolean(startPlacementPreview) });
  }

  requestPromoScaleFromSurfacePainter(delta = 0) {
    const blockedReason = this.getSurfacePainterPromoBlockedReason();
    if (blockedReason) {
      this.appendChatLine("", blockedReason, "system");
      return;
    }
    const target = this.getSurfacePainterPromoTarget();
    if (!target) {
      return;
    }
    const step = Number(delta);
    if (!Number.isFinite(step) || Math.abs(step) < 0.0001) {
      return;
    }
    const nextScale = THREE.MathUtils.clamp(
      (Number(target.scale) || 1) + step,
      PROMO_MIN_SCALE,
      PROMO_MAX_SCALE
    );
    if (Math.abs(nextScale - (Number(target.scale) || 1)) < 0.0001) {
      return;
    }
    this.requestPromoUpsert({
      placeInFront: false,
      preserveExistingStyle: true,
      scaleOverride: nextScale
    });
  }

  toggleSurfacePainterPromoAllowOthersDraw() {
    const blockedReason = this.getSurfacePainterPromoBlockedReason();
    if (blockedReason) {
      this.appendChatLine("", blockedReason, "system");
      return;
    }
    const target = this.getSurfacePainterPromoTarget();
    if (!target) {
      return;
    }
    const nextAllow = !Boolean(target.allowOthersDraw);
    this.requestPromoUpsert({
      placeInFront: false,
      preserveExistingStyle: true,
      allowOthersDrawOverride: nextAllow,
      successNotice: nextAllow
        ? "다른사람 수정 허용으로 변경했습니다."
        : "다른사람 수정 금지로 변경했습니다."
    });
  }

  requestHostSurfacePaintPolicyUpdate(surfaceId, allowOthersDraw) {
    const normalizedId = String(surfaceId ?? "").trim().toLowerCase();
    if (!this.isHostControlledSurfaceId(normalizedId)) {
      return;
    }
    if (!this.socket || !this.networkConnected) {
      this.appendChatLine("", "서버 연결 후 다시 시도하세요.", "system");
      return;
    }
    if (!this.isRoomHost) {
      this.appendChatLine("", "이 표면 권한 변경은 방장만 가능합니다.", "system");
      return;
    }
    if (this.surfacePaintPolicySetInFlight) {
      return;
    }

    this.surfacePaintPolicySetInFlight = true;
    this.updateSurfacePainterSaveAvailability();
    this.socket.emit(
      "paint:surface:policy:set",
      { surfaceId: normalizedId, allowOthersDraw: Boolean(allowOthersDraw) },
      (response = {}) => {
        this.surfacePaintPolicySetInFlight = false;
        this.updateSurfacePainterSaveAvailability();
        if (!response?.ok) {
          const reason = String(response?.error ?? "").trim() || "알 수 없는 오류";
          this.appendChatLine("", `표면 권한 변경 실패: ${reason}`, "system");
          return;
        }
        if (response?.surfacePolicies && typeof response.surfacePolicies === "object") {
          this.applySurfacePaintPolicyState(response.surfacePolicies);
        }
        const enabled = Boolean(response?.allowOthersDraw);
        this.appendChatLine(
          "",
          enabled
            ? "다른사람 수정 허용으로 변경했습니다."
            : "다른사람 수정 금지로 변경했습니다.",
          "system"
        );
      }
    );
  }

  toggleHostControlledSurfaceAllowOthersDraw() {
    const targetSurfaceId = String(this.surfacePainterTargetId ?? "").trim().toLowerCase();
    if (!this.isHostControlledSurfaceId(targetSurfaceId)) {
      return;
    }
    if (!this.isRoomHost) {
      this.appendChatLine("", "이 표면 권한 변경은 방장만 가능합니다.", "system");
      return;
    }
    const nextAllow = !this.getHostControlledSurfaceAllowOthersDraw(targetSurfaceId);
    this.requestHostSurfacePaintPolicyUpdate(targetSurfaceId, nextAllow);
  }

  handleSurfacePainterDeleteAction() {
    const promoOwnerKey = this.getSurfacePainterPromoOwnerKey();
    if (promoOwnerKey) {
      // Mobile flow: deleting from the painter should not reopen the legacy promo panel.
      this.requestPromoRemoveFromSurfacePainter({ startPlacementPreview: false });
      return;
    }
    this.clearSurfacePainterCanvas();
  }

  getSurfacePaintSaveBlockedReason() {
    if (this.surfacePainterSaveInFlight) {
      return "그림 저장 중입니다.";
    }
    const surfacePaintCoreAvailable =
      typeof this.runtimePolicyState?.surfacePaintCoreMemory?.available === "boolean"
        ? this.runtimePolicyState.surfacePaintCoreMemory.available
        : this.runtimePolicyState?.persistentStateAvailable;
    if (surfacePaintCoreAvailable === false) {
      return this.getCoreMemoryUnavailableMessage(
        "캔버스",
        this.runtimePolicyState?.surfacePaintCoreMemory
      );
    }
    const surfacePaintMode = this.normalizeRuntimeFeatureMode(
      this.runtimePolicyState?.surfacePaintMode,
      ""
    );
    if (surfacePaintMode === "off") {
      return "캔버스 저장이 현재 비활성화되어 있습니다.";
    }
    if (surfacePaintMode === "host" && !this.hasHostPrivilege()) {
      return "캔버스 저장은 방장만 가능합니다.";
    }
    const policyBlockedReason = this.getSurfacePaintPolicyBlockedReason(this.surfacePainterTargetId);
    if (policyBlockedReason) {
      return policyBlockedReason;
    }
    const promoOwnerKey = this.getSurfacePainterPromoOwnerKey();
    if (promoOwnerKey && !this.canCurrentPlayerEditPromoSurface(promoOwnerKey)) {
      return "소유자가 허용한 오브젝트만 수정할 수 있습니다.";
    }
    if (!this.socketEndpoint) {
      const endpointError = String(this.socketEndpointValidationError ?? "").trim();
      if (endpointError) {
        return endpointError;
      }
      return "서버 링크가 필요합니다. ?server=https://... 형식으로 접속하세요.";
    }
    return "";
  }

  showSurfacePaintLinkWarningOnce(message = "") {
    const text = String(message ?? this.socketEndpointValidationError ?? "").trim();
    if (!text || this.surfacePaintLinkWarningShown) {
      return;
    }
    this.surfacePaintLinkWarningShown = true;
    this.appendChatLine("", text, "system");
  }

  updateSurfacePainterSaveAvailability() {
    if (!this.surfacePainterSaveBtnEl) {
      return;
    }
    const blockedReason = this.getSurfacePaintSaveBlockedReason();
    const canSave = !blockedReason;
    this.surfacePainterSaveBtnEl.disabled = !canSave;
    if (!canSave) {
      this.surfacePainterSaveBtnEl.title = blockedReason;
    } else {
      this.surfacePainterSaveBtnEl.removeAttribute("title");
    }
    if (this.surfacePainterImportBtnEl) {
      const canImport = this.surfacePainterOpen && this.hasHostPrivilege();
      this.surfacePainterImportBtnEl.disabled = !canImport;
      this.surfacePainterImportBtnEl.title = canImport
        ? "PNG/JPG 파일을 캔버스로 불러옵니다."
        : "PNG/JPG 불러오기는 호스트만 가능합니다.";
    }

    const promoButtons = [
      this.surfacePainterPromoRepositionBtnEl,
      this.surfacePainterPromoRemoveBtnEl,
      this.surfacePainterPromoScaleDownBtnEl,
      this.surfacePainterPromoScaleUpBtnEl
    ];
    const promoOwnerKey = this.getSurfacePainterPromoOwnerKey();
    const showPromoButtons =
      this.surfacePainterOpen &&
      Boolean(promoOwnerKey) &&
      promoOwnerKey === String(this.promoOwnerKey ?? "");
    const promoBlockedReason = this.getSurfacePainterPromoBlockedReason();
    for (const button of promoButtons) {
      if (!button) {
        continue;
      }
      button.classList.toggle("hidden", !showPromoButtons);
      button.disabled = Boolean(promoBlockedReason);
      if (promoBlockedReason) {
        button.title = promoBlockedReason;
      } else {
        button.removeAttribute("title");
      }
    }

    if (this.surfacePainterPromoShareToggleBtnEl) {
      const currentSurfaceId = String(this.surfacePainterTargetId ?? "").trim().toLowerCase();
      if (this.isHostControlledSurfaceId(currentSurfaceId)) {
        const showShareToggle = this.surfacePainterOpen && this.isRoomHost;
        const allowOthersDraw = this.getHostControlledSurfaceAllowOthersDraw(currentSurfaceId);
        const lockEnabled = this.isPromoEditLockEnabled(allowOthersDraw);
        this.surfacePainterPromoShareToggleBtnEl.classList.toggle("hidden", !showShareToggle);
        this.surfacePainterPromoShareToggleBtnEl.classList.toggle("active", lockEnabled);
        this.surfacePainterPromoShareToggleBtnEl.setAttribute(
          "aria-pressed",
          lockEnabled ? "true" : "false"
        );
        this.surfacePainterPromoShareToggleBtnEl.textContent = lockEnabled
          ? "다른사람 수정금지: 켜짐"
          : "다른사람 수정금지: 꺼짐";
        this.surfacePainterPromoShareToggleBtnEl.disabled = this.surfacePaintPolicySetInFlight;
        this.surfacePainterPromoShareToggleBtnEl.title = lockEnabled
          ? "현재 상태: 다른 사람은 이 표면을 수정할 수 없습니다."
          : "현재 상태: 다른 사람도 이 표면을 수정할 수 있습니다.";
      } else {
        const promoTarget = this.getSurfacePainterPromoTarget();
        const isOwnPromoSurface = promoOwnerKey === String(this.promoOwnerKey ?? "");
        const nextAllow =
          isOwnPromoSurface && typeof this.promoAllowOthersDrawDraft === "boolean"
            ? this.promoAllowOthersDrawDraft
            : Boolean(promoTarget?.allowOthersDraw);
        const lockEnabled = this.isPromoEditLockEnabled(nextAllow);
        const showShareToggle = showPromoButtons && this.isHostEntryLink;
        this.surfacePainterPromoShareToggleBtnEl.classList.toggle("hidden", !showShareToggle);
        this.surfacePainterPromoShareToggleBtnEl.classList.toggle("active", lockEnabled);
        this.surfacePainterPromoShareToggleBtnEl.setAttribute(
          "aria-pressed",
          lockEnabled ? "true" : "false"
        );
        this.surfacePainterPromoShareToggleBtnEl.textContent = lockEnabled
          ? "다른사람 수정금지: 켜짐"
          : "다른사람 수정금지: 꺼짐";
        this.surfacePainterPromoShareToggleBtnEl.disabled = Boolean(promoBlockedReason);
        if (promoBlockedReason) {
          this.surfacePainterPromoShareToggleBtnEl.title = promoBlockedReason;
        } else {
          this.surfacePainterPromoShareToggleBtnEl.title = this.getPromoEditLockStatusText(nextAllow);
        }
      }
    }
  }

  updateSurfacePainterActionsUi() {
    const isMobilePainter = Boolean(this.mobileEnabled && this.surfacePainterOpen);
    const collapsed = Boolean(isMobilePainter && this.surfacePainterActionsCollapsed);
    this.surfacePainterPanelEl?.classList.toggle("actions-collapsed", collapsed);
    if (!this.surfacePainterActionsToggleBtnEl) {
      return;
    }
    this.surfacePainterActionsToggleBtnEl.classList.toggle("hidden", !isMobilePainter);
    this.surfacePainterActionsToggleBtnEl.textContent = collapsed ? "버튼 열기" : "버튼 접기";
    this.surfacePainterActionsToggleBtnEl.setAttribute(
      "aria-expanded",
      collapsed ? "false" : "true"
    );
  }

  toggleSurfacePainterActionsCollapsed() {
    if (!this.surfacePainterOpen || !this.mobileEnabled) {
      return;
    }
    this.surfacePainterActionsCollapsed = !this.surfacePainterActionsCollapsed;
    this.updateSurfacePainterActionsUi();
  }

  isRetryableSurfacePaintError(reason) {
    const text = String(reason ?? "").trim().toLowerCase();
    if (!text) {
      return true;
    }
    return (
      text.includes("offline") ||
      text.includes("timeout") ||
      text.includes("network") ||
      text.includes("transport") ||
      text.includes("room not found") ||
      text.includes("player not in room") ||
      text.includes("disconnected")
    );
  }

  enqueueSurfacePaintRetry(surfaceId, imageDataUrl, reason = "") {
    const normalizedId = String(surfaceId ?? "").trim();
    const normalizedImage = String(imageDataUrl ?? "").trim();
    if (!normalizedId || !/^data:image\/webp;base64,/i.test(normalizedImage)) {
      return;
    }
    const previous = this.surfacePaintRetryQueue.get(normalizedId) ?? {};
    this.surfacePaintRetryQueue.set(normalizedId, {
      surfaceId: normalizedId,
      imageDataUrl: normalizedImage,
      retryCount: Math.max(0, Math.trunc(Number(previous.retryCount) || 0)),
      lastError: String(reason ?? "").trim(),
      queuedAt: Math.max(0, Math.trunc(Number(previous.queuedAt) || Date.now()))
    });
    this.scheduleSurfacePaintRetry();
  }

  scheduleSurfacePaintRetry(delayMs = this.surfacePaintRetryDelayMs) {
    if (this.surfacePaintRetryQueue.size <= 0) {
      return;
    }
    if (this.surfacePaintRetryTimer) {
      window.clearTimeout(this.surfacePaintRetryTimer);
      this.surfacePaintRetryTimer = null;
    }
    const waitMs = Math.max(120, Math.trunc(Number(delayMs) || this.surfacePaintRetryDelayMs));
    this.surfacePaintRetryTimer = window.setTimeout(() => {
      this.surfacePaintRetryTimer = null;
      void this.flushSurfacePaintRetryQueue();
    }, waitMs);
  }

  async flushSurfacePaintRetryQueue() {
    if (this.surfacePaintRetryInFlight || this.surfacePaintRetryQueue.size <= 0) {
      return;
    }
    if (!this.isSurfacePaintOnlineReady()) {
      this.scheduleSurfacePaintRetry();
      return;
    }

    this.surfacePaintRetryInFlight = true;
    let successCount = 0;
    try {
      const items = Array.from(this.surfacePaintRetryQueue.entries()).slice(0, 8);
      for (const [surfaceId, entry] of items) {
        const response = await this.sendSurfacePaintUpdate(surfaceId, entry?.imageDataUrl ?? "");
        if (response?.ok) {
          this.surfacePaintRetryQueue.delete(surfaceId);
          this.applySurfacePaintUpdate(response);
          successCount += 1;
          continue;
        }
        const reason = String(response?.error ?? "").trim() || "unknown";
        if (!this.isRetryableSurfacePaintError(reason)) {
          this.surfacePaintRetryQueue.delete(surfaceId);
          this.appendChatLine("", `그림 재시도 중단(${surfaceId}): ${reason}`, "system");
          continue;
        }
        const retryCount = Math.max(0, Math.trunc(Number(entry?.retryCount) || 0)) + 1;
        if (retryCount > 15) {
          this.surfacePaintRetryQueue.delete(surfaceId);
          this.appendChatLine("", `그림 재시도 한도 초과(${surfaceId})`, "system");
          continue;
        }
        this.surfacePaintRetryQueue.set(surfaceId, {
          surfaceId,
          imageDataUrl: String(entry?.imageDataUrl ?? ""),
          retryCount,
          lastError: reason,
          queuedAt: Math.max(0, Math.trunc(Number(entry?.queuedAt) || Date.now()))
        });
      }
    } finally {
      this.surfacePaintRetryInFlight = false;
    }
    if (successCount > 0) {
      this.requestSurfacePaintSnapshot();
    }
    if (this.surfacePaintRetryQueue.size > 0) {
      this.scheduleSurfacePaintRetry();
    }
  }

  requestSurfacePaintSnapshot() {
    if (!this.isSurfacePaintOnlineReady()) {
      return;
    }
    this.socket.emit("paint:state:request");
  }

  sendSurfacePaintUpdate(surfaceId, imageDataUrl, { forceFlush = false } = {}) {
    return new Promise((resolve) => {
      if (!this.isSurfacePaintOnlineReady()) {
        resolve({ ok: false, error: "offline" });
        return;
      }
      let settled = false;
      const finish = (response = {}) => {
        if (settled) {
          return;
        }
        settled = true;
        if (timeoutId) {
          window.clearTimeout(timeoutId);
        }
        resolve(response);
      };
      const timeoutId = window.setTimeout(() => {
        finish({ ok: false, error: "timeout" });
      }, 4500);
      this.socket.emit(
        "paint:surface:set",
        { surfaceId, imageDataUrl, forceFlush: Boolean(forceFlush) },
        (response = {}) => {
          finish(response);
        }
      );
    });
  }

  getSurfacePainterSaveImageDataUrl(maxChars = 4_000_000) {
    const canvas = this.surfacePainterCanvasEl;
    if (!canvas) {
      return "";
    }
    const qualities = [0.84, 0.76, 0.68, 0.58, 0.5];
    let bestEffort = "";
    for (const quality of qualities) {
      let dataUrl = "";
      try {
        dataUrl = String(canvas.toDataURL("image/webp", quality) ?? "");
      } catch {
        dataUrl = "";
      }
      if (!/^data:image\/webp;base64,/i.test(dataUrl)) {
        continue;
      }
      if (!bestEffort || dataUrl.length < bestEffort.length) {
        bestEffort = dataUrl;
      }
      if (dataUrl.length <= maxChars) {
        return dataUrl;
      }
    }
    return bestEffort;
  }

  async saveSurfacePainter() {
    if (!this.surfacePainterOpen || this.surfacePainterSaveInFlight || !this.surfacePainterCanvasEl) {
      return;
    }

    const surfaceId = String(this.surfacePainterTargetId ?? "").trim();
    if (!surfaceId) {
      return;
    }
    const targetIds = this.getSurfacePainterTargetIds(surfaceId);
    if (!targetIds.length) {
      return;
    }

    const blockedReason = this.getSurfacePaintSaveBlockedReason();
    if (blockedReason) {
      if (!this.socketEndpoint || this.socketEndpointLinkRequired) {
        this.showSurfacePaintLinkWarningOnce(blockedReason);
      } else {
        this.appendChatLine("", blockedReason, "system");
      }
      this.updateSurfacePainterSaveAvailability();
      return;
    }

    const imageDataUrl = this.getSurfacePainterSaveImageDataUrl();
    if (!imageDataUrl) {
      this.appendChatLine("", "그림 데이터(WebP) 인코딩에 실패했습니다.", "system");
      return;
    }
    this.surfacePainterSaveInFlight = true;
    this.surfacePaintSendInFlight = true;
    this.updateSurfacePainterSaveAvailability();
    let successCount = 0;
    let queuedCount = 0;
    let failedCount = 0;
    let lastReason = "";
    try {
      for (const targetId of targetIds) {
        const response = await this.sendSurfacePaintUpdate(targetId, imageDataUrl, {
          // Explicit save action should be durable per-surface even during abrupt restarts.
          forceFlush: true
        });
        if (response?.ok) {
          successCount += 1;
          this.applySurfacePaintUpdate(response);
          continue;
        }

        const reason = String(response?.error ?? "").trim() || "알 수 없는 오류";
        lastReason = reason;
        if (this.isRetryableSurfacePaintError(reason)) {
          queuedCount += 1;
          this.enqueueSurfacePaintRetry(targetId, imageDataUrl, reason);
          continue;
        }
        failedCount += 1;
      }
    } finally {
      this.surfacePainterSaveInFlight = false;
      this.surfacePaintSendInFlight = false;
      this.updateSurfacePainterSaveAvailability();
    }

    if (failedCount > 0) {
      this.requestSurfacePaintSnapshot();
      this.appendChatLine("", `그림 반영 실패(${failedCount}면): ${lastReason}`, "system");
    }

    if (queuedCount > 0) {
      this.appendChatLine(
        "",
        `그림 저장 대기열 등록(${queuedCount}면): 연결 복구 시 자동 재시도`,
        "system"
      );
      this.scheduleSurfacePaintRetry(600);
    }

    if (failedCount === 0 && (successCount > 0 || queuedCount > 0)) {
      this.closeSurfacePainter();
    }

    if (failedCount === 0 && targetIds.length > 1) {
      this.appendChatLine("", `오브젝트 전체면(${targetIds.length}) 반영 완료`, "system");
    }
  }

  createPortalTimeBillboard(options = {}) {
    const dynamic = Boolean(options?.dynamic);
    const onTopAdReady = typeof options?.onTopAdReady === "function" ? options.onTopAdReady : null;
    const onBillboardReady =
      typeof options?.onBillboardReady === "function" ? options.onBillboardReady : null;
    const topAdImageUrl = String(options?.topAdImageUrl ?? PORTAL_TOP_AD_IMAGE_URL).trim()
      || PORTAL_TOP_AD_IMAGE_URL;
    const line1 = String(options?.line1 ?? "상시 입장 가능").trim() || "상시 입장 가능";
    const line2 = String(options?.line2 ?? "").trim();
    const line3 = String(options?.line3 ?? "").trim();
    const rotationYRaw = Number(options?.rotationY);
    const rotationY = Number.isFinite(rotationYRaw) ? rotationYRaw : Math.PI;
    const palette = options?.palette ?? {};
    const board = new THREE.Group();
    const billboardBaseYOffsetRaw = Number(options?.billboardBaseYOffset);
    const billboardBaseYOffset = Number.isFinite(billboardBaseYOffsetRaw)
      ? Math.min(6, Math.max(-2, billboardBaseYOffsetRaw))
      : 0;
    const topAdPanelYOffsetRaw = Number(options?.topAdPanelYOffset);
    const topAdPanelYOffset = Number.isFinite(topAdPanelYOffsetRaw)
      ? Math.min(6, Math.max(-2, topAdPanelYOffsetRaw))
      : 0;
    const topAdScaleRaw = Number(options?.topAdScale);
    const topAdScale = Number.isFinite(topAdScaleRaw)
      ? Math.min(2.4, Math.max(0.5, topAdScaleRaw))
      : 1;
    const billboardBaseY = 7.1 + billboardBaseYOffset;
    const schedulePanelY = 2.55;
    const topAdPanelY = 7.8 + topAdPanelYOffset;
    board.position.set(0, billboardBaseY, 0);
    board.rotation.y = rotationY;

    const glowBack = new THREE.Mesh(
      new THREE.PlaneGeometry(12.6, 2.72),
      new THREE.MeshBasicMaterial({
        color: 0x4fc8ff,
        transparent: true,
        opacity: 0.12,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        toneMapped: false
      })
    );
    glowBack.position.set(0, schedulePanelY, 0.02);
    glowBack.renderOrder = 13;

    const canvas = document.createElement("canvas");
    canvas.width = 1280;
    canvas.height = 320;
    const context = canvas.getContext("2d");
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;

    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(12.0, 2.58),
      new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        toneMapped: false,
        side: THREE.DoubleSide
      })
    );
    screen.position.set(0, schedulePanelY, 0.08);
    screen.renderOrder = 14;

    const portalTopAdMaxWidth = 14.5 * topAdScale;
    const portalTopAdMaxHeight = 7.2 * topAdScale;
    const portalTopAdDefaultAspect = 16 / 9;
    const getTopAdSize = (rawAspect) => {
      const safeAspect =
        Number.isFinite(rawAspect) && rawAspect > 0.2 ? rawAspect : portalTopAdDefaultAspect;
      let width = portalTopAdMaxWidth;
      let height = width / safeAspect;
      if (height > portalTopAdMaxHeight) {
        height = portalTopAdMaxHeight;
        width = height * safeAspect;
      }
      return { width, height };
    };
    const topAdDefaultSize = getTopAdSize(portalTopAdDefaultAspect);
    let topAdGlow = null;
    let topAdBorder = null;
    let topAdScreen = null;
    const updateTopAdGeometry = (rawAspect) => {
      if (!topAdGlow || !topAdBorder || !topAdScreen) {
        return;
      }
      const nextSize = getTopAdSize(rawAspect);
      topAdGlow.geometry.dispose();
      topAdGlow.geometry = new THREE.PlaneGeometry(nextSize.width + 0.82, nextSize.height + 0.74);
      topAdBorder.geometry.dispose();
      topAdBorder.geometry = new THREE.PlaneGeometry(nextSize.width + 0.24, nextSize.height + 0.24);
      topAdScreen.geometry.dispose();
      topAdScreen.geometry = new THREE.PlaneGeometry(nextSize.width, nextSize.height);
    };
    const topAdTexture = this.textureLoader.load(topAdImageUrl, (loadedTexture) => {
      const image = loadedTexture?.image;
      if (!image) {
        return;
      }
      const width = Number(image.width) || 0;
      const height = Number(image.height) || 0;
      if (width <= 0 || height <= 0) {
        return;
      }
      updateTopAdGeometry(width / height);
    });
    const maxAnisotropy = Math.max(1, this.renderer?.capabilities?.getMaxAnisotropy?.() || 1);
    topAdTexture.colorSpace = THREE.SRGBColorSpace;
    topAdTexture.minFilter = THREE.LinearMipmapLinearFilter;
    topAdTexture.magFilter = THREE.LinearFilter;
    topAdTexture.generateMipmaps = true;
    topAdTexture.anisotropy = this.mobileEnabled ? Math.min(2, maxAnisotropy) : Math.min(8, maxAnisotropy);
    topAdTexture.needsUpdate = true;

    topAdGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(topAdDefaultSize.width + 0.82, topAdDefaultSize.height + 0.74),
      new THREE.MeshBasicMaterial({
        color: 0x4fc8ff,
        transparent: true,
        opacity: 0.12,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        toneMapped: false
      })
    );
    topAdGlow.position.set(0, topAdPanelY, 0.02);
    topAdGlow.renderOrder = 15;

    topAdBorder = new THREE.Mesh(
      new THREE.PlaneGeometry(topAdDefaultSize.width + 0.24, topAdDefaultSize.height + 0.24),
      new THREE.MeshBasicMaterial({
        color: 0x0c1825,
        transparent: true,
        opacity: 0.94,
        toneMapped: false,
        side: THREE.DoubleSide
      })
    );
    topAdBorder.position.set(0, topAdPanelY, 0.07);
    topAdBorder.renderOrder = 16;

    topAdScreen = new THREE.Mesh(
      new THREE.PlaneGeometry(topAdDefaultSize.width, topAdDefaultSize.height),
      new THREE.MeshBasicMaterial({
        map: topAdTexture,
        transparent: true,
        toneMapped: false,
        side: THREE.DoubleSide
      })
    );
    topAdScreen.position.set(0, topAdPanelY, 0.09);
    topAdScreen.renderOrder = 17;

    const topAdImage = topAdTexture?.image;
    if (topAdImage?.width && topAdImage?.height) {
      updateTopAdGeometry(Number(topAdImage.width) / Number(topAdImage.height));
    }

    board.add(glowBack, screen, topAdGlow, topAdBorder, topAdScreen);
    if (onTopAdReady) {
      onTopAdReady({
        texture: topAdTexture,
        screen: topAdScreen,
        material: topAdScreen.material,
        updateGeometry: updateTopAdGeometry,
        imageUrl: topAdImageUrl
      });
    }

    const resolvedPalette = dynamic
      ? {
          bgFrom: String(palette?.bgFrom ?? "rgba(27, 11, 29, 0.56)"),
          bgTo: String(palette?.bgTo ?? "rgba(46, 14, 45, 0.64)"),
          border: String(palette?.border ?? "rgba(255, 148, 226, 0.82)"),
          stripe: String(palette?.stripe ?? "rgba(208, 102, 178, 0.16)"),
          shadow: String(palette?.shadow ?? "rgba(255, 156, 228, 0.72)"),
          line1: String(palette?.line1 ?? "#ffe7f8"),
          line2: String(palette?.line2 ?? "#ffc7ee"),
          line3: String(palette?.line3 ?? "#f6b8e7")
        }
      : {
          bgFrom: String(palette?.bgFrom ?? "rgba(6, 16, 28, 0.50)"),
          bgTo: String(palette?.bgTo ?? "rgba(8, 24, 39, 0.58)"),
          border: String(palette?.border ?? "rgba(122, 191, 235, 0.72)"),
          stripe: String(palette?.stripe ?? "rgba(88, 150, 198, 0.12)"),
          shadow: String(palette?.shadow ?? "rgba(90, 199, 255, 0.65)"),
          line1: String(palette?.line1 ?? "#d8f2ff"),
          line2: String(palette?.line2 ?? "#9de7ff"),
          line3: String(palette?.line3 ?? "#8bd6f5")
        };
    const redrawLines = ({ line1: nextLine1 = "", line2: nextLine2 = "", line3: nextLine3 = "" } = {}) => {
      this.drawPortalBillboardLines(context, canvas, {
        line1: nextLine1,
        line2: nextLine2,
        line3: nextLine3,
        palette: resolvedPalette
      });
      texture.needsUpdate = true;
    };

    if (dynamic) {
      this.portalBillboardCanvas = canvas;
      this.portalBillboardContext = context;
      this.portalBillboardTexture = texture;
      this.portalBillboardUpdateClock = 0;
      this.portalBillboardCache = {
        line1: "",
        line2: "",
        line3: ""
      };
      this.portalBillboardPalette = resolvedPalette;
      this.updatePortalTimeBillboard(1, true);
    } else {
      redrawLines({ line1, line2, line3 });
    }
    if (onBillboardReady) {
      onBillboardReady({
        topAdBaseTexture: topAdTexture,
        topAdMaterial: topAdScreen.material,
        updateTopAdGeometry: updateTopAdGeometry,
        redrawLines
      });
    }
    return board;
  }

  drawPortalBillboardLines(context, canvas, { line1 = "", line2 = "", line3 = "", palette = {} } = {}) {
    if (!context || !canvas) {
      return;
    }
    const width = canvas.width;
    const height = canvas.height;
    context.clearRect(0, 0, width, height);
    const bgGradient = context.createLinearGradient(0, 0, width, height);
    bgGradient.addColorStop(0, String(palette?.bgFrom ?? "rgba(6, 16, 28, 0.50)"));
    bgGradient.addColorStop(1, String(palette?.bgTo ?? "rgba(8, 24, 39, 0.58)"));
    context.fillStyle = bgGradient;
    context.fillRect(0, 0, width, height);

    context.strokeStyle = String(palette?.border ?? "rgba(122, 191, 235, 0.72)");
    context.lineWidth = 6;
    context.strokeRect(8, 8, width - 16, height - 16);

    context.fillStyle = String(palette?.stripe ?? "rgba(88, 150, 198, 0.12)");
    for (let y = 22; y < height; y += 8) {
      context.fillRect(14, y, width - 28, 1);
    }

    context.textAlign = "center";
    context.textBaseline = "middle";
    const hasLine3 = Boolean(String(line3 ?? "").trim());
    const fontScale = Math.max(0.75, Math.min(1.25, width / 1280));
    const headlineFontPx = Math.round(78 * fontScale);
    const timeLabelFontPx = Math.round(50 * fontScale);
    const line1Y = Math.round(height * 0.34);
    const line2Y = Math.round(hasLine3 ? height * 0.67 : height * 0.72);
    const line3Y = Math.round(height * 0.86);

    context.shadowColor = String(palette?.shadow ?? "rgba(90, 199, 255, 0.65)");
    context.shadowBlur = 12;
    context.fillStyle = String(palette?.line1 ?? "#d8f2ff");
    context.font = `700 ${headlineFontPx}px Bahnschrift, "Trebuchet MS", "Segoe UI", sans-serif`;
    context.fillText(String(line1 ?? ""), width * 0.5, line1Y);

    context.shadowBlur = 10;
    context.fillStyle = String(palette?.line2 ?? "#9de7ff");
    context.font = `700 ${timeLabelFontPx}px Bahnschrift, "Trebuchet MS", "Segoe UI", sans-serif`;
    context.fillText(String(line2 ?? ""), width * 0.5, line2Y);

    if (hasLine3) {
      context.shadowBlur = 10;
      context.fillStyle = String(palette?.line3 ?? "#8bd6f5");
      context.font = `700 ${timeLabelFontPx}px Bahnschrift, "Trebuchet MS", "Segoe UI", sans-serif`;
      context.fillText(String(line3 ?? ""), width * 0.5, line3Y);
    }
  }

  applyInitialFlowSpawn() {
    if (!this.hubFlowEnabled) {
      this.flowStage = "city_live";
      this.hubFlowUiEl?.classList.add("hidden");
      this.hideNicknameGate();
      this.hideNpcChoiceGate();
      this.bridgeNpcPlayApproved = true;
      this.lastSafePosition.copy(this.playerPosition);
      this.ensureEntryMusicPlayback();
      return;
    }

    if (this.isHostEntryLink) {
      this.localPlayerName = this.hostEntryFixedName;
      this.pendingPlayerNameSync = true;
      this.pendingAuthoritativeStateSync = true;
      this.flowStage = "city_live";
      this.bridgeNpcPlayApproved = true;
      this.playerPosition.copy(this.citySpawn);
      this.yaw = this.getLookYaw(this.citySpawn, this.cityLookTarget);
      this.pitch = -0.02;
      this.hubFlowUiEl?.classList.add("hidden");
      this.hideNicknameGate();
      this.hideNpcChoiceGate();
      this.setMirrorGateVisible(false);
      this.lastSafePosition.copy(this.playerPosition);
      this.ensureEntryMusicPlayback();
      return;
    }

    const requestedZone = this.normalizeRoomZone(this.requestedEntryZone, "");
    const explicitLobbyEntry = requestedZone === "lobby";
    const forceBridgeIntro =
      explicitLobbyEntry ||
      this.parseQueryFlag("bridge_intro") ||
      this.parseQueryFlag("bridgeIntro");

    // Open-room default: enter straight into the public city plaza unless bridge intro is requested.
    let savedNickname = "";
    try { savedNickname = String(localStorage.getItem("emptines_nickname") ?? "").trim(); } catch (_) {}
    if (savedNickname.length >= 2) {
      this.localPlayerName = this.formatPlayerName(savedNickname);
    }
    const returnPortalHint = this.normalizeReturnPortalHint(this.returnEntryPortal, "");
    if (
      returnPortalHint === "ox" ||
      returnPortalHint === "fps" ||
      returnPortalHint === "hall"
    ) {
      const returnSpawnState = this.buildReturnPortalSpawnState(returnPortalHint);
      if (returnSpawnState) {
        this.pendingPlayerNameSync = true;
        this.pendingAuthoritativeStateSync = true;
        this.flowStage = "city_live";
        this.bridgeNpcPlayApproved = true;
        this.playerPosition.copy(returnSpawnState.position);
        this.yaw = returnSpawnState.yaw;
        this.pitch = returnSpawnState.pitch;
        this.hubFlowUiEl?.classList.add("hidden");
        this.hideNicknameGate();
        this.hideNpcChoiceGate();
        this.setMirrorGateVisible(false);
        this.lastSafePosition.copy(this.playerPosition);
        this.ensureEntryMusicPlayback();
        return;
      }
    }
    if (!forceBridgeIntro) {
      this.pendingPlayerNameSync = true;
      this.pendingAuthoritativeStateSync = true;
      this.flowStage = "city_live";
      this.bridgeNpcPlayApproved = true;
      this.playerPosition.copy(this.citySpawn);
      this.yaw = this.getLookYaw(this.citySpawn, this.cityLookTarget);
      this.pitch = -0.02;
      this.hubFlowUiEl?.classList.add("hidden");
      this.hideNicknameGate();
      this.hideNpcChoiceGate();
      this.setMirrorGateVisible(false);
      this.lastSafePosition.copy(this.playerPosition);
      this.ensureEntryMusicPlayback();
      return;
    }
    const allowFastCityRejoin =
      !explicitLobbyEntry &&
      (this.parseQueryFlag("skip_bridge") ||
        this.parseQueryFlag("skipBridge") ||
        this.parseQueryFlag("rejoin_city") ||
        this.parseQueryFlag("city_live"));
    this.syncPortalAnchorsFromMovableObjects({ force: true });
    if (allowFastCityRejoin && savedNickname.length >= 2) {
      this.pendingPlayerNameSync = true;
      this.pendingAuthoritativeStateSync = true;
      this.flowStage = "city_live";
      this.bridgeNpcPlayApproved = true;
      this.playerPosition.copy(this.citySpawn);
      this.yaw = this.getLookYaw(this.citySpawn, this.cityLookTarget);
      this.pitch = -0.02;
      this.hubFlowUiEl?.classList.add("hidden");
      this.hideNicknameGate();
      this.hideNpcChoiceGate();
      this.setMirrorGateVisible(false);
      this.lastSafePosition.copy(this.playerPosition);
      this.ensureEntryMusicPlayback();
      return;
    }

    this.playerPosition.copy(this.bridgeApproachSpawn);
    this.yaw = this.getLookYaw(this.bridgeApproachSpawn, this.bridgeNpcPosition);
    this.pitch = -0.03;
    this.flowStage = "boot_intro";
    this.bootIntroPending = true;
    this.bootIntroVideoPlaying = false;
    this.flowClock = 0;
    this.mirrorLookClock = 0;
    this.bridgeBoundaryDingClock = 0;
    this.bridgeBoundaryDingTriggered = false;
    this.portalPhase = "cooldown";
    this.portalPhaseClock = this.portalCooldownSeconds;
    this.bridgeNpcPlayApproved = true;
    this.hideNpcChoiceGate();
    this.setMirrorGateVisible(false);
    this.setFlowHeadline("입장 확인", "임시 닉네임을 입력하고 시작하세요.");
    this.hud.setStatus(this.getStatusText());
    this.showNicknameGate();
    this.lastSafePosition.copy(this.playerPosition);
  }

  bindHubFlowUiEvents() {
    if (this.hubFlowUiBound || !this.hubFlowEnabled || !this.nicknameFormEl) {
      return;
    }
    this.hubFlowUiBound = true;

    this.nicknameFormEl.addEventListener("submit", (event) => {
      event.preventDefault();
      this.confirmBridgeName();
    });
    this.npcChoiceNicknameBtnEl?.addEventListener("click", () => {
      this.openNpcNicknameGate();
    });
    this.npcChoiceGuideBtnEl?.addEventListener("click", () => {
      this.handleNpcCityGuideChoice();
    });
    this.npcChoicePlayBtnEl?.addEventListener("click", () => {
      this.handleNpcPlayChoice();
    });
  }

  isNpcChoiceGateOpen() {
    return Boolean(this.npcChoiceGateEl && !this.npcChoiceGateEl.classList.contains("hidden"));
  }

  showNpcChoiceGate() {
    if (!this.hubFlowEnabled || this.flowStage !== "bridge_approach" || this.bridgeNpcPlayApproved) {
      return;
    }
    if (performance.now() < this.bridgeNpcChoiceCooldownUntil) {
      return;
    }
    if (!this.npcChoiceGateEl) {
      return;
    }
    if (!(this.nicknameGateEl?.classList.contains("hidden") ?? true)) {
      return;
    }
    this.npcChoiceGateEl.classList.remove("hidden");
    if (document.pointerLockElement === this.renderer.domElement) {
      document.exitPointerLock?.();
    }
    this.syncMobileUiState();
  }

  hideNpcChoiceGate() {
    if (!this.npcChoiceGateEl) {
      return;
    }
    this.npcChoiceGateEl.classList.add("hidden");
    this.syncMobileUiState();
  }

  openNpcNicknameGate() {
    if (!this.hubFlowEnabled || this.flowStage !== "bridge_approach") {
      return;
    }
    this.hideNpcChoiceGate();
    this.setFlowHeadline("입장 확인", "임시 닉네임을 입력하세요.");
    this.showNicknameGate();
    this.hud.setStatus(this.getStatusText());
  }

  handleNpcCityGuideChoice() {
    if (!this.hubFlowEnabled || this.flowStage !== "bridge_approach") {
      return;
    }
    this.bridgeNpcChoiceCooldownUntil = performance.now() + 1400;
    this.hideNpcChoiceGate();
    this.playNpcGreeting();
    this.appendChatLine("NPC", "도시 안에서는 자유 이동, 광고판 그리기, 포탈 이동을 할 수 있습니다.", "system");
    this.appendChatLine("NPC", "신사문은 언제든 바로 통과 가능합니다.", "system");
    this.setChatOpen(true);
  }

  handleNpcPlayChoice() {
    if (!this.hubFlowEnabled || this.flowStage !== "bridge_approach") {
      return;
    }
    this.hideNpcChoiceGate();
    this.appendChatLine("NPC", "나중에 놀아줄게. 지금은 신사문으로 바로 입장해도 돼.", "system");
    this.setChatOpen(true);
  }

  showNicknameGate() {
    if (!this.nicknameGateEl) {
      return;
    }
    this.hideNpcChoiceGate();
    this.nicknameGateEl.classList.remove("hidden");
    if (document.pointerLockElement === this.renderer.domElement) {
      document.exitPointerLock?.();
    }
    this.setNicknameError("");
    if (this.nicknameInputEl) {
      const nextName = /^PLAYER(?:_\d+)?$/i.test(this.localPlayerName) ? "" : this.localPlayerName;
      this.nicknameInputEl.value = nextName;
      window.setTimeout(() => {
        this.nicknameInputEl?.focus();
        this.nicknameInputEl?.select();
      }, 10);
    }
  }

  hideNicknameGate() {
    this.nicknameGateEl?.classList.add("hidden");
    this.setNicknameError("");
  }

  setNicknameError(message) {
    if (!this.nicknameErrorEl) {
      return;
    }
    const text = String(message ?? "").trim();
    this.nicknameErrorEl.textContent = text;
    this.nicknameErrorEl.classList.toggle("hidden", !text);
  }

  detachEntryMusicUnlockListeners() {
    if (!this.entryMusicUnlockHandler) {
      return;
    }
    const handler = this.entryMusicUnlockHandler;
    this.entryMusicUnlockHandler = null;
    window.removeEventListener("pointerdown", handler);
    window.removeEventListener("keydown", handler);
    window.removeEventListener("touchstart", handler);
  }

  attachEntryMusicUnlockListeners() {
    if (this.entryMusicStarted || this.entryMusicUnlockHandler) {
      return;
    }
    const handler = () => {
      this.detachEntryMusicUnlockListeners();
      this.ensureEntryMusicPlayback();
    };
    this.entryMusicUnlockHandler = handler;
    window.addEventListener("pointerdown", handler, { passive: true });
    window.addEventListener("keydown", handler);
    window.addEventListener("touchstart", handler, { passive: true });
  }

  ensureEntryMusicPlayback() {
    if (this.entryMusicStarted) {
      this.updateSpatialAudioMix();
      return;
    }
    if (!this.entryMusicAudioEl) {
      const audio = new Audio(ENTRY_BGM_URL);
      audio.preload = "auto";
      audio.loop = false;
      audio.volume = this.entryMusicBaseVolume;
      this.entryMusicAudioEl = audio;
    }

    this.entryMusicAudioEl.play().then(
      () => {
        this.entryMusicStarted = true;
        this.updateSpatialAudioMix();
        this.detachEntryMusicUnlockListeners();
      },
      () => {
        this.attachEntryMusicUnlockListeners();
      }
    );
  }

  computeSpatialAudioGain(sourcePosition, minDistance = 8, maxDistance = 240, rolloff = 1.2) {
    if (!sourcePosition) {
      return 1;
    }

    const dx = this.playerPosition.x - sourcePosition.x;
    const dy = this.playerPosition.y - sourcePosition.y;
    const dz = this.playerPosition.z - sourcePosition.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (distance <= minDistance) {
      return 1;
    }
    if (distance >= maxDistance) {
      return 0;
    }

    const span = Math.max(0.001, maxDistance - minDistance);
    const normalized = THREE.MathUtils.clamp((distance - minDistance) / span, 0, 1);
    return Math.pow(1 - normalized, Math.max(0.2, Number(rolloff) || 1.2));
  }

  updateSpatialAudioMix() {
    if (this.entryMusicAudioEl) {
      const gain = this.computeSpatialAudioGain(
        this.entryMusicSourcePosition,
        this.entryMusicMinDistance,
        this.entryMusicMaxDistance,
        this.entryMusicRolloff
      );
      this.entryMusicAudioEl.volume = THREE.MathUtils.clamp(this.entryMusicBaseVolume * gain, 0, 1);
    }

    if (this.plazaBillboardRightVideoEl) {
      const gain = this.computeSpatialAudioGain(
        this.rightBillboardSourcePosition,
        this.rightBillboardMinDistance,
        this.rightBillboardMaxDistance,
        this.rightBillboardRolloff
      );
      this.plazaBillboardRightVideoEl.volume = THREE.MathUtils.clamp(
        this.rightBillboardBaseVolume * gain,
        0,
        1
      );
    }

    if (this.sharedMusicAudioEl) {
      this.sharedMusicAudioEl.volume = THREE.MathUtils.clamp(this.sharedMusicBaseVolume, 0, 1);
    }
  }

  beginBridgeApproachFlow() {
    this.bootIntroPending = false;
    this.bootIntroVideoPlaying = false;
    this.flowStage = "bridge_approach";
    this.bridgeNpcPlayApproved = true;
    this.bridgeNpcPromptCooldownUntil = 0;
    this.bridgeNpcChoiceCooldownUntil = 0;
    this.flowClock = 0;
    this.keys.clear();
    this.chalkDrawingActive = false;
    this.chalkLastStamp = null;
    this.hideNicknameGate();
    this.hideNpcChoiceGate();
    this.setMirrorGateVisible(false);
    this.setFlowHeadline("입장 대기", "신사문은 언제든 통과 가능합니다.");
    this.lastSafePosition.copy(this.playerPosition);
    this.pendingAuthoritativeStateSync = true;
    this.requestAuthoritativeStateSync();
    this.hud.setStatus(this.getStatusText());
    this.syncGameplayUiForFlow();
    this.playNpcGreeting();
  }

  finishBootIntroVideo() {
    this.bootIntroVideoPlaying = false;
    if (this.introVideoEl) {
      this.introVideoEl.onended = null;
      this.introVideoEl.onerror = null;
      this.introVideoEl.pause();
      this.introVideoEl.removeAttribute("src");
      this.introVideoEl.load();
    }
    this.introVideoOverlayEl?.classList.add("hidden");
    this.beginBridgeApproachFlow();
  }

  playBootIntroVideo() {
    if (!this.hubFlowEnabled) {
      this.beginBridgeApproachFlow();
      return;
    }

    if (!this.introVideoEl || !this.introVideoOverlayEl) {
      this.beginBridgeApproachFlow();
      return;
    }

    this.bootIntroVideoPlaying = true;
    this.introVideoOverlayEl.classList.remove("hidden");
    const video = this.introVideoEl;
    video.src = INTRO_BOOT_VIDEO_URL;
    video.currentTime = 0;
    video.playbackRate = 1.5;
    video.muted = false;
    video.loop = false;
    video.onended = () => {
      this.finishBootIntroVideo();
    };
    video.onerror = () => {
      this.finishBootIntroVideo();
    };

    video.play().catch(() => {
      video.muted = true;
      video.currentTime = 0;
      video.play().then(
        () => {},
        () => {
          this.finishBootIntroVideo();
        }
      );
    });
  }

  confirmBridgeName() {
    if (this.hubFlowEnabled && this.flowStage === "boot_intro") {
      const rawBootName = String(this.nicknameInputEl?.value ?? "").trim();
      this.requestFullscreenOnMobileStartInteraction();
      this.primeEntryMusicOnMobileStartInteraction();
      const nextName = rawBootName.length > 0 ? this.formatPlayerName(rawBootName) : "게스트";
      this.localPlayerName = nextName;
      if (rawBootName.length >= 2) {
        try { localStorage.setItem("emptines_nickname", nextName); } catch (_) {}
      }
      this.pendingPlayerNameSync = true;
      this.syncPlayerNameIfConnected();
      this.hideNicknameGate();
      this.playBootIntroVideo();
      return;
    }

    const canConfirmInBridgeFlow =
      this.flowStage === "bridge_name" || this.flowStage === "bridge_approach";
    if (!this.hubFlowEnabled || !canConfirmInBridgeFlow) {
      return;
    }

    const raw = String(this.nicknameInputEl?.value ?? "").trim();
    if (raw.length < 2) {
      this.setNicknameError("콜사인은 최소 2자 이상이어야 합니다.");
      return;
    }

    const nextName = this.formatPlayerName(raw);
    this.localPlayerName = nextName;
    this.pendingPlayerNameSync = true;
    this.syncPlayerNameIfConnected();
    try { localStorage.setItem("emptines_nickname", nextName); } catch (_) {}

    this.hideNicknameGate();
    if (this.flowStage === "bridge_approach") {
      this.appendChatLine("NPC", `임시 닉네임을 ${nextName}(으)로 설정했어요.`, "system");
      this.hud.setStatus(this.getStatusText());
      this.syncGameplayUiForFlow();
      return;
    }

    this.flowStage = "bridge_mirror";
    this.mirrorLookClock = 0;
    this.flowClock = 0;
    this.keys.clear();
    this.chalkDrawingActive = false;
    this.chalkLastStamp = null;
    this.setMirrorGateVisible(true);
    this.yaw = this.getLookYaw(this.playerPosition, this.bridgeMirrorPosition);
    this.setFlowHeadline("입장 동기화", "계속하려면 신사문 아래를 통과하세요.");
    this.hud.setStatus(this.getStatusText());
    this.syncGameplayUiForFlow();
  }

  syncGameplayUiForFlow() {
    const gameplayEnabled = !this.hubFlowEnabled || this.flowStage === "city_live";
    const chatEnabled = this.canUseChatControls();
    this.toolUiEl?.classList.toggle(
      "hidden",
      !gameplayEnabled || !this.isDrawingInteractionEnabled()
    );
    this.chatUiEl?.classList.toggle("hidden", !chatEnabled);
    if (!chatEnabled) {
      this.setChatOpen(false);
    }
    if (!gameplayEnabled) {
      this.closeSurfacePainter();
    }
    this.syncMobileUiState();
    this.syncChatLiveUi();
    this.syncHostControls();
  }

  syncBodyUiModeClass() {
    if (typeof document === "undefined" || !document.body) {
      return;
    }
    const mobile = Boolean(this.mobileEnabled);
    document.body.classList.toggle("is-mobile-ui", mobile);
    if (!mobile) {
      document.body.classList.remove("chat-mobile-open");
      document.body.classList.remove("mobile-portrait-lock");
    }

    const hudUi = document.getElementById("hud-ui");
    const hudStatusRow = document.getElementById("hud-row-status");
    const hudPositionRow = document.getElementById("hud-row-position");
    const hudFpsRow = document.getElementById("hud-row-fps");
    const hudPlayersRow = document.getElementById("hud-row-players");
    const hudPlayersKey = hudPlayersRow?.querySelector?.(".hud-key");
    const hubFlowUi = document.getElementById("hub-flow-ui");
    const rosterHint = document.querySelector?.(".player-roster-hint");

    hudStatusRow?.classList.add("hidden");
    hudPositionRow?.classList.add("hidden");
    hudFpsRow?.classList.add("hidden");
    hudPlayersKey?.classList.add("hidden");
    hubFlowUi?.classList.add("hidden");
    rosterHint?.classList.add("hidden");

    if (hudUi) {
      hudUi.style.background = "transparent";
      hudUi.style.border = "none";
      hudUi.style.backdropFilter = "none";
      hudUi.style.boxShadow = "none";
      hudUi.style.padding = "0";
      hudUi.style.minWidth = "0";
      hudUi.style.gap = "0";
    }
  }

  isMobilePortraitBlocked() {
    if (!this.mobileEnabled || typeof window === "undefined") {
      return false;
    }
    const width = Math.max(0, Number(window.innerWidth) || 0);
    const height = Math.max(0, Number(window.innerHeight) || 0);
    if (width <= 0 || height <= 0) {
      return false;
    }
    return height > width;
  }

  syncMobileUiState() {
    if (!this.mobileUiEl) {
      this.syncChatLiveUi();
      return;
    }
    const portraitBlocked = this.isMobilePortraitBlocked();
    this.mobileRotateOverlayEl?.classList.toggle("hidden", !portraitBlocked);
    if (typeof document !== "undefined" && document.body) {
      document.body.classList.toggle("mobile-portrait-lock", portraitBlocked);
    }
    if (portraitBlocked && this.promoPanelMobileOpen) {
      this.promoPanelMobileOpen = false;
      this.syncPromoPanelUi();
    }
    if (portraitBlocked && this.chatOpen) {
      this.setChatOpen(false);
      return;
    }
    const visible =
      this.mobileEnabled &&
      !portraitBlocked &&
      !this.chatOpen &&
      !this.promoPanelMobileOpen &&
      this.canMovePlayer() &&
      !this.surfacePainterOpen &&
      !this.bootIntroVideoPlaying &&
      this.flowStage !== "portal_transfer" &&
      (this.nicknameGateEl?.classList.contains("hidden") ?? true) &&
      (this.npcChoiceGateEl?.classList.contains("hidden") ?? true);
    this.mobileUiEl.classList.toggle("hidden", !visible);
    if (this.mobilePaintBtnEl) {
      const paintEnabled = this.isSurfacePaintFeatureEnabled();
      const paintVisible = visible && paintEnabled && Boolean(this.surfacePaintTarget);
      this.mobilePaintBtnEl.classList.toggle("hidden", !paintVisible);
      this.mobilePaintBtnEl.disabled = !paintVisible;
    }
    if (this.mobilePromoPlaceBtnEl) {
      this.mobilePromoPlaceBtnEl.disabled = !visible;
    }
    const previewScaleVisible = visible && this.promoPlacementPreviewActive && !this.getOwnPromoObject();
    if (this.mobilePromoScaleWrapEl) {
      this.mobilePromoScaleWrapEl.classList.toggle("hidden", !previewScaleVisible);
    }
    if (this.mobilePromoScaleInputEl) {
      const scaleControlDisabled =
        !previewScaleVisible ||
        !(this.socket && this.networkConnected) ||
        this.promoSetInFlight ||
        this.promoRemoveInFlight;
      this.mobilePromoScaleInputEl.disabled = scaleControlDisabled;
    }
    if (!visible) {
      this.resetMobileControlInputState();
    }
    this.updateSurfacePainterActionsUi();
    this.syncPromoPanelUi();
    this.syncChatLiveUi();
  }

  resetMobileMoveInput() {
    if (
      this.mobileMovePointerId !== null &&
      this.mobileMovePadEl &&
      typeof this.mobileMovePadEl.releasePointerCapture === "function"
    ) {
      try {
        this.mobileMovePadEl.releasePointerCapture(this.mobileMovePointerId);
      } catch {
        // ignore stale capture errors
      }
    }
    this.mobileMovePointerId = null;
    this.mobileMoveVector.set(0, 0);
    if (this.mobileMoveStickEl) {
      this.mobileMoveStickEl.style.transform = "translate(-50%, -50%)";
    }
  }

  resetMobileControlInputState() {
    this.resetMobileMoveInput();
    this.mobileLookTouchId = null;
    this.mobileSprintHeld = false;
    this.mobileJumpQueued = false;
    this.mobileSprintBtnEl?.classList.remove("active");
    this.mobileJumpBtnEl?.classList.remove("active");
  }

  updateMobileMoveFromPointer(clientX, clientY) {
    if (!this.mobileMovePadEl) {
      return;
    }
    const rect = this.mobileMovePadEl.getBoundingClientRect();
    const centerX = rect.left + rect.width * 0.5;
    const centerY = rect.top + rect.height * 0.5;
    const radius = Math.max(18, Math.min(rect.width, rect.height) * 0.34);
    const dx = clientX - centerX;
    const dy = clientY - centerY;
    const distance = Math.hypot(dx, dy);
    const ratio = distance > radius ? radius / Math.max(distance, 0.0001) : 1;
    const normalizedX = (dx * ratio) / radius;
    const normalizedY = (dy * ratio) / radius;
    this.mobileMoveVector.set(
      THREE.MathUtils.clamp(normalizedX, -1, 1),
      THREE.MathUtils.clamp(normalizedY, -1, 1)
    );
    this.mobileMoveStickRadius = radius;
    if (this.mobileMoveStickEl) {
      const stickX = this.mobileMoveVector.x * radius;
      const stickY = this.mobileMoveVector.y * radius;
      this.mobileMoveStickEl.style.transform = `translate(calc(-50% + ${stickX}px), calc(-50% + ${stickY}px))`;
    }
  }

  updateMobileLookFromTouch(touch) {
    const deltaX = touch.clientX - this.mobileLookLastX;
    const deltaY = touch.clientY - this.mobileLookLastY;
    this.mobileLookLastX = touch.clientX;
    this.mobileLookLastY = touch.clientY;
    this.lastLookInputAtMs = typeof performance !== "undefined" ? performance.now() : Date.now();

    // Increase mobile drag sensitivity to reduce sluggish camera response.
    this.yaw -= deltaX * 0.005;
    this.yaw = this.normalizeYawAngle(this.yaw);
    this.pitch -= deltaY * 0.0038;
    this.pitch = THREE.MathUtils.clamp(this.pitch, -1.52, 1.52);
  }

  applyPendingMouseLookInput() {
    const deltaX = Number(this.pendingMouseLookDeltaX) || 0;
    const deltaY = Number(this.pendingMouseLookDeltaY) || 0;
    if (Math.abs(deltaX) < 0.0001 && Math.abs(deltaY) < 0.0001) {
      return;
    }
    this.pendingMouseLookDeltaX = 0;
    this.pendingMouseLookDeltaY = 0;

    const sensitivityX = this.mobileEnabled ? 0.0018 : 0.0023;
    const sensitivityY = this.mobileEnabled ? 0.0016 : 0.002;
    this.yaw -= deltaX * sensitivityX;
    this.yaw = this.normalizeYawAngle(this.yaw);
    this.pitch -= deltaY * sensitivityY;
    this.pitch = THREE.MathUtils.clamp(this.pitch, -1.52, 1.52);
  }

  setMirrorGateVisible(visible) {
    if (this.mirrorGateGroup) {
      this.mirrorGateGroup.visible = Boolean(visible);
    }
  }

  openBridgeNameGate() {
    if (!this.hubFlowEnabled || this.flowStage !== "bridge_dialogue") {
      return;
    }
    this.flowStage = "bridge_mirror";
    this.keys.clear();
    this.chalkDrawingActive = false;
    this.chalkLastStamp = null;
    this.hideNicknameGate();
    this.setMirrorGateVisible(true);
    this.setFlowHeadline("입장 동기화", "계속하려면 신사문 아래를 통과하세요.");
    this.hud.setStatus(this.getStatusText());
  }

  createNpcGreetingScreen() {
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(1.42, 2.38),
      new THREE.MeshBasicMaterial({
        color: 0x5ecbff,
        transparent: true,
        opacity: 0.08,
        depthWrite: false
      })
    );
    screen.position.set(0, 1.48, -0.42);
    screen.rotation.y = Math.PI;
    screen.renderOrder = 12;
    screen.frustumCulled = false;
    screen.visible = false;
    this.npcGreetingVideoEl = null;
    this.npcGreetingVideoTexture = null;
    this.npcGreetingScreen = screen;
    return screen;
  }

  hasSeenNpcGreetingInSession() {
    if (typeof window === "undefined") {
      return false;
    }
    try {
      return String(window.sessionStorage.getItem(NPC_GREETING_SESSION_KEY) ?? "") === "1";
    } catch {
      return false;
    }
  }

  markNpcGreetingSeenInSession() {
    this.npcGreetingPlayed = true;
    if (typeof window === "undefined") {
      return;
    }
    try {
      window.sessionStorage.setItem(NPC_GREETING_SESSION_KEY, "1");
    } catch {
      // ignore storage failures
    }
  }

  disposeNpcGreetingVideoPlayback({ disposeTexture = true } = {}) {
    if (this.npcGreetingVideoEl) {
      this.npcGreetingVideoEl.onended = null;
      this.npcGreetingVideoEl.onerror = null;
      this.npcGreetingVideoEl.ontimeupdate = null;
      this.npcGreetingVideoEl.pause();
      this.npcGreetingVideoEl.removeAttribute("src");
      this.npcGreetingVideoEl.load();
      this.npcGreetingVideoEl = null;
    }
    if (disposeTexture && this.npcGreetingVideoTexture) {
      this.npcGreetingVideoTexture.dispose();
      this.npcGreetingVideoTexture = null;
    }
  }

  playNpcGreetingVideoOnScreen(
    sourceUrl,
    { freezeOnEnd = false, triggerHalfwayOnEnd = false, onHalfway = null, onEnded = null } = {}
  ) {
    const normalizedSource = String(sourceUrl ?? "").trim();
    if (!normalizedSource) {
      return false;
    }

    const screenMaterial =
      this.npcGreetingScreen && !Array.isArray(this.npcGreetingScreen.material)
        ? this.npcGreetingScreen.material
        : null;
    if (!screenMaterial) {
      return false;
    }

    this.disposeNpcGreetingVideoPlayback();

    const video = document.createElement("video");
    video.preload = "auto";
    video.playsInline = true;
    video.muted = false;
    video.volume = 1;
    video.loop = false;
    video.crossOrigin = "anonymous";
    video.disablePictureInPicture = true;
    video.setAttribute("playsinline", "true");
    video.setAttribute("webkit-playsinline", "true");
    video.setAttribute("disableremoteplayback", "true");
    video.src = normalizedSource;
    video.currentTime = 0;

    const texture = new THREE.VideoTexture(video);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;

    screenMaterial.map = texture;
    screenMaterial.color.setHex(0xffffff);
    screenMaterial.opacity = 1;
    screenMaterial.needsUpdate = true;
    this.npcGreetingScreen.visible = true;

    this.npcGreetingVideoEl = video;
    this.npcGreetingVideoTexture = texture;

    let halfwayTriggered = false;
    const runHalfway = () => {
      if (halfwayTriggered) {
        return;
      }
      halfwayTriggered = true;
      onHalfway?.();
    };

    const finishPlayback = ({ triggerHalfway = false } = {}) => {
      if (this.npcGreetingVideoEl !== video) {
        return;
      }
      if (triggerHalfway) {
        runHalfway();
      }
      video.onended = null;
      video.onerror = null;
      video.ontimeupdate = null;
      if (freezeOnEnd) {
        this.freezeVideoOnLastFrame(video, texture);
      } else {
        video.pause();
      }
      onEnded?.();
    };

    video.ontimeupdate = () => {
      if (halfwayTriggered) {
        return;
      }
      if (Number.isFinite(video.duration) && video.duration > 0 && video.currentTime >= video.duration * 0.5) {
        runHalfway();
      }
    };

    video.onended = () => {
      finishPlayback({ triggerHalfway: triggerHalfwayOnEnd });
    };
    video.onerror = () => {
      finishPlayback({ triggerHalfway: false });
    };

    video.play().catch(() => {
      // Fallback for strict autoplay policies: retry muted before giving up.
      video.muted = true;
      video.currentTime = 0;
      video.play().then(
        () => {},
        () => {
          finishPlayback({ triggerHalfway: false });
        }
      );
    });

    return true;
  }

  triggerNpcGreetingMidpointEffects() {
    if (this.npcGreetingMidpointTriggered) {
      return;
    }
    this.npcGreetingMidpointTriggered = true;
    this.ensureEntryMusicPlayback();
    this.startSpawnPortalVeilRevealVideo();
  }

  playNpcGreeting() {
    if (!this.hubFlowEnabled || this.npcGreetingPlayed || !this.npcGreetingScreen) {
      return;
    }

    const introSourceUrl = String(NPC_GREETING_INTRO_VIDEO_URL ?? "").trim();
    const followupSourceUrl = String(NPC_GREETING_FOLLOWUP_VIDEO_URL ?? "").trim();
    if (!introSourceUrl && !followupSourceUrl) {
      this.markNpcGreetingSeenInSession();
      return;
    }

    if (this.npcGreetingVideoEl) {
      return;
    }
    this.markNpcGreetingSeenInSession();
    this.npcGreetingMidpointTriggered = false;

    const playFollowup = () => {
      if (!followupSourceUrl) {
        return;
      }
      this.playNpcGreetingVideoOnScreen(followupSourceUrl, { freezeOnEnd: true });
    };

    if (!introSourceUrl) {
      this.triggerNpcGreetingMidpointEffects();
      playFollowup();
      return;
    }

    const started = this.playNpcGreetingVideoOnScreen(introSourceUrl, {
      freezeOnEnd: false,
      triggerHalfwayOnEnd: true,
      onHalfway: () => {
        this.triggerNpcGreetingMidpointEffects();
      },
      onEnded: () => {
        this.triggerNpcGreetingMidpointEffects();
        playFollowup();
      }
    });

    if (!started) {
      this.triggerNpcGreetingMidpointEffects();
      playFollowup();
    }
  }

  createSpawnPortalVeilTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = this.mobileEnabled ? 1024 : 1536;
    canvas.height = this.mobileEnabled ? 640 : 900;
    const context = canvas.getContext("2d");
    if (!context) {
      return null;
    }

    context.fillStyle = "#000000";
    context.fillRect(0, 0, canvas.width, canvas.height);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    this.spawnPortalVeilBaseTexture = texture;
    this.spawnPortalVeilTexture = texture;
    return texture;
  }

  freezeVideoOnLastFrame(video, texture = null) {
    if (!video) {
      return;
    }
    try {
      if (Number.isFinite(video.duration) && video.duration > 0) {
        video.currentTime = Math.max(0, video.duration - 0.04);
        if (texture) {
          texture.needsUpdate = true;
        }
      }
    } catch {
      // ignore seek failures on ended media
    }
    video.pause();
  }

  startSpawnPortalVeilRevealVideo() {
    if (this.spawnPortalVeilRevealStarted) {
      return;
    }
    this.spawnPortalVeilRevealStarted = true;

    const sourceUrl = String(SPAWN_PORTAL_VEIL_REVEAL_VIDEO_URL ?? "").trim();
    if (!sourceUrl || !this.spawnPortalVeilMaterial) {
      return;
    }

    if (this.spawnPortalVeilVideoEl) {
      return;
    }

    const video = document.createElement("video");
    video.preload = "auto";
    video.playsInline = true;
    video.muted = true;
    video.volume = 0;
    video.loop = false;
    video.crossOrigin = "anonymous";
    video.disablePictureInPicture = true;
    video.setAttribute("playsinline", "true");
    video.setAttribute("webkit-playsinline", "true");
    video.setAttribute("disableremoteplayback", "true");
    video.src = sourceUrl;
    video.currentTime = 0;

    const texture = new THREE.VideoTexture(video);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;

    this.spawnPortalVeilVideoEl = video;
    this.spawnPortalVeilVideoTexture = texture;
    this.spawnPortalVeilTexture = texture;
    this.spawnPortalVeilMaterial.map = texture;
    this.spawnPortalVeilMaterial.color.setHex(0xffffff);
    this.spawnPortalVeilMaterial.emissive.setHex(0x0f1f32);
    this.spawnPortalVeilMaterial.emissiveIntensity = 0.26;
    this.spawnPortalVeilMaterial.needsUpdate = true;

    const finishPlayback = () => {
      if (this.spawnPortalVeilVideoEl !== video) {
        return;
      }
      video.onended = null;
      video.onerror = null;
      this.freezeVideoOnLastFrame(video, texture);
    };

    video.onended = finishPlayback;
    video.onerror = finishPlayback;
    video.play().catch(() => {
      video.currentTime = 0;
      video.play().then(
        () => {},
        () => {
          finishPlayback();
        }
      );
    });
  }

  updateSpawnPortalVeilTexture() {
    if (this.spawnPortalVeilTexture) {
      this.spawnPortalVeilTexture.needsUpdate = true;
    }
  }

  getNpcDistance() {
    const dx = this.playerPosition.x - this.bridgeNpcPosition.x;
    const dz = this.playerPosition.z - this.bridgeNpcPosition.z;
    return Math.hypot(dx, dz);
  }

  isPlayerPassingShrineGate() {
    const dx = Math.abs(this.playerPosition.x - this.bridgeMirrorPosition.x);
    if (dx > this.bridgeGateHalfWidth) {
      return false;
    }
    const dz = this.playerPosition.z - this.bridgeMirrorPosition.z;
    if (Math.abs(dz) > 6.5) {
      return false;
    }
    return dz >= this.bridgeGateTriggerDepth;
  }

  triggerBridgeBoundaryDing() {
    this.bridgeBoundaryDingClock = 0.72;
    this.bridgeBoundaryDingTriggered = true;
  }

  updateBridgeBoundaryMarker(delta) {
    if (!this.bridgeBoundaryMarker || !this.bridgeBoundaryRing || !this.bridgeBoundaryHalo || !this.bridgeBoundaryBeam) {
      return;
    }

    this.bridgeBoundaryDingClock = Math.max(0, this.bridgeBoundaryDingClock - delta);
    const dingAlpha = THREE.MathUtils.clamp(this.bridgeBoundaryDingClock / 0.72, 0, 1);
    const pulse = 0.5 + 0.5 * Math.sin(this.portalPulseClock * 5.2);

    const ringMaterial = this.bridgeBoundaryRing.material;
    const haloMaterial = this.bridgeBoundaryHalo.material;
    const beamMaterial = this.bridgeBoundaryBeam.material;

    ringMaterial.emissiveIntensity = 0.42 + pulse * 0.42 + dingAlpha * 1.08;
    ringMaterial.opacity = 0.72 + pulse * 0.1 + dingAlpha * 0.2;
    haloMaterial.opacity = 0.16 + pulse * 0.22 + dingAlpha * 0.34;
    beamMaterial.opacity = 0.2 + pulse * 0.16 + dingAlpha * 0.28;

    const scale = 1 + dingAlpha * 0.18;
    this.bridgeBoundaryMarker.scale.set(scale, 1 + dingAlpha * 0.08, scale);
  }

  setFlowHeadline(title, subtitle) {
    // Hub headline overlay is intentionally suppressed for cleaner gameplay.
    this.hubFlowUiEl?.classList.add("hidden");
    this.flowHeadlineCache.title = String(title ?? "").trim();
    this.flowHeadlineCache.subtitle = String(subtitle ?? "").trim();
  }

  getLookYaw(from, to) {
    const dx = Number(to?.x ?? 0) - Number(from?.x ?? 0);
    const dz = Number(to?.z ?? 0) - Number(from?.z ?? 0);
    if (Math.abs(dx) < 0.001 && Math.abs(dz) < 0.001) {
      return this.yaw;
    }
    return Math.atan2(-dx, -dz);
  }

  normalizeYawAngle(value) {
    const raw = Number(value);
    if (!Number.isFinite(raw)) {
      return 0;
    }
    return Math.atan2(Math.sin(raw), Math.cos(raw));
  }

  canMovePlayer() {
    if (this.socketEndpointLinkRequired) {
      return false;
    }
    if (this.isMobilePortraitBlocked()) {
      return false;
    }
    if (this.surfacePainterOpen) {
      return false;
    }
    if (!(this.nicknameGateEl?.classList.contains("hidden") ?? true)) {
      return false;
    }
    if (!(this.npcChoiceGateEl?.classList.contains("hidden") ?? true)) {
      return false;
    }
    if (!this.hubFlowEnabled) {
      return true;
    }
    if (this.flowStage === "portal_transfer") {
      return false;
    }
    if (this.bootIntroVideoPlaying) {
      return false;
    }
    return true;
  }

  canUseGameplayControls() {
    if (this.isMobilePortraitBlocked()) {
      return false;
    }
    if (this.surfacePainterOpen) {
      return false;
    }
    return !this.hubFlowEnabled || this.flowStage === "city_live";
  }

  canUseHostChatShortcut() {
    if (this.isMobilePortraitBlocked()) {
      return false;
    }
    if (this.surfacePainterOpen) {
      return false;
    }
    return this.hasHostPrivilege();
  }

  canUseOfflineHostMode() {
    if (this.socketEndpoint || !this.autoHostClaimEnabled) {
      return false;
    }
    if (typeof window === "undefined") {
      return false;
    }
    const { protocol, hostname } = window.location;
    if (protocol === "file:") {
      return true;
    }
    return hostname === "localhost" || hostname === "127.0.0.1";
  }

  hasHostPrivilege() {
    const localHostMode = this.canUseOfflineHostMode();
    const roomHostMatch = Boolean(
      this.localPlayerId &&
      this.roomHostId &&
      String(this.localPlayerId) === String(this.roomHostId)
    );
    return this.isRoomHost || roomHostMatch || localHostMode;
  }

  canUseObjectEditor() {
    if (!this.hasHostPrivilege()) {
      return false;
    }
    return this.canMovePlayer();
  }

  canUseChatControls() {
    return this.canMovePlayer() || this.canUseHostChatShortcut();
  }

  shouldKeepChatOpenAfterSend() {
    // Keep chat expanded after sending so the user can see the latest line immediately.
    return true;
  }

  canUsePointerLock() {
    return this.canMovePlayer() && !this.portalTransitioning && !this.objEditorActive;
  }

  getFullscreenElement() {
    if (typeof document === "undefined") {
      return null;
    }
    return document.fullscreenElement ?? document.webkitFullscreenElement ?? null;
  }

  isFullscreenActive() {
    return Boolean(this.getFullscreenElement());
  }

  canUseFullscreenApi() {
    if (typeof document === "undefined") {
      return false;
    }
    const root = document.documentElement;
    if (!root) {
      return false;
    }
    const requestFn = root.requestFullscreen ?? root.webkitRequestFullscreen;
    const exitFn = document.exitFullscreen ?? document.webkitExitFullscreen;
    return typeof requestFn === "function" && typeof exitFn === "function";
  }

  updateFullscreenToggleState() {
    if (!this.fullscreenToggleBtnEl) {
      return;
    }
    if (!this.canUseFullscreenApi()) {
      this.fullscreenToggleBtnEl.classList.add("hidden");
      return;
    }
    const active = this.isFullscreenActive();
    this.fullscreenToggleBtnEl.classList.remove("hidden");
    this.fullscreenToggleBtnEl.textContent = active ? "전체해제" : "전체화면";
    this.fullscreenToggleBtnEl.setAttribute("aria-pressed", active ? "true" : "false");
    this.fullscreenToggleBtnEl.title = active ? "전체화면 종료" : "전체화면 진입";
  }

  toggleFullscreenFromInteraction() {
    if (!this.canUseFullscreenApi() || typeof document === "undefined") {
      return;
    }
    if (this.isFullscreenActive()) {
      const exitFn = document.exitFullscreen ?? document.webkitExitFullscreen;
      try {
        const maybePromise = exitFn.call(document);
        if (maybePromise && typeof maybePromise.catch === "function") {
          maybePromise.catch(() => {});
        }
      } catch {
        // ignore
      }
      return;
    }

    const root = document.documentElement;
    if (!root) {
      return;
    }
    const requestFn = root.requestFullscreen ?? root.webkitRequestFullscreen;
    try {
      const maybePromise = requestFn.call(root);
      if (maybePromise && typeof maybePromise.catch === "function") {
        maybePromise.catch(() => {});
      }
    } catch {
      // ignore
    }
  }

  requestFullscreenFromInteraction() {
    if (!this.autoFullscreenEnabled) {
      return;
    }
    if (typeof document === "undefined") {
      return;
    }
    if (this.isFullscreenActive()) {
      this.fullscreenRestorePending = false;
      return;
    }

    const root = document.documentElement;
    if (!root) {
      return;
    }

    const requestFn =
      root.requestFullscreen ??
      root.webkitRequestFullscreen;
    if (typeof requestFn !== "function") {
      return;
    }

    try {
      const maybePromise = requestFn.call(root, { navigationUI: "hide" });
      if (maybePromise && typeof maybePromise.catch === "function") {
        maybePromise.catch(() => {
          this.fullscreenRestorePending = true;
        });
      }
      this.fullscreenRestorePending = false;
    } catch {
      this.fullscreenRestorePending = true;
    }
  }

  syncFullscreenRestoreFlag() {
    if (!this.autoFullscreenEnabled) {
      this.fullscreenRestorePending = false;
      return;
    }
    this.fullscreenRestorePending = !this.isFullscreenActive();
  }

  tryEnterFullscreenFromInteraction() {
    if (!this.autoFullscreenEnabled) {
      return;
    }
    if (!this.fullscreenRestorePending && this.isFullscreenActive()) {
      return;
    }
    this.requestFullscreenFromInteraction();
  }

  updateHubFlow(delta) {
    if (!this.hubFlowEnabled) {
      return;
    }

    this.portalPulseClock += delta;
    this.updateNpcTemplePortalVisual();
    this.updateBridgeBoundaryMarker(delta);
    this.updateSpawnPortalVeilVisibility();
    this.syncPortalAnchorsFromMovableObjects();
    this.requestPortalPrewarm();

    const hallSchedule = this.getPortalScheduleComputed(Date.now());
    const hallPortalOpenNow =
      hallSchedule.mode === "open" || hallSchedule.mode === "open_manual";

    // Hall portal is host-controlled. FPS portal remains available only when dual-portal mode is enabled.
    if (hallPortalOpenNow && !this.portalTransitioning && this.isPlayerInHallPortalZone()) {
      this.triggerPortalTransfer(this.buildHallPortalTransferUrl(), {
        immediate: true,
        transitionText: "라이브 포탈 이동 중...",
        portalHint: "hall"
      });
      return;
    }
    if (A_ZONE_PORTAL_ENABLED && !this.portalTransitioning && this.isPlayerInAZonePortalZone()) {
      this.triggerPortalTransfer(this.buildAZonePortalTransferUrl(), {
        immediate: true,
        transitionText: "포탈 2 이동 중...",
        portalHint: "fps"
      });
      return;
    }
    if (!this.portalTransitioning && this.isPlayerInPortalZone()) {
      const destination = this.buildPortalTransferUrl();
      if (destination) {
        this.triggerPortalTransfer(destination, {
          immediate: true,
          transitionText: "OX 퀴즈 대회 이동 중...",
          portalHint: "ox"
        });
      }
      return;
    }

    if (this.flowStage === "boot_intro") {
      this.updatePortalVisual();
      return;
    }

    if (this.flowStage === "bridge_approach") {
      this.updatePortalVisual();
      if (this.isPlayerPassingShrineGate()) {
        this.flowStage = "city_live";
        this.flowClock = 0;
        this.bridgeBoundaryDingTriggered = false;
        this.bridgeBoundaryDingClock = 0;
        this.keys.clear();
        this.hideNpcChoiceGate();
        this.setMirrorGateVisible(false);
        this.lastSafePosition.copy(this.playerPosition);
        this.setFlowHeadline("도시 라이브", "자유 이동");
        this.hud.setStatus(this.getStatusText());
        this.syncGameplayUiForFlow();
      }
      return;
    }

    if (this.flowStage === "bridge_dialogue") {
      // Legacy stage: return to free-move bridge flow.
      this.flowStage = "bridge_approach";
      this.flowClock = 0;
      this.updatePortalVisual();
      return;
    }

    if (this.flowStage === "bridge_name") {
      // Legacy stage: return to free-move bridge flow.
      this.flowStage = "bridge_approach";
      this.flowClock = 0;
      this.updatePortalVisual();
      return;
    }

    if (this.flowStage === "bridge_mirror") {
      this.updatePortalVisual();
      if (this.isPlayerPassingShrineGate()) {
        this.flowStage = "city_live";
        this.flowClock = 0;
        this.bridgeBoundaryDingTriggered = false;
        this.bridgeBoundaryDingClock = 0;
        this.keys.clear();
        this.setMirrorGateVisible(false);
        this.lastSafePosition.copy(this.playerPosition);
        this.setFlowHeadline("도시 라이브", "자유 이동");
        this.hud.setStatus(this.getStatusText());
        this.syncGameplayUiForFlow();
      }
      return;
    }

    if (this.flowStage === "city_intro") {
      // Legacy compatibility: promote stage immediately, no forced position teleport.
      this.flowStage = "city_live";
      this.flowClock = 0;
      this.lastSafePosition.copy(this.playerPosition);
      this.setFlowHeadline("도시 라이브", "자유 이동");
      this.hud.setStatus(this.getStatusText());
      this.syncGameplayUiForFlow();
      return;
    }

    if (this.flowStage !== "city_live") {
      return;
    }

    this.updatePortalPhase(delta);
    this.updatePortalVisual();
  }

  requestFullscreenOnMobileStartInteraction() {
    if (!this.mobileEnabled || !this.canUseFullscreenApi() || this.isFullscreenActive()) {
      return;
    }
    if (typeof document === "undefined") {
      return;
    }

    const root = document.documentElement;
    if (!root) {
      return;
    }

    const requestFn = root.requestFullscreen ?? root.webkitRequestFullscreen;
    if (typeof requestFn !== "function") {
      return;
    }

    try {
      const maybePromise = requestFn.call(root, { navigationUI: "hide" });
      if (maybePromise && typeof maybePromise.catch === "function") {
        maybePromise.catch(() => {});
      }
    } catch {
      // ignore
    }
  }

  primeEntryMusicOnMobileStartInteraction() {
    if (!this.mobileEnabled || this.entryMusicStarted) {
      return;
    }
    if (!this.entryMusicAudioEl) {
      const audio = new Audio(ENTRY_BGM_URL);
      audio.preload = "auto";
      audio.loop = false;
      audio.volume = this.entryMusicBaseVolume;
      this.entryMusicAudioEl = audio;
    }

    const audio = this.entryMusicAudioEl;
    if (!audio) {
      return;
    }

    audio.muted = true;
    audio.play().then(
      () => {
        try {
          audio.pause();
          audio.currentTime = 0;
        } catch {
          // ignore
        }
        audio.muted = false;
        this.detachEntryMusicUnlockListeners();
      },
      () => {
        audio.muted = false;
        this.attachEntryMusicUnlockListeners();
      }
    );
  }

  updatePortalPhase(delta) {
    const now = Date.now();
    const previousScheduleMode = String(this.portalSchedule?.mode ?? "idle");
    const schedule = this.getPortalScheduleComputed(now);
    const scheduleChanged =
      schedule.mode !== previousScheduleMode ||
      schedule.remainingSec !== Math.max(0, Math.trunc(Number(this.portalSchedule?.remainingSec) || 0)) ||
      schedule.startAtMs !== Math.max(0, Math.trunc(Number(this.portalSchedule?.startAtMs) || 0)) ||
      schedule.openUntilMs !== Math.max(0, Math.trunc(Number(this.portalSchedule?.openUntilMs) || 0));
    if (scheduleChanged) {
      this.portalSchedule = {
        ...schedule,
        updatedAt: now
      };
    }

    if (schedule.mode !== "idle") {
      if (schedule.mode === "open" || schedule.mode === "open_manual") {
        this.portalPhase = "open";
        const timedOpen = schedule.mode === "open";
        this.portalPhaseClock = timedOpen ? Math.max(0, Number(schedule.remainingSec) || 0) : 0;
        if (this.hallPortalTargetUrl) {
          this.setFlowHeadline(
            "포탈 1 개방",
            timedOpen
              ? `입장 가능 (${Math.ceil(this.portalPhaseClock)}초 남음)`
              : "입장 가능 (호스트가 닫기 전까지 유지)"
          );
        } else {
          this.setFlowHeadline(
            "포탈 1 개방 / 목적지 없음",
            "포탈 1 목적지를 확인하세요."
          );
        }
        return;
      }

      if (schedule.mode === "final_countdown") {
        this.portalPhase = "warning";
        this.portalPhaseClock = Math.max(0, Number(schedule.remainingSec) || 0);
        this.setFlowHeadline("공연장 시작 카운트다운", `${Math.ceil(this.portalPhaseClock)}초 후 개방`);
        return;
      }

      this.portalPhase = "cooldown";
      this.portalPhaseClock = Math.max(0, Number(schedule.remainingSec) || 0);
      if (this.portalPhaseClock >= 60) {
        const remainingLabel = this.formatPortalDelayLabel(this.portalPhaseClock);
        this.setFlowHeadline("공연장 시작 대기", `${remainingLabel} 후 개방`);
      } else {
        this.setFlowHeadline("공연장 시작 대기", `${Math.ceil(this.portalPhaseClock)}초 후 개방`);
      }
      return;
    }

    const hasHostPrivilege = this.hasHostPrivilege();
    this.portalPhase = "cooldown";
    this.portalPhaseClock = 0;
    this.setFlowHeadline("도시 라이브", hasHostPrivilege ? "호스팅" : "");
  }

  updateNpcTemplePortalVisual() {
    const coreMaterial = this.npcTemplePortalCore?.material;
    const glowMaterial = this.npcTemplePortalGlow?.material;
    if (!coreMaterial || !glowMaterial) {
      return;
    }

    const pulse = 0.5 + 0.5 * Math.sin(this.portalPulseClock * 7.2);
    coreMaterial.emissiveIntensity = 0.9 + pulse * 1.15;
    glowMaterial.opacity = 0.65 + pulse * 0.28;
  }

  updateSpawnPortalVeilVisibility() {
    if (!this.spawnPortalVeilGroup) {
      return;
    }

    const veilZ = Number(this.spawnPortalVeilWorldZ) || this.bridgeNpcPosition.z;
    const passedPortal = this.playerPosition.z >= veilZ + 0.6;
    const forceHideByFlow =
      this.flowStage === "city_live" ||
      this.flowStage === "portal_transfer";
    this.spawnPortalVeilGroup.visible = !forceHideByFlow && !passedPortal;
    if (this.spawnPortalVeilGroup.visible) {
      this.updateSpawnPortalVeilTexture();
    }
  }

  updatePortalVisual() {
    if (!this.portalRing || !this.portalCore || !this.portalGroup) {
      return;
    }

    const ringMaterial = this.portalRing.material;
    const coreMaterial = this.portalCore.material;
    const coreGlowMaterial = this.portalCoreGlow?.material ?? null;
    if (!ringMaterial || !coreMaterial) {
      return;
    }

    const pulse = 0.5 + 0.5 * Math.sin(this.portalPulseClock * 6.4);
    if (this.aZonePortalRing && this.aZonePortalCore && this.aZonePortalGroup) {
      const aZoneRingMaterial = this.aZonePortalRing.material;
      const aZoneCoreMaterial = this.aZonePortalCore.material;
      const aZoneCoreGlowMaterial = this.aZonePortalCoreGlow?.material ?? null;
      if (aZoneRingMaterial && aZoneCoreMaterial) {
        aZoneRingMaterial.emissiveIntensity = 0.86 + pulse * 0.72;
        aZoneRingMaterial.opacity = 0.84 + pulse * 0.14;
        aZoneCoreMaterial.opacity = 0.65 + pulse * 0.23;
        if (aZoneCoreGlowMaterial) {
          aZoneCoreGlowMaterial.opacity = 0.4 + pulse * 0.26;
        }
        const scale = 1 + pulse * 0.06;
        this.aZonePortalGroup.scale.set(scale, scale, scale);
      }
    }
    if (this.hallPortalRing && this.hallPortalCore && this.hallPortalGroup) {
      const hallRingMaterial = this.hallPortalRing.material;
      const hallCoreMaterial = this.hallPortalCore.material;
      const hallCoreGlowMaterial = this.hallPortalCoreGlow?.material ?? null;
      if (hallRingMaterial && hallCoreMaterial) {
        hallRingMaterial.emissiveIntensity = 0.74 + pulse * 0.66;
        hallRingMaterial.opacity = 0.82 + pulse * 0.14;
        hallCoreMaterial.opacity = 0.56 + pulse * 0.22;
        if (hallCoreGlowMaterial) {
          hallCoreGlowMaterial.opacity = 0.34 + pulse * 0.24;
        }
        const hallScale = 1 + pulse * 0.055;
        this.hallPortalGroup.scale.set(hallScale, hallScale, hallScale);
      }
    }
    // OX portal stays always-open visual.
    ringMaterial.emissiveIntensity = 0.86 + pulse * 0.72;
    ringMaterial.opacity = 0.84 + pulse * 0.14;
    coreMaterial.opacity = 0.65 + pulse * 0.23;
    if (coreGlowMaterial) {
      coreGlowMaterial.opacity = 0.4 + pulse * 0.26;
    }
    const oxScale = 1 + pulse * 0.06;
    this.portalGroup.scale.set(oxScale, oxScale, oxScale);
    this.portalReplicaGroup?.scale.set(oxScale, oxScale, oxScale);
  }

  formatPortalClockTimeText(rawValue = Date.now()) {
    const directMs = Number(rawValue);
    const ms = Number.isFinite(directMs)
      ? directMs
      : rawValue instanceof Date
        ? rawValue.getTime()
        : Date.now();
    const date = new Date(ms);
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${hours}:${minutes}`;
  }

  formatPortalDelayLabel(delaySeconds = 0) {
    const safeSeconds = Math.max(0, Math.trunc(Number(delaySeconds) || 0));
    if (safeSeconds < 60) {
      return `${safeSeconds}초`;
    }
    const totalMinutes = Math.max(1, Math.ceil(safeSeconds / 60));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours > 0 && minutes > 0) {
      return `${hours}시간 ${minutes}분`;
    }
    if (hours > 0) {
      return `${hours}시간`;
    }
    return `${totalMinutes}분`;
  }

  formatPortalStartLabelFromRemaining(remainingSeconds = 0) {
    const safeSeconds = Math.max(0, Math.trunc(Number(remainingSeconds) || 0));
    if (safeSeconds <= 0) {
      return "곧 시작";
    }
    if (safeSeconds < 60) {
      return `${safeSeconds}초후 시작`;
    }
    return `${this.formatPortalDelayLabel(safeSeconds)}후 시작`;
  }

  updatePortalTimeBillboard(delta = 0, force = false) {
    if (!this.portalBillboardContext || !this.portalBillboardTexture || !this.portalBillboardCanvas) {
      return;
    }

    this.portalBillboardUpdateClock += Math.max(0, Number(delta) || 0);
    const updateInterval = Math.max(0.2, Number(this.portalBillboardUpdateInterval) || 0.4);
    if (!force && this.portalBillboardUpdateClock < updateInterval) {
      return;
    }
    this.portalBillboardUpdateClock = 0;

    this.applyPortalDisplayLines("portal1", this.portalDisplayStates?.portal1 ?? {}, { force });

    const hallDisplayState = this.getPortalDisplayState("hall");
    if (hallDisplayState.mode !== "time") {
      const line1 = hallDisplayState.title;
      const line2 = hallDisplayState.line2;
      const line3 = hallDisplayState.line3;
      if (
        !force &&
        this.portalBillboardCache.line1 === line1 &&
        this.portalBillboardCache.line2 === line2 &&
        this.portalBillboardCache.line3 === line3
      ) {
        return;
      }
      this.drawPortalBillboardLines(this.portalBillboardContext, this.portalBillboardCanvas, {
        line1,
        line2,
        line3,
        palette: this.portalBillboardPalette
      });
      this.portalBillboardTexture.needsUpdate = true;
      this.portalBillboardCache = { line1, line2, line3 };
      return;
    }

    const nowMs = Date.now();
    const schedule = this.getPortalScheduleComputed(nowMs);
    const remainingSec = Math.max(0, Math.trunc(Number(schedule.remainingSec) || 0));
    const currentTime = this.formatPortalClockTimeText(nowMs);

    let startLeadText = "( 대 기 중 )";
    if (schedule.mode === "open_manual") {
      startLeadText = "입장 가능 (수동 종료)";
    } else if (schedule.mode === "open") {
      startLeadText = "입장 가능";
    } else if (schedule.mode === "waiting" || schedule.mode === "final_countdown") {
      startLeadText = this.formatPortalStartLabelFromRemaining(remainingSec);
    }

    let startTimeText = "( 대 기 중 )";
    if (
      schedule.mode === "waiting" ||
      schedule.mode === "final_countdown" ||
      schedule.mode === "open" ||
      schedule.mode === "open_manual"
    ) {
      const rawStartAtMs = Math.trunc(Number(schedule.startAtMs) || 0);
      const computedStartAtMs = rawStartAtMs > 0 ? rawStartAtMs : nowMs + remainingSec * 1000;
      startTimeText = this.formatPortalClockTimeText(computedStartAtMs);
    }

    const line1 = startLeadText;
    const line2 = `시작시간 : ${startTimeText}`;
    const line3 = `현재시간 : ${currentTime}`;

    if (
      !force &&
      this.portalBillboardCache.line1 === line1 &&
      this.portalBillboardCache.line2 === line2 &&
      this.portalBillboardCache.line3 === line3
    ) {
      return;
    }

    const context = this.portalBillboardContext;
    const canvas = this.portalBillboardCanvas;
    this.drawPortalBillboardLines(context, canvas, {
      line1,
      line2,
      line3,
      palette: this.portalBillboardPalette
    });

    this.portalBillboardTexture.needsUpdate = true;
    this.portalBillboardCache = { line1, line2, line3 };
  }

  syncPortalAnchorsFromMovableObjects({ force = false } = {}) {
    const syncEntryPosition = (entry, targetVector) => {
      if (!entry?.mesh || !targetVector) {
        return false;
      }
      const mesh = entry.mesh;
      if (mesh.visible === false) {
        return false;
      }
      mesh.updateMatrixWorld(true);
      mesh.getWorldPosition(this.portalAnchorSyncTemp);
      const nextX = Number(this.portalAnchorSyncTemp.x);
      const nextY = Number(this.portalAnchorSyncTemp.y);
      const nextZ = Number(this.portalAnchorSyncTemp.z);
      if (!Number.isFinite(nextX) || !Number.isFinite(nextY) || !Number.isFinite(nextZ)) {
        return false;
      }
      const changed =
        Math.abs((Number(targetVector.x) || 0) - nextX) > 0.0005 ||
        Math.abs((Number(targetVector.y) || 0) - nextY) > 0.0005 ||
        Math.abs((Number(targetVector.z) || 0) - nextZ) > 0.0005;
      if (force || changed) {
        targetVector.set(nextX, nextY, nextZ);
      }
      return changed;
    };

    let changed = false;
    changed = syncEntryPosition(this.portalOxAnchorEntry, this.portalFloorPosition) || changed;
    changed = syncEntryPosition(this.portalFpsAnchorEntry, this.aZonePortalFloorPosition) || changed;
    changed = syncEntryPosition(this.portalHallAnchorEntry, this.hallPortalFloorPosition) || changed;
    if (this.portalOxAnchorEntry?.mesh) {
      this.portalYawRadians = this.normalizeYawAngle(this.portalOxAnchorEntry.mesh.rotation.y);
    }
    return changed;
  }

  isPlayerInPortalZone() {
    const triggerRadius = this.portalRadius * 0.78;
    const triggerRadiusSquared = triggerRadius * triggerRadius;
    // Only the city-end portal (under billboard) is interactive.
    // Bridge/shrine-side portals remain decorative and must never trigger transfer.
    const dx = this.playerPosition.x - this.portalFloorPosition.x;
    const dz = this.playerPosition.z - this.portalFloorPosition.z;
    return dx * dx + dz * dz <= triggerRadiusSquared;
  }

  isPlayerInAZonePortalZone() {
    if (!A_ZONE_PORTAL_ENABLED) {
      return false;
    }
    const triggerRadius = this.aZonePortalRadius * 0.78;
    const triggerRadiusSquared = triggerRadius * triggerRadius;
    const dx = this.playerPosition.x - this.aZonePortalFloorPosition.x;
    const dz = this.playerPosition.z - this.aZonePortalFloorPosition.z;
    return dx * dx + dz * dz <= triggerRadiusSquared;
  }

  isPlayerInHallPortalZone() {
    const triggerRadius = this.hallPortalRadius * 0.78;
    const triggerRadiusSquared = triggerRadius * triggerRadius;
    const dx = this.playerPosition.x - this.hallPortalFloorPosition.x;
    const dz = this.playerPosition.z - this.hallPortalFloorPosition.z;
    return dx * dx + dz * dz <= triggerRadiusSquared;
  }

  setPortalTransition(active, text = "") {
    if (this.portalTransitionTextEl && text) {
      this.portalTransitionTextEl.textContent = String(text);
    }
    this.portalTransitionEl?.classList.toggle("on", Boolean(active));
  }

  updateHallPortalCountdownOverlay(force = false) {
    if (!this.hallPortalCountdownEl) {
      return;
    }

    const schedule = this.getPortalScheduleComputed(Date.now());
    const isFinalCountdown = schedule.mode === "final_countdown";
    const remaining = Math.max(0, Math.trunc(Number(schedule.remainingSec) || 0));
    const show = isFinalCountdown && remaining > 0 && remaining <= 5;
    const nextText = show ? String(remaining) : "";

    if (!force && this.hallPortalCountdownLastText === nextText) {
      return;
    }

    this.hallPortalCountdownLastText = nextText;
    this.hallPortalCountdownEl.classList.toggle("on", show);
    this.hallPortalCountdownEl.classList.toggle("hidden", !show);
    if (show) {
      this.hallPortalCountdownEl.textContent = nextText;
    }
  }

  setBoundaryWarning(active, text = "") {
    if (!this.boundaryWarningEl) {
      return;
    }
    if (text) {
      this.boundaryWarningEl.textContent = String(text);
    }
    this.boundaryWarningEl.classList.toggle("on", Boolean(active));
  }

  getBoundarySoftLimit() {
    return Math.max(4, Number(this.playerBoundsHalfExtent) || GAME_CONSTANTS.WORLD_LIMIT);
  }

  getBoundaryHardLimit() {
    // Keep movement clamp aligned with authoritative server world limit.
    return Math.min(this.getBoundarySoftLimit(), GAME_CONSTANTS.WORLD_LIMIT);
  }

  canUseBoundaryGuard() {
    if (this.portalTransitioning) {
      return false;
    }
    if (!this.canMovePlayer()) {
      return false;
    }
    if (!this.hubFlowEnabled) {
      return true;
    }
    return this.flowStage !== "city_intro" && this.flowStage !== "portal_transfer";
  }

  updateBoundaryGuard(delta) {
    if (!this.canUseBoundaryGuard()) {
      this.boundaryOutClock = 0;
      if (this.boundaryNoticeClock > 0) {
        this.boundaryNoticeClock = Math.max(0, this.boundaryNoticeClock - delta);
        if (this.boundaryNoticeClock <= 0) {
          this.setBoundaryWarning(false);
        }
      } else {
        this.setBoundaryWarning(false);
      }
      return;
    }

    const softLimit = this.getBoundarySoftLimit();
    const outsideBounds =
      Math.abs(this.playerPosition.x) > softLimit || Math.abs(this.playerPosition.z) > softLimit;

    if (!outsideBounds) {
      this.lastSafePosition.copy(this.playerPosition);
      this.boundaryOutClock = 0;
      if (this.boundaryNoticeClock > 0) {
        this.boundaryNoticeClock = Math.max(0, this.boundaryNoticeClock - delta);
        if (this.boundaryNoticeClock <= 0) {
          this.setBoundaryWarning(false);
        }
      } else {
        this.setBoundaryWarning(false);
      }
      return;
    }

    this.boundaryOutClock += delta;
    const secondsLeft = Math.max(0, Math.ceil(this.boundaryReturnDelaySeconds - this.boundaryOutClock));
    this.setBoundaryWarning(
      true,
      `맵 경계를 벗어났습니다. ${secondsLeft}초 안에 돌아오세요.`
    );

    if (this.boundaryOutClock < this.boundaryReturnDelaySeconds) {
      return;
    }

    if (this.lastSafePosition.lengthSq() <= 0.0001) {
      this.lastSafePosition.set(0, GAME_CONSTANTS.PLAYER_HEIGHT, 0);
    }
    this.playerPosition.copy(this.lastSafePosition);
    this.playerPosition.y = GAME_CONSTANTS.PLAYER_HEIGHT;
    this.verticalVelocity = 0;
    this.onGround = true;
    this.keys.clear();
    this.boundaryOutClock = 0;
    this.boundaryNoticeClock = this.boundaryReturnNoticeSeconds;
    this.setBoundaryWarning(true, "맵 경계를 벗어났습니다. 즉시 돌아오세요.");
  }

  parseQueryFlag(name) {
    const value = String(this.queryParams.get(name) ?? "").trim().toLowerCase();
    return value === "1" || value === "true" || value === "yes" || value === "on";
  }

  parseQueryText(...names) {
    for (const rawName of names) {
      const name = String(rawName ?? "").trim();
      if (!name) {
        continue;
      }
      const value = String(this.queryParams.get(name) ?? "").trim();
      if (value) {
        return value;
      }
    }
    return "";
  }

  normalizeReturnPortalHint(rawValue, fallback = "") {
    const directZone = this.normalizeRoomZone(rawValue, "");
    if (directZone === "ox" || directZone === "fps") {
      return directZone;
    }

    const text = String(rawValue ?? "")
      .trim()
      .toLowerCase();
    if (text) {
      if (
        text.includes("fps") ||
        text.includes("reclaim-fps") ||
        text.includes("a-zone") ||
        text.includes("azone")
      ) {
        return "fps";
      }
      if (text.includes("ox") || text.includes("singularity-ox") || text.includes("quiz")) {
        return "ox";
      }
      if (
        text.includes("hall") ||
        text.includes("performance") ||
        text.includes("concert") ||
        text.includes("show")
      ) {
        return "hall";
      }
    }

    const fallbackText = String(fallback ?? "")
      .trim()
      .toLowerCase();
    if (
      fallbackText.includes("hall") ||
      fallbackText.includes("performance") ||
      fallbackText.includes("concert") ||
      fallbackText.includes("show")
    ) {
      return "hall";
    }

    const fallbackZone = this.normalizeRoomZone(fallback, "");
    return fallbackZone === "ox" || fallbackZone === "fps" ? fallbackZone : "";
  }

  resolveReturnEntryPortalHint() {
    const queryHint = this.parseQueryText(
      "returnPortal",
      "return_portal",
      "returnportal",
      "portalReturn",
      "portal_return",
      "fromPortal",
      "from_portal",
      "from"
    );
    const normalizedQueryHint = this.normalizeReturnPortalHint(queryHint, "");
    if (normalizedQueryHint) {
      return normalizedQueryHint;
    }

    if (typeof document === "undefined") {
      return "";
    }

    const referrer = String(document.referrer ?? "").trim();
    if (!referrer) {
      return "";
    }

    try {
      const parsed = new URL(referrer, window.location.href);
      const referrerQueryHint =
        parsed.searchParams.get("returnPortal") ??
        parsed.searchParams.get("return_portal") ??
        parsed.searchParams.get("portalReturn") ??
        parsed.searchParams.get("from") ??
        parsed.searchParams.get("zone") ??
        parsed.searchParams.get("z") ??
        "";
      const normalizedReferrerQueryHint = this.normalizeReturnPortalHint(referrerQueryHint, "");
      if (normalizedReferrerQueryHint) {
        return normalizedReferrerQueryHint;
      }

      const normalizedReferrerHint = this.normalizeReturnPortalHint(
        `${parsed.hostname}${parsed.pathname}`,
        ""
      );
      if (normalizedReferrerHint) {
        return normalizedReferrerHint;
      }
    } catch {
      const normalizedFallback = this.normalizeReturnPortalHint(referrer, "");
      if (normalizedFallback) {
        return normalizedFallback;
      }
    }

    return "";
  }

  buildReturnPortalSpawnState(portalHint = "") {
    this.syncPortalAnchorsFromMovableObjects({ force: true });
    const normalizedHint = this.normalizeReturnPortalHint(portalHint, "");
    if (normalizedHint !== "ox" && normalizedHint !== "fps" && normalizedHint !== "hall") {
      return null;
    }

    // Unify all external return links to one central lobby spawn point.
    const spawnPosition = new THREE.Vector3(
      Number(this.citySpawn?.x) || 0,
      GAME_CONSTANTS.PLAYER_HEIGHT,
      Number(this.citySpawn?.z) || -8
    );
    const lookTarget = new THREE.Vector3(
      Number(this.cityLookTarget?.x) || 0,
      GAME_CONSTANTS.PLAYER_HEIGHT,
      Number(this.cityLookTarget?.z) || 44
    );
    const yaw = this.getLookYaw(spawnPosition, lookTarget);

    return {
      position: spawnPosition,
      yaw,
      pitch: -0.02
    };
  }

  normalizeRoomZone(rawValue, fallback = "lobby") {
    const value = String(rawValue ?? "")
      .trim()
      .toLowerCase();
    if (ROOM_ZONE_IDS.includes(value)) {
      return value;
    }

    const fallbackValue = String(fallback ?? "")
      .trim()
      .toLowerCase();
    if (ROOM_ZONE_IDS.includes(fallbackValue)) {
      return fallbackValue;
    }
    return "";
  }

  normalizeRoomZoneHint(rawValue, fallback = "") {
    const strict = this.normalizeRoomZone(rawValue, "");
    if (strict) {
      return strict;
    }
    const value = String(rawValue ?? "")
      .trim()
      .toLowerCase();
    if (value.startsWith("lobby")) {
      return "lobby";
    }
    if (value.startsWith("fps")) {
      return "fps";
    }
    if (value.startsWith("ox")) {
      return "ox";
    }
    const fallbackValue = String(fallback ?? "")
      .trim()
      .toLowerCase();
    if (fallbackValue === "lobby" || fallbackValue === "fps" || fallbackValue === "ox") {
      return fallbackValue;
    }
    return "";
  }

  getRoomZoneLabel(rawZone) {
    const zone = this.normalizeRoomZone(rawZone, "lobby") || "lobby";
    return ROOM_ZONE_LABELS[zone] ?? ROOM_ZONE_LABELS.lobby;
  }

  resolvePortalTransferZone(rawTarget, fallbackZone = "lobby") {
    const normalizedFallback = this.normalizeRoomZone(fallbackZone, "");
    const rawText = String(rawTarget ?? "").trim();
    if (!rawText) {
      return normalizedFallback;
    }

    const text = rawText.toLowerCase();
    const directZone = this.normalizeRoomZoneHint(text.replace(/^zone:/, ""), "");
    if (directZone) {
      return directZone;
    }

    try {
      const parsed = new URL(rawText, window.location.href);
      const zoneFromQuery = this.normalizeRoomZoneHint(
        parsed.searchParams.get("zone") ?? parsed.searchParams.get("z") ?? "",
        ""
      );
      if (zoneFromQuery) {
        return zoneFromQuery;
      }

      const pathname = String(parsed.pathname ?? "").toLowerCase();
      if (pathname.includes("/fps")) {
        return "fps";
      }
      if (pathname.includes("/ox")) {
        return "ox";
      }
      if (pathname.includes("/lobby")) {
        return "lobby";
      }

      const host = String(parsed.hostname ?? "").toLowerCase();
      if (host.includes("reclaim-fps")) {
        return "fps";
      }
      if (host.includes("singularity-ox")) {
        return "ox";
      }
    } catch {
      // keep fallback
    }

    return normalizedFallback;
  }

  normalizePortalTargetUrl(rawValue, fallback = "") {
    const text = String(rawValue ?? "").trim();
    if (!text) {
      return String(fallback ?? "").trim();
    }

    const baseHref =
      typeof window !== "undefined" && window.location?.href
        ? window.location.href
        : "https://example.invalid/";

    let parsed;
    try {
      parsed = new URL(text, baseHref);
    } catch {
      return String(fallback ?? "").trim();
    }

    const protocol = String(parsed.protocol ?? "").toLowerCase();
    if (protocol !== "http:" && protocol !== "https:") {
      return String(fallback ?? "").trim();
    }

    const zoneHint = this.normalizeRoomZoneHint(
      parsed.searchParams.get("zone") ?? parsed.searchParams.get("z") ?? "",
      ""
    );
    if (typeof window !== "undefined" && parsed.origin === window.location.origin && zoneHint) {
      const canonical = new URL("/", window.location.href);
      canonical.searchParams.set("zone", zoneHint);
      return canonical.toString();
    }

    return parsed.toString();
  }

  resolveRequestedPortalTargetCandidate() {
    const queryTarget = String(
      this.queryParams.get("portal") ?? this.queryParams.get("next") ?? ""
    ).trim();
    if (queryTarget) {
      return this.normalizePortalTargetUrl(queryTarget, "");
    }

    const globalTarget =
      typeof window !== "undefined"
        ? String(window.__EMPTINES_PORTAL_TARGET ?? "").trim()
        : "";
    if (globalTarget) {
      return this.normalizePortalTargetUrl(globalTarget, "");
    }

    return "";
  }

  resolvePortalTargetUrl(defaultTarget = "") {
    const requestedTarget = this.resolveRequestedPortalTargetCandidate();
    if (requestedTarget) {
      return requestedTarget;
    }

    const configTarget = this.normalizePortalTargetUrl(defaultTarget, "");
    if (configTarget) {
      return configTarget;
    }

    return this.normalizePortalTargetUrl(DEFAULT_PORTAL_TARGET_URL, "");
  }

  applyPortalTargetUpdate(rawTarget) {
    const normalized = this.normalizePortalTargetUrl(rawTarget, "");
    if (!normalized || normalized === this.portalTargetUrl) {
      if (normalized && normalized === this.hostPortalTargetCandidate) {
        this.hostPortalTargetSynced = true;
      }
      return false;
    }

    this.portalTargetUrl = normalized;
    if (normalized === this.hostPortalTargetCandidate) {
      this.hostPortalTargetSynced = true;
    }
    this.schedulePortalPrewarm({ immediate: true });
    return true;
  }

  buildPortalTransferUrl() {
    const target = String(this.portalTargetUrl ?? "").trim();
    return target || DEFAULT_PORTAL_TARGET_URL;
  }

  buildAZonePortalTransferUrl() {
    if (!A_ZONE_PORTAL_ENABLED) {
      return "";
    }
    const target = String(this.aZonePortalTargetUrl ?? "").trim();
    return target || A_ZONE_FIXED_PORTAL_TARGET_URL;
  }

  buildHallPortalTransferUrl() {
    const target = String(this.hallPortalTargetUrl ?? "").trim();
    const fallback = this.normalizePortalTargetUrl(HALL_FIXED_PORTAL_TARGET_URL, "");
    return target || fallback;
  }

  normalizePortalPrewarmUrl(rawTarget = "") {
    if (typeof window === "undefined") {
      return "";
    }

    const destination = this.resolvePortalTransferDestination(rawTarget, "");
    if (!destination || destination.type !== "external") {
      return "";
    }

    try {
      const parsed = new URL(destination.url, window.location.href);
      if (parsed.origin === window.location.origin) {
        return "";
      }

      if (parsed.hostname.endsWith("onrender.com")) {
        parsed.pathname = "/health";
        parsed.search = "";
        parsed.hash = "";
        return parsed.toString();
      }

      parsed.hash = "";
      parsed.searchParams.set("_prewarm", "1");
      if (!parsed.searchParams.has("from")) {
        parsed.searchParams.set("from", "emptines-prewarm");
      }
      return parsed.toString();
    } catch {
      return "";
    }
  }

  collectPortalPrewarmUrls() {
    const candidates = [
      this.buildPortalTransferUrl(),
      this.buildAZonePortalTransferUrl(),
      this.buildHallPortalTransferUrl()
    ];
    const unique = new Set();
    for (const target of candidates) {
      const url = this.normalizePortalPrewarmUrl(target);
      if (url) {
        unique.add(url);
      }
    }
    return Array.from(unique);
  }

  requestPortalPrewarm({ force = false } = {}) {
    if (typeof window === "undefined" || typeof fetch !== "function") {
      return;
    }

    const now = Date.now();
    const minIntervalMs = Math.max(15_000, Math.trunc(Number(this.portalPrewarmMinIntervalMs) || 0));
    for (const url of this.collectPortalPrewarmUrls()) {
      const lastAt = Math.max(0, Math.trunc(Number(this.portalPrewarmLastAt.get(url)) || 0));
      if (!force && now - lastAt < minIntervalMs) {
        continue;
      }
      this.portalPrewarmLastAt.set(url, now);
      try {
        fetch(url, {
          method: "GET",
          mode: "no-cors",
          cache: "no-store",
          keepalive: true
        }).catch(() => {});
      } catch {
        // no-op
      }
    }
  }

  schedulePortalPrewarm({ immediate = false } = {}) {
    if (typeof window === "undefined") {
      return;
    }
    if (this.portalPrewarmKickTimer) {
      window.clearTimeout(this.portalPrewarmKickTimer);
      this.portalPrewarmKickTimer = null;
    }
    const delayMs = immediate ? 120 : 900;
    this.portalPrewarmKickTimer = window.setTimeout(() => {
      this.portalPrewarmKickTimer = null;
      this.requestPortalPrewarm({ force: true });
    }, delayMs);
  }

  buildLobbyReturnUrl(portalHint = "") {
    if (typeof window === "undefined") {
      return "";
    }
    try {
      const normalizedHint = this.normalizeReturnPortalHint(portalHint, "");
      const returnUrl = new URL("/", window.location.href);
      returnUrl.searchParams.set("zone", "lobby");
      if (normalizedHint) {
        returnUrl.searchParams.set("returnPortal", normalizedHint);
        returnUrl.searchParams.set("from", normalizedHint);
      }
      return returnUrl.toString();
    } catch {
      return "";
    }
  }

  appendPortalReturnContextToExternalUrl(rawUrl, portalHint = "") {
    const targetUrl = String(rawUrl ?? "").trim();
    if (!targetUrl) {
      return "";
    }
    try {
      const parsed = new URL(targetUrl, window.location.href);
      const normalizedHint = this.normalizeReturnPortalHint(portalHint, "");
      if (!parsed.searchParams.has("from")) {
        parsed.searchParams.set("from", "emptines");
      }
      if (normalizedHint && !parsed.searchParams.has("returnPortal")) {
        parsed.searchParams.set("returnPortal", normalizedHint);
      }
      const returnUrl = this.buildLobbyReturnUrl(normalizedHint);
      if (returnUrl && !parsed.searchParams.has("returnUrl")) {
        parsed.searchParams.set("returnUrl", returnUrl);
      }
      return parsed.toString();
    } catch {
      return targetUrl;
    }
  }

  resolveLegacyOxPortalExternalUrl(rawTarget = "") {
    const text = String(rawTarget ?? "").trim();
    if (!text) {
      return "";
    }

    try {
      const parsed = new URL(text, window.location.href);
      const zone = this.normalizeRoomZone(
        parsed.searchParams.get("zone") ?? parsed.searchParams.get("z") ?? "",
        ""
      );
      const pathname = String(parsed.pathname ?? "").trim();
      if (zone !== "ox" || (pathname && pathname !== "/")) {
        return "";
      }
      return DEFAULT_PORTAL_TARGET_URL;
    } catch {
      return "";
    }
  }

  resolveLegacyFpsPortalExternalUrl(rawTarget = "") {
    const text = String(rawTarget ?? "").trim();
    if (!text) {
      return "";
    }

    try {
      const parsed = new URL(text, window.location.href);
      const zone = this.normalizeRoomZone(
        parsed.searchParams.get("zone") ?? parsed.searchParams.get("z") ?? "",
        ""
      );
      const pathname = String(parsed.pathname ?? "").trim();
      if (zone !== "fps" || (pathname && pathname !== "/")) {
        return "";
      }
      return A_ZONE_FIXED_PORTAL_TARGET_URL;
    } catch {
      return "";
    }
  }

  resolveExternalPortalUrl(rawTarget = "") {
    const text = String(rawTarget ?? "").trim();
    if (!text) {
      return "";
    }

    const normalized = this.normalizePortalTargetUrl(text, "");
    if (!normalized) {
      return "";
    }

    try {
      const parsed = new URL(normalized, window.location.href);
      if (parsed.origin !== window.location.origin) {
        return parsed.toString();
      }
      const pathname = String(parsed.pathname ?? "").trim().toLowerCase();
      if (pathname === "/ox" || pathname.startsWith("/ox/")) {
        return parsed.toString();
      }
    } catch {
      return "";
    }

    return "";
  }

  resolvePortalTransferDestination(rawTarget, fallbackTarget = "") {
    const rawText = String(rawTarget ?? "").trim();
    const fallbackText = String(fallbackTarget ?? "").trim();
    const candidate = rawText || fallbackText;
    if (!candidate) {
      return null;
    }

    const legacyOxExternalUrl = this.resolveLegacyOxPortalExternalUrl(candidate);
    if (legacyOxExternalUrl) {
      return { type: "external", url: legacyOxExternalUrl };
    }

    const legacyFpsExternalUrl = this.resolveLegacyFpsPortalExternalUrl(candidate);
    if (legacyFpsExternalUrl) {
      return { type: "external", url: legacyFpsExternalUrl };
    }

    const explicitExternalUrl = this.resolveExternalPortalUrl(candidate);
    if (explicitExternalUrl) {
      return { type: "external", url: explicitExternalUrl };
    }

    const zone = this.resolvePortalTransferZone(candidate, "");
    if (zone) {
      return { type: "zone", zone };
    }

    const externalUrl = this.normalizePortalTargetUrl(candidate, "");
    if (externalUrl) {
      return { type: "external", url: externalUrl };
    }

    return null;
  }

  applyPortalZoneSwitchState(rawState = null) {
    const parsedState = this.parseChatMessageState(rawState ?? null);
    if (!parsedState) {
      return false;
    }

    this.playerPosition.set(parsedState.x, parsedState.y, parsedState.z);
    this.yaw = this.normalizeYawAngle(parsedState.yaw);
    this.pitch = THREE.MathUtils.clamp(parsedState.pitch, -1.52, 1.52);
    this.verticalVelocity = 0;
    this.onGround = parsedState.y <= GAME_CONSTANTS.PLAYER_HEIGHT + 0.001;
    this.lastSafePosition.copy(this.playerPosition);
    this.pendingAuthoritativeStateSync = true;
    this.authoritativeSyncGraceUntil = performance.now() + 1200;
    this.requestAuthoritativeStateSync({ minIntervalMs: 80 });
    return true;
  }

  requestInitialZoneSwitch() {
    if (this.entryZoneSwitchRequested) {
      return;
    }
    const zone = this.normalizeRoomZone(this.requestedEntryZone, "");
    const returnPortalHint = this.normalizeReturnPortalHint(this.returnEntryPortal, "");
    if (!zone) {
      return;
    }
    if (zone === "lobby") {
      if (returnPortalHint !== "ox" && returnPortalHint !== "fps" && returnPortalHint !== "hall") {
        return;
      }
      this.entryZoneSwitchRequested = true;
      this.triggerPortalTransfer("lobby", {
        immediate: true,
        skipCooldown: true,
        force: true,
        transitionText: "대기방 복귀 위치 동기화 중...",
        silent: true,
        portalHint: returnPortalHint
      });
      return;
    }
    this.entryZoneSwitchRequested = true;
    this.triggerPortalTransfer(zone, {
      immediate: true,
      skipCooldown: true,
      transitionText: `${this.getRoomZoneLabel(zone)} 이동 중...`,
      silent: true
    });
  }

  triggerPortalTransfer(overrideDestination = "", options = null) {
    if (this.portalTransitioning || this.portalZoneSwitchInFlight) {
      return;
    }

    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const skipCooldown = Boolean(options?.skipCooldown);
    if (!skipCooldown && now < (Number(this.portalTransferBlockedUntil) || 0)) {
      return;
    }

    const immediate = Boolean(options?.immediate);
    const silent = Boolean(options?.silent);

    const target = this.resolvePortalTransferDestination(
      overrideDestination,
      this.buildPortalTransferUrl()
    );
    if (!target) {
      this.appendChatLine("", "포탈 전환 대상을 확인할 수 없습니다.", "system");
      return;
    }
    if (target.type === "external") {
      const targetUrl = String(target.url ?? "").trim();
      if (!targetUrl) {
        this.appendChatLine("", "외부 포탈 주소가 비어 있습니다.", "system");
        return;
      }
      const portalHint =
        this.normalizeReturnPortalHint(options?.portalHint ?? options?.returnPortal, "") ||
        this.normalizeReturnPortalHint(targetUrl, "");
      const finalTargetUrl = this.appendPortalReturnContextToExternalUrl(targetUrl, portalHint);

      const previousStage = this.flowStage;
      const transitionText =
        String(options?.transitionText ?? "").trim() || "외부 게임으로 이동 중...";

      this.portalTransitioning = true;
      this.portalZoneSwitchInFlight = false;
      this.portalTransferReturnStage = previousStage;
      this.flowStage = "portal_transfer";
      this.hud.setStatus(this.getStatusText());
      this.syncGameplayUiForFlow();
      this.setPortalTransition(true, transitionText);

      const safeNavigate = () => {
        try {
          window.location.assign(finalTargetUrl || targetUrl);
        } catch {
          if (!this.portalTransitioning) {
            return;
          }
          this.portalTransitioning = false;
          this.portalTransferBlockedUntil =
            (typeof performance !== "undefined" ? performance.now() : Date.now()) + 1800;
          const restoreStage =
            String(this.portalTransferReturnStage ?? "").trim() || "city_live";
          this.portalTransferReturnStage = null;
          this.flowStage = restoreStage === "portal_transfer" ? "city_live" : restoreStage;
          this.hud.setStatus(this.getStatusText());
          this.syncGameplayUiForFlow();
          this.setPortalTransition(false, "");
          if (!silent) {
            this.appendChatLine("", "외부 포탈 이동에 실패했습니다.", "system");
          }
        }
      };

      window.setTimeout(safeNavigate, immediate ? 0 : 180);
      return;
    }

    let targetZone = target.zone;
    if (!options?.force && targetZone === this.localRoomZone) {
      // If the portal points to the current zone, treat it as "exit to lobby".
      if (targetZone === "lobby") {
        return;
      }
      targetZone = "lobby";
    }
    if (!this.socket || !this.networkConnected) {
      this.appendChatLine("", "온라인 연결 후 다시 시도하세요.", "system");
      return;
    }

    const previousStage = this.flowStage;
    const zoneTransitionText =
      String(options?.transitionText ?? "").trim() ||
      `${this.getRoomZoneLabel(targetZone)} 이동 중...`;

    this.portalTransitioning = true;
    this.portalZoneSwitchInFlight = true;
    this.portalTransferReturnStage = previousStage;
    this.flowStage = "portal_transfer";
    this.hud.setStatus(this.getStatusText());
    this.syncGameplayUiForFlow();
    this.setPortalTransition(true, zoneTransitionText);

    const recoverFromFailedTransfer = (message = "") => {
      if (!this.portalTransitioning) {
        return;
      }
      this.portalZoneSwitchInFlight = false;
      this.portalTransitioning = false;
      this.portalTransferBlockedUntil =
        (typeof performance !== "undefined" ? performance.now() : Date.now()) + 1800;
      const restoreStage =
        String(this.portalTransferReturnStage ?? "").trim() || "city_live";
      this.portalTransferReturnStage = null;
      this.flowStage = restoreStage === "portal_transfer" ? "city_live" : restoreStage;
      this.hud.setStatus(this.getStatusText());
      this.syncGameplayUiForFlow();
      this.setPortalTransition(false, "");
      if (!silent) {
        const reason = String(message ?? "").trim();
        this.appendChatLine(
          "",
          reason || "포탈 전환이 실패했습니다. 다시 진입해 주세요.",
          "system"
        );
      }
    };

    const finalizeZoneTransfer = (response = {}) => {
      if (!this.portalTransitioning) {
        return;
      }
      this.portalZoneSwitchInFlight = false;
      this.localRoomZone = targetZone;
      this.applyPortalZoneSwitchState(response?.state ?? null);
      this.portalTransitioning = false;
      this.portalTransferBlockedUntil =
        (typeof performance !== "undefined" ? performance.now() : Date.now()) + 1200;
      const restoreStage =
        String(this.portalTransferReturnStage ?? "").trim() || "city_live";
      this.portalTransferReturnStage = null;
      this.flowStage = restoreStage === "portal_transfer" ? "city_live" : restoreStage;
      this.hud.setStatus(this.getStatusText());
      this.syncGameplayUiForFlow();
      this.setPortalTransition(false, "");
      if (!silent) {
        this.appendChatLine("", `${this.getRoomZoneLabel(targetZone)}으로 이동했습니다.`, "system");
      }
    };

    const requestTimeoutMs = Math.max(1200, Math.trunc(Number(options?.timeoutMs) || 3200));
    const switchPortalHint = this.normalizeReturnPortalHint(
      options?.portalHint ?? options?.returnPortal,
      ""
    );
    let resolved = false;
    const trySwitchZone = () => {
      const timeoutId = window.setTimeout(() => {
        if (resolved) {
          return;
        }
        resolved = true;
        recoverFromFailedTransfer("존 전환 응답이 지연되었습니다. 다시 시도하세요.");
      }, requestTimeoutMs);

      const switchPayload = {
        zone: targetZone,
        ...(switchPortalHint ? { portalHint: switchPortalHint } : {})
      };
      this.socket.emit("room:zone:switch", switchPayload, (response = {}) => {
        if (resolved) {
          return;
        }
        resolved = true;
        window.clearTimeout(timeoutId);
        if (!response?.ok) {
          const errorMessage = String(response?.error ?? "").trim();
          recoverFromFailedTransfer(errorMessage || "존 전환 요청이 거부되었습니다.");
          return;
        }
        finalizeZoneTransfer(response);
      });
    };

    window.setTimeout(trySwitchZone, immediate ? 0 : 420);
  }

  syncPlayerNameIfConnected(options = null) {
    const preferredName = this.isHostEntryLink ? this.hostEntryFixedName : this.localPlayerName;
    const nextName = this.formatPlayerName(preferredName);
    this.localPlayerName = nextName;
    if (!this.socket || !this.networkConnected) {
      this.pendingPlayerNameSync = true;
      return;
    }

    const onJoined = typeof options?.onJoined === "function" ? options.onJoined : null;
    this.socket.emit("room:quick-join", { name: nextName }, (response = {}) => {
      if (!response?.ok) {
        return;
      }
      onJoined?.(response);
    });
    this.pendingPlayerNameSync = false;
  }

  requestAuthoritativeStateSync(options = null) {
    if (!this.socket || !this.networkConnected || !this.localPlayerId) {
      return false;
    }
    if (this.authoritativeStateSyncInFlight) {
      return false;
    }
    const minIntervalMs = Math.max(80, Number(options?.minIntervalMs) || 800);
    const now = performance.now();
    if (now - this.lastAuthoritativeStateSyncAt < minIntervalMs) {
      return false;
    }
    this.lastAuthoritativeStateSyncAt = now;
    this.authoritativeStateSyncInFlight = true;

    const payload = {
      x: this.playerPosition.x,
      y: this.playerPosition.y,
      z: this.playerPosition.z,
      yaw: this.yaw,
      pitch: this.pitch
    };

    this.socket.emit("player:state:sync", payload, (response = {}) => {
      this.authoritativeStateSyncInFlight = false;
      if (!response?.ok) {
        return;
      }
      this.pendingAuthoritativeStateSync = false;
      this.authoritativeSyncGraceUntil = 0;
      const state = this.parsePackedSnapshotState(response?.state);
      if (state) {
        this.applyAuthoritativeSelfState(state, 0);
      }
    });
    return true;
  }

  setPlayerRosterVisible(visible) {
    const nextVisible = Boolean(visible);
    this.playerRosterVisible = nextVisible;
    this.playerRosterEl?.classList.toggle("hidden", !nextVisible);
  }

  updateRoomPlayerSnapshot(players) {
    const source = Array.isArray(players) ? players : [];
    this.roomPlayerSnapshot = source
      .map((player) => ({
        id: String(player?.id ?? "").trim(),
        name: this.formatPlayerName(player?.name ?? "PLAYER")
      }))
      .filter((player) => Boolean(player.id));
    this.renderPlayerRoster();
  }

  renderPlayerRoster() {
    this.resolveUiElements();
    if (!this.playerRosterCountEl || !this.playerRosterListEl) {
      return;
    }

    const localId = String(this.localPlayerId ?? "").trim();
    const hostId = String(this.roomHostId ?? "").trim();
    const roomPlayers = Array.isArray(this.roomPlayerSnapshot) ? this.roomPlayerSnapshot : [];
    const fallbackCount = Math.max(0, this.remotePlayers.size + (this.networkConnected ? 1 : 0));
    const totalPlayers = roomPlayers.length > 0 ? roomPlayers.length : fallbackCount;

    this.playerRosterCountEl.textContent = `${totalPlayers}명`;
    this.playerRosterListEl.textContent = "";

    const sortedPlayers = [...roomPlayers].sort((a, b) => {
      const aHost = a.id === hostId ? 1 : 0;
      const bHost = b.id === hostId ? 1 : 0;
      if (aHost !== bHost) {
        return bHost - aHost;
      }

      const aSelf = a.id === localId ? 1 : 0;
      const bSelf = b.id === localId ? 1 : 0;
      if (aSelf !== bSelf) {
        return bSelf - aSelf;
      }

      return a.name.localeCompare(b.name);
    });

    if (sortedPlayers.length === 0) {
      const empty = document.createElement("li");
      empty.className = "empty";
      empty.textContent = this.networkConnected ? "플레이어 동기화 대기 중..." : "서버 연결 필요";
      this.playerRosterListEl.appendChild(empty);
      return;
    }

    for (const player of sortedPlayers) {
      const item = document.createElement("li");
      const isSelf = player.id === localId;
      const isHost = player.id === hostId;

      if (isSelf) {
        item.classList.add("self");
      }
      if (isHost) {
        item.classList.add("host");
      }

      const tags = [];
      if (isSelf) {
        tags.push("나");
      }
      if (isHost) {
        tags.push("방장");
      }
      const suffix = tags.length > 0 ? ` (${tags.join(" / ")})` : "";
      item.textContent = `${player.name}${suffix}`;
      this.playerRosterListEl.appendChild(item);
    }
  }

  syncHostControls() {
    const hasHostPrivilege = this.hasHostPrivilege();
    if (!hasHostPrivilege && this.hostCustomBlockPlacementPreviewActive) {
      this.clearHostCustomBlockPlacementPreview({ syncUi: false });
    }
    const visible = hasHostPrivilege;
    const canHostUseChat = this.canUseHostChatShortcut();
    const chatEnabled = this.canUseChatControls();
    this.chatUiEl?.classList.toggle("hidden", !chatEnabled);
    if (!chatEnabled && this.chatOpen) {
      this.setChatOpen(false);
    }
    this.syncChatLiveUi();
    if (this.hostChatToggleBtnEl) {
      const showHostChatToggle = canHostUseChat;
      this.hostChatToggleBtnEl.classList.toggle("hidden", !showHostChatToggle);
      const hostLabel = this.chatOpen ? "채팅 닫기" : "채팅";
      if (this.hostChatToggleBtnEl.textContent !== hostLabel) {
        this.hostChatToggleBtnEl.textContent = hostLabel;
      }
      this.hostChatToggleBtnEl.setAttribute("aria-pressed", this.chatOpen ? "true" : "false");
    }
    if (this.hostControlsToggleBtnEl) {
      this.hostControlsToggleBtnEl.classList.toggle("hidden", !visible);
      const toggleLabel = this.hostControlsOpen ? "조작 패널 닫기" : "조작 패널 열기";
      if (this.hostControlsToggleBtnEl.textContent !== toggleLabel) {
        this.hostControlsToggleBtnEl.textContent = toggleLabel;
      }
      this.hostControlsToggleBtnEl.setAttribute("aria-pressed", this.hostControlsOpen ? "true" : "false");
    }

    if (!this.hostControlsEl) {
      return;
    }

    const controlsBusy =
      this.portalForceOpenInFlight ||
      this.portalCloseInFlight ||
      this.portalScheduleSetInFlight ||
      this.portalTargetSetInFlight ||
      this.aZonePortalTargetSetInFlight ||
      Boolean(this.portalDisplaySetInFlight?.portal1) ||
      Boolean(this.portalDisplaySetInFlight?.portal2) ||
      this.mainPortalAdSetInFlight ||
      this.leftBillboardSetInFlight ||
      this.rightBillboardResetInFlight ||
      this.billboardVideoSetInFlight ||
      this.hostMusicSetInFlight ||
      this.securityTestSetInFlight ||
      this.editorSettingsSetInFlight;

    const canControlPortal = hasHostPrivilege;
    const schedule = this.getPortalScheduleComputed();
    const portalOpenNow = schedule.mode === "open" || schedule.mode === "open_manual";
    const canSchedulePortal = canControlPortal && !portalOpenNow;

    this.hostControlsEl.classList.toggle("hidden", !visible || !this.hostControlsOpen);
    if (this.hostOpenPortalBtnEl) {
      this.hostOpenPortalBtnEl.classList.remove("hidden");
      const nextLabel = portalOpenNow ? "포탈 1 닫기" : "포탈 1 열기";
      if (this.hostOpenPortalBtnEl.textContent !== nextLabel) {
        this.hostOpenPortalBtnEl.textContent = nextLabel;
      }
      this.hostOpenPortalBtnEl.title = portalOpenNow
        ? "포탈 1 즉시 닫기"
        : "포탈 1 즉시 개방";
      this.hostOpenPortalBtnEl.disabled = controlsBusy;
    }
    const quickDelayRow = this.hostDelayButtons?.[0]?.closest?.(".host-delay-row");
    quickDelayRow?.classList.remove("hidden");
    quickDelayRow?.previousElementSibling?.classList.remove("hidden");
    const customDelayRow = this.hostDelayMinutesInputEl?.closest?.(".host-custom-row");
    customDelayRow?.classList.remove("hidden");

    for (const button of this.hostDelayButtons) {
      button.disabled = controlsBusy || !canSchedulePortal;
    }
    if (this.hostDelayMinutesInputEl) {
      this.hostDelayMinutesInputEl.disabled = controlsBusy || !canSchedulePortal;
    }
    if (this.hostDelayUnitSelectEl) {
      this.hostDelayUnitSelectEl.disabled = controlsBusy || !canSchedulePortal;
    }
    if (this.hostApplyDelayBtnEl) {
      this.hostApplyDelayBtnEl.disabled = controlsBusy || !canSchedulePortal;
    }
    if (this.hostPortalTargetInputEl) {
      this.hostPortalTargetInputEl.disabled = controlsBusy;
      if (document.activeElement !== this.hostPortalTargetInputEl) {
        const nextValue = String(this.hostPortalTargetCandidate || this.portalTargetUrl || "").trim();
        if (this.hostPortalTargetInputEl.value !== nextValue) {
          this.hostPortalTargetInputEl.value = nextValue;
        }
      }
    }
    if (this.hostPortalTargetApplyBtnEl) {
      this.hostPortalTargetApplyBtnEl.disabled = controlsBusy;
    }
    if (this.hostAZonePortalTargetInputEl) {
      const aZoneTargetRow = this.hostAZonePortalTargetInputEl.closest?.(".host-row");
      aZoneTargetRow?.classList.toggle("hidden", !A_ZONE_PORTAL_ENABLED);
      const aZoneTargetCustomRow = this.hostAZonePortalTargetInputEl.closest?.(".host-custom-row");
      aZoneTargetCustomRow?.classList.toggle("hidden", !A_ZONE_PORTAL_ENABLED);
      aZoneTargetCustomRow?.previousElementSibling?.classList.toggle("hidden", !A_ZONE_PORTAL_ENABLED);
      this.hostAZonePortalTargetInputEl.disabled = controlsBusy;
      if (document.activeElement !== this.hostAZonePortalTargetInputEl) {
        const nextValue = String(
          this.hostAZonePortalTargetCandidate || this.aZonePortalTargetUrl || ""
        ).trim();
        if (this.hostAZonePortalTargetInputEl.value !== nextValue) {
          this.hostAZonePortalTargetInputEl.value = nextValue;
        }
      }
    }
    if (this.hostAZonePortalTargetApplyBtnEl) {
      if (!this.hostAZonePortalTargetInputEl) {
        this.hostAZonePortalTargetApplyBtnEl.classList.toggle("hidden", !A_ZONE_PORTAL_ENABLED);
      }
      this.hostAZonePortalTargetApplyBtnEl.disabled = controlsBusy;
    }
    const portal1DisplayState = this.getPortalDisplayState("portal1");
    const portal2DisplayState = this.getPortalDisplayState("portal2");
    if (this.hostPortal1NameInputEl) {
      this.hostPortal1NameInputEl.disabled = controlsBusy;
      if (document.activeElement !== this.hostPortal1NameInputEl) {
        const nextValue = String(portal1DisplayState.title ?? "").trim();
        if (this.hostPortal1NameInputEl.value !== nextValue) {
          this.hostPortal1NameInputEl.value = nextValue;
        }
      }
    }
    if (this.hostPortal1ModeSelectEl) {
      this.hostPortal1ModeSelectEl.disabled = controlsBusy;
      if (this.hostPortal1ModeSelectEl.value !== portal1DisplayState.mode) {
        this.hostPortal1ModeSelectEl.value = portal1DisplayState.mode;
      }
    }
    if (this.hostPortal1Line2InputEl) {
      this.hostPortal1Line2InputEl.disabled = controlsBusy;
      if (document.activeElement !== this.hostPortal1Line2InputEl) {
        const nextValue = String(portal1DisplayState.line2 ?? "").trim();
        if (this.hostPortal1Line2InputEl.value !== nextValue) {
          this.hostPortal1Line2InputEl.value = nextValue;
        }
      }
    }
    if (this.hostPortal1Line3InputEl) {
      this.hostPortal1Line3InputEl.disabled = controlsBusy;
      if (document.activeElement !== this.hostPortal1Line3InputEl) {
        const nextValue = String(portal1DisplayState.line3 ?? "").trim();
        if (this.hostPortal1Line3InputEl.value !== nextValue) {
          this.hostPortal1Line3InputEl.value = nextValue;
        }
      }
    }
    if (this.hostPortal1ImageFileInputEl) {
      this.hostPortal1ImageFileInputEl.disabled = controlsBusy;
    }
    if (this.hostPortal1ApplyBtnEl) {
      this.hostPortal1ApplyBtnEl.disabled = controlsBusy;
    }
    if (this.hostPortal1ResetBtnEl) {
      this.hostPortal1ResetBtnEl.disabled = controlsBusy;
    }
    if (this.hostPortal2NameInputEl) {
      this.hostPortal2NameInputEl.closest?.(".host-row")?.classList.toggle("hidden", !A_ZONE_PORTAL_ENABLED);
      this.hostPortal2NameInputEl.disabled = controlsBusy;
      if (document.activeElement !== this.hostPortal2NameInputEl) {
        const nextValue = String(portal2DisplayState.title ?? "").trim();
        if (this.hostPortal2NameInputEl.value !== nextValue) {
          this.hostPortal2NameInputEl.value = nextValue;
        }
      }
    }
    if (this.hostPortal2ImageFileInputEl) {
      this.hostPortal2ImageFileInputEl.closest?.(".host-row")?.classList.toggle("hidden", !A_ZONE_PORTAL_ENABLED);
      this.hostPortal2ImageFileInputEl.disabled = controlsBusy;
    }
    if (this.hostPortal2ApplyBtnEl) {
      this.hostPortal2ApplyBtnEl.closest?.(".host-actions")?.classList.toggle("hidden", !A_ZONE_PORTAL_ENABLED);
      this.hostPortal2ApplyBtnEl.disabled = controlsBusy;
    }
    if (this.hostPortal2ResetBtnEl) {
      this.hostPortal2ResetBtnEl.closest?.(".host-actions")?.classList.toggle("hidden", !A_ZONE_PORTAL_ENABLED);
      this.hostPortal2ResetBtnEl.disabled = controlsBusy;
    }
    if (this.hostMainPortalAdFileInputEl) {
      this.hostMainPortalAdFileInputEl.disabled = controlsBusy;
    }
    if (this.hostMainPortalAdApplyBtnEl) {
      this.hostMainPortalAdApplyBtnEl.disabled = controlsBusy;
    }
    if (this.hostMainPortalAdResetBtnEl) {
      this.hostMainPortalAdResetBtnEl.disabled = controlsBusy;
    }
    const hallDisplayState = this.getPortalDisplayState("hall");
    if (this.hostHallPortalModeSelectEl) {
      this.hostHallPortalModeSelectEl.disabled = controlsBusy;
      if (this.hostHallPortalModeSelectEl.value !== hallDisplayState.mode) {
        this.hostHallPortalModeSelectEl.value = hallDisplayState.mode;
      }
    }
    if (this.hostHallPortalTitleInputEl) {
      this.hostHallPortalTitleInputEl.disabled = controlsBusy;
      if (document.activeElement !== this.hostHallPortalTitleInputEl) {
        const nextValue = String(hallDisplayState.title ?? "").trim();
        if (this.hostHallPortalTitleInputEl.value !== nextValue) {
          this.hostHallPortalTitleInputEl.value = nextValue;
        }
      }
    }
    if (this.hostHallPortalLine2InputEl) {
      this.hostHallPortalLine2InputEl.disabled = controlsBusy;
      if (document.activeElement !== this.hostHallPortalLine2InputEl) {
        const nextValue = String(hallDisplayState.line2 ?? "").trim();
        if (this.hostHallPortalLine2InputEl.value !== nextValue) {
          this.hostHallPortalLine2InputEl.value = nextValue;
        }
      }
    }
    if (this.hostHallPortalLine3InputEl) {
      this.hostHallPortalLine3InputEl.disabled = controlsBusy;
      if (document.activeElement !== this.hostHallPortalLine3InputEl) {
        const nextValue = String(hallDisplayState.line3 ?? "").trim();
        if (this.hostHallPortalLine3InputEl.value !== nextValue) {
          this.hostHallPortalLine3InputEl.value = nextValue;
        }
      }
    }
    if (this.hostHallPortalApplyBtnEl) {
      this.hostHallPortalApplyBtnEl.disabled = controlsBusy;
    }
    if (this.hostHallPortalResetBtnEl) {
      this.hostHallPortalResetBtnEl.disabled = controlsBusy;
    }
    if (this.hostRightVideoSelectEl) {
      this.hostRightVideoSelectEl.disabled = controlsBusy;
    }
    if (this.hostPlayRightVideoBtnEl) {
      this.hostPlayRightVideoBtnEl.disabled = controlsBusy;
    }
    if (this.hostResetRightVideoBtnEl) {
      this.hostResetRightVideoBtnEl.disabled = controlsBusy;
    }
    if (this.hostBillboardVideoFileInputEl) {
      this.hostBillboardVideoFileInputEl.disabled = controlsBusy;
    }
    if (this.hostBillboardVideoPlayLeftBtnEl) {
      this.hostBillboardVideoPlayLeftBtnEl.disabled = controlsBusy;
    }
    if (this.hostBillboardVideoPlayRightBtnEl) {
      this.hostBillboardVideoPlayRightBtnEl.disabled = controlsBusy;
    }
    if (this.hostBillboardVideoPlayBothBtnEl) {
      this.hostBillboardVideoPlayBothBtnEl.disabled = controlsBusy;
    }
    if (this.hostSecurityTestToggleBtnEl) {
      const enabled = Boolean(this.securityTestState?.enabled);
      const nextLabel = enabled ? "보안 테스트: ON" : "보안 테스트: OFF";
      if (this.hostSecurityTestToggleBtnEl.textContent !== nextLabel) {
        this.hostSecurityTestToggleBtnEl.textContent = nextLabel;
      }
      this.hostSecurityTestToggleBtnEl.setAttribute("aria-pressed", enabled ? "true" : "false");
      this.hostSecurityTestToggleBtnEl.disabled = controlsBusy;
    }
    if (this.hostLeftImageFileInputEl) {
      this.hostLeftImageFileInputEl.disabled = controlsBusy;
    }
    if (this.hostResetLeftImageBtnEl) {
      this.hostResetLeftImageBtnEl.disabled = controlsBusy;
    }
    if (this.hostMusicFileInputEl) {
      this.hostMusicFileInputEl.disabled = controlsBusy;
    }
    if (this.hostMusicPlayBtnEl) {
      this.hostMusicPlayBtnEl.disabled = controlsBusy;
    }
    if (this.hostMusicStopBtnEl) {
      this.hostMusicStopBtnEl.disabled = controlsBusy;
    }
    if (this.editorPlatformLimitInputEl) {
      this.editorPlatformLimitInputEl.disabled = controlsBusy;
    }
    if (this.editorRopeLimitInputEl) {
      this.editorRopeLimitInputEl.disabled = controlsBusy;
    }
    if (this.editorPlatformScaleInputEl) {
      this.editorPlatformScaleInputEl.disabled = controlsBusy;
    }
    if (this.editorRopeScaleInputEl) {
      this.editorRopeScaleInputEl.disabled = controlsBusy;
    }
    if (this.editorSettingsApplyBtnEl) {
      this.editorSettingsApplyBtnEl.disabled = controlsBusy;
    }
    if (this.platformEditorSaveBtnEl) {
      this.platformEditorSaveBtnEl.disabled = controlsBusy;
    }
    if (this.platformEditorDeleteOneBtnEl) {
      this.platformEditorDeleteOneBtnEl.disabled = controlsBusy || this.jumpPlatforms.length <= 0;
    }
    if (this.platformEditorClearBtnEl) {
      const hasAnyPlacedEditorItem = this.jumpPlatforms.length > 0 || this.jumpRopes.length > 0;
      this.platformEditorClearBtnEl.disabled = controlsBusy || !hasAnyPlacedEditorItem;
    }
    const hostCustomTotal = this.getHostCustomPaintBlockEntries().length;
    const hostCustomAvailable = this.getHostCustomPaintBlockAvailableCount();
    const hostCustomVisible = this.getVisibleHostCustomPaintBlockEntries().length;
    const hostCustomPreviewActive = this.hostCustomBlockPlacementPreviewActive;
    const hostCustomDisabled =
      controlsBusy || (hostCustomAvailable <= 0 && !hostCustomPreviewActive);
    if (this.hostGrayObjectWidthInputEl) {
      this.hostGrayObjectWidthInputEl.disabled = controlsBusy;
    }
    if (this.hostGrayObjectHeightInputEl) {
      this.hostGrayObjectHeightInputEl.disabled = controlsBusy;
    }
    if (this.hostGrayObjectDepthInputEl) {
      this.hostGrayObjectDepthInputEl.disabled = controlsBusy;
    }
    if (this.hostGrayObjectAddBtnEl) {
      const nextLabel = hostCustomPreviewActive
        ? `오브젝트 배치 확정 (${hostCustomAvailable}/${hostCustomTotal})`
        : `앞에 오브젝트 추가 (${hostCustomAvailable}/${hostCustomTotal})`;
      if (this.hostGrayObjectAddBtnEl.textContent !== nextLabel) {
        this.hostGrayObjectAddBtnEl.textContent = nextLabel;
      }
      this.hostGrayObjectAddBtnEl.disabled = hostCustomDisabled;
    }
    if (this.hostGrayObjectDeleteBtnEl) {
      this.hostGrayObjectDeleteBtnEl.disabled = controlsBusy || hostCustomVisible <= 0;
    }
    this.syncObjectEditorSettingsUi();
    for (const button of this.hostRightVideoQuickButtons ?? []) {
      button.disabled = controlsBusy;
    }
    this.syncRightBillboardHostUi();
  }

  getDefaultObjectEditorSettings() {
    return {
      platformLimit: 400,
      ropeLimit: 200,
      platformScale: 1,
      ropeScale: 1,
      updatedAt: Date.now()
    };
  }

  normalizeObjectEditorSettings(raw = {}, fallbackRaw = null) {
    const fallback =
      fallbackRaw && typeof fallbackRaw === "object"
        ? fallbackRaw
        : this.getDefaultObjectEditorSettings();

    const pickLimit = (value, fallbackValue) => {
      const parsed = Math.trunc(Number(value));
      const safe = Number.isFinite(parsed) ? parsed : Math.trunc(Number(fallbackValue) || 0);
      return THREE.MathUtils.clamp(safe, OBJECT_EDITOR_MIN_LIMIT, OBJECT_EDITOR_MAX_LIMIT);
    };
    const pickScale = (value, fallbackValue) => {
      const parsed = Number(value);
      const safe = Number.isFinite(parsed) ? parsed : Number(fallbackValue) || 1;
      return THREE.MathUtils.clamp(safe, OBJECT_EDITOR_MIN_SCALE, OBJECT_EDITOR_MAX_SCALE);
    };

    const updatedAtRaw = Math.trunc(Number(raw?.updatedAt));
    const fallbackUpdatedAt = Math.trunc(Number(fallback?.updatedAt) || Date.now());
    const updatedAt = Math.max(
      0,
      Number.isFinite(updatedAtRaw) ? updatedAtRaw : fallbackUpdatedAt
    );

    return {
      platformLimit: pickLimit(raw?.platformLimit, fallback?.platformLimit),
      ropeLimit: pickLimit(raw?.ropeLimit, fallback?.ropeLimit),
      platformScale: pickScale(raw?.platformScale, fallback?.platformScale),
      ropeScale: pickScale(raw?.ropeScale, fallback?.ropeScale),
      updatedAt
    };
  }

  persistObjectEditorSettingsLocally() {
    try {
      localStorage.setItem(
        this.objectEditorSettingsStorageKey,
        JSON.stringify(this.objectEditorSettings)
      );
    } catch {
      // ignore
    }
  }

  loadSavedObjectEditorSettings() {
    try {
      const raw = localStorage.getItem(this.objectEditorSettingsStorageKey);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw);
      const normalized = this.normalizeObjectEditorSettings(parsed, this.objectEditorSettings);
      this.objectEditorSettings = normalized;
    } catch {
      // ignore
    }
  }

  refreshObjectEditorPreviewGeometry() {
    if (this.platformEditorPreviewMesh) {
      this.platformEditorPreviewMesh.geometry.dispose();
      this.platformEditorPreviewMesh.geometry = new THREE.BoxGeometry(
        this.platformEditorSize.w,
        this.platformEditorSize.h,
        this.platformEditorSize.d
      );
    }
    if (this.ropeEditorPreviewMesh) {
      this.ropeEditorPreviewMesh.geometry.dispose();
      this.ropeEditorPreviewMesh.geometry = new THREE.CylinderGeometry(
        0.07,
        0.07,
        this.ropeEditorHeight,
        8
      );
    }
  }

  syncObjectEditorSettingsUi() {
    this.resolveUiElements();
    const settings = this.normalizeObjectEditorSettings(this.objectEditorSettings);
    if (this.editorPlatformLimitInputEl && document.activeElement !== this.editorPlatformLimitInputEl) {
      this.editorPlatformLimitInputEl.value = String(settings.platformLimit);
    }
    if (this.editorRopeLimitInputEl && document.activeElement !== this.editorRopeLimitInputEl) {
      this.editorRopeLimitInputEl.value = String(settings.ropeLimit);
    }
    if (this.editorPlatformScaleInputEl && document.activeElement !== this.editorPlatformScaleInputEl) {
      this.editorPlatformScaleInputEl.value = settings.platformScale.toFixed(2);
    }
    if (this.editorRopeScaleInputEl && document.activeElement !== this.editorRopeScaleInputEl) {
      this.editorRopeScaleInputEl.value = settings.ropeScale.toFixed(2);
    }
    if (this.editorPlatformScaleValueEl) {
      this.editorPlatformScaleValueEl.textContent = `${settings.platformScale.toFixed(2)}x`;
    }
    if (this.editorRopeScaleValueEl) {
      this.editorRopeScaleValueEl.textContent = `${settings.ropeScale.toFixed(2)}x`;
    }
  }

  applyObjectEditorSettings(
    rawSettings = {},
    { persistLocal = true, syncUi = true, forceScaleApply = false } = {}
  ) {
    const previous = this.normalizeObjectEditorSettings(this.objectEditorSettings);
    const normalized = this.normalizeObjectEditorSettings(rawSettings, previous);
    const platformScaleChanged =
      Math.abs((normalized.platformScale || 1) - (previous.platformScale || 1)) > 0.0001;
    const ropeScaleChanged =
      Math.abs((normalized.ropeScale || 1) - (previous.ropeScale || 1)) > 0.0001;

    this.objectEditorSettings = normalized;

    if (forceScaleApply || platformScaleChanged) {
      this.platformEditorSize = {
        w: this.platformEditorBaseSize.w * normalized.platformScale,
        h: Math.max(0.05, this.platformEditorBaseSize.h * normalized.platformScale),
        d: this.platformEditorBaseSize.d * normalized.platformScale
      };
    }
    if (forceScaleApply || ropeScaleChanged) {
      this.ropeEditorHeight = THREE.MathUtils.clamp(
        this.ropeEditorBaseHeight * normalized.ropeScale,
        0.5,
        50
      );
    }
    if (forceScaleApply || platformScaleChanged || ropeScaleChanged) {
      this.refreshObjectEditorPreviewGeometry();
    }

    if (persistLocal) {
      this.persistObjectEditorSettingsLocally();
    }
    if (syncUi) {
      this.syncObjectEditorSettingsUi();
    }
    this.updatePlatformEditorCount();
    this.updateRopeEditorCount();
  }

  requestObjectEditorSettingsUpdate(rawSettings = {}, { announceErrors = true } = {}) {
    if (!this.hasHostPrivilege()) {
      return false;
    }

    const nextSettings = this.normalizeObjectEditorSettings(rawSettings, this.objectEditorSettings);

    if (!(this.socket && this.networkConnected)) {
      this.applyObjectEditorSettings(nextSettings, {
        persistLocal: true,
        syncUi: true,
        forceScaleApply: true
      });
      return true;
    }

    this.editorSettingsSetInFlight = true;
    this.syncHostControls();
    this.socket.emit(
      "editor:settings:set",
      { settings: nextSettings },
      (response = {}) => {
        this.editorSettingsSetInFlight = false;
        if (!response?.ok) {
          if (announceErrors) {
            this.appendChatLine("", `에디터 값 적용 실패: ${String(response?.error ?? "unknown")}`, "system");
          }
          this.syncHostControls();
          return;
        }
        this.applyObjectEditorSettings(
          response?.settings && typeof response.settings === "object"
            ? response.settings
            : nextSettings,
          {
            persistLocal: true,
            syncUi: true,
            forceScaleApply: true
          }
        );
        this.syncHostControls();
      }
    );
    return true;
  }

  getOrCreatePromoOwnerKey() {
    const normalize = (rawValue) => String(rawValue ?? "").trim().replace(/[^a-zA-Z0-9:_-]/g, "");
    let key = "";
    try {
      key = normalize(localStorage.getItem(this.promoOwnerKeyStorageKey));
    } catch {
      key = "";
    }
    if (!key || key.length < 8) {
      const randomPart = Math.random().toString(36).slice(2, 14);
      key = normalize(`pk_${Date.now().toString(36)}_${randomPart}`).slice(0, 96);
      if (key.length < 8) {
        key = `pk_${Date.now().toString(36)}_${randomPart}x`;
      }
      try {
        localStorage.setItem(this.promoOwnerKeyStorageKey, key);
      } catch {
        // ignore
      }
    }
    return key;
  }

  normalizePromoLinkUrl(rawValue) {
    const text = String(rawValue ?? "").trim().slice(0, 2048);
    if (!text) {
      return "";
    }
    try {
      const parsed = new URL(text);
      const protocol = String(parsed.protocol ?? "").toLowerCase();
      if (protocol !== "http:" && protocol !== "https:") {
        return "";
      }
      return parsed.toString();
    } catch {
      return "";
    }
  }

  normalizePromoKind(_rawValue, _fallback = "block") {
    // Promo object shape is intentionally fixed to a clean gray block.
    return "block";
  }

  normalizePromoYaw(rawValue, fallback = 0) {
    const parsed = Number(rawValue);
    const safe = Number.isFinite(parsed) ? parsed : Number(fallback) || 0;
    const twoPi = Math.PI * 2;
    let wrapped = ((safe + Math.PI) % twoPi + twoPi) % twoPi - Math.PI;
    if (Math.abs(wrapped) < 0.00001) {
      wrapped = 0;
    }
    return wrapped;
  }

  normalizePromoDrawBackgroundColor(rawValue, fallback = "#707782") {
    const text = String(rawValue ?? "").trim();
    if (/^#[0-9a-fA-F]{6}$/.test(text)) {
      return text.toLowerCase();
    }
    return /^#[0-9a-fA-F]{6}$/.test(String(fallback ?? "").trim())
      ? String(fallback).trim().toLowerCase()
      : "#707782";
  }

  normalizePromoObjectEntry(rawValue) {
    if (!rawValue || typeof rawValue !== "object") {
      return null;
    }
    const ownerKey = String(rawValue.ownerKey ?? "").trim().replace(/[^a-zA-Z0-9:_-]/g, "").slice(0, 96);
    if (!ownerKey || ownerKey.length < 8) {
      return null;
    }
    const mediaDataUrl = String(rawValue.mediaDataUrl ?? "").trim();
    const hasMediaData = /^data:image\/webp;base64,/i.test(mediaDataUrl);
    const mediaKind = hasMediaData ? "image" : "none";
    return {
      ownerKey,
      ownerName: this.formatPlayerName(rawValue.ownerName ?? "PLAYER"),
      kind: this.normalizePromoKind(rawValue.kind ?? "block", "block"),
      x: THREE.MathUtils.clamp(Number(rawValue.x) || 0, -2000, 2000),
      y: THREE.MathUtils.clamp(Number(rawValue.y) || 0, -100, 400),
      z: THREE.MathUtils.clamp(Number(rawValue.z) || 0, -2000, 2000),
      yaw: this.normalizePromoYaw(rawValue.yaw, 0),
      scale: THREE.MathUtils.clamp(Number(rawValue.scale) || 1, PROMO_MIN_SCALE, PROMO_MAX_SCALE),
      linkUrl: this.normalizePromoLinkUrl(rawValue.linkUrl ?? ""),
      mediaDataUrl: hasMediaData ? mediaDataUrl : "",
      mediaKind,
      allowOthersDraw: Boolean(rawValue.allowOthersDraw),
      updatedAt: Math.max(0, Math.trunc(Number(rawValue.updatedAt) || Date.now()))
    };
  }

  getPromoObjectSignature(entry) {
    if (!entry) {
      return "";
    }
    return [
      entry.ownerKey,
      entry.ownerName,
      entry.kind,
      entry.x.toFixed(3),
      entry.y.toFixed(3),
      entry.z.toFixed(3),
      this.normalizePromoYaw(entry.yaw, 0).toFixed(4),
      entry.scale.toFixed(3),
      entry.linkUrl,
      entry.mediaKind,
      entry.mediaDataUrl.slice(0, 64),
      entry.mediaDataUrl.length,
      entry.allowOthersDraw ? "1" : "0"
    ].join("|");
  }

  setPromoPanelStatus(message = "") {
    if (!this.promoStatusEl) {
      return;
    }
    this.promoStatusEl.textContent = String(message ?? "").trim();
  }

  normalizeRuntimeFeatureMode(rawValue, fallback = "") {
    const text = String(rawValue ?? "")
      .trim()
      .toLowerCase();
    if (text === "public" || text === "host" || text === "off") {
      return text;
    }
    return fallback;
  }

  getPersistentStateUnavailableMessage(featureLabel = "프로젝트 홍보") {
    const reason = String(this.runtimePolicyState?.persistentStateReason ?? "").trim();
    const lowerReason = reason.toLowerCase();
    if (lowerReason.includes("eacces") || lowerReason.includes("permission denied")) {
      return `${featureLabel} 저장용 디스크를 사용할 수 없습니다. 운영자 확인이 필요합니다.`;
    }
    if (lowerReason.includes("path missing")) {
      return `${featureLabel} 저장 경로가 설정되지 않았습니다. 운영자 확인이 필요합니다.`;
    }
    return `${featureLabel} 저장을 현재 사용할 수 없습니다. 운영자 확인이 필요합니다.`;
  }

  getCoreMemoryUnavailableMessage(featureLabel = "회색 오브젝트", coreMemoryState = null) {
    const normalizedCoreMemoryState =
      coreMemoryState && typeof coreMemoryState === "object"
        ? coreMemoryState
        : this.runtimePolicyState?.coreMemory;
    const coreReason = String(normalizedCoreMemoryState?.reason ?? "").trim();
    const fallbackReason = String(this.runtimePolicyState?.persistentStateReason ?? "").trim();
    const reason = coreReason || fallbackReason;
    const lowerReason = reason.toLowerCase();
    if (lowerReason.includes("eacces") || lowerReason.includes("permission denied")) {
      return `${featureLabel} 코어 저장용 디스크를 사용할 수 없습니다. 운영자 확인이 필요합니다.`;
    }
    if (lowerReason.includes("path missing") || lowerReason.includes("storage path missing")) {
      return `${featureLabel} 코어 저장 경로가 설정되지 않았습니다. 운영자 확인이 필요합니다.`;
    }
    return `${featureLabel} 코어 저장을 현재 사용할 수 없습니다. 운영자 확인이 필요합니다.`;
  }

  normalizeRuntimeCoreMemoryState(rawValue, fallback = null) {
    if (!rawValue || typeof rawValue !== "object") {
      return fallback;
    }
    return {
      available: typeof rawValue.available === "boolean" ? rawValue.available : null,
      reason: String(rawValue.reason ?? "").trim(),
      count: Math.max(0, Math.trunc(Number(rawValue.count) || 0)),
      storageKey: String(rawValue.storageKey ?? "").trim(),
      durabilityTier: String(rawValue.durabilityTier ?? "").trim(),
      authoredType: String(rawValue.authoredType ?? "").trim(),
      payloadVersion: Math.max(0, Math.trunc(Number(rawValue.payloadVersion) || 0)),
      schemaVersion: Math.max(0, Math.trunc(Number(rawValue.schemaVersion) || 0)),
      lastPersistAt: Math.max(0, Math.trunc(Number(rawValue.lastPersistAt) || 0)),
      lastPersistError: String(rawValue.lastPersistError ?? "").trim(),
      queued: Boolean(rawValue.queued),
      inFlight: Boolean(rawValue.inFlight)
    };
  }

  applyRuntimePolicyState(payload = {}) {
    const nextPromoMode = this.normalizeRuntimeFeatureMode(
      payload?.promoMode,
      this.normalizeRuntimeFeatureMode(this.runtimePolicyState?.promoMode, "")
    );
    const nextSurfacePaintMode = this.normalizeRuntimeFeatureMode(
      payload?.surfacePaintMode,
      this.normalizeRuntimeFeatureMode(this.runtimePolicyState?.surfacePaintMode, "")
    );
    const nextPersistentStateAvailable =
      typeof payload?.persistentStateAvailable === "boolean"
        ? payload.persistentStateAvailable
        : this.runtimePolicyState?.persistentStateAvailable ?? null;
    const nextPersistentStateReason = String(
      payload?.persistentStateReason ?? this.runtimePolicyState?.persistentStateReason ?? ""
    ).trim();
    const nextCoreMemory = this.normalizeRuntimeCoreMemoryState(
      payload?.coreMemory,
      this.runtimePolicyState?.coreMemory ?? null
    );
    const nextSurfacePaintCoreMemory = this.normalizeRuntimeCoreMemoryState(
      payload?.surfacePaintCoreMemory,
      this.runtimePolicyState?.surfacePaintCoreMemory ?? null
    );
    this.runtimePolicyState = {
      promoMode: nextPromoMode,
      surfacePaintMode: nextSurfacePaintMode,
      persistentStateAvailable: nextPersistentStateAvailable,
      persistentStateReason: nextPersistentStateReason,
      coreMemory: nextCoreMemory,
      surfacePaintCoreMemory: nextSurfacePaintCoreMemory
    };
    this.syncPromoPanelUi();
    this.updateSurfacePainterSaveAvailability();
  }

  getPromoActionBlockedReason() {
    if (!(this.socket && this.networkConnected)) {
      return "서버 연결 후 사용 가능";
    }
    if (this.runtimePolicyState?.persistentStateAvailable === false) {
      return this.getPersistentStateUnavailableMessage("프로젝트 홍보");
    }
    const promoMode = this.normalizeRuntimeFeatureMode(this.runtimePolicyState?.promoMode, "");
    if (promoMode === "off") {
      return "프로젝트 홍보 저장이 현재 비활성화되어 있습니다.";
    }
    if (promoMode === "host" && !this.hasHostPrivilege()) {
      return "프로젝트 홍보 저장은 방장만 가능합니다.";
    }
    return "";
  }

  getPromoActionErrorMessage(rawErrorText = "", actionLabel = "저장") {
    const errorText = String(rawErrorText ?? "").trim();
    const normalizedError = errorText.toLowerCase();
    const blockedReason = this.getPromoPlacementBlockReasonFromServerError(normalizedError);
    if (blockedReason) {
      return this.getPromoPlacementBlockReasonMessage(blockedReason) || PLAYER_PLACEABLE_BLOCKED_MESSAGE;
    }
    if (normalizedError === "promo host only" || normalizedError === "host only") {
      return "프로젝트 홍보 저장은 방장만 가능합니다.";
    }
    if (normalizedError === "promo disabled") {
      return "프로젝트 홍보 저장이 현재 비활성화되어 있습니다.";
    }
    if (
      normalizedError.startsWith("promo disabled:") ||
      normalizedError.includes("permission denied") ||
      normalizedError.includes("eacces") ||
      normalizedError.includes("persistent storage path missing")
    ) {
      return this.getPersistentStateUnavailableMessage("프로젝트 홍보");
    }
    if (normalizedError === "owner key required") {
      return "세션 식별이 없어 프로젝트 홍보를 저장할 수 없습니다. 새로고침 후 다시 시도하세요.";
    }
    if (normalizedError === "promo rate limited" || normalizedError === "promo ip flood detected") {
      return "짧은 시간에 너무 많이 저장해 잠시 제한되었습니다.";
    }
    return `홍보 오브젝트 ${actionLabel} 실패: ${errorText || "unknown"}`;
  }

  getOwnPromoObject() {
    return this.promoObjects.get(this.promoOwnerKey) ?? null;
  }

  getNearestPromoObject(maxDistance = PROMO_LINK_INTERACT_RADIUS) {
    const maxDistanceSq = maxDistance * maxDistance;
    let nearest = null;
    let nearestDistSq = Number.POSITIVE_INFINITY;
    const px = Number(this.playerPosition.x) || 0;
    const pz = Number(this.playerPosition.z) || 0;
    for (const entry of this.promoObjects.values()) {
      const dx = px - (Number(entry.x) || 0);
      const dz = pz - (Number(entry.z) || 0);
      const distSq = dx * dx + dz * dz;
      if (distSq > maxDistanceSq || distSq >= nearestDistSq) {
        continue;
      }
      nearest = entry;
      nearestDistSq = distSq;
    }
    return nearest;
  }

  setPromoPanelMobileOpen(nextOpen, { syncMobileUi = true } = {}) {
    const shouldOpen =
      Boolean(nextOpen) &&
      this.mobileEnabled &&
      !this.isMobilePortraitBlocked() &&
      !this.surfacePainterOpen &&
      !this.chatOpen;
    if (this.promoPanelMobileOpen === shouldOpen) {
      this.syncPromoPanelUi();
      if (syncMobileUi) {
        this.syncMobileUiState();
      }
      return;
    }
    this.promoPanelMobileOpen = shouldOpen;
    if (shouldOpen) {
      this.chatInputEl?.blur?.();
      this.resetMobileControlInputState();
      if (typeof document !== "undefined" && document.pointerLockElement === this.renderer.domElement) {
        document.exitPointerLock?.();
      }
    }
    this.syncPromoPanelUi();
    if (syncMobileUi) {
      this.syncMobileUiState();
    }
  }

  setPromoPanelDesktopOpen(nextOpen, { syncUi = true } = {}) {
    const shouldOpen = Boolean(nextOpen) && !this.mobileEnabled;
    if (this.promoPanelDesktopOpen === shouldOpen) {
      if (syncUi) {
        this.syncPromoPanelUi();
      }
      return;
    }
    this.promoPanelDesktopOpen = shouldOpen;
    if (shouldOpen) {
      this.chatInputEl?.blur?.();
      if (typeof document !== "undefined" && document.pointerLockElement === this.renderer.domElement) {
        document.exitPointerLock?.();
      }
    }
    if (syncUi) {
      this.syncPromoPanelUi();
    }
  }

  initPromoDrawCanvasIfNeeded() {
    if (!this.promoDrawCanvasEl) {
      return;
    }
    const nextBackground = this.normalizePromoDrawBackgroundColor(
      this.promoDrawBgInputEl?.value,
      this.promoDrawBackgroundColor
    );
    this.promoDrawBackgroundColor = nextBackground;
    if (this.promoDrawBgInputEl && document.activeElement !== this.promoDrawBgInputEl) {
      this.promoDrawBgInputEl.value = nextBackground;
    }
    if (!this.promoDrawContext) {
      this.promoDrawContext = this.promoDrawCanvasEl.getContext("2d");
    }
    if (!this.promoDrawContext || this.promoDrawCanvasInitialized) {
      return;
    }
    this.paintPromoDrawCanvasBase(this.promoDrawBackgroundColor);
    this.promoDrawCanvasInitialized = true;
  }

  paintPromoDrawCanvasBase(backgroundColor = this.promoDrawBackgroundColor) {
    if (!this.promoDrawContext || !this.promoDrawCanvasEl) {
      return;
    }
    const safeBackground = this.normalizePromoDrawBackgroundColor(
      backgroundColor,
      this.promoDrawBackgroundColor
    );
    this.promoDrawBackgroundColor = safeBackground;
    const context = this.promoDrawContext;
    const canvas = this.promoDrawCanvasEl;
    context.fillStyle = safeBackground;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = "rgba(20, 28, 36, 0.72)";
    context.lineWidth = 6;
    context.strokeRect(0, 0, canvas.width, canvas.height);
  }

  getPromoDrawBackgroundRgb(colorValue) {
    const safeColor = this.normalizePromoDrawBackgroundColor(colorValue, this.promoDrawBackgroundColor);
    const r = Number.parseInt(safeColor.slice(1, 3), 16);
    const g = Number.parseInt(safeColor.slice(3, 5), 16);
    const b = Number.parseInt(safeColor.slice(5, 7), 16);
    return {
      r: Number.isFinite(r) ? r : 112,
      g: Number.isFinite(g) ? g : 119,
      b: Number.isFinite(b) ? b : 130
    };
  }

  applyPromoDrawBackgroundColor({ announce = false, applyToMedia = true } = {}) {
    this.initPromoDrawCanvasIfNeeded();
    if (!this.promoDrawContext || !this.promoDrawCanvasEl) {
      return;
    }
    const nextBackground = this.normalizePromoDrawBackgroundColor(
      this.promoDrawBgInputEl?.value,
      this.promoDrawBackgroundColor
    );
    const previousBackground = this.normalizePromoDrawBackgroundColor(this.promoDrawBackgroundColor, "#707782");
    if (this.promoDrawBgInputEl) {
      this.promoDrawBgInputEl.value = nextBackground;
    }
    this.promoDrawBackgroundColor = nextBackground;

    if (previousBackground !== nextBackground) {
      const context = this.promoDrawContext;
      const canvas = this.promoDrawCanvasEl;
      const from = this.getPromoDrawBackgroundRgb(previousBackground);
      const to = this.getPromoDrawBackgroundRgb(nextBackground);
      let replaced = false;
      try {
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        const pixels = imageData.data;
        for (let index = 0; index < pixels.length; index += 4) {
          if (
            pixels[index + 3] === 255 &&
            pixels[index] === from.r &&
            pixels[index + 1] === from.g &&
            pixels[index + 2] === from.b
          ) {
            pixels[index] = to.r;
            pixels[index + 1] = to.g;
            pixels[index + 2] = to.b;
            replaced = true;
          }
        }
        if (replaced) {
          context.putImageData(imageData, 0, 0);
          context.strokeStyle = "rgba(20, 28, 36, 0.72)";
          context.lineWidth = 6;
          context.strokeRect(0, 0, canvas.width, canvas.height);
        } else {
          this.paintPromoDrawCanvasBase(nextBackground);
        }
      } catch {
        this.paintPromoDrawCanvasBase(nextBackground);
      }
    }

    if (applyToMedia) {
      this.applyPromoDrawCanvasToMedia({ announce: false });
    }
    if (announce) {
      this.appendChatLine("", "캔버스 배경색을 변경했습니다.", "system");
    }
  }

  clearPromoDrawCanvas({ announce = false } = {}) {
    this.initPromoDrawCanvasIfNeeded();
    if (!this.promoDrawContext || !this.promoDrawCanvasEl) {
      return;
    }
    this.paintPromoDrawCanvasBase(this.promoDrawBackgroundColor);
    this.applyPromoDrawCanvasToMedia({ announce: false });
    if (announce) {
      this.appendChatLine("", "캔버스를 초기화했습니다.", "system");
    }
  }

  getPromoDrawCanvasPoint(clientX, clientY) {
    if (!this.promoDrawCanvasEl) {
      return null;
    }
    const rect = this.promoDrawCanvasEl.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return null;
    }
    const nx = (clientX - rect.left) / rect.width;
    const ny = (clientY - rect.top) / rect.height;
    return {
      x: THREE.MathUtils.clamp(nx, 0, 1) * this.promoDrawCanvasEl.width,
      y: THREE.MathUtils.clamp(ny, 0, 1) * this.promoDrawCanvasEl.height
    };
  }

  drawPromoCanvasSegment(fromX, fromY, toX, toY) {
    if (!this.promoDrawContext) {
      return;
    }
    const brushColor = String(this.promoDrawColorInputEl?.value ?? "#1a1a1a");
    const brushSize = THREE.MathUtils.clamp(Number(this.promoDrawSizeInputEl?.value) || 10, 2, 40);
    this.promoDrawContext.save();
    this.promoDrawContext.globalCompositeOperation = "source-over";
    this.promoDrawContext.strokeStyle = brushColor;
    this.promoDrawContext.lineWidth = brushSize;
    this.promoDrawContext.lineCap = "round";
    this.promoDrawContext.lineJoin = "round";
    this.promoDrawContext.beginPath();
    this.promoDrawContext.moveTo(fromX, fromY);
    this.promoDrawContext.lineTo(toX, toY);
    this.promoDrawContext.stroke();
    this.promoDrawContext.restore();
  }

  beginPromoDrawStrokeAt(clientX, clientY, pointerId) {
    if (!this.promoDrawCanvasEl || !this.promoPanelEl || this.promoPanelEl.classList.contains("hidden")) {
      return;
    }
    if (this.promoDrawColorInputEl?.disabled || this.promoDrawSizeInputEl?.disabled) {
      return;
    }
    this.initPromoDrawCanvasIfNeeded();
    const point = this.getPromoDrawCanvasPoint(clientX, clientY);
    if (!point) {
      return;
    }
    this.promoDrawDrawing = true;
    this.promoDrawPointerId = pointerId;
    this.promoDrawLastX = point.x;
    this.promoDrawLastY = point.y;
    this.promoDrawCanvasEl.setPointerCapture?.(pointerId);
    this.drawPromoCanvasSegment(point.x, point.y, point.x, point.y);
  }

  continuePromoDrawStrokeAt(clientX, clientY, pointerId) {
    if (!this.promoDrawDrawing || pointerId !== this.promoDrawPointerId) {
      return;
    }
    const point = this.getPromoDrawCanvasPoint(clientX, clientY);
    if (!point) {
      return;
    }
    this.drawPromoCanvasSegment(this.promoDrawLastX, this.promoDrawLastY, point.x, point.y);
    this.promoDrawLastX = point.x;
    this.promoDrawLastY = point.y;
  }

  endPromoDrawStroke(pointerId) {
    if (!this.promoDrawDrawing || pointerId !== this.promoDrawPointerId) {
      return;
    }
    this.promoDrawCanvasEl?.releasePointerCapture?.(pointerId);
    this.promoDrawDrawing = false;
    this.promoDrawPointerId = null;
    this.applyPromoDrawCanvasToMedia({ announce: false });
  }

  applyPromoDrawCanvasToMedia({ announce = false } = {}) {
    if (!this.promoDrawCanvasEl) {
      return;
    }
    let dataUrl = "";
    try {
      dataUrl = this.promoDrawCanvasEl.toDataURL("image/webp", 0.86);
    } catch {
      dataUrl = "";
    }
    if (!dataUrl || !dataUrl.startsWith("data:image/webp;base64,")) {
      return;
    }
    this.promoPendingMedia = {
      dataUrl,
      kind: "image",
      name: "promo-canvas.webp"
    };
    this.promoMediaRemoved = false;
    if (announce) {
      this.appendChatLine("", "캔버스 이미지를 미디어로 적용했습니다.", "system");
    }
    this.syncPromoPanelUi();
  }

  syncPromoPanelUi() {
    this.resolveUiElements();
    const promoPanelReady =
      !this.surfacePainterOpen &&
      !this.bootIntroVideoPlaying &&
      this.flowStage !== "portal_transfer" &&
      (this.nicknameGateEl?.classList.contains("hidden") ?? true) &&
      (this.npcChoiceGateEl?.classList.contains("hidden") ?? true);
    let mobilePanelVisible =
      this.mobileEnabled &&
      this.promoPanelMobileOpen &&
      !this.isMobilePortraitBlocked() &&
      !this.chatOpen &&
      promoPanelReady;
    if (this.mobileEnabled && this.promoPanelMobileOpen && !mobilePanelVisible) {
      this.promoPanelMobileOpen = false;
      mobilePanelVisible = false;
    }
    const desktopPanelVisible = !this.mobileEnabled && this.promoPanelDesktopOpen && promoPanelReady;
    const panelVisible = this.mobileEnabled ? mobilePanelVisible : desktopPanelVisible;
    if (this.promoPanelEl) {
      this.promoPanelEl.classList.toggle("hidden", !panelVisible);
      this.promoPanelEl.classList.toggle("mobile-fullscreen", Boolean(this.mobileEnabled && panelVisible));
    }
    if (this.promoPanelCloseBtnEl) {
      this.promoPanelCloseBtnEl.classList.toggle("hidden", !(this.mobileEnabled && panelVisible));
    }
    if (this.mobilePromoPlaceBtnEl) {
      this.mobilePromoPlaceBtnEl.classList.toggle("active", Boolean(this.mobileEnabled && panelVisible));
    }
    document.body.classList.toggle("promo-desktop-open", Boolean(desktopPanelVisible));

    const connected = Boolean(this.socket && this.networkConnected);
    const busy = this.promoSetInFlight || this.promoRemoveInFlight;
    const own = this.getOwnPromoObject();
    const hasOwnPromo = Boolean(own);
    const previewActive = this.promoPlacementPreviewActive && !hasOwnPromo;
    const previewScale = THREE.MathUtils.clamp(
      Number(this.promoPlacementPreviewCurrentScale) ||
        Number(this.promoScaleInputEl?.value) ||
        PROMO_DEFAULT_SCALE,
      PROMO_MIN_SCALE,
      PROMO_MAX_SCALE
    );
    const panelScaleValue = THREE.MathUtils.clamp(
      Number(this.promoScaleInputEl?.value) || PROMO_DEFAULT_SCALE,
      PROMO_MIN_SCALE,
      PROMO_MAX_SCALE
    );
    const scaleValue = hasOwnPromo
      ? THREE.MathUtils.clamp(Number(own?.scale) || PROMO_DEFAULT_SCALE, PROMO_MIN_SCALE, PROMO_MAX_SCALE)
      : previewActive
        ? previewScale
        : panelScaleValue;
    const allowOthersDrawValue = typeof this.promoAllowOthersDrawDraft === "boolean"
      ? this.promoAllowOthersDrawDraft
      : Boolean(own?.allowOthersDraw);
    const lockOthersEditValue = this.isPromoEditLockEnabled(allowOthersDrawValue);
    const showPromoLockControl = Boolean(this.isHostEntryLink);
    const ownKind = this.normalizePromoKind(own?.kind ?? "block", "block");
    const linkValue = own?.linkUrl ?? "";
    const placeBtnLabel = previewActive ? "배치 확정" : "앞에 배치+저장";
    const mobilePromoLabel = previewActive ? "확정" : "배치";
    const prefersTouchUi =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(hover: none) and (pointer: coarse)").matches;
    const galleryFirstMode = Boolean(this.mobileEnabled || prefersTouchUi);
    const folderPickerSupported = Boolean(
      this.promoMediaFolderInputEl &&
      ("webkitdirectory" in this.promoMediaFolderInputEl ||
        this.promoMediaFolderInputEl.hasAttribute("webkitdirectory"))
    );
    const showFolderPicker = folderPickerSupported && !galleryFirstMode;

    if (this.promoMediaPickBtnEl) {
      this.promoMediaPickBtnEl.textContent = galleryFirstMode ? "갤러리 선택" : "파일/갤러리 선택";
    }
    if (this.promoMediaFolderBtnEl) {
      this.promoMediaFolderBtnEl.classList.toggle("hidden", !showFolderPicker);
    }
    if (this.promoMediaHelpEl) {
      if (galleryFirstMode) {
        this.promoMediaHelpEl.textContent = "모바일은 갤러리에서 선택 후 저장";
      } else if (showFolderPicker) {
        this.promoMediaHelpEl.textContent = "PC는 파일/폴더 선택 가능";
      } else {
        this.promoMediaHelpEl.textContent = "파일에서 이미지/영상 선택 후 저장";
      }
    }
    if (this.promoDrawHelpEl) {
      this.promoDrawHelpEl.textContent = "네모 캔버스에 그리면 오브젝트 화면으로 저장됩니다";
    }
    if (this.promoPlaceBtnEl) {
      this.promoPlaceBtnEl.classList.toggle("hidden", hasOwnPromo);
      this.promoPlaceBtnEl.textContent = placeBtnLabel;
    }
    if (this.mobilePromoPlaceBtnEl) {
      this.mobilePromoPlaceBtnEl.classList.toggle("hidden", hasOwnPromo);
      this.mobilePromoPlaceBtnEl.textContent = mobilePromoLabel;
    }
    if (this.promoRemoveBtnEl) {
      this.promoRemoveBtnEl.textContent = "철거";
    }
    if (panelVisible) {
      this.initPromoDrawCanvasIfNeeded();
    }

    if (this.promoScaleInputEl && document.activeElement !== this.promoScaleInputEl) {
      this.promoScaleInputEl.value = String(scaleValue.toFixed(2));
    }
    if (this.promoScaleValueEl) {
      const currentScale = Number(this.promoScaleInputEl?.value);
      const safeScale = Number.isFinite(currentScale) ? currentScale : scaleValue;
      this.promoScaleValueEl.textContent = `${safeScale.toFixed(2)}x`;
    }
    if (this.mobilePromoScaleInputEl && document.activeElement !== this.mobilePromoScaleInputEl) {
      this.mobilePromoScaleInputEl.value = String(scaleValue.toFixed(2));
    }
    if (this.mobilePromoScaleValueEl) {
      const currentMobileScale = Number(this.mobilePromoScaleInputEl?.value);
      const safeMobileScale = Number.isFinite(currentMobileScale) ? currentMobileScale : scaleValue;
      this.mobilePromoScaleValueEl.textContent = `${safeMobileScale.toFixed(2)}x`;
    }
    if (this.promoLinkInputEl && document.activeElement !== this.promoLinkInputEl) {
      this.promoLinkInputEl.value = linkValue;
    }
    if (this.promoAllowOthersDrawRowEl) {
      this.promoAllowOthersDrawRowEl.classList.toggle("hidden", !showPromoLockControl);
    }
    const promoAllowOthersDrawCheckWrap = this.promoAllowOthersDrawEl?.closest?.(".promo-panel-check");
    if (promoAllowOthersDrawCheckWrap) {
      promoAllowOthersDrawCheckWrap.classList.toggle("active", lockOthersEditValue);
      promoAllowOthersDrawCheckWrap.title = this.getPromoEditLockStatusText(allowOthersDrawValue);
    }
    if (this.promoAllowOthersDrawStatusEl) {
      this.promoAllowOthersDrawStatusEl.textContent = lockOthersEditValue
        ? "현재: 다른사람 수정 금지"
        : "현재: 다른사람 수정 허용";
    }
    if (this.promoAllowOthersDrawEl && document.activeElement !== this.promoAllowOthersDrawEl) {
      this.promoAllowOthersDrawEl.checked = lockOthersEditValue;
    }
    if (this.promoTypeSelectEl && document.activeElement !== this.promoTypeSelectEl) {
      const selectedType = this.normalizePromoKind(this.promoTypeSelectEl.value, ownKind);
      this.promoTypeSelectEl.value = hasOwnPromo ? ownKind : selectedType;
    }
    if (this.promoDrawBgInputEl && document.activeElement !== this.promoDrawBgInputEl) {
      this.promoDrawBgInputEl.value = this.normalizePromoDrawBackgroundColor(
        this.promoDrawBackgroundColor,
        "#707782"
      );
    }
    if (this.promoMediaNameEl) {
      if (this.promoPendingMedia?.dataUrl) {
        this.promoMediaNameEl.textContent = `선택됨: ${this.promoPendingMedia.name || "미디어"}`;
      } else if (this.promoMediaRemoved) {
        this.promoMediaNameEl.textContent = "저장 시 미디어가 제거됩니다";
      } else if (own?.mediaDataUrl) {
        this.promoMediaNameEl.textContent =
          own.mediaKind === "image" ? "저장된 이미지 사용 중" : "저장된 영상 사용 중";
      } else {
        this.promoMediaNameEl.textContent = "선택된 미디어 없음";
      }
    }
    const previewDataUrl = this.promoPendingMedia?.dataUrl
      ? this.promoPendingMedia.dataUrl
      : this.promoMediaRemoved
        ? ""
        : own?.mediaDataUrl ?? "";
    const previewKind = previewDataUrl
      ? (/^data:image\//i.test(previewDataUrl) ? "image" : /^data:video\//i.test(previewDataUrl) ? "video" : "")
      : "";
    if (this.promoMediaPreviewEl) {
      this.promoMediaPreviewEl.classList.toggle("hidden", !previewKind);
    }
    if (this.promoMediaPreviewImageEl) {
      const showImage = previewKind === "image";
      this.promoMediaPreviewImageEl.classList.toggle("hidden", !showImage);
      if (showImage) {
        if (this.promoMediaPreviewImageEl.src !== previewDataUrl) {
          this.promoMediaPreviewImageEl.src = previewDataUrl;
        }
      } else {
        this.promoMediaPreviewImageEl.removeAttribute("src");
      }
    }
    if (this.promoMediaPreviewVideoEl) {
      const showVideo = previewKind === "video";
      this.promoMediaPreviewVideoEl.classList.toggle("hidden", !showVideo);
      if (showVideo) {
        if (this.promoMediaPreviewVideoEl.src !== previewDataUrl) {
          this.promoMediaPreviewVideoEl.src = previewDataUrl;
          this.promoMediaPreviewVideoEl.currentTime = 0;
        }
        this.promoMediaPreviewVideoEl.play().catch(() => {});
      } else {
        try {
          this.promoMediaPreviewVideoEl.pause();
        } catch {
          // ignore pause errors
        }
        this.promoMediaPreviewVideoEl.removeAttribute("src");
      }
    }

    const promoActionBlockedReason = this.getPromoActionBlockedReason();
    const disabled = !connected || busy || Boolean(promoActionBlockedReason);
    this.promoScaleInputEl && (this.promoScaleInputEl.disabled = disabled);
    this.promoTypeSelectEl && (this.promoTypeSelectEl.disabled = disabled);
    this.promoLinkInputEl && (this.promoLinkInputEl.disabled = disabled);
    this.promoAllowOthersDrawEl && (this.promoAllowOthersDrawEl.disabled = disabled || !showPromoLockControl);
    this.promoDrawColorInputEl && (this.promoDrawColorInputEl.disabled = disabled);
    this.promoDrawBgInputEl && (this.promoDrawBgInputEl.disabled = disabled);
    this.promoDrawSizeInputEl && (this.promoDrawSizeInputEl.disabled = disabled);
    this.promoDrawClearBtnEl && (this.promoDrawClearBtnEl.disabled = disabled);
    this.promoDrawApplyBtnEl && (this.promoDrawApplyBtnEl.disabled = disabled);
    this.promoMediaPickBtnEl && (this.promoMediaPickBtnEl.disabled = disabled);
    this.promoMediaFolderBtnEl && (this.promoMediaFolderBtnEl.disabled = disabled || !showFolderPicker);
    this.promoMediaClearBtnEl && (this.promoMediaClearBtnEl.disabled = disabled);
    this.promoPlaceBtnEl && (this.promoPlaceBtnEl.disabled = disabled);
    this.promoSaveBtnEl && (this.promoSaveBtnEl.disabled = disabled);
    this.promoRemoveBtnEl && (this.promoRemoveBtnEl.disabled = disabled);

    if (!connected) {
      this.setPromoPanelStatus("서버 연결 후 사용 가능");
    } else if (busy) {
      this.setPromoPanelStatus("홍보 오브젝트 동기화 중...");
    } else if (promoActionBlockedReason) {
      this.setPromoPanelStatus(promoActionBlockedReason);
    } else if (previewActive) {
      const blockReasonMessage = this.getPromoPlacementBlockReasonMessage(
        this.promoPlacementPreviewBlockReason
      );
      if (blockReasonMessage) {
        this.setPromoPanelStatus(`배치 불가: ${blockReasonMessage}`);
      } else {
        this.setPromoPanelStatus("배치 미리보기 중 · 휠/크기 조절 후 배치 확정");
      }
    } else if (own) {
      this.setPromoPanelStatus("내 오브젝트 배치됨 · Y로 위치 이동 · 가까이서 수정 가능");
    } else {
      this.setPromoPanelStatus("내 오브젝트 없음 · Y로 배치");
    }
  }

  async loadPromoMediaFromFile(file) {
    if (!file) {
      return;
    }
    const type = String(file.type ?? "").toLowerCase();
    const fileName = String(file.name ?? "").toLowerCase();
    const isWebp = type === "image/webp" || fileName.endsWith(".webp");
    if (!isWebp) {
      this.appendChatLine("", "WEBP 파일만 지원합니다.", "system");
      return;
    }
    if (Number(file.size) > PROMO_MAX_MEDIA_BYTES) {
      this.appendChatLine("", "미디어 파일이 너무 큽니다. 6MB 이하로 선택하세요.", "system");
      return;
    }

    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(new Error("file_read_failed"));
      reader.readAsDataURL(file);
    }).catch(() => "");

    if (!dataUrl || !/^data:image\/webp;base64,/i.test(dataUrl)) {
      this.appendChatLine("", "미디어 파일을 읽지 못했습니다.", "system");
      return;
    }
    this.promoPendingMedia = {
      dataUrl,
      kind: "image",
      name: String(file.name ?? "").trim()
    };
    this.promoMediaRemoved = false;
    this.syncPromoPanelUi();
  }

  clearPromoPendingMedia() {
    this.promoPendingMedia = {
      dataUrl: "",
      kind: "none",
      name: ""
    };
    this.promoMediaRemoved = true;
    this.syncPromoPanelUi();
  }

  getPromoPlacementTransform() {
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    dir.y = 0;
    if (dir.lengthSq() < 0.001) {
      dir.set(0, 0, -1);
    }
    dir.normalize();
    const pos = this.playerPosition.clone().addScaledVector(dir, 4.8);
    const yaw = this.normalizePromoYaw(Math.atan2(-dir.x, -dir.z), 0);
    return {
      x: Math.round(pos.x * 2) / 2,
      y: Math.round((this.playerPosition.y - GAME_CONSTANTS.PLAYER_HEIGHT) * 2) / 2,
      z: Math.round(pos.z * 2) / 2,
      yaw: Math.round(yaw * 10000) / 10000
    };
  }

  getPromoCenterPlacementTransform() {
    const centerX = Math.round((Number(this.citySpawn?.x) || 0) * 2) / 2;
    const centerZ = Math.round(((Number(this.citySpawn?.z) || -8) + 4) * 2) / 2;
    const baseY = Number(this.citySpawn?.y);
    const groundY = Number.isFinite(baseY)
      ? baseY - GAME_CONSTANTS.PLAYER_HEIGHT
      : this.playerPosition.y - GAME_CONSTANTS.PLAYER_HEIGHT;
    const centerPosition = { x: centerX, z: centerZ };
    const yaw = this.normalizePromoYaw(this.getLookYaw(centerPosition, this.playerPosition), 0);
    return {
      x: centerX,
      y: Math.round(groundY * 2) / 2,
      z: centerZ,
      yaw: Math.round(yaw * 10000) / 10000
    };
  }

  getPromoPlacementBlockReason(position, scaleOverride = null) {
    const x = Number(position?.x);
    const z = Number(position?.z);
    if (!Number.isFinite(x) || !Number.isFinite(z)) {
      return "";
    }
    const resolvedScale = THREE.MathUtils.clamp(
      Number(scaleOverride ?? position?.scale ?? this.promoPlacementPreviewCurrentScale ?? this.promoScaleInputEl?.value) ||
        PROMO_DEFAULT_SCALE,
      PROMO_MIN_SCALE,
      PROMO_MAX_SCALE
    );
    const footprintRadius = Math.max(0.7, PROMO_BLOCK_BASE_RADIUS * resolvedScale);

    const spawnCenterX = Number(this.bridgeApproachSpawn?.x) || 0;
    const spawnCenterZ = Number(this.bridgeApproachSpawn?.z) || -98;
    const spawnRadius = Math.max(10, Number(this.bridgeWidth) * 0.95 + 4) + footprintRadius;
    const spawnDx = x - spawnCenterX;
    const spawnDz = z - spawnCenterZ;
    if (spawnDx * spawnDx + spawnDz * spawnDz <= spawnRadius * spawnRadius) {
      return "spawn";
    }

    const ax = Number(this.bridgeSpawn?.x) || 0;
    const az = Number(this.bridgeSpawn?.z) || -86;
    const bx = Number(this.bridgeCityEntry?.x) || 0;
    const bz = Number(this.bridgeCityEntry?.z) || -18;
    const abx = bx - ax;
    const abz = bz - az;
    const abLenSq = abx * abx + abz * abz;
    if (abLenSq > 0.001) {
      const apx = x - ax;
      const apz = z - az;
      const rawT = (apx * abx + apz * abz) / abLenSq;
      const bridgeEdgeMargin = Math.max(0.08, footprintRadius / Math.sqrt(abLenSq));
      if (rawT >= -bridgeEdgeMargin && rawT <= 1 + bridgeEdgeMargin) {
        const t = THREE.MathUtils.clamp(rawT, 0, 1);
        const nearestX = ax + abx * t;
        const nearestZ = az + abz * t;
        const lateralDx = x - nearestX;
        const lateralDz = z - nearestZ;
        const bridgeHalfWidth = Math.max(4.8, Number(this.bridgeWidth) * 0.6 + 1.5) + footprintRadius;
        if (lateralDx * lateralDx + lateralDz * lateralDz <= bridgeHalfWidth * bridgeHalfWidth) {
          return "bridge";
        }
      }
    }

    const portalZones = [
      {
        center: this.portalFloorPosition,
        radius: Math.max(4.6, (Number(this.portalRadius) || 4.4) + PROMO_BLOCKED_PORTAL_RADIUS_PADDING)
      },
      {
        center: this.aZonePortalFloorPosition,
        radius: Math.max(4.6, (Number(this.aZonePortalRadius) || 4.2) + PROMO_BLOCKED_PORTAL_RADIUS_PADDING)
      },
      {
        center: this.hallPortalFloorPosition,
        radius: Math.max(4.4, (Number(this.hallPortalRadius) || 4.0) + PROMO_BLOCKED_PORTAL_RADIUS_PADDING)
      }
    ];
    for (const zone of portalZones) {
      const portalX = Number(zone.center?.x);
      const portalZ = Number(zone.center?.z);
      if (!Number.isFinite(portalX) || !Number.isFinite(portalZ)) {
        continue;
      }
      const dx = x - portalX;
      const dz = z - portalZ;
      const radius = Math.max(1.8, Number(zone.radius) || 0) + footprintRadius;
      if (dx * dx + dz * dz <= radius * radius) {
        return "portal";
      }
    }

    const centerX = Number(this.citySpawn?.x) || 0;
    const centerZ = (Number(this.citySpawn?.z) || -8) + 8;
    const centerDx = x - centerX;
    const centerDz = z - centerZ;
    const centerRadius = PROMO_BLOCKED_CENTER_RADIUS + footprintRadius;
    if (centerDx * centerDx + centerDz * centerDz <= centerRadius * centerRadius) {
      return "center";
    }

    return "";
  }

  getPromoPlacementBlockReasonMessage(blockReason = "") {
    const reason = String(blockReason ?? "").trim().toLowerCase();
    if (reason === "land") {
      return "홍보 오브젝트는 바다 구역에서만 배치할 수 있습니다.";
    }
    if (reason === "spawn" || reason === "bridge" || reason === "portal" || reason === "center") {
      return PLAYER_PLACEABLE_BLOCKED_MESSAGE;
    }
    return "";
  }

  getPromoPlacementBlockReasonFromServerError(rawErrorText = "") {
    const errorText = String(rawErrorText ?? "").trim().toLowerCase();
    if (!errorText) {
      return "";
    }
    if (errorText === "placement blocked at spawn") {
      return "spawn";
    }
    if (errorText === "placement blocked on bridge") {
      return "bridge";
    }
    if (errorText === "placement blocked at portal") {
      return "portal";
    }
    if (errorText === "placement blocked at center") {
      return "center";
    }
    if (errorText === "placement blocked on land") {
      return "land";
    }
    return "";
  }

  ensurePromoPlacementPreviewMesh() {
    if (this.promoPlacementPreviewMesh) {
      return this.promoPlacementPreviewMesh;
    }

    const bodyWidth = PROMO_BLOCK_WIDTH;
    const bodyHeight = PROMO_BLOCK_HEIGHT;
    const bodyDepth = PROMO_BLOCK_DEPTH;

    const group = new THREE.Group();
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: PLAYER_PLACEABLE_BLOCK_BASE_COLOR,
      emissive: PLAYER_PLACEABLE_BLOCK_EMISSIVE_COLOR,
      emissiveIntensity: 0.08,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
      roughness: 0.56,
      metalness: 0.06
    });
    const body = new THREE.Mesh(new THREE.BoxGeometry(bodyWidth, bodyHeight, bodyDepth), bodyMaterial);
    body.renderOrder = 26;
    body.castShadow = false;
    body.receiveShadow = false;

    const edgeMaterial = new THREE.LineBasicMaterial({
      color: PLAYER_PLACEABLE_BLOCK_EDGE_COLOR,
      transparent: true,
      opacity: 0.95,
      toneMapped: false
    });
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(bodyWidth, bodyHeight, bodyDepth)),
      edgeMaterial
    );
    edges.renderOrder = 28;

    group.add(body, edges);
    group.visible = false;
    group.userData.previewBodyMaterial = bodyMaterial;
    group.userData.previewEdgeMaterial = edgeMaterial;
    this.scene.add(group);
    this.promoPlacementPreviewMesh = group;
    this.promoPlacementPreviewCurrentScale = PROMO_DEFAULT_SCALE;
    return group;
  }

  setPromoPlacementPreviewTint(blocked = false) {
    const preview = this.promoPlacementPreviewMesh;
    if (!preview) {
      return;
    }
    const bodyMaterial = preview.userData.previewBodyMaterial;
    const edgeMaterial = preview.userData.previewEdgeMaterial;
    const baseColor = blocked ? 0xff5f72 : PLAYER_PLACEABLE_BLOCK_BASE_COLOR;
    const emissiveColor = blocked ? 0x5a1722 : PLAYER_PLACEABLE_BLOCK_EMISSIVE_COLOR;
    const edgeColor = blocked ? 0xffd2d8 : PLAYER_PLACEABLE_BLOCK_EDGE_COLOR;

    bodyMaterial?.color?.setHex?.(baseColor);
    bodyMaterial?.emissive?.setHex?.(emissiveColor);
    edgeMaterial?.color?.setHex?.(edgeColor);
  }

  clearPromoPlacementPreview({ syncUi = true } = {}) {
    this.promoPlacementPreviewActive = false;
    this.promoPlacementPreviewBlockReason = "";
    this.promoPlacementPreviewTransform = null;
    if (this.promoPlacementPreviewMesh) {
      this.promoPlacementPreviewMesh.visible = false;
    }
    if (syncUi) {
      this.syncPromoPanelUi();
      if (this.mobileEnabled) {
        this.syncMobileUiState();
      }
    }
  }

  updatePromoPlacementPreview() {
    if (!this.promoPlacementPreviewActive) {
      if (this.promoPlacementPreviewMesh) {
        this.promoPlacementPreviewMesh.visible = false;
      }
      return;
    }
    if (!(this.socket && this.networkConnected)) {
      this.clearPromoPlacementPreview({ syncUi: true });
      return;
    }
    if (this.getOwnPromoObject()) {
      this.clearPromoPlacementPreview({ syncUi: true });
      return;
    }

    const preview = this.ensurePromoPlacementPreviewMesh();
    const transform = this.getPromoPlacementTransform();
    const scale = THREE.MathUtils.clamp(
      Number(this.promoScaleInputEl?.value) || PROMO_DEFAULT_SCALE,
      PROMO_MIN_SCALE,
      PROMO_MAX_SCALE
    );
    const blockReason = this.getPromoPlacementBlockReason(transform, scale);
    this.promoPlacementPreviewCurrentScale = scale;
    this.promoPlacementPreviewBlockReason = blockReason;
    this.promoPlacementPreviewTransform = transform;

    const bodyHeight = PROMO_BLOCK_HEIGHT * scale;
    preview.position.set(transform.x, transform.y + bodyHeight * 0.5, transform.z);
    preview.rotation.set(0, this.normalizePromoYaw(transform.yaw, 0), 0);
    preview.scale.set(scale, scale, scale);
    preview.visible = true;
    this.setPromoPlacementPreviewTint(Boolean(blockReason));
  }

  beginPromoPlacementPreview({ announce = true, syncUi = true } = {}) {
    if (this.getOwnPromoObject()) {
      return false;
    }
    const policyBlockedReason = this.getPromoActionBlockedReason();
    if (policyBlockedReason) {
      if (announce) {
        this.appendChatLine("", policyBlockedReason, "system");
      }
      if (syncUi) {
        this.syncPromoPanelUi();
      }
      return false;
    }
    if (this.hostCustomBlockPlacementPreviewActive) {
      this.clearHostCustomBlockPlacementPreview({ syncUi: true });
    }
    if (this.promoPlacementPreviewActive) {
      return true;
    }
    this.promoPlacementPreviewActive = true;
    this.promoPlacementPreviewBlockReason = "";
    this.promoPlacementPreviewTransform = null;
    this.ensurePromoPlacementPreviewMesh();
    this.updatePromoPlacementPreview();
    if (syncUi) {
      this.syncPromoPanelUi();
      if (this.mobileEnabled) {
        this.syncMobileUiState();
      }
    }
    if (announce) {
      this.appendChatLine(
        "",
        "배치 미리보기 시작: 휠(PC)/크기 슬라이더(모바일) 조절 후 클릭 또는 배치 버튼으로 확정",
        "system"
      );
    }
    return true;
  }

  applyAZonePortalTargetUpdate(rawTarget) {
    const normalized = this.normalizePortalTargetUrl(rawTarget, "");
    if (!normalized || normalized === this.aZonePortalTargetUrl) {
      if (normalized && normalized === this.hostAZonePortalTargetCandidate) {
        this.hostAZonePortalTargetSynced = true;
      }
      return false;
    }

    this.aZonePortalTargetUrl = normalized;
    if (normalized === this.hostAZonePortalTargetCandidate) {
      this.hostAZonePortalTargetSynced = true;
    }
    this.schedulePortalPrewarm({ immediate: true });
    return true;
  }

  confirmPromoPlacementPreview() {
    if (!this.promoPlacementPreviewActive) {
      return false;
    }
    this.updatePromoPlacementPreview();
    const blockReason = this.promoPlacementPreviewBlockReason;
    if (blockReason) {
      const message =
        this.getPromoPlacementBlockReasonMessage(blockReason) || PLAYER_PLACEABLE_BLOCKED_MESSAGE;
      if (message) {
        this.appendChatLine("", message, "system");
      }
      this.syncPromoPanelUi();
      return true;
    }
    const transform = this.promoPlacementPreviewTransform ?? this.getPromoPlacementTransform();
    const scale = THREE.MathUtils.clamp(
      Number(this.promoPlacementPreviewCurrentScale) ||
        Number(this.promoScaleInputEl?.value) ||
        PROMO_DEFAULT_SCALE,
      PROMO_MIN_SCALE,
      PROMO_MAX_SCALE
    );
    this.clearPromoPlacementPreview({ syncUi: true });
    this.requestPromoUpsert({
      placeInFront: false,
      preserveExistingStyle: true,
      scaleOverride: scale,
      transformOverride: transform,
      skipPlacementPreview: true
    });
    return true;
  }

  adjustPromoPlacementPreviewScale(delta = 0) {
    if (!this.promoScaleInputEl) {
      return;
    }
    const step = Number(delta);
    if (!Number.isFinite(step) || Math.abs(step) < 0.0001) {
      return;
    }
    const current = THREE.MathUtils.clamp(
      Number(this.promoScaleInputEl.value) ||
        this.promoPlacementPreviewCurrentScale ||
        PROMO_DEFAULT_SCALE,
      PROMO_MIN_SCALE,
      PROMO_MAX_SCALE
    );
    const next = THREE.MathUtils.clamp(current + step, PROMO_MIN_SCALE, PROMO_MAX_SCALE);
    if (Math.abs(next - current) < 0.0001) {
      return;
    }
    this.promoScaleInputEl.value = next.toFixed(2);
    if (this.promoScaleValueEl) {
      this.promoScaleValueEl.textContent = `${next.toFixed(2)}x`;
    }
    this.promoPlacementPreviewCurrentScale = next;
    this.updatePromoPlacementPreview();
  }

  requestPlatformState() {
    if (!(this.socket && this.networkConnected)) {
      return;
    }
    this.socket.emit("platform:state:request");
  }

  requestRopeState() {
    if (!(this.socket && this.networkConnected)) {
      return;
    }
    this.socket.emit("rope:state:request");
  }

  requestObjectState() {
    if (!(this.socket && this.networkConnected)) {
      return;
    }
    this.socket.emit("object:state:request");
  }

  requestPromoState() {
    if (!(this.socket && this.networkConnected)) {
      return;
    }
    this.socket.emit("promo:state:request");
  }

  requestPromoUpsert({
    placeInFront = false,
    placeAtCenter = false,
    preserveExistingStyle = false,
    scaleOverride = null,
    transformOverride = null,
    allowOthersDrawOverride = null,
    skipPlacementPreview = false,
    successNotice = "",
    retryOnMissingOwn = true
  } = {}) {
    if (!(this.socket && this.networkConnected)) {
      this.appendChatLine("", "서버 연결 후 다시 시도하세요.", "system");
      return;
    }
    const policyBlockedReason = this.getPromoActionBlockedReason();
    if (policyBlockedReason) {
      this.appendChatLine("", policyBlockedReason, "system");
      this.syncPromoPanelUi();
      return;
    }
    if (this.promoSetInFlight) {
      return;
    }

    let own = this.getOwnPromoObject();
    if (!own && preserveExistingStyle) {
      const surfaceTarget = this.getSurfacePainterPromoTarget();
      const targetOwnerKey = String(surfaceTarget?.ownerKey ?? "").trim();
      if (targetOwnerKey && targetOwnerKey === String(this.promoOwnerKey ?? "")) {
        own = surfaceTarget;
      }
    }
    const hasExplicitTransformOverride =
      Boolean(transformOverride) && typeof transformOverride === "object";
    const canCreateWithoutOwn =
      Boolean(placeInFront) || Boolean(placeAtCenter) || hasExplicitTransformOverride;
    if (!own && preserveExistingStyle && !canCreateWithoutOwn) {
      if (retryOnMissingOwn) {
        this.requestPromoState();
        window.setTimeout(() => {
          this.requestPromoUpsert({
            placeInFront,
            placeAtCenter,
            preserveExistingStyle,
            scaleOverride,
            transformOverride,
            allowOthersDrawOverride,
            skipPlacementPreview,
            successNotice,
            retryOnMissingOwn: false
          });
        }, 180);
        return;
      }
      this.appendChatLine("", "오브젝트 상태 동기화가 지연되고 있습니다. 다시 시도해주세요.", "system");
      this.requestPromoState();
      return;
    }
    if (!own && placeInFront && !placeAtCenter && !skipPlacementPreview) {
      if (!this.promoPlacementPreviewActive) {
        this.beginPromoPlacementPreview();
      } else {
        this.confirmPromoPlacementPreview();
      }
      return;
    }
    if (own && this.promoPlacementPreviewActive) {
      this.clearPromoPlacementPreview({ syncUi: false });
    }

    let transform = null;
    if (transformOverride && typeof transformOverride === "object") {
      transform = {
        x: Number(transformOverride.x),
        y: Number(transformOverride.y),
        z: Number(transformOverride.z),
        yaw: this.normalizePromoYaw(transformOverride.yaw, 0)
      };
    } else if (placeAtCenter) {
      transform = this.getPromoCenterPlacementTransform();
    } else if (placeInFront || !own) {
      transform = this.getPromoPlacementTransform();
    } else {
      transform = {
        x: own.x,
        y: own.y,
        z: own.z,
        yaw: this.normalizePromoYaw(own.yaw, 0)
      };
    }
    const scaleOverrideValue = Number(scaleOverride);
    const hasScaleOverride = Number.isFinite(scaleOverrideValue);
    const previewScaleRaw = hasScaleOverride
      ? scaleOverrideValue
      : Number(this.promoScaleInputEl?.value) || Number(own?.scale) || PROMO_DEFAULT_SCALE;
    const previewScale = THREE.MathUtils.clamp(previewScaleRaw, PROMO_MIN_SCALE, PROMO_MAX_SCALE);
    const blockReason = this.getPromoPlacementBlockReason(transform, previewScale);
    const hasPositionChange =
      !own ||
      Math.abs(Number(transform.x) - Number(own.x)) > 0.001 ||
      Math.abs(Number(transform.z) - Number(own.z)) > 0.001;
    const hasScaleChange = !own || Math.abs(previewScale - (Number(own?.scale) || PROMO_DEFAULT_SCALE)) > 0.001;
    if (blockReason && (hasPositionChange || hasScaleChange)) {
      const reasonMessage =
        this.getPromoPlacementBlockReasonMessage(blockReason) || PLAYER_PLACEABLE_BLOCKED_MESSAGE;
      this.appendChatLine("", reasonMessage, "system");
      return;
    }
    const usePanelValues = !(preserveExistingStyle && own);
    const scaleRaw = hasScaleOverride
      ? scaleOverrideValue
      : usePanelValues
        ? Number(this.promoScaleInputEl?.value)
        : Number(own?.scale);
    const scale = THREE.MathUtils.clamp(
      Number.isFinite(scaleRaw) ? scaleRaw : own?.scale ?? PROMO_DEFAULT_SCALE,
      PROMO_MIN_SCALE,
      PROMO_MAX_SCALE
    );
    const kind = usePanelValues
      ? this.normalizePromoKind(this.promoTypeSelectEl?.value ?? own?.kind ?? "block", own?.kind ?? "block")
      : this.normalizePromoKind(own?.kind ?? "block", "block");

    let linkUrl = this.normalizePromoLinkUrl(this.promoLinkInputEl?.value ?? own?.linkUrl ?? "");
    if (!usePanelValues && own) {
      linkUrl = this.normalizePromoLinkUrl(own.linkUrl ?? "");
    }

    const draftAllowOthersDraw = typeof this.promoAllowOthersDrawDraft === "boolean"
      ? this.promoAllowOthersDrawDraft
      : Boolean(this.promoAllowOthersDrawEl?.checked);
    const allowOthersDraw = typeof allowOthersDrawOverride === "boolean"
      ? allowOthersDrawOverride
      : usePanelValues
        ? draftAllowOthersDraw
        : Boolean(own?.allowOthersDraw);
    if (typeof allowOthersDrawOverride === "boolean" || usePanelValues) {
      this.promoAllowOthersDrawDraft = allowOthersDraw;
    }

    let mediaDataUrl = "";
    if (this.promoMediaRemoved) {
      mediaDataUrl = "";
    } else if (this.promoPendingMedia?.dataUrl) {
      mediaDataUrl = this.promoPendingMedia.dataUrl;
    } else if (own?.mediaDataUrl) {
      mediaDataUrl = own.mediaDataUrl;
    }

    this.promoSetInFlight = true;
    this.syncPromoPanelUi();
    this.socket.emit(
      "promo:upsert",
      {
        x: transform.x,
        y: transform.y,
        z: transform.z,
        yaw: this.normalizePromoYaw(transform.yaw, 0),
        kind,
        scale,
        linkUrl,
        mediaDataUrl,
        allowOthersDraw,
        forceFlush: true
      },
      (response = {}) => {
        this.promoSetInFlight = false;
        if (!response?.ok) {
          const errorText = String(response?.error ?? "unknown");
          this.appendChatLine("", this.getPromoActionErrorMessage(errorText, "저장"), "system");
          this.syncPromoPanelUi();
          return;
        }
        this.promoPendingMedia = {
          dataUrl: "",
          kind: "none",
          name: ""
        };
        this.promoMediaRemoved = false;
        this.requestPromoState();
        if (successNotice) {
          this.appendChatLine("", String(successNotice), "system");
        }
        this.syncPromoPanelUi();
      }
    );
  }

  requestPromoRemove({ startPlacementPreviewOnSuccess = false } = {}) {
    if (!(this.socket && this.networkConnected)) {
      this.appendChatLine("", "서버 연결 후 다시 시도하세요.", "system");
      return;
    }
    const policyBlockedReason = this.getPromoActionBlockedReason();
    if (policyBlockedReason) {
      this.appendChatLine("", policyBlockedReason, "system");
      this.syncPromoPanelUi();
      return;
    }
    if (this.promoRemoveInFlight) {
      return;
    }
    this.promoRemoveInFlight = true;
    this.syncPromoPanelUi();
    this.socket.emit("promo:remove", { forceFlush: true }, (response = {}) => {
      this.promoRemoveInFlight = false;
      if (!response?.ok) {
        const errorText = String(response?.error ?? "unknown");
        this.appendChatLine("", this.getPromoActionErrorMessage(errorText, "삭제"), "system");
        this.syncPromoPanelUi();
        return;
      }
      this.promoPendingMedia = {
        dataUrl: "",
        kind: "none",
        name: ""
      };
      this.promoMediaRemoved = false;
      const ownOwnerKey = String(this.promoOwnerKey ?? "").trim();
      if (ownOwnerKey) {
        this.disposePromoObjectVisual(ownOwnerKey);
        this.promoObjects.delete(ownOwnerKey);
      }
      this.rebuildPromoCollisionBoxes();
      this.requestPromoState();
      if (startPlacementPreviewOnSuccess) {
        const started = this.beginPromoPlacementPreview({ announce: true, syncUi: true });
        if (!started) {
          window.setTimeout(() => {
            this.beginPromoPlacementPreview({ announce: false, syncUi: true });
          }, 180);
        }
      }
      this.syncPromoPanelUi();
    });
  }

  disposePromoObjectVisual(ownerKey) {
    const key = String(ownerKey ?? "").trim();
    if (!key) {
      return;
    }
    const visual = this.promoObjectVisuals.get(key);
    if (!visual) {
      return;
    }
    if (Array.isArray(visual.paintSurfaceEntries) && visual.paintSurfaceEntries.length > 0) {
      for (const entry of visual.paintSurfaceEntries) {
        this.unregisterPromoPaintSurface(entry?.surfaceId, entry?.mesh);
      }
    } else {
      this.unregisterPromoPaintSurface(visual.paintSurfaceId, visual.paintSurfaceMesh);
    }
    if (visual.videoEl) {
      try {
        visual.videoEl.pause();
        visual.videoEl.src = "";
        visual.videoEl.load();
      } catch {
        // ignore
      }
    }
    if (visual.videoTexture) {
      visual.videoTexture.dispose();
    }
    if (visual.imageTexture) {
      visual.imageTexture.dispose();
    }
    this.scene.remove(visual.group);
    disposeMeshTree(visual.group);
    this.promoObjectVisuals.delete(key);
  }

  clearPromoObjectVisuals() {
    for (const ownerKey of this.promoObjectVisuals.keys()) {
      this.disposePromoObjectVisual(ownerKey);
    }
    this.promoCollisionBoxes = [];
    this.promoPlatformCandidateBuffer.length = 0;
  }

  createPromoScreenMediaResources(
    entry,
    screenMaterial,
    { videoEmissive = 0.08, imageEmissive = 0.1, emptyColor = 0xcfd4da, emptyEmissive = 0.04 } = {}
  ) {
    let videoEl = null;
    let videoTexture = null;
    let imageTexture = null;
    if (entry.mediaDataUrl && entry.mediaKind === "video") {
      videoEl = document.createElement("video");
      videoEl.preload = "auto";
      videoEl.loop = true;
      videoEl.muted = true;
      videoEl.playsInline = true;
      videoEl.setAttribute("playsinline", "true");
      videoEl.setAttribute("webkit-playsinline", "true");
      videoEl.src = entry.mediaDataUrl;
      videoTexture = new THREE.VideoTexture(videoEl);
      videoTexture.colorSpace = THREE.SRGBColorSpace;
      videoTexture.minFilter = THREE.LinearFilter;
      videoTexture.magFilter = THREE.LinearFilter;
      videoTexture.generateMipmaps = false;
      screenMaterial.map = videoTexture;
      screenMaterial.color.setHex(0xffffff);
      screenMaterial.emissiveIntensity = videoEmissive;
      videoEl.play().catch(() => {});
    } else if (entry.mediaDataUrl && entry.mediaKind === "image") {
      imageTexture = this.textureLoader.load(entry.mediaDataUrl);
      imageTexture.colorSpace = THREE.SRGBColorSpace;
      imageTexture.minFilter = THREE.LinearFilter;
      imageTexture.magFilter = THREE.LinearFilter;
      imageTexture.generateMipmaps = false;
      screenMaterial.map = imageTexture;
      screenMaterial.color.setHex(0xffffff);
      screenMaterial.emissiveIntensity = imageEmissive;
    } else {
      screenMaterial.color.setHex(emptyColor);
      screenMaterial.emissiveIntensity = emptyEmissive;
    }
    screenMaterial.needsUpdate = true;
    return { videoEl, videoTexture, imageTexture };
  }

  createPromoBlockVisual(entry) {
    const safeScale = THREE.MathUtils.clamp(Number(entry.scale) || 1, PROMO_MIN_SCALE, PROMO_MAX_SCALE);
    const bodyWidth = PROMO_BLOCK_WIDTH * safeScale;
    const bodyHeight = PROMO_BLOCK_HEIGHT * safeScale;
    const bodyDepth = PROMO_BLOCK_DEPTH * safeScale;
    const surfaceBaseId = this.getPromoPaintSurfaceBaseId(entry.ownerKey);

    const group = new THREE.Group();
    group.position.set(entry.x, entry.y + bodyHeight * 0.5, entry.z);
    group.rotation.y = this.normalizePromoYaw(entry.yaw, 0);

    const bodyMaterialTemplate = new THREE.MeshStandardMaterial({
      color: PLAYER_PLACEABLE_BLOCK_BASE_COLOR,
      roughness: 0.82,
      metalness: 0.08,
      emissive: PLAYER_PLACEABLE_BLOCK_EMISSIVE_COLOR,
      emissiveIntensity: PLAYER_PLACEABLE_BLOCK_EMISSIVE_INTENSITY
    });
    bodyMaterialTemplate.toneMapped = true;
    const { videoEl, videoTexture, imageTexture } = this.createPromoScreenMediaResources(
      entry,
      bodyMaterialTemplate,
      {
        videoEmissive: 0.08,
        imageEmissive: 0.1,
        emptyColor: PLAYER_PLACEABLE_BLOCK_BASE_COLOR,
        emptyEmissive: PLAYER_PLACEABLE_BLOCK_EMISSIVE_INTENSITY
      }
    );

    const body = surfaceBaseId
      ? this.createPaintableBoxMesh(
          new THREE.BoxGeometry(bodyWidth, bodyHeight, bodyDepth),
          bodyMaterialTemplate,
          surfaceBaseId
        )
      : new THREE.Mesh(
          new THREE.BoxGeometry(bodyWidth, bodyHeight, bodyDepth),
          bodyMaterialTemplate.clone()
        );
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    const paintSurfaceEntries = [];
    if (surfaceBaseId) {
      // Keep painting focused on side faces (left/right/front/back).
      this.paintableSurfaceMap.delete(`${surfaceBaseId}:py`);
      this.paintableSurfaceMap.delete(`${surfaceBaseId}:ny`);
      const sideFaces = ["px", "nx", "pz", "nz"];
      for (const faceKey of sideFaces) {
        paintSurfaceEntries.push({ surfaceId: `${surfaceBaseId}:${faceKey}`, mesh: body });
      }
    }

    return {
      group,
      videoEl,
      videoTexture,
      imageTexture,
      paintSurfaceEntries
    };
  }

  createPromoSignVisual(entry) {
    const safeScale = THREE.MathUtils.clamp(Number(entry.scale) || 1, PROMO_MIN_SCALE, PROMO_MAX_SCALE);
    const boardWidth = 2.6 * safeScale;
    const boardHeight = 1.5 * safeScale;
    const boardDepth = 0.12 * safeScale;
    const poleHeight = 1.7 * safeScale;

    const group = new THREE.Group();
    group.position.set(entry.x, entry.y - 0.7 * safeScale, entry.z);
    group.rotation.y = this.normalizePromoYaw(entry.yaw, 0);

    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1 * safeScale, 0.14 * safeScale, poleHeight, 12),
      new THREE.MeshStandardMaterial({
        color: 0x788ba6,
        roughness: 0.64,
        metalness: 0.2,
        emissive: 0x1f2f45,
        emissiveIntensity: 0.22
      })
    );
    pole.position.y = poleHeight * 0.5;
    group.add(pole);

    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(boardWidth + 0.16 * safeScale, boardHeight + 0.16 * safeScale, boardDepth),
      new THREE.MeshStandardMaterial({
        color: 0x314763,
        roughness: 0.46,
        metalness: 0.24,
        emissive: 0x203449,
        emissiveIntensity: 0.78
      })
    );
    frame.position.y = poleHeight + boardHeight * 0.5 + 0.04 * safeScale;
    group.add(frame);

    const screenMaterial = new THREE.MeshStandardMaterial({
      color: 0xe2f2ff,
      emissive: 0x294766,
      emissiveIntensity: 0.56,
      roughness: 0.3,
      metalness: 0.02
    });
    screenMaterial.toneMapped = false;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(boardWidth, boardHeight), screenMaterial);
    screen.position.set(0, frame.position.y, boardDepth * 0.52);
    group.add(screen);

    const { videoEl, videoTexture, imageTexture } = this.createPromoScreenMediaResources(entry, screenMaterial, {
      videoEmissive: 0.08,
      imageEmissive: 0.1,
      emptyColor: 0xd9f1ff,
      emptyEmissive: 0.58
    });
    const paintSurfaceId = this.registerPromoPaintSurface(screen, entry.ownerKey, boardWidth, boardHeight);
    return {
      group,
      videoEl,
      videoTexture,
      imageTexture,
      paintSurfaceId,
      paintSurfaceMesh: screen
    };
  }

  createPromoObjectVisual(entry) {
    const kind = this.normalizePromoKind(entry?.kind ?? "block", "block");
    if (kind === "sign") {
      return this.createPromoSignVisual(entry);
    }
    return this.createPromoBlockVisual(entry);
  }

  applyPromoState(rawObjects = []) {
    const incoming = Array.isArray(rawObjects) ? rawObjects : [];
    const nextMap = new Map();
    for (const rawValue of incoming) {
      const normalized = this.normalizePromoObjectEntry(rawValue);
      if (!normalized) {
        continue;
      }
      nextMap.set(normalized.ownerKey, normalized);
    }

    for (const ownerKey of this.promoObjectVisuals.keys()) {
      if (!nextMap.has(ownerKey)) {
        this.disposePromoObjectVisual(ownerKey);
      }
    }

    for (const [ownerKey, nextEntry] of nextMap.entries()) {
      const prevEntry = this.promoObjects.get(ownerKey);
      const prevSignature = this.getPromoObjectSignature(prevEntry);
      const nextSignature = this.getPromoObjectSignature(nextEntry);
      if (prevSignature === nextSignature && this.promoObjectVisuals.has(ownerKey)) {
        continue;
      }
      this.disposePromoObjectVisual(ownerKey);
      const visual = this.createPromoObjectVisual(nextEntry);
      this.scene.add(visual.group);
      this.promoObjectVisuals.set(ownerKey, visual);
    }

    this.promoObjects = nextMap;
    const ownNext = nextMap.get(this.promoOwnerKey) ?? null;
    if (
      ownNext &&
      typeof this.promoAllowOthersDrawDraft === "boolean" &&
      Boolean(ownNext.allowOthersDraw) === this.promoAllowOthersDrawDraft
    ) {
      this.promoAllowOthersDrawDraft = null;
    }
    this.rebuildPromoCollisionBoxes();
    if (this.promoPlacementPreviewActive && this.getOwnPromoObject()) {
      this.clearPromoPlacementPreview({ syncUi: false });
    }
    this.syncPromoPanelUi();
    this.updatePromoLinkPrompt(0, true);
  }

  rebuildPromoCollisionBoxes() {
    // v1.1 hardening: promo objects stay visual-only to prevent griefing via collision traps.
    this.promoCollisionBoxes = [];
  }

  openNearestPromoLink() {
    const target = this.nearestPromoLinkObject;
    if (!target) {
      return false;
    }
    const isOwn = String(target.ownerKey ?? "") === String(this.promoOwnerKey ?? "");
    if (isOwn) {
      if (this.mobileEnabled) {
        this.setPromoPanelMobileOpen(true, { syncMobileUi: true });
      } else {
        this.setPromoPanelDesktopOpen(true, { syncUi: true });
      }
      return true;
    }
    if (!target.linkUrl) {
      return false;
    }
    try {
      const opened = window.open(target.linkUrl, "_blank", "noopener,noreferrer");
      if (opened) {
        opened.opener = null;
      }
      return true;
    } catch {
      return false;
    }
  }

  updatePromoLinkPrompt(delta = 0, force = false) {
    if (!this.promoLinkPromptEl) {
      return;
    }
    const nowMs = typeof performance !== "undefined" ? performance.now() : Date.now();
    const recentLookInputMs = Math.max(0, nowMs - (Number(this.lastLookInputAtMs) || 0));
    const promptInterval =
      recentLookInputMs < this.dynamicResolutionInputQuietMs
        ? this.promoLinkPromptUpdateInterval * 1.8
        : this.promoLinkPromptUpdateInterval;
    const step = Math.max(0, Number(delta) || 0);
    if (step > 0) {
      this.promoLinkPromptUpdateClock += step;
      if (!force && this.promoLinkPromptUpdateClock < promptInterval) {
        return;
      }
      this.promoLinkPromptUpdateClock = 0;
    } else if (force) {
      this.promoLinkPromptUpdateClock = 0;
    }
    if (
      this.isMobilePortraitBlocked() ||
      this.surfacePainterOpen ||
      (this.mobileEnabled && this.promoPanelMobileOpen) ||
      !this.canMovePlayer()
    ) {
      this.nearestPromoLinkObject = null;
      this.promoLinkPromptEl.classList.add("hidden");
      return;
    }
    const nearest = this.getNearestPromoObject(PROMO_LINK_INTERACT_RADIUS);
    const isOwn = String(nearest?.ownerKey ?? "") === String(this.promoOwnerKey ?? "");
    if (!nearest || (!isOwn && !nearest.linkUrl)) {
      this.nearestPromoLinkObject = null;
      this.promoLinkPromptEl.classList.add("hidden");
      return;
    }
    if (isOwn) {
      // Own-object editing is handled in the surface painter (F interaction),
      // so suppress the separate promo-link prompt to avoid overlapping hints.
      this.nearestPromoLinkObject = null;
      this.promoLinkPromptEl.classList.add("hidden");
      return;
    }
    this.nearestPromoLinkObject = nearest;
    if (this.promoOpenLinkBtnEl) {
      this.promoOpenLinkBtnEl.textContent = `${nearest.ownerName} 링크 열기`;
    }
    if (this.promoLinkPromptTextEl) {
      this.promoLinkPromptTextEl.textContent = `${nearest.ownerName} 링크 열기`;
    }
    this.promoLinkPromptEl.classList.remove("hidden");
  }

  normalizePortalSchedule(raw = {}) {
    const modeRaw = String(raw?.mode ?? "idle").trim().toLowerCase();
    const mode = ["idle", "waiting", "final_countdown", "open", "open_manual"].includes(modeRaw)
      ? modeRaw
      : "idle";
    const finalCountdownSeconds = THREE.MathUtils.clamp(
      Math.trunc(Number(raw?.finalCountdownSeconds) || 10),
      3,
      30
    );

    let startAtMs = Math.max(0, Math.trunc(Number(raw?.startAtMs) || 0));
    let openUntilMs = Math.max(0, Math.trunc(Number(raw?.openUntilMs) || 0));
    let remainingSec = Math.max(0, Math.trunc(Number(raw?.remainingSec) || 0));
    const updatedAt = Math.max(0, Math.trunc(Number(raw?.updatedAt) || Date.now()));

    if ((mode === "waiting" || mode === "final_countdown") && startAtMs <= 0 && remainingSec > 0) {
      startAtMs = Date.now() + remainingSec * 1000;
    }
    if (mode === "open" && openUntilMs <= 0 && remainingSec > 0) {
      openUntilMs = Date.now() + remainingSec * 1000;
    }

    return {
      mode,
      startAtMs,
      openUntilMs,
      remainingSec,
      finalCountdownSeconds,
      updatedAt
    };
  }

  getPortalScheduleComputed(now = Date.now()) {
    const state = this.normalizePortalSchedule(this.portalSchedule ?? {});
    let mode = state.mode;
    let remainingSec = state.remainingSec;

    if (mode === "waiting" || mode === "final_countdown") {
      const byStartAt = state.startAtMs > 0 ? Math.max(0, Math.ceil((state.startAtMs - now) / 1000)) : 0;
      if (byStartAt > 0 || state.startAtMs > 0) {
        remainingSec = byStartAt;
      }

      if (remainingSec <= 0) {
        mode = "open";
        const byOpenUntil = state.openUntilMs > now
          ? Math.max(0, Math.ceil((state.openUntilMs - now) / 1000))
          : this.portalOpenSeconds;
        remainingSec = Math.max(1, byOpenUntil);
      } else {
        mode = remainingSec <= state.finalCountdownSeconds ? "final_countdown" : "waiting";
      }
    } else if (mode === "open") {
      const byOpenUntil = state.openUntilMs > 0 ? Math.max(0, Math.ceil((state.openUntilMs - now) / 1000)) : 0;
      if (byOpenUntil > 0 || state.openUntilMs > 0) {
        remainingSec = byOpenUntil;
      }
      // Keep open state visible briefly during the transition boundary.
      if (remainingSec <= 0 && state.openUntilMs > 0 && now - state.openUntilMs < 8000) {
        remainingSec = 1;
      }
      if (remainingSec <= 0) {
        mode = "idle";
        remainingSec = 0;
      }
    } else if (mode === "open_manual") {
      remainingSec = 0;
    } else {
      mode = "idle";
      remainingSec = 0;
    }

    return {
      ...state,
      mode,
      remainingSec
    };
  }

  applyPortalScheduleUpdate(raw = {}, { announce = false } = {}) {
    const next = this.normalizePortalSchedule(raw);
    this.portalSchedule = next;
    if (next.mode === "open" || next.mode === "open_manual") {
      this.portalPhase = "open";
      this.portalPhaseClock = next.mode === "open" ? Math.max(1, Number(next.remainingSec) || 0) : 0;
      this.updatePortalVisual();
    } else if (this.portalPhase === "open") {
      this.portalPhase = "cooldown";
      this.portalPhaseClock = 0;
      this.updatePortalVisual();
    }
    this.updatePortalTimeBillboard(0, true);
    this.updateHallPortalCountdownOverlay(true);
    this.syncHostControls();

    if (announce && (next.mode === "open" || next.mode === "open_manual")) {
      this.appendChatLine("", "방장이 포탈 1을 즉시 개방했습니다.", "system");
    }
  }

  requestPortalScheduleSet(delaySeconds) {
    const requestedDelay = Math.trunc(Number(delaySeconds) || 0);
    if (requestedDelay <= 0) {
      this.appendChatLine("", "예약 시간(분/시간)을 다시 입력하세요.", "system");
      return;
    }
    const delay = Math.max(10, Math.min(6 * 60 * 60, requestedDelay));

    const localHostMode = this.canUseOfflineHostMode();
    if (!this.socket || !this.networkConnected) {
      if (!localHostMode) {
        this.appendChatLine("", "서버 연결 후 다시 시도하세요.", "system");
        return;
      }

      const now = Date.now();
      this.applyPortalScheduleUpdate(
        {
          mode: delay <= 10 ? "final_countdown" : "waiting",
          startAtMs: now + delay * 1000,
          openUntilMs: 0,
          remainingSec: delay,
          finalCountdownSeconds: 10,
          updatedAt: now
        },
        { announce: false }
      );
      const delayLabel = this.formatPortalDelayLabel(delay);
      this.appendChatLine("", `${delayLabel}후 시작 예약 완료`, "system");
      return;
    }
    if (!this.isRoomHost) {
      this.appendChatLine("", "시작 시간 설정은 방장만 가능합니다.", "system");
      return;
    }
    const computed = this.getPortalScheduleComputed();
    if (computed.mode === "open" || computed.mode === "open_manual") {
      this.appendChatLine("", "포탈 1이 열려 있는 동안에는 예약을 변경할 수 없습니다. 먼저 닫아주세요.", "system");
      return;
    }
    if (this.portalScheduleSetInFlight) {
      return;
    }

    this.portalScheduleSetInFlight = true;
    this.syncHostControls();
    this.socket.emit("portal:schedule:set", { delaySeconds: delay }, (response = {}) => {
      this.portalScheduleSetInFlight = false;
      this.syncHostControls();

      if (!response?.ok) {
        const reason = String(response?.error ?? "").trim() || "알 수 없는 오류";
        this.appendChatLine("", `시작 예약 실패: ${reason}`, "system");
        return;
      }

      this.applyPortalScheduleUpdate(response?.schedule ?? {}, { announce: false });
      const delayLabel = this.formatPortalDelayLabel(delay);
      this.appendChatLine("", `${delayLabel}후 시작 예약 완료`, "system");
    });
  }

  handlePortalForceOpen(_payload = {}, { announce = true } = {}) {
    if (!this.hubFlowEnabled) {
      return;
    }

    const now = Date.now();
    const fallbackSchedule = {
      mode: "open_manual",
      startAtMs: now,
      openUntilMs: 0,
      remainingSec: 0,
      finalCountdownSeconds: 10,
      updatedAt: now
    };
    const schedule = _payload?.schedule ?? fallbackSchedule;
    this.applyPortalScheduleUpdate(schedule, { announce: false });
    const computed = this.getPortalScheduleComputed();
    this.portalPhase = "open";
    this.portalPhaseClock = computed.mode === "open_manual"
      ? 0
      : Math.max(1, Number(computed.remainingSec) || this.portalOpenSeconds);
    this.updatePortalVisual();

    if (announce) {
      this.appendChatLine("", "방장이 포탈 1을 즉시 개방했습니다.", "system");
    }
  }

  handlePortalForceClose(_payload = {}, { announce = true } = {}) {
    if (!this.hubFlowEnabled) {
      return;
    }

    const now = Date.now();
    const fallbackSchedule = {
      mode: "idle",
      startAtMs: 0,
      openUntilMs: 0,
      remainingSec: 0,
      finalCountdownSeconds: 10,
      updatedAt: now
    };
    const schedule = _payload?.schedule ?? fallbackSchedule;
    this.applyPortalScheduleUpdate(schedule, { announce: false });
    this.portalPhase = "cooldown";
    this.portalPhaseClock = 0;
    this.updatePortalVisual();

    if (announce) {
      this.appendChatLine("", "방장이 포탈 1을 닫았습니다.", "system");
    }
  }

  requestPortalForceOpen() {
    const localHostMode = this.canUseOfflineHostMode();
    if (!this.socket || !this.networkConnected) {
      if (localHostMode) {
        this.handlePortalForceOpen({}, { announce: false });
        this.appendChatLine("", "로컬 모드에서 포탈 1을 즉시 개방했습니다.", "system");
        return;
      }
      this.appendChatLine("", "서버 연결 후 다시 시도하세요.", "system");
      return;
    }
    if (!this.isRoomHost) {
      this.appendChatLine("", "포탈 즉시 개방은 방장만 가능합니다.", "system");
      return;
    }
    if (this.portalForceOpenInFlight) {
      return;
    }

    this.portalForceOpenInFlight = true;
    this.syncHostControls();
    this.socket.emit("portal:force-open", {}, (response = {}) => {
      this.portalForceOpenInFlight = false;
      this.syncHostControls();

      if (!response?.ok) {
        const reason = String(response?.error ?? "").trim() || "알 수 없는 오류";
        this.appendChatLine("", `포탈 1 개방 실패: ${reason}`, "system");
        return;
      }

      // Apply immediately for local host; room broadcast will update everyone else.
      this.handlePortalForceOpen(response, { announce: false });
      this.appendChatLine("", "포탈 1을 즉시 개방했습니다. (직접 닫을 때까지 유지)", "system");
    });
  }

  requestPortalForceClose() {
    const localHostMode = this.canUseOfflineHostMode();
    if (!this.socket || !this.networkConnected) {
      if (localHostMode) {
        this.handlePortalForceClose({}, { announce: false });
        this.appendChatLine("", "로컬 모드에서 포탈 1을 닫았습니다.", "system");
        return;
      }
      this.appendChatLine("", "서버 연결 후 다시 시도하세요.", "system");
      return;
    }
    if (!this.isRoomHost) {
      this.appendChatLine("", "포탈 1 닫기는 방장만 가능합니다.", "system");
      return;
    }
    const computed = this.getPortalScheduleComputed();
    const portalOpenNow = computed.mode === "open" || computed.mode === "open_manual";
    if (!portalOpenNow) {
      this.appendChatLine("", "현재 열린 포탈 1이 없습니다.", "system");
      return;
    }
    if (this.portalCloseInFlight) {
      return;
    }

    this.portalCloseInFlight = true;
    this.syncHostControls();
    this.socket.emit("portal:close", {}, (response = {}) => {
      this.portalCloseInFlight = false;
      this.syncHostControls();

      if (!response?.ok) {
        const reason = String(response?.error ?? "").trim() || "알 수 없는 오류";
        this.appendChatLine("", `포탈 1 닫기 실패: ${reason}`, "system");
        return;
      }

      this.handlePortalForceClose(response, { announce: false });
      this.appendChatLine("", "포탈 1을 닫았습니다.", "system");
    });
  }

  normalizeSecurityTestState(raw = {}) {
    return {
      enabled: Boolean(raw?.enabled ?? raw?.active),
      updatedAt: Math.max(0, Math.trunc(Number(raw?.updatedAt) || Date.now()))
    };
  }

  applySecurityTestState(raw = {}, { announce = false } = {}) {
    const next = this.normalizeSecurityTestState(raw);
    const previous = this.normalizeSecurityTestState(this.securityTestState);
    this.securityTestState = next;
    this.refreshSecurityTestObjectLabels();
    this.securityTestLabelRefreshClock = 0;

    if (announce && previous.enabled !== next.enabled) {
      const label = next.enabled ? "ON" : "OFF";
      this.appendChatLine("", `보안 테스트 모드: ${label}`, "system");
    }
    this.syncHostControls();
  }

  requestHostSecurityTestToggle(forceEnabled = null) {
    const nextEnabled =
      typeof forceEnabled === "boolean" ? forceEnabled : !Boolean(this.securityTestState?.enabled);

    const localHostMode = this.canUseOfflineHostMode();
    if (!this.socket || !this.networkConnected) {
      if (!localHostMode) {
        this.appendChatLine("", "서버 연결 후 다시 시도하세요.", "system");
        return;
      }
      this.applySecurityTestState(
        {
          enabled: nextEnabled,
          updatedAt: Date.now()
        },
        { announce: true }
      );
      return;
    }

    if (!this.hasHostPrivilege()) {
      this.appendChatLine("", "보안 테스트 토글은 방장만 가능합니다.", "system");
      return;
    }
    if (this.securityTestSetInFlight) {
      return;
    }

    this.securityTestSetInFlight = true;
    this.syncHostControls();
    this.socket.emit("security:test:set", { enabled: nextEnabled }, (response = {}) => {
      this.securityTestSetInFlight = false;
      this.syncHostControls();
      if (!response?.ok) {
        const reason = String(response?.error ?? "").trim() || "알 수 없는 오류";
        this.appendChatLine("", `보안 테스트 변경 실패: ${reason}`, "system");
        return;
      }

      this.applySecurityTestState(response?.state ?? { enabled: nextEnabled }, { announce: true });
    });
  }

  requestHostClaim({ manual = false } = {}) {
    if (!this.socket || !this.networkConnected) {
      if (manual) {
        this.appendChatLine("", "서버 연결 후 다시 시도하세요. (/host)", "system");
      }
      return;
    }
    if (this.isRoomHost) {
      if (manual) {
        this.appendChatLine("", "이미 방장 권한입니다.", "system");
      }
      return;
    }
    if (!manual && !this.autoHostClaimEnabled) {
      return;
    }

    if (!manual) {
      const now = performance.now();
      if (now - this.autoHostClaimLastAttemptMs < 1200) {
        return;
      }
      this.autoHostClaimLastAttemptMs = now;
    }

    this.socket.emit(
      "room:host:claim",
      { key: this.hostClaimKey },
      (response = {}) => {
        if (!response?.ok) {
          const reason = String(response?.error ?? "").trim();
          if (!manual && reason === "invalid host key") {
            this.autoHostClaimEnabled = false;
          }
          if (manual) {
            this.appendChatLine("", `방장 권한 요청 실패: ${reason || "알 수 없는 오류"}`, "system");
          }
          return;
        }

        if (response?.room) {
          this.handleRoomUpdate(response.room);
        } else if (this.localPlayerId) {
          this.roomHostId = this.localPlayerId;
          this.isRoomHost = true;
          this.hud.setStatus(this.getStatusText());
          this.syncHostControls();
        }

        if (manual) {
          this.appendChatLine("", "방장 권한을 획득했습니다.", "system");
        }
        this.syncHostPortalTargetCandidate();
        this.syncHostAZonePortalTargetCandidate();
        this.requestPlatformState();
        this.requestRopeState();
        this.requestObjectState();
        this.requestPromoState();
      }
    );
  }

  requestPortalTargetUpdate(targetUrl, { announceSuccess = false, announceErrors = false } = {}) {
    if (!this.socket || !this.networkConnected) {
      if (announceErrors) {
        this.appendChatLine("", "서버 연결 후 포탈 1 링크를 변경할 수 있습니다.", "system");
      }
      return;
    }
    if (!this.isRoomHost) {
      if (announceErrors) {
        this.appendChatLine("", "포탈 1 링크 변경은 방장만 가능합니다.", "system");
      }
      return;
    }
    if (this.portalTargetSetInFlight) {
      return;
    }

    const normalized = this.normalizePortalTargetUrl(targetUrl, "");
    if (!normalized) {
      if (announceErrors) {
        this.appendChatLine("", "유효한 http/https 링크를 입력하세요.", "system");
      }
      return;
    }

    if (normalized === this.portalTargetUrl) {
      if (announceSuccess) {
        this.appendChatLine("", `포탈 1 링크 유지: ${normalized}`, "system");
      }
      if (normalized === this.hostPortalTargetCandidate) {
        this.hostPortalTargetSynced = true;
      }
      return;
    }

    this.portalTargetSetInFlight = true;
    this.socket.emit("portal:target:set", { targetUrl: normalized }, (response = {}) => {
      this.portalTargetSetInFlight = false;

      if (!response?.ok) {
        if (announceErrors) {
          const reason = String(response?.error ?? "").trim() || "알 수 없는 오류";
          this.appendChatLine("", `포탈 1 링크 변경 실패: ${reason}`, "system");
        }
        return;
      }

      const applied = this.normalizePortalTargetUrl(response?.targetUrl ?? normalized, normalized);
      this.portalTargetUrl = applied;
      if (applied === this.hostPortalTargetCandidate) {
        this.hostPortalTargetSynced = true;
      }
      if (announceSuccess) {
        this.appendChatLine("", `포탈 1 링크 변경 완료: ${applied}`, "system");
      }
    });
  }

  requestAZonePortalTargetUpdate(targetUrl, { announceSuccess = false, announceErrors = false } = {}) {
    if (!this.socket || !this.networkConnected) {
      if (announceErrors) {
        this.appendChatLine("", "서버 연결 후 포탈 2 링크를 변경할 수 있습니다.", "system");
      }
      return;
    }
    if (!this.isRoomHost) {
      if (announceErrors) {
        this.appendChatLine("", "포탈 2 링크 변경은 방장만 가능합니다.", "system");
      }
      return;
    }
    if (this.aZonePortalTargetSetInFlight) {
      return;
    }

    const normalized = this.normalizePortalTargetUrl(targetUrl, "");
    if (!normalized) {
      if (announceErrors) {
        this.appendChatLine("", "유효한 http/https 링크를 입력하세요.", "system");
      }
      return;
    }

    if (normalized === this.aZonePortalTargetUrl) {
      if (announceSuccess) {
        this.appendChatLine("", `포탈 2 링크 유지: ${normalized}`, "system");
      }
      if (normalized === this.hostAZonePortalTargetCandidate) {
        this.hostAZonePortalTargetSynced = true;
      }
      return;
    }

    this.aZonePortalTargetSetInFlight = true;
    let completed = false;
    const finalize = () => {
      if (completed) {
        return false;
      }
      completed = true;
      this.aZonePortalTargetSetInFlight = false;
      return true;
    };
    const timeoutId = window.setTimeout(() => {
      if (!finalize()) {
        return;
      }
      if (announceErrors) {
        this.appendChatLine("", "포탈 2 링크 변경 응답 시간 초과", "system");
      }
    }, 4000);
    this.socket.emit("portal:a-zone-target:set", { targetUrl: normalized }, (response = {}) => {
      if (!finalize()) {
        return;
      }
      window.clearTimeout(timeoutId);

      if (!response?.ok) {
        if (announceErrors) {
          const reason = String(response?.error ?? "").trim() || "알 수 없는 오류";
          this.appendChatLine("", `포탈 2 링크 변경 실패: ${reason}`, "system");
        }
        return;
      }

      const applied = this.normalizePortalTargetUrl(response?.targetUrl ?? normalized, normalized);
      this.aZonePortalTargetUrl = applied;
      if (applied === this.hostAZonePortalTargetCandidate) {
        this.hostAZonePortalTargetSynced = true;
      }
      if (announceSuccess) {
        this.appendChatLine("", `포탈 2 링크 변경 완료: ${applied}`, "system");
      }
    });
  }

  syncHostPortalTargetCandidate() {
    if (!this.isRoomHost || !this.hostPortalTargetCandidate) {
      return;
    }
    if (this.hostPortalTargetSynced) {
      return;
    }

    if (this.hostPortalTargetCandidate === this.portalTargetUrl) {
      this.hostPortalTargetSynced = true;
      return;
    }

    this.requestPortalTargetUpdate(this.hostPortalTargetCandidate);
  }

  syncHostAZonePortalTargetCandidate() {
    if (!this.isRoomHost || !this.hostAZonePortalTargetCandidate) {
      return;
    }
    if (this.hostAZonePortalTargetSynced) {
      return;
    }
    if (this.hostAZonePortalTargetCandidate === this.aZonePortalTargetUrl) {
      this.hostAZonePortalTargetSynced = true;
      return;
    }
    this.requestAZonePortalTargetUpdate(this.hostAZonePortalTargetCandidate);
  }

  handleChatCommand(rawText) {
    const text = String(rawText ?? "").trim();
    if (!text.startsWith("/")) {
      return false;
    }

    const [commandRaw, ...rest] = text.split(/\s+/);
    const command = String(commandRaw ?? "").toLowerCase();
    const argText = rest.join(" ").trim();

    if (command === "/host") {
      this.requestHostClaim({ manual: true });
      return true;
    }

    if (command === "/portal") {
      if (!argText) {
        this.appendChatLine("", "사용법: /portal https://example.com", "system");
        return true;
      }

      const normalized = this.normalizePortalTargetUrl(argText, "");
      if (!normalized) {
        this.appendChatLine("", "유효한 http/https 링크를 입력하세요.", "system");
        return true;
      }

      this.hostPortalTargetCandidate = normalized;
      this.hostPortalTargetSynced = false;
      this.requestPortalTargetUpdate(normalized, {
        announceSuccess: true,
        announceErrors: true
      });
      return true;
    }

    this.appendChatLine("", "지원 명령어: /host, /portal <url>", "system");
    return true;
  }

  setupSky(sunDirection) {
    if (this.skyDome) {
      this.scene.remove(this.skyDome);
      disposeMeshTree(this.skyDome);
      this.skyDome = null;
    }

    const skyConfig = this.worldContent.sky;
    if (skyConfig?.textureUrl) {
      this.setupSkyTexture(skyConfig, sunDirection);
      return;
    }

    this.clearSkyTexture();
    const sky = new Sky();
    sky.scale.setScalar(skyConfig.scale);
    const uniforms = sky.material.uniforms;
    uniforms.turbidity.value = skyConfig.turbidity;
    uniforms.rayleigh.value = skyConfig.rayleigh;
    uniforms.mieCoefficient.value = skyConfig.mieCoefficient;
    uniforms.mieDirectionalG.value = skyConfig.mieDirectionalG;

    this.skySun.copy(sunDirection).multiplyScalar(skyConfig.scale);
    uniforms.sunPosition.value.copy(this.skySun);

    this.skyDome = sky;
    this.scene.add(this.skyDome);
  }

  setupSkyTexture(skyConfig, sunDirection) {
    this.skyTextureRequestId += 1;
    const requestId = this.skyTextureRequestId;
    this.clearSkyTexture();

    const url = String(skyConfig?.textureUrl ?? "").trim();
    if (!url) {
      this.setupSky(sunDirection);
      return;
    }

    const loader = new RGBELoader();
    loader.load(
      url,
      (hdrTexture) => {
        if (requestId !== this.skyTextureRequestId) {
          hdrTexture.dispose?.();
          return;
        }
        const pmrem = new THREE.PMREMGenerator(this.renderer);
        const envRT = pmrem.fromEquirectangular(hdrTexture);
        pmrem.dispose();
        hdrTexture.dispose?.();

        const backgroundIntensity = Number(skyConfig.textureBackgroundIntensity);
        this.skyBackgroundTexture = envRT.texture;
        this.skyEnvironmentTexture = envRT.texture;

        this.scene.background = this.skyBackgroundTexture;
        this.scene.environment = this.skyEnvironmentTexture;
        if (Number.isFinite(backgroundIntensity)) {
          this.scene.backgroundIntensity = backgroundIntensity;
        }
        this.scene.backgroundBlurriness = 0.2;
        const environmentIntensity = Number(skyConfig.textureEnvironmentIntensity);
        this.scene.environmentIntensity = Number.isFinite(environmentIntensity)
          ? environmentIntensity
          : 1;
      },
      undefined,
      () => {
        if (requestId !== this.skyTextureRequestId) {
          return;
        }
        this.clearSkyTexture();
        const sky = new Sky();
        sky.scale.setScalar(skyConfig.scale);
        const uniforms = sky.material.uniforms;
        uniforms.turbidity.value = skyConfig.turbidity;
        uniforms.rayleigh.value = skyConfig.rayleigh;
        uniforms.mieCoefficient.value = skyConfig.mieCoefficient;
        uniforms.mieDirectionalG.value = skyConfig.mieDirectionalG;
        this.skySun.copy(sunDirection).multiplyScalar(skyConfig.scale);
        uniforms.sunPosition.value.copy(this.skySun);
        this.skyDome = sky;
        this.scene.add(this.skyDome);
      }
    );
  }

  clearSkyTexture() {
    if (this.scene.background === this.skyBackgroundTexture) {
      this.scene.background = new THREE.Color(this.worldContent.skyColor);
      this.scene.backgroundIntensity = 1;
      this.scene.backgroundBlurriness = 0;
    }
    if (this.scene.environment === this.skyEnvironmentTexture) {
      this.scene.environment = null;
      this.scene.environmentIntensity = 1;
    }
    if (this.skyBackgroundTexture && this.skyBackgroundTexture === this.skyEnvironmentTexture) {
      this.skyBackgroundTexture.dispose?.();
    } else {
      this.skyBackgroundTexture?.dispose?.();
      this.skyEnvironmentTexture?.dispose?.();
    }
    this.skyBackgroundTexture = null;
    this.skyEnvironmentTexture = null;
  }

  setupCloudLayer() {
    if (this.cloudLayer) {
      this.scene.remove(this.cloudLayer);
      disposeMeshTree(this.cloudLayer);
      this.cloudLayer = null;
    }
    this.cloudParticles.length = 0;

    const cloudConfig = this.worldContent.clouds;
    if (!cloudConfig?.enabled) {
      return;
    }

    const group = new THREE.Group();
    const puffGeometry = new THREE.SphereGeometry(
      1,
      this.mobileEnabled ? 8 : 10,
      this.mobileEnabled ? 6 : 8
    );
    const puffMaterial = new THREE.MeshStandardMaterial({
      color: cloudConfig.color,
      roughness: 1,
      metalness: 0,
      envMapIntensity: 0,
      emissive: cloudConfig.emissive ?? 0x0,
      emissiveIntensity: Number(cloudConfig.emissiveIntensity) || 0,
      transparent: true,
      opacity: cloudConfig.opacity,
      depthWrite: false
    });

    const baseCount = Math.max(1, Math.trunc(cloudConfig.count));
    const mobileCountScale = Number(cloudConfig.mobileCountScale) || 0.55;
    const count = this.mobileEnabled
      ? Math.max(6, Math.round(baseCount * mobileCountScale))
      : baseCount;
    const area = Math.max(RUNTIME_TUNING.CLOUD_MIN_AREA, Number(cloudConfig.area) || 9000);
    const halfArea = area * 0.5;
    const minScale = Number(cloudConfig.minScale) || 28;
    const maxScale = Number(cloudConfig.maxScale) || 66;
    const minHeight = Number(cloudConfig.minHeight) || 120;
    const maxHeight = Number(cloudConfig.maxHeight) || 260;
    const driftMin = Number(cloudConfig.driftMin) || 0.4;
    const driftMax = Number(cloudConfig.driftMax) || 1.1;
    const minPuffs = Math.max(3, Math.trunc(Number(cloudConfig.minPuffs) || 5));
    const maxPuffs = Math.max(minPuffs, Math.trunc(Number(cloudConfig.maxPuffs) || 8));
    const puffSpread = Math.max(0.8, Number(cloudConfig.puffSpread) || 1.8);
    const puffHeightSpread = Math.max(0.04, Number(cloudConfig.puffHeightSpread) || 0.18);

    for (let i = 0; i < count; i += 1) {
      const cloud = new THREE.Group();
      const puffCount = minPuffs + Math.floor(Math.random() * (maxPuffs - minPuffs + 1));

      for (let p = 0; p < puffCount; p += 1) {
        const puff = new THREE.Mesh(puffGeometry, puffMaterial);
        const angle = (p / puffCount) * Math.PI * 2 + Math.random() * 0.7;
        const radial = (0.35 + Math.random() * 0.9) * puffSpread;
        const offsetX = Math.cos(angle) * radial + (Math.random() - 0.5) * 0.45;
        const offsetY = (Math.random() - 0.5) * puffHeightSpread;
        const offsetZ = Math.sin(angle) * radial * 0.56 + (Math.random() - 0.5) * 0.34;
        puff.position.set(offsetX, offsetY, offsetZ);
        puff.scale.set(
          0.9 + Math.random() * 0.58,
          0.34 + Math.random() * 0.22,
          0.68 + Math.random() * 0.52
        );
        cloud.add(puff);
      }

      const cloudScale = minScale + Math.random() * Math.max(1, maxScale - minScale);
      cloud.scale.set(cloudScale, cloudScale * 0.3, cloudScale * 0.82);
      cloud.rotation.y = Math.random() * Math.PI * 2;
      cloud.position.set(
        (Math.random() * 2 - 1) * halfArea,
        minHeight + Math.random() * Math.max(1, maxHeight - minHeight),
        (Math.random() * 2 - 1) * halfArea
      );

      group.add(cloud);

      const driftSpeed = driftMin + Math.random() * Math.max(0.05, driftMax - driftMin);
      const driftAngle = Math.random() * Math.PI * 2;
      this.cloudParticles.push({
        mesh: cloud,
        driftX: Math.cos(driftAngle) * driftSpeed,
        driftZ: Math.sin(driftAngle) * driftSpeed,
        halfArea
      });
    }

    this.cloudLayer = group;
    this.scene.add(this.cloudLayer);
  }

  updateCloudLayer(delta) {
    if (this.cloudParticles.length === 0) {
      return;
    }

    for (const cloud of this.cloudParticles) {
      cloud.mesh.position.x += cloud.driftX * delta;
      cloud.mesh.position.z += cloud.driftZ * delta;

      if (cloud.mesh.position.x > cloud.halfArea) {
        cloud.mesh.position.x = -cloud.halfArea;
      } else if (cloud.mesh.position.x < -cloud.halfArea) {
        cloud.mesh.position.x = cloud.halfArea;
      }

      if (cloud.mesh.position.z > cloud.halfArea) {
        cloud.mesh.position.z = -cloud.halfArea;
      } else if (cloud.mesh.position.z < -cloud.halfArea) {
        cloud.mesh.position.z = cloud.halfArea;
      }
    }
  }

  clearBoundaryWalls() {
    if (!this.boundaryGroup) {
      return;
    }
    this.scene.remove(this.boundaryGroup);
    disposeMeshTree(this.boundaryGroup);
    this.boundaryGroup = null;
  }

  setupBoundaryWalls(config = {}) {
    this.clearBoundaryWalls();
    if (!config?.enabled) {
      const groundSize = Number(this.worldContent?.ground?.size);
      const fallbackHalfExtent =
        Number.isFinite(groundSize) && groundSize > 20
          ? groundSize * 0.5 - this.playerCollisionRadius
          : GAME_CONSTANTS.WORLD_LIMIT - this.playerCollisionRadius;
      this.playerBoundsHalfExtent = Math.max(4, fallbackHalfExtent);
      return;
    }

    const halfExtent = Math.max(20, Number(config.halfExtent) || GAME_CONSTANTS.WORLD_LIMIT);
    const height = Math.max(4, Number(config.height) || 14);
    const thickness = Math.max(0.4, Number(config.thickness) || 2.2);
    this.playerBoundsHalfExtent = Math.max(4, halfExtent - thickness - this.playerCollisionRadius);
    const span = halfExtent * 2 + thickness * 2;

    const material = new THREE.MeshStandardMaterial({
      color: config.color ?? 0x6f757d,
      roughness: Number(config.roughness) || 0.82,
      metalness: Number(config.metalness) || 0.03,
      emissive: config.emissive ?? 0x20252a,
      emissiveIntensity: Number(config.emissiveIntensity) || 0.09
    });

    const wallXGeometry = new THREE.BoxGeometry(thickness, height, span);
    const wallZGeometry = new THREE.BoxGeometry(span, height, thickness);
    const group = new THREE.Group();

    const createWall = (geometry, x, y, z) => {
      const wall = new THREE.Mesh(geometry, material);
      wall.position.set(x, y, z);
      wall.castShadow = !this.mobileEnabled;
      wall.receiveShadow = true;
      wall.frustumCulled = false;
      return wall;
    };

    const y = height * 0.5;
    group.add(
      createWall(wallXGeometry, halfExtent + thickness * 0.5, y, 0),
      createWall(wallXGeometry, -halfExtent - thickness * 0.5, y, 0),
      createWall(wallZGeometry, 0, y, halfExtent + thickness * 0.5),
      createWall(wallZGeometry, 0, y, -halfExtent - thickness * 0.5)
    );

    group.renderOrder = 5;
    this.boundaryGroup = group;
    this.scene.add(this.boundaryGroup);
  }

  clearChalkLayer() {
    if (this.chalkLayer) {
      this.scene.remove(this.chalkLayer);
      this.chalkLayer.clear();
      this.chalkLayer = null;
    }
    for (const material of this.chalkMaterials.values()) {
      material.dispose?.();
    }
    this.chalkMaterials.clear();
    this.chalkStampGeometry?.dispose?.();
    this.chalkStampGeometry = null;
    this.chalkStampTexture?.dispose?.();
    this.chalkStampTexture = null;
    this.chalkMarks.length = 0;
    this.chalkDrawingActive = false;
    this.chalkLastStamp = null;
  }

  setupChalkLayer(config = {}) {
    this.clearChalkLayer();
    if (!config?.enabled) {
      return;
    }

    this.chalkLayer = new THREE.Group();
    this.chalkLayer.renderOrder = 6;
    this.scene.add(this.chalkLayer);

    const textureUrl = String(
      config.textureUrl ?? "/assets/graphics/world/textures/oss-chalk/disc.png"
    ).trim();
    if (textureUrl) {
      this.chalkStampTexture = this.textureLoader.load(textureUrl);
      this.chalkStampTexture.wrapS = THREE.ClampToEdgeWrapping;
      this.chalkStampTexture.wrapT = THREE.ClampToEdgeWrapping;
    }
    this.chalkStampGeometry = new THREE.CircleGeometry(1, this.mobileEnabled ? 10 : 14);
  }

  getChalkMaterial(color, opacity) {
    const key = `${String(color).toLowerCase()}|${Number(opacity).toFixed(2)}`;
    if (this.chalkMaterials.has(key)) {
      return this.chalkMaterials.get(key);
    }
    const material = new THREE.MeshBasicMaterial({
      color,
      alphaMap: this.chalkStampTexture ?? null,
      transparent: true,
      opacity,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -1
    });
    material.toneMapped = false;
    this.chalkMaterials.set(key, material);
    return material;
  }

  canDrawChalk() {
    if (!this.hasChalk) {
      return false;
    }
    if (!this.canUseGameplayControls()) {
      return false;
    }
    if (this.activeTool !== "chalk") {
      return false;
    }
    if (!this.worldContent?.chalk?.enabled || !this.chalkLayer || !this.chalkStampGeometry) {
      return false;
    }
    if (this.chatOpen) {
      return false;
    }
    return true;
  }

  updateChalkPointerFromClient(clientX, clientY) {
    const canvas = this.renderer?.domElement;
    if (!canvas) {
      return;
    }
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return;
    }
    const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.chalkPointer.set(THREE.MathUtils.clamp(nx, -1, 1), THREE.MathUtils.clamp(ny, -1, 1));
  }

  tryDrawChalkMark() {
    if (!this.canDrawChalk()) {
      return false;
    }

    this.chalkRaycaster.setFromCamera(this.chalkPointer, this.camera);
    if (!this.chalkRaycaster.ray.intersectPlane(this.chalkGroundPlane, this.chalkHitPoint)) {
      return false;
    }

    const limit = this.playerBoundsHalfExtent;
    if (Math.abs(this.chalkHitPoint.x) > limit || Math.abs(this.chalkHitPoint.z) > limit) {
      return false;
    }

    const chalkConfig = this.worldContent?.chalk ?? {};
    const minDistance = Math.max(
      0.02,
      Number(chalkConfig.minDistance) || RUNTIME_TUNING.CHALK_MIN_STAMP_DISTANCE
    );
    if (
      this.chalkLastStamp &&
      this.chalkLastStamp.distanceToSquared(this.chalkHitPoint) < minDistance * minDistance
    ) {
      return false;
    }

    const sizeMin = Math.max(
      0.04,
      Number(chalkConfig.markSizeMin) || RUNTIME_TUNING.CHALK_MARK_SIZE_MIN
    );
    const sizeMax = Math.max(
      sizeMin,
      Number(chalkConfig.markSizeMax) || RUNTIME_TUNING.CHALK_MARK_SIZE_MAX
    );
    const size = sizeMin + Math.random() * Math.max(0.001, sizeMax - sizeMin);

    const markHeight =
      Number(chalkConfig.markHeight) || RUNTIME_TUNING.CHALK_MARK_HEIGHT;
    const markOpacity = THREE.MathUtils.clamp(
      Number(chalkConfig.markOpacity) || RUNTIME_TUNING.CHALK_MARK_OPACITY,
      0.1,
      1
    );

    const mark = new THREE.Mesh(
      this.chalkStampGeometry,
      this.getChalkMaterial(this.selectedChalkColor, markOpacity)
    );
    mark.rotation.x = -Math.PI / 2;
    mark.rotation.z = Math.random() * Math.PI * 2;
    mark.position.set(
      this.chalkHitPoint.x,
      markHeight + Math.random() * 0.0015,
      this.chalkHitPoint.z
    );
    mark.scale.set(size, size, 1);
    mark.frustumCulled = true;
    mark.renderOrder = 6;

    this.chalkLayer.add(mark);
    this.chalkMarks.push(mark);

    const maxMarks = Math.max(
      40,
      Number(chalkConfig.maxMarks) || RUNTIME_TUNING.CHALK_MAX_MARKS
    );
    while (this.chalkMarks.length > maxMarks) {
      const oldest = this.chalkMarks.shift();
      if (oldest) {
        this.chalkLayer.remove(oldest);
      }
    }

    if (!this.chalkLastStamp) {
      this.chalkLastStamp = new THREE.Vector3();
    }
    this.chalkLastStamp.copy(this.chalkHitPoint);
    return true;
  }

  updateChalkDrawing() {
    if (!this.chalkDrawingActive) {
      return;
    }
    this.tryDrawChalkMark();
  }

  clearBeachLayer() {
    if (this.beach) {
      this.scene.remove(this.beach);
      this.beach.geometry?.dispose?.();
      this.beach.material?.map?.dispose?.();
      this.beach.material?.normalMap?.dispose?.();
      this.beach.material?.roughnessMap?.dispose?.();
      this.beach.material?.aoMap?.dispose?.();
      this.beach.material?.dispose?.();
      this.beach = null;
    }
    if (this.shoreFoam) {
      this.scene.remove(this.shoreFoam);
      this.shoreFoam.geometry?.dispose?.();
      this.shoreFoam.material?.dispose?.();
      this.shoreFoam = null;
    }
    if (this.shoreWetBand) {
      this.scene.remove(this.shoreWetBand);
      this.shoreWetBand.geometry?.dispose?.();
      this.shoreWetBand.material?.dispose?.();
      this.shoreWetBand = null;
    }
  }

  setupBeachLayer(config = {}, oceanConfig = {}) {
    this.clearBeachLayer();
    if (!config?.enabled) {
      return;
    }

    const maxAnisotropy = this.renderer.capabilities.getMaxAnisotropy();
    const anisotropy = this.mobileEnabled ? Math.min(2, maxAnisotropy) : Math.min(8, maxAnisotropy);
    const loadTiledTexture = (url, repeatX, repeatY, colorSpace = null) => {
      if (!url) {
        return null;
      }
      const texture = this.textureLoader.load(url);
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(repeatX, repeatY);
      texture.anisotropy = anisotropy;
      if (colorSpace) {
        texture.colorSpace = colorSpace;
      }
      return texture;
    };

    const width = Math.max(40, Number(config.width) || 7800);
    const depth = Math.max(60, Number(config.depth) || 220000);
    const shoreDirectionRaw = Number(config.shoreDirection ?? oceanConfig.shoreDirection ?? 1);
    const shoreDirection = shoreDirectionRaw < 0 ? -1 : 1;
    const shorelineCandidate = Number(config.shorelineX ?? oceanConfig.shorelineX);
    const explicitCenterX = Number(config.positionX);
    const hasCenterX = Number.isFinite(explicitCenterX);
    const beachCenterX = hasCenterX
      ? explicitCenterX
      : Number.isFinite(shorelineCandidate)
        ? shorelineCandidate - shoreDirection * width * 0.5
        : 12000 - shoreDirection * width * 0.5;
    const shorelineX = Number.isFinite(shorelineCandidate)
      ? shorelineCandidate
      : beachCenterX + shoreDirection * width * 0.5;
    const explicitZ = Number(config.positionZ ?? oceanConfig.positionZ);
    const beachZ = Number.isFinite(explicitZ) ? explicitZ : 0;
    const repeatX = Number(config.repeatX) || 56;
    const repeatY = Number(config.repeatY) || 950;

    const beachMap = loadTiledTexture(config.textureUrl, repeatX, repeatY, THREE.SRGBColorSpace);
    const beachNormal = loadTiledTexture(config.normalTextureUrl, repeatX, repeatY);
    const beachRoughness = loadTiledTexture(config.roughnessTextureUrl, repeatX, repeatY);
    const beachAo = loadTiledTexture(config.aoTextureUrl, repeatX, repeatY);

    const beachGeometry = new THREE.PlaneGeometry(width, depth, 1, 1);
    const uv = beachGeometry.getAttribute("uv");
    if (uv) {
      beachGeometry.setAttribute("uv2", new THREE.Float32BufferAttribute(Array.from(uv.array), 2));
    }

    const normalScale = Array.isArray(config.normalScale)
      ? new THREE.Vector2(
          Number(config.normalScale[0]) || 1,
          Number(config.normalScale[1]) || Number(config.normalScale[0]) || 1
        )
      : new THREE.Vector2(1, 1);

    const beach = new THREE.Mesh(
      beachGeometry,
      new THREE.MeshStandardMaterial({
        color: config.color ?? 0xd9c08a,
        map: beachMap ?? null,
        normalMap: beachNormal ?? null,
        normalScale,
        roughnessMap: beachRoughness ?? null,
        aoMap: beachAo ?? null,
        aoMapIntensity: Number(config.aoIntensity) || 0.32,
        roughness: Number(config.roughness) || 0.93,
        metalness: Number(config.metalness) || 0,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
        side: THREE.FrontSide
      })
    );
    beach.rotation.x = -Math.PI / 2;
    beach.position.set(
      beachCenterX,
      Number(config.positionY) || 0.025,
      beachZ
    );
    beach.receiveShadow = true;
    beach.renderOrder = 4;
    beach.frustumCulled = false;
    this.beach = beach;
    this.scene.add(this.beach);

    const foamWidth = Math.max(40, Number(config.foamWidth) || 220);
    const foam = new THREE.Mesh(
      new THREE.PlaneGeometry(foamWidth, depth, 1, 1),
      new THREE.MeshBasicMaterial({
        color: config.foamColor ?? 0xe8f7ff,
        transparent: true,
        opacity: Number(config.foamOpacity) || 0.46,
        depthWrite: false,
        depthTest: false
      })
    );
    foam.rotation.x = -Math.PI / 2;
    foam.position.set(
      shorelineX + shoreDirection * foamWidth * 0.4,
      beach.position.y + 0.015,
      beachZ
    );
    foam.userData.baseOpacity = foam.material.opacity;
    foam.userData.elapsed = 0;
    foam.material.toneMapped = false;
    foam.renderOrder = 7;
    foam.frustumCulled = false;
    this.shoreFoam = foam;
    this.scene.add(this.shoreFoam);

    const wetBandWidth = Math.max(60, Number(config.wetBandWidth) || 190);
    const wetBand = new THREE.Mesh(
      new THREE.PlaneGeometry(wetBandWidth, depth, 1, 1),
      new THREE.MeshBasicMaterial({
        color: config.wetBandColor ?? 0xc8a16a,
        transparent: true,
        opacity: Number(config.wetBandOpacity) || 0.28,
        depthWrite: false,
        depthTest: false
      })
    );
    wetBand.rotation.x = -Math.PI / 2;
    wetBand.position.set(
      shorelineX - shoreDirection * wetBandWidth * 0.32,
      beach.position.y + 0.01,
      beachZ
    );
    wetBand.userData.baseOpacity = wetBand.material.opacity;
    wetBand.userData.elapsed = 0;
    wetBand.material.toneMapped = false;
    wetBand.renderOrder = 6;
    wetBand.frustumCulled = false;
    this.shoreWetBand = wetBand;
    this.scene.add(this.shoreWetBand);
  }

  clearOceanLayer() {
    if (this.oceanBase) {
      this.scene.remove(this.oceanBase);
      this.oceanBase.geometry?.dispose?.();
      this.oceanBase.material?.dispose?.();
      this.oceanBase = null;
    }
    if (!this.ocean) {
      return;
    }
    const normalSampler = this.ocean.material?.uniforms?.normalSampler?.value;
    normalSampler?.dispose?.();
    this.scene.remove(this.ocean);
    this.ocean.geometry?.dispose?.();
    this.ocean.material?.dispose?.();
    this.ocean = null;
  }

  setupOceanLayer(config = {}) {
    this.clearOceanLayer();
    if (!config?.enabled) {
      return;
    }

    const width = Math.max(40, Number(config.width) || 120000);
    const depth = Math.max(60, Number(config.depth) || 220000);
    const shoreDirectionRaw = Number(config.shoreDirection ?? 1);
    const shoreDirection = shoreDirectionRaw < 0 ? -1 : 1;
    const shorelineX = Number(config.shorelineX);
    const explicitCenterX = Number(config.positionX);
    const centerX = Number.isFinite(explicitCenterX)
      ? explicitCenterX
      : Number.isFinite(shorelineX)
        ? shorelineX + shoreDirection * width * 0.5
        : 60000;
    const explicitZ = Number(config.positionZ);
    const centerZ = Number.isFinite(explicitZ) ? explicitZ : 0;
    const normalMapUrl =
      String(config.normalTextureUrl ?? "").trim() ||
      "/assets/graphics/world/textures/oss-water/waternormals.jpg";
    const normalMap = this.textureLoader.load(normalMapUrl);
    normalMap.wrapS = THREE.RepeatWrapping;
    normalMap.wrapT = THREE.RepeatWrapping;
    normalMap.repeat.set(Number(config.normalRepeatX) || 20, Number(config.normalRepeatY) || 20);
    normalMap.anisotropy = this.mobileEnabled ? 2 : 4;

    let water;
    try {
      water = new Water(new THREE.PlaneGeometry(width, depth), {
        textureWidth: this.mobileEnabled ? 192 : 448,
        textureHeight: this.mobileEnabled ? 192 : 448,
        waterNormals: normalMap,
        sunDirection: this.sunLight
          ? this.sunLight.position.clone().normalize()
          : new THREE.Vector3(0.4, 0.8, 0.2),
        sunColor: config.sunColor ?? 0xffffff,
        waterColor: config.color ?? 0x2f8ed9,
        distortionScale: Number(config.distortionScale) || 2.2,
        fog: Boolean(this.scene.fog),
        alpha: THREE.MathUtils.clamp(Number(config.opacity) || 0.92, 0.72, 1),
        side: THREE.FrontSide
      });
    } catch {
      normalMap.dispose?.();
      water = new THREE.Mesh(
        new THREE.PlaneGeometry(width, depth),
        new THREE.MeshPhysicalMaterial({
          color: config.color ?? 0x2f8ed9,
          roughness: 0.12,
          metalness: 0.08,
          transmission: 0.04,
          transparent: true,
          opacity: THREE.MathUtils.clamp(Number(config.opacity) || 0.92, 0.72, 1),
          side: THREE.FrontSide
        })
      );
    }

    water.rotation.x = -Math.PI / 2;
    water.position.set(
      centerX,
      Number(config.positionY) || 0.05,
      centerZ
    );
    water.receiveShadow = false;
    water.renderOrder = 3;
    water.frustumCulled = false;
    water.material.depthWrite = false;
    water.material.depthTest = true;
    water.userData.timeScale = Number(config.timeScale) || 0.33;
    water.userData.basePositionY = water.position.y;
    water.userData.bobAmplitude = Number(config.bobAmplitude) || 0.05;
    water.userData.bobFrequency = Number(config.bobFrequency) || 0.45;
    water.userData.elapsed = 0;
    water.userData.shorelineX = Number.isFinite(shorelineX)
      ? shorelineX
      : centerX - shoreDirection * width * 0.5;

    const oceanBase = new THREE.Mesh(
      new THREE.PlaneGeometry(width, depth),
      new THREE.MeshBasicMaterial({
        color: config.color ?? 0x2f8ed9
      })
    );
    oceanBase.rotation.x = -Math.PI / 2;
    oceanBase.position.copy(water.position);
    oceanBase.position.y -= 0.018;
    oceanBase.renderOrder = 2;
    oceanBase.material.toneMapped = false;
    oceanBase.frustumCulled = false;
    this.oceanBase = oceanBase;
    this.scene.add(this.oceanBase);

    this.ocean = water;
    this.scene.add(this.ocean);
  }

  updateOcean(delta) {
    if (!this.ocean) {
      return;
    }
    const uniforms = this.ocean.material?.uniforms;
    if (!uniforms?.time) {
      return;
    }
    const deltaClamped = THREE.MathUtils.clamp(delta, 1 / 180, 1 / 24);
    this.waterDeltaSmoothed = THREE.MathUtils.lerp(this.waterDeltaSmoothed, deltaClamped, 0.18);
    const waterDelta = this.waterDeltaSmoothed;
    const timeScale = Number(this.ocean.userData.timeScale) || 0.33;
    uniforms.time.value += waterDelta * timeScale;

    this.ocean.userData.elapsed = (Number(this.ocean.userData.elapsed) || 0) + waterDelta;
    const amplitude = Number(this.ocean.userData.bobAmplitude) || 0;
    const frequency = Number(this.ocean.userData.bobFrequency) || 0;
    const baseY = Number(this.ocean.userData.basePositionY) || 0;
    if (amplitude > 0 && frequency > 0) {
      this.ocean.position.y = baseY + Math.sin(this.ocean.userData.elapsed * frequency) * amplitude;
    }

    if (this.shoreFoam?.material) {
      this.shoreFoam.userData.elapsed =
        (Number(this.shoreFoam.userData.elapsed) || 0) + waterDelta;
      const pulse = 0.85 + Math.sin(this.shoreFoam.userData.elapsed * 1.4) * 0.15;
      const baseOpacity = Number(this.shoreFoam.userData.baseOpacity) || 0.42;
      this.shoreFoam.material.opacity = THREE.MathUtils.clamp(baseOpacity * pulse, 0.08, 0.95);
      this.shoreFoam.position.y = Math.max(this.ocean.position.y + 0.015, (this.beach?.position.y ?? 0) + 0.01);
    }
    if (this.shoreWetBand?.material) {
      this.shoreWetBand.userData.elapsed =
        (Number(this.shoreWetBand.userData.elapsed) || 0) + waterDelta;
      const pulse = 0.9 + Math.sin(this.shoreWetBand.userData.elapsed * 0.7) * 0.1;
      const baseOpacity = Number(this.shoreWetBand.userData.baseOpacity) || 0.28;
      this.shoreWetBand.material.opacity = THREE.MathUtils.clamp(baseOpacity * pulse, 0.06, 0.8);
      this.shoreWetBand.position.y = Math.max(
        this.ocean.position.y + 0.008,
        (this.beach?.position.y ?? 0) + 0.004
      );
    }
  }

  setupPostProcessing() {
    if (this.composer && typeof this.composer.dispose === "function") {
      this.composer.dispose();
    }

    const bloomConfig = this.worldContent?.postProcessing?.bloom;
    const bloomEnabled =
      Boolean(bloomConfig?.enabled) && (!this.mobileEnabled || Boolean(bloomConfig?.mobileEnabled));
    if (!bloomEnabled) {
      this.composer = null;
      this.bloomPass = null;
      return;
    }

    const composer = new EffectComposer(this.renderer);
    composer.setPixelRatio(this.currentPixelRatio);
    composer.setSize(window.innerWidth, window.innerHeight);

    const renderPass = new RenderPass(this.scene, this.camera);
    composer.addPass(renderPass);

    const bloom = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      Number(bloomConfig.strength) || 0.22,
      Number(bloomConfig.radius) || 0.62,
      Number(bloomConfig.threshold) || 0.86
    );
    composer.addPass(bloom);

    this.composer = composer;
    this.bloomPass = bloom;
  }

  setupHands() {
    const hands = this.handContent;
    const pose = hands.pose ?? {};
    const shoulderX = Number(pose.shoulderX ?? 0.24);
    const shoulderY = Number(pose.shoulderY ?? -0.2);
    const shoulderZ = Number(pose.shoulderZ ?? -0.58);
    const elbowY = Number(pose.elbowY ?? -0.3);
    const elbowZ = Number(pose.elbowZ ?? -0.45);
    const handY = Number(pose.handY ?? -0.4);
    const handZ = Number(pose.handZ ?? -0.33);
    const upperArmRoll = Number(pose.upperArmRoll ?? 0.42);
    const forearmRoll = Number(pose.forearmRoll ?? 0.22);
    const bendX = Number(pose.bendX ?? 0.16);

    const group = new THREE.Group();

    const skin = new THREE.MeshStandardMaterial({
      color: hands.skin.color,
      roughness: hands.skin.roughness,
      metalness: hands.skin.metalness,
      emissive: hands.skin.emissive,
      emissiveIntensity: hands.skin.emissiveIntensity
    });

    const sleeve = new THREE.MeshStandardMaterial({
      color: hands.sleeve.color,
      roughness: hands.sleeve.roughness,
      metalness: hands.sleeve.metalness,
      emissive: hands.sleeve.emissive,
      emissiveIntensity: hands.sleeve.emissiveIntensity
    });

    const upperArmGeometry = new THREE.CapsuleGeometry(0.055, 0.2, 6, 10);
    const forearmGeometry = new THREE.CapsuleGeometry(0.05, 0.2, 6, 10);
    const palmGeometry = new THREE.SphereGeometry(0.078, 10, 8);
    const fingerGeometry = new THREE.CapsuleGeometry(0.016, 0.07, 4, 6);
    const thumbGeometry = new THREE.CapsuleGeometry(0.02, 0.075, 4, 6);

    const buildArm = (side) => {
      const upperArm = new THREE.Mesh(upperArmGeometry, sleeve);
      upperArm.position.set(side * shoulderX, shoulderY, shoulderZ);
      upperArm.rotation.x = bendX;
      upperArm.rotation.z = -side * upperArmRoll;
      upperArm.castShadow = false;

      const forearm = new THREE.Mesh(forearmGeometry, sleeve);
      forearm.position.set(side * (shoulderX + 0.03), elbowY, elbowZ);
      forearm.rotation.x = bendX + 0.05;
      forearm.rotation.z = -side * forearmRoll;
      forearm.castShadow = false;

      const palm = new THREE.Mesh(palmGeometry, skin);
      palm.position.set(side * (shoulderX + 0.05), handY, handZ);
      palm.scale.set(1.12, 0.76, 1.26);
      palm.rotation.x = bendX + 0.09;
      palm.castShadow = false;

      const thumb = new THREE.Mesh(thumbGeometry, skin);
      thumb.position.set(side * (shoulderX + 0.1), handY - 0.005, handZ - 0.01);
      thumb.rotation.x = 0.52;
      thumb.rotation.z = -side * 0.86;
      thumb.castShadow = false;

      const fingerOffsets = [
        [0.03, 0.026],
        [0.012, 0.04],
        [-0.008, 0.048]
      ];
      const fingers = fingerOffsets.map((offset) => {
        const finger = new THREE.Mesh(fingerGeometry, skin);
        finger.position.set(
          side * (shoulderX + offset[0]),
          handY - 0.022,
          handZ + offset[1]
        );
        finger.rotation.x = 0.36;
        finger.rotation.z = -side * 0.15;
        finger.castShadow = false;
        return finger;
      });

      group.add(upperArm, forearm, palm, thumb, ...fingers);
    };

    buildArm(1);
    buildArm(-1);
    group.position.set(0, 0, 0);
    group.rotation.x = hands.groupRotationX;

    this.handView = group;
    this.camera.add(this.handView);
  }

  bindEvents() {
    this.resolveUiElements();
    this.updateFullscreenToggleState();

    window.addEventListener("resize", () => this.onResize());
    document.addEventListener("fullscreenchange", () => this.updateFullscreenToggleState());
    document.addEventListener("webkitfullscreenchange", () => this.updateFullscreenToggleState());

    if (this.fullscreenToggleBtnEl) {
      this.fullscreenToggleBtnEl.addEventListener("click", () => {
        this.toggleFullscreenFromInteraction();
      });
    }
    if (this.graphicsToggleBtnEl) {
      this.graphicsToggleBtnEl.addEventListener("click", (event) => {
        event.preventDefault();
        this.graphicsPanelOpen = !this.graphicsPanelOpen;
        this.syncGraphicsControlsUi();
      });
    }
    if (this.graphicsQualitySelectEl) {
      this.graphicsQualitySelectEl.addEventListener("change", () => {
        this.setGraphicsQuality(this.graphicsQualitySelectEl.value, { persist: true });
      });
    }

    window.addEventListener("keydown", (event) => {
      if (this.isTextInputTarget(event.target)) {
        if (event.code === "Escape") {
          this.setChatOpen(false);
          event.target.blur?.();
        }
        return;
      }

      if (this.surfacePainterOpen) {
        if (event.code === "Escape") {
          event.preventDefault();
          this.closeSurfacePainter();
        }
        return;
      }

      if (!this.mobileEnabled && this.promoPanelDesktopOpen && event.code === "Escape") {
        event.preventDefault();
        this.setPromoPanelDesktopOpen(false, { syncUi: true });
        return;
      }
      if (
        this.promoPlacementPreviewActive &&
        (event.code === "Escape" || (!this.mobileEnabled && event.code === "KeyY"))
      ) {
        event.preventDefault();
        this.clearPromoPlacementPreview({ syncUi: true });
        this.appendChatLine("", "배치 미리보기를 취소했습니다.", "system");
        return;
      }
      if (this.hostCustomBlockPlacementPreviewActive && event.code === "Escape") {
        event.preventDefault();
        this.clearHostCustomBlockPlacementPreview({ syncUi: true });
        this.appendChatLine("", "회색 오브젝트 미리보기를 취소했습니다.", "system");
        return;
      }

      if (event.code === "Tab") {
        event.preventDefault();
        this.setPlayerRosterVisible(true);
        return;
      }

      if (event.code === "KeyG" && this.hasHostPrivilege()) {
        // Always allow turning fly mode off, even when gameplay controls are
        // temporarily blocked by flow/UI state. Turning it on keeps the
        // original gameplay-control gate.
        if (this.flyModeActive || this.canUseGameplayControls()) {
          event.preventDefault();
          this.toggleFlyMode();
          return;
        }
      }

      if (!this.canMovePlayer()) {
        return;
      }

      if (
        event.code === RUNTIME_TUNING.CHAT_OPEN_KEY &&
        this.chatInputEl &&
        this.canUseChatControls()
      ) {
        event.preventDefault();
        this.focusChatInput();
        return;
      }

      if (event.code === "KeyY" && this.canMovePlayer() && !this.mobileEnabled) {
        event.preventDefault();
        this.requestPromoUpsert({ placeInFront: true, preserveExistingStyle: true });
        return;
      }

      if (this.objEditorActive && this.flyModeActive && this.canUseObjectEditor()) {
        if (event.code === "KeyE") {
          event.preventDefault();
          this.adjustSelectedObjEditorHeight(0.25);
          return;
        }
        if (event.code === "KeyQ") {
          event.preventDefault();
          this.adjustSelectedObjEditorHeight(-0.25);
          return;
        }
        if (
          event.code === "KeyR" &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.altKey
        ) {
          event.preventDefault();
          const snap = Boolean(event.shiftKey);
          const rotateStep = snap
            ? OBJECT_EDITOR_ROTATE_SNAP_STEP_RAD
            : OBJECT_EDITOR_ROTATE_STEP_RAD;
          this.rotateSelectedObjEditorYaw(rotateStep, { snap });
          return;
        }
      }

      if (event.code === "KeyF" && this.canMovePlayer()) {
        event.preventDefault();
        if (this.tryOpenSurfacePainterFromInteraction()) {
          return;
        }
        if (!this.hasChalk) {
          this.tryPickupChalk();
        }
        return;
      }

      if (event.code === "KeyB" && this.canUseGameplayControls() && this.hasChalk) {
        event.preventDefault();
        this.setActiveTool(this.activeTool === "chalk" ? "move" : "chalk");
        return;
      }

      if (event.code === "KeyE" && this.canUseGameplayControls()) {
        event.preventDefault();
        this.tryClimbRope();
        return;
      }

      if (event.code === "KeyZ" && this.flyModeActive) {
        event.preventDefault();
        if (this.editorMode === "rope") {
          this.undoLastRope();
        } else if (this.editorMode === "obj") {
          // reserved for future object-editor undo
          return;
        } else {
          this.undoLastPlatform();
        }
        return;
      }

      const colorIndex = this.canUseGameplayControls() ? this.getColorDigitIndex(event.code) : -1;
      if (colorIndex >= 0) {
        this.setChalkColorByIndex(colorIndex);
        return;
      }

      if (event.code === "Space") {
        event.preventDefault();
      }

      this.keys.add(event.code);
      if (event.code === "Space") {
        if (this.climbingRope) {
          this.climbingRope = null;
          this.verticalVelocity = GAME_CONSTANTS.JUMP_FORCE * 0.6;
          return;
        }
        if (this.onGround) {
          this.verticalVelocity = GAME_CONSTANTS.JUMP_FORCE;
          this.onGround = false;
          this.pendingJumpInput = true;
        }
      }
    });

    window.addEventListener("keyup", (event) => {
      if (event.code === "Tab") {
        event.preventDefault();
        this.setPlayerRosterVisible(false);
        return;
      }
      this.keys.delete(event.code);
    });

    window.addEventListener("blur", () => {
      this.keys.clear();
      this.chalkDrawingActive = false;
      this.surfacePainterDrawing = false;
      this.surfacePainterPointerId = null;
      this.mobileLookTouchId = null;
      this.mobileSprintHeld = false;
      this.mobileJumpQueued = false;
      this.pendingJumpInput = false;
      this.objEditorDragging = false;
      this.resetMobileMoveInput();
      this.mobileSprintBtnEl?.classList.remove("active");
      this.mobileJumpBtnEl?.classList.remove("active");
      this.setPlayerRosterVisible(false);
    });

    this.renderer.domElement.addEventListener("click", () => {
      if (this.canDrawChalk()) return;
      this.tryPointerLock();
    });
    // Catch clicks on HUD elements that sit above the canvas
    document.addEventListener("click", (event) => {
      const target = event.target;
      const clickedGraphicsToggle = Boolean(
        target &&
          this.graphicsToggleBtnEl &&
          typeof this.graphicsToggleBtnEl.contains === "function" &&
          this.graphicsToggleBtnEl.contains(target)
      );
      const clickedGraphicsPanel = Boolean(
        target &&
          this.graphicsControlsEl &&
          typeof this.graphicsControlsEl.contains === "function" &&
          this.graphicsControlsEl.contains(target)
      );

      if (this.graphicsPanelOpen && !clickedGraphicsToggle && !clickedGraphicsPanel) {
        this.graphicsPanelOpen = false;
        this.syncGraphicsControlsUi();
      }

      if (clickedGraphicsToggle || clickedGraphicsPanel) {
        return;
      }
      const clickedPromoPanel = Boolean(
        target &&
          this.promoPanelEl &&
          typeof this.promoPanelEl.contains === "function" &&
          this.promoPanelEl.contains(target)
      );
      const clickedPromoPrompt = Boolean(
        target &&
          this.promoLinkPromptEl &&
          typeof this.promoLinkPromptEl.contains === "function" &&
          this.promoLinkPromptEl.contains(target)
      );
      if (clickedPromoPanel || clickedPromoPrompt) {
        return;
      }

      if (this.isTextInputTarget(target)) {
        return;
      }
      if (target === this.renderer.domElement) return;
      if (this.canDrawChalk()) return;
      if (this.chatOpen || this.nicknameGateEl?.classList.contains("hidden") === false) return;
      this.tryPointerLock();
    });
    document.addEventListener("pointerlockerror", () => {
      this.hud.setStatus(this.getStatusText());
    });
    this.renderer.domElement.addEventListener("mousedown", (event) => {
      if (event.button === 0 && this.promoPlacementPreviewActive && this.canMovePlayer()) {
        event.preventDefault();
        this.confirmPromoPlacementPreview();
        return;
      }
      if (event.button === 0 && this.hostCustomBlockPlacementPreviewActive && this.canMovePlayer()) {
        event.preventDefault();
        this.confirmHostCustomBlockPlacementPreview();
        return;
      }
      if (
        event.button === 0 &&
        this.flyModeActive &&
        this.editorMode === "obj" &&
        this.objEditorActive &&
        this.canUseObjectEditor()
      ) {
        event.preventDefault();
        this.beginObjEditorDrag(event.clientX, event.clientY);
        return;
      }
      if (event.button === 0 && this.flyModeActive && this.pointerLocked) {
        if (this.editorMode === "rope") {
          this.placeRopeAtPreview();
        } else if (this.editorMode === "platform") {
          this.placePlatformAtPreview();
        }
        return;
      }
      if (!this.pointerLocked) {
        this.updateChalkPointerFromClient(event.clientX, event.clientY);
      } else {
        this.chalkPointer.set(0, 0);
      }
      if (event.button !== 0 || !this.canDrawChalk()) {
        return;
      }
      this.chalkDrawingActive = true;
      this.chalkLastStamp = null;
      this.tryDrawChalkMark();
    });
    window.addEventListener("mouseup", (event) => {
      if (event.button !== 0) {
        return;
      }
      const wasObjDragging = this.objEditorDragging;
      this.objEditorDragging = false;
      if (wasObjDragging) {
        this.saveObjectPositions({ announceErrors: false, forceFlush: true });
      }
      this.chalkDrawingActive = false;
      this.chalkLastStamp = null;
    });
    this.renderer.domElement.addEventListener("wheel", (event) => {
      if (this.promoPlacementPreviewActive && !this.mobileEnabled && this.canMovePlayer()) {
        event.preventDefault();
        const scaleDelta = THREE.MathUtils.clamp(-event.deltaY * 0.0012, -0.4, 0.4);
        this.adjustPromoPlacementPreviewScale(scaleDelta);
        this.syncPromoPanelUi();
        return;
      }
      if (this.hostCustomBlockPlacementPreviewActive && !this.mobileEnabled && this.canMovePlayer()) {
        event.preventDefault();
        const sizeDelta = THREE.MathUtils.clamp(-event.deltaY * 0.003, -0.8, 0.8);
        this.adjustHostCustomBlockPlacementPreviewSize(sizeDelta);
        return;
      }
      if (!this.flyModeActive) return;
      if (this.editorMode === "obj" && this.objEditorActive && this.canUseObjectEditor()) {
        event.preventDefault();
        this.platformEditorDist = Math.max(2, Math.min(18, this.platformEditorDist - event.deltaY * 0.005));
        return;
      }
      if (!this.pointerLocked) return;
      event.preventDefault();
      if (this.editorMode === "rope") {
        this.ropeEditorHeight = Math.max(0.5, Math.min(50, this.ropeEditorHeight - event.deltaY * 0.005));
        if (this.ropeEditorPreviewMesh) {
          this.ropeEditorPreviewMesh.geometry.dispose();
          this.ropeEditorPreviewMesh.geometry = new THREE.CylinderGeometry(0.07, 0.07, this.ropeEditorHeight, 8);
        }
      } else {
        this.platformEditorDist = Math.max(2, Math.min(12, this.platformEditorDist - event.deltaY * 0.005));
      }
    }, { passive: false });
    this.renderer.domElement.addEventListener(
      "touchstart",
      (event) => {
        const touch = event.changedTouches?.[0] ?? event.touches?.[0];
        if (!touch) {
          return;
        }
        if (this.canDrawChalk()) {
          this.updateChalkPointerFromClient(touch.clientX, touch.clientY);
          this.chalkDrawingActive = true;
          this.chalkLastStamp = null;
          this.tryDrawChalkMark();
          return;
        }
        if (this.mobileEnabled && this.mobileLookTouchId === null) {
          this.mobileLookTouchId = touch.identifier;
          this.mobileLookLastX = touch.clientX;
          this.mobileLookLastY = touch.clientY;
        }
      },
      { passive: true }
    );
    this.renderer.domElement.addEventListener(
      "touchmove",
      (event) => {
        if (this.canDrawChalk()) {
          const drawTouch = event.touches?.[0];
          if (!drawTouch) {
            return;
          }
          this.updateChalkPointerFromClient(drawTouch.clientX, drawTouch.clientY);
          if (this.chalkDrawingActive) {
            this.tryDrawChalkMark();
          }
          return;
        }
        if (!this.mobileEnabled || this.mobileLookTouchId === null) {
          return;
        }
        const lookTouch = Array.from(event.touches ?? []).find(
          (candidate) => candidate.identifier === this.mobileLookTouchId
        );
        if (lookTouch) {
          this.updateMobileLookFromTouch(lookTouch);
        }
      },
      { passive: true }
    );
    window.addEventListener(
      "touchend",
      (event) => {
        if (this.mobileLookTouchId !== null) {
          const endedTouches = Array.from(event.changedTouches ?? []);
          const ended = endedTouches.some(
            (touch) => touch.identifier === this.mobileLookTouchId
          );
          if (ended) {
            this.mobileLookTouchId = null;
          }
        }
        this.chalkDrawingActive = false;
        this.chalkLastStamp = null;
      },
      { passive: true }
    );

    document.addEventListener("pointerlockchange", () => {
      this.pointerLocked = document.pointerLockElement === this.renderer.domElement;
      if (this.pointerLocked) {
        this.chalkPointer.set(0, 0);
      }
      this.hud.setStatus(this.getStatusText());
      if (!this.pointerLocked) {
        this.pendingMouseLookDeltaX = 0;
        this.pendingMouseLookDeltaY = 0;
        this.chalkDrawingActive = false;
        this.chalkLastStamp = null;
      }
    });

    window.addEventListener(
      "mousemove",
      (event) => {
        if (this.objEditorActive && this.objEditorDragging && this.objEditorSelected) {
          this.updateObjEditorDrag(event.clientX, event.clientY);
          return;
        }
        if (!this.pointerLocked && !this.mobileEnabled) {
          this.updateChalkPointerFromClient(event.clientX, event.clientY);
          return;
        }
        if (this.pointerLocked) {
          this.chalkPointer.set(0, 0);
        }
        this.lastLookInputAtMs = typeof performance !== "undefined" ? performance.now() : Date.now();
        this.pendingMouseLookDeltaX += Number(event.movementX) || 0;
        this.pendingMouseLookDeltaY += Number(event.movementY) || 0;
      },
      { passive: true }
    );

    if (this.chatInputEl) {
      this.chatInputEl.addEventListener("focus", () => {
        this.keys.clear();
        this.setChatOpen(true);
      });
      this.chatInputEl.addEventListener("keydown", (event) => {
        const isEnter = event.code === "Enter" || event.key === "Enter";
        const isEscape = event.code === "Escape" || event.key === "Escape";
        if (isEnter) {
          event.preventDefault();
          if (event.repeat) {
            return;
          }
          this.sendChatMessage();
          return;
        }
        if (isEscape) {
          event.preventDefault();
          this.setChatOpen(false);
          this.chatInputEl.blur();
        }
      });
      this.chatInputEl.addEventListener("blur", () => {
        if (this.mobileEnabled) {
          return;
        }
        window.setTimeout(() => {
          const activeElement = typeof document !== "undefined" ? document.activeElement : null;
          if (activeElement && this.chatUiEl?.contains(activeElement)) {
            return;
          }
          this.setChatOpen(false);
        }, 0);
      });
    }
    if (this.chatToggleBtnEl) {
      this.chatToggleBtnEl.addEventListener("click", () => {
        if (!this.canUseChatControls()) {
          return;
        }
        if (this.chatOpen) {
          this.setChatOpen(false);
          this.chatInputEl?.blur();
        } else {
          this.focusChatInput();
        }
      });
    }
    if (this.chatExpandBtnEl) {
      this.chatExpandBtnEl.addEventListener("click", () => {
        if (!this.canUseChatControls() || !this.chatOpen) {
          return;
        }
        this.setChatHistoryExpanded(!this.chatHistoryExpanded, { requestHistory: true });
      });
    }
    if (this.chatSendBtnEl) {
      this.chatSendBtnEl.addEventListener("pointerdown", (event) => {
        // Keep focus on chat input so desktop send-click does not collapse chat before send.
        event.preventDefault();
      });
      this.chatSendBtnEl.addEventListener("click", () => {
        this.sendChatMessage();
      });
    }
    if (this.chatLogEl) {
      this.chatLogEl.addEventListener("pointerdown", () => {
        if (!this.mobileEnabled || this.chatOpen || !this.canUseChatControls()) {
          return;
        }
        this.focusChatInput();
      });
    }

    if (this.hostChatToggleBtnEl) {
      this.hostChatToggleBtnEl.addEventListener("click", () => {
        if (!this.canUseHostChatShortcut()) {
          return;
        }
        if (this.chatOpen) {
          this.setChatOpen(false);
          this.chatInputEl?.blur();
          return;
        }
        this.focusChatInput();
      });
    }
    if (this.hostControlsToggleBtnEl) {
      this.hostControlsToggleBtnEl.addEventListener("click", () => {
        if (!this.hubFlowEnabled || !this.hasHostPrivilege()) {
          return;
        }
        this.hostControlsOpen = !this.hostControlsOpen;
        this.syncHostControls();
      });
    }

    if (this.toolHotbarEl) {
      this.toolHotbarEl.addEventListener("click", (event) => {
        const button = event.target?.closest?.(".tool-slot[data-tool]");
        if (!button) {
          return;
        }
        this.setActiveTool(String(button.dataset.tool || "move"));
      });
    }

    if (this.chalkColorsEl) {
      this.chalkColorsEl.addEventListener("click", (event) => {
        const button = event.target?.closest?.(".chalk-color[data-color]");
        if (!button) {
          return;
        }
        this.setChalkColor(String(button.dataset.color || this.selectedChalkColor));
      });
    }

    if (this.mobileMovePadEl) {
      this.mobileMovePadEl.addEventListener("pointerdown", (event) => {
        if (!this.mobileEnabled || !this.canMovePlayer()) {
          return;
        }
        this.mobileMovePointerId = event.pointerId;
        this.mobileMovePadEl.setPointerCapture?.(event.pointerId);
        this.updateMobileMoveFromPointer(event.clientX, event.clientY);
      });
      this.mobileMovePadEl.addEventListener("pointermove", (event) => {
        if (!this.mobileEnabled || event.pointerId !== this.mobileMovePointerId) {
          return;
        }
        this.updateMobileMoveFromPointer(event.clientX, event.clientY);
      });
      const clearMovePointer = (event) => {
        if (event.pointerId !== this.mobileMovePointerId) {
          return;
        }
        this.mobileMovePadEl.releasePointerCapture?.(event.pointerId);
        this.resetMobileMoveInput();
      };
      this.mobileMovePadEl.addEventListener("pointerup", clearMovePointer);
      this.mobileMovePadEl.addEventListener("pointercancel", clearMovePointer);
      this.mobileMovePadEl.addEventListener("pointerleave", clearMovePointer);
    }

    if (this.mobileJumpBtnEl) {
      const clearJumpVisual = () => this.mobileJumpBtnEl.classList.remove("active");
      this.mobileJumpBtnEl.addEventListener("pointerdown", () => {
        if (!this.mobileEnabled || !this.canMovePlayer()) {
          return;
        }
        this.mobileJumpQueued = true;
        this.pendingJumpInput = true;
        this.mobileJumpBtnEl.classList.add("active");
      });
      this.mobileJumpBtnEl.addEventListener("pointerup", clearJumpVisual);
      this.mobileJumpBtnEl.addEventListener("pointercancel", clearJumpVisual);
      this.mobileJumpBtnEl.addEventListener("pointerleave", clearJumpVisual);
    }

    if (this.mobileSprintBtnEl) {
      const setSprint = (active) => {
        this.mobileSprintHeld = Boolean(active && this.mobileEnabled && this.canMovePlayer());
        this.mobileSprintBtnEl.classList.toggle("active", this.mobileSprintHeld);
      };
      this.mobileSprintBtnEl.addEventListener("pointerdown", () => setSprint(true));
      this.mobileSprintBtnEl.addEventListener("pointerup", () => setSprint(false));
      this.mobileSprintBtnEl.addEventListener("pointercancel", () => setSprint(false));
      this.mobileSprintBtnEl.addEventListener("pointerleave", () => setSprint(false));
    }

    if (this.mobileChatBtnEl) {
      this.mobileChatBtnEl.addEventListener("pointerdown", () => {
        if (!this.mobileEnabled || !this.canUseChatControls()) {
          return;
        }
        if (this.chatOpen) {
          this.setChatOpen(false);
          this.chatInputEl?.blur?.();
          return;
        }
        this.focusChatInput();
      });
    }
    if (this.mobilePaintBtnEl) {
      this.mobilePaintBtnEl.addEventListener("pointerdown", () => {
        if (!this.mobileEnabled || !this.canMovePlayer()) {
          return;
        }
        this.tryOpenSurfacePainterFromInteraction();
      });
    }
    if (this.mobilePromoPlaceBtnEl) {
      this.mobilePromoPlaceBtnEl.addEventListener("pointerdown", () => {
        if (!this.mobileEnabled || !this.canMovePlayer()) {
          return;
        }
        this.requestPromoUpsert({ placeInFront: true, preserveExistingStyle: true });
      });
    }
    if (this.promoScaleInputEl) {
      this.promoScaleInputEl.addEventListener("input", () => {
        const value = Number(this.promoScaleInputEl?.value);
        if (this.promoScaleValueEl && Number.isFinite(value)) {
          this.promoScaleValueEl.textContent = `${value.toFixed(2)}x`;
        }
        if (
          this.mobilePromoScaleInputEl &&
          Number.isFinite(value) &&
          document.activeElement !== this.mobilePromoScaleInputEl
        ) {
          this.mobilePromoScaleInputEl.value = value.toFixed(2);
        }
        if (this.mobilePromoScaleValueEl && Number.isFinite(value)) {
          this.mobilePromoScaleValueEl.textContent = `${value.toFixed(2)}x`;
        }
        if (this.promoPlacementPreviewActive) {
          this.promoPlacementPreviewCurrentScale = Number.isFinite(value)
            ? value
            : this.promoPlacementPreviewCurrentScale;
          this.updatePromoPlacementPreview();
          this.syncPromoPanelUi();
        }
      });
    }
    if (this.mobilePromoScaleInputEl) {
      this.mobilePromoScaleInputEl.addEventListener("input", () => {
        const value = Number(this.mobilePromoScaleInputEl?.value);
        if (!Number.isFinite(value)) {
          return;
        }
        if (this.promoScaleInputEl && document.activeElement !== this.promoScaleInputEl) {
          this.promoScaleInputEl.value = value.toFixed(2);
        }
        if (this.promoScaleValueEl) {
          this.promoScaleValueEl.textContent = `${value.toFixed(2)}x`;
        }
        if (this.mobilePromoScaleValueEl) {
          this.mobilePromoScaleValueEl.textContent = `${value.toFixed(2)}x`;
        }
        if (this.promoPlacementPreviewActive) {
          this.promoPlacementPreviewCurrentScale = value;
          this.updatePromoPlacementPreview();
          this.syncPromoPanelUi();
        }
      });
    }
    if (this.promoAllowOthersDrawEl) {
      this.promoAllowOthersDrawEl.addEventListener("input", () => {
        const lockEnabled = Boolean(this.promoAllowOthersDrawEl?.checked);
        this.promoAllowOthersDrawDraft = !lockEnabled;
        this.syncPromoPanelUi();
        if (this.isHostEntryLink) {
          this.appendChatLine(
            "",
            this.getPromoEditLockStatusText(!lockEnabled, { draft: true }),
            "system"
          );
        }
      });
    }
    if (this.promoDrawBgInputEl) {
      this.promoDrawBgInputEl.addEventListener("input", () => {
        this.applyPromoDrawBackgroundColor({ announce: false, applyToMedia: true });
      });
    }
    if (this.promoMediaPickBtnEl && this.promoMediaFileInputEl) {
      this.promoMediaPickBtnEl.addEventListener("click", () => {
        this.promoMediaFileInputEl.click();
      });
      this.promoMediaFileInputEl.addEventListener("change", () => {
        const file = this.promoMediaFileInputEl?.files?.[0] ?? null;
        void this.loadPromoMediaFromFile(file);
        this.promoMediaFileInputEl.value = "";
      });
    }
    if (this.promoMediaFolderBtnEl && this.promoMediaFolderInputEl) {
      this.promoMediaFolderBtnEl.addEventListener("click", () => {
        this.promoMediaFolderInputEl.click();
      });
      this.promoMediaFolderInputEl.addEventListener("change", () => {
        const files = Array.from(this.promoMediaFolderInputEl?.files ?? []);
        const target = files.find((file) => {
          const type = String(file?.type ?? "").toLowerCase();
          const name = String(file?.name ?? "").toLowerCase();
          return type === "image/webp" || name.endsWith(".webp");
        }) ?? null;
        void this.loadPromoMediaFromFile(target);
        this.promoMediaFolderInputEl.value = "";
      });
    }
    this.promoMediaClearBtnEl?.addEventListener("click", () => {
      this.clearPromoPendingMedia();
    });
    this.promoPlaceBtnEl?.addEventListener("click", () => {
      this.requestPromoUpsert({ placeInFront: true });
    });
    this.promoSaveBtnEl?.addEventListener("click", () => {
      this.requestPromoUpsert({ placeInFront: false });
    });
    this.promoRemoveBtnEl?.addEventListener("click", () => {
      this.requestPromoRemove({ startPlacementPreviewOnSuccess: false });
    });
    if (this.promoLinkInputEl) {
      this.promoLinkInputEl.addEventListener("keydown", (event) => {
        if (event.code !== "Enter") {
          return;
        }
        event.preventDefault();
        this.requestPromoUpsert({ placeInFront: false });
      });
    }
    this.promoOpenLinkBtnEl?.addEventListener("click", () => {
      this.openNearestPromoLink();
    });
    this.promoPanelCloseBtnEl?.addEventListener("click", () => {
      this.setPromoPanelMobileOpen(false);
    });
    if (this.promoDrawCanvasEl) {
      this.promoDrawCanvasEl.addEventListener("pointerdown", (event) => {
        this.beginPromoDrawStrokeAt(event.clientX, event.clientY, event.pointerId);
      });
      this.promoDrawCanvasEl.addEventListener("pointermove", (event) => {
        this.continuePromoDrawStrokeAt(event.clientX, event.clientY, event.pointerId);
      });
      this.promoDrawCanvasEl.addEventListener("pointerup", (event) => {
        this.endPromoDrawStroke(event.pointerId);
      });
      this.promoDrawCanvasEl.addEventListener("pointercancel", (event) => {
        this.endPromoDrawStroke(event.pointerId);
      });
      this.promoDrawCanvasEl.addEventListener("pointerleave", (event) => {
        this.endPromoDrawStroke(event.pointerId);
      });
    }
    this.promoDrawClearBtnEl?.addEventListener("click", () => {
      this.clearPromoDrawCanvas({ announce: true });
    });
    this.promoDrawApplyBtnEl?.addEventListener("click", () => {
      this.applyPromoDrawCanvasToMedia({ announce: true });
    });

    if (this.hostOpenPortalBtnEl) {
      this.hostOpenPortalBtnEl.addEventListener("click", () => {
        const schedule = this.getPortalScheduleComputed();
        const portalOpenNow = schedule.mode === "open" || schedule.mode === "open_manual";
        if (portalOpenNow) {
          this.requestPortalForceClose();
          return;
        }
        this.requestPortalForceOpen();
      });
    }
    if (this.hostScheduleControlsEl) {
      this.hostScheduleControlsEl.addEventListener("click", (event) => {
        const button = event.target?.closest?.(".host-delay-btn[data-delay-min]");
        if (!button) {
          return;
        }
        const delayMinutes = Math.trunc(Number(button.dataset.delayMin) || 0);
        if (delayMinutes <= 0) {
          return;
        }
        if (this.hostDelayMinutesInputEl) {
          this.hostDelayMinutesInputEl.value = String(delayMinutes);
        }
        if (this.hostDelayUnitSelectEl) {
          this.hostDelayUnitSelectEl.value = "minute";
        }
        this.requestPortalScheduleSet(delayMinutes * 60);
      });
    }
    if (this.hostApplyDelayBtnEl) {
      this.hostApplyDelayBtnEl.addEventListener("click", () => {
        const delayAmount = Math.trunc(Number(this.hostDelayMinutesInputEl?.value) || 0);
        if (delayAmount <= 0) {
          this.appendChatLine("", "예약 시간(분/시간)을 다시 입력하세요.", "system");
          this.hostDelayMinutesInputEl?.focus?.();
          return;
        }
        const unit = String(this.hostDelayUnitSelectEl?.value ?? "minute").trim().toLowerCase();
        const delaySeconds = delayAmount * (unit === "hour" ? 60 * 60 : 60);
        this.requestPortalScheduleSet(delaySeconds);
      });
    }
    if (this.hostDelayMinutesInputEl) {
      this.hostDelayMinutesInputEl.addEventListener("keydown", (event) => {
        if (event.code !== "Enter") {
          return;
        }
        event.preventDefault();
        this.hostApplyDelayBtnEl?.click?.();
      });
    }
    if (this.hostPortalTargetApplyBtnEl) {
      this.hostPortalTargetApplyBtnEl.addEventListener("click", () => {
        const raw = String(this.hostPortalTargetInputEl?.value ?? "").trim();
        const normalized = this.normalizePortalTargetUrl(raw, "");
        if (!normalized) {
          this.appendChatLine("", "유효한 http/https 링크를 입력하세요.", "system");
          this.hostPortalTargetInputEl?.focus?.();
          return;
        }
        this.hostPortalTargetCandidate = normalized;
        this.hostPortalTargetSynced = false;
        this.requestPortalTargetUpdate(normalized, { announceSuccess: true, announceErrors: true });
      });
    }
    if (this.hostPortalTargetInputEl) {
      this.hostPortalTargetInputEl.addEventListener("keydown", (event) => {
        if (event.code !== "Enter") {
          return;
        }
        event.preventDefault();
        this.hostPortalTargetApplyBtnEl?.click?.();
      });
    }
    if (this.hostAZonePortalTargetApplyBtnEl) {
      this.hostAZonePortalTargetApplyBtnEl.addEventListener("click", () => {
        const raw = String(this.hostAZonePortalTargetInputEl?.value ?? "").trim();
        const normalized = this.normalizePortalTargetUrl(raw, "");
        if (!normalized) {
          this.appendChatLine("", "유효한 http/https 링크를 입력하세요.", "system");
          this.hostAZonePortalTargetInputEl?.focus?.();
          return;
        }
        this.hostAZonePortalTargetCandidate = normalized;
        this.hostAZonePortalTargetSynced = false;
        this.requestAZonePortalTargetUpdate(normalized, {
          announceSuccess: true,
          announceErrors: true
        });
      });
    }
    if (this.hostAZonePortalTargetInputEl) {
      this.hostAZonePortalTargetInputEl.addEventListener("keydown", (event) => {
        if (event.code !== "Enter") {
          return;
        }
        event.preventDefault();
        this.hostAZonePortalTargetApplyBtnEl?.click?.();
      });
    }
    const bindPortalDisplayControls = ({
      portalKey,
      titleInputEl,
      modeSelectEl,
      line2InputEl,
      line3InputEl,
      fileInputEl,
      applyBtnEl,
      resetBtnEl
    }) => {
      fileInputEl?.addEventListener("change", () => {
        const file = fileInputEl?.files?.[0] ?? null;
        this.handleHostPortalDisplayFileSelected(portalKey, file);
        fileInputEl.value = "";
      });
      applyBtnEl?.addEventListener("click", () => {
        const title = String(titleInputEl?.value ?? "").trim();
        const mode = String(modeSelectEl?.value ?? "text").trim().toLowerCase();
        const line2 = String(line2InputEl?.value ?? "").trim();
        const line3 = String(line3InputEl?.value ?? "").trim();
        const pendingImageDataUrl = String(
          this.hostPortalDisplayPendingImageDataUrls?.[portalKey] ?? ""
        ).trim();
        this.requestPortalDisplaySet(
          portalKey,
          {
            mode,
            title,
            line2,
            line3,
            ...(pendingImageDataUrl ? { imageDataUrl: pendingImageDataUrl } : {})
          },
          { announceErrors: true }
        );
      });
      resetBtnEl?.addEventListener("click", () => {
        this.requestPortalDisplayReset(portalKey, { announceErrors: true });
      });
      const bindEnterToApply = (element) => {
        element?.addEventListener("keydown", (event) => {
          if (event.code !== "Enter") {
            return;
          }
          event.preventDefault();
          applyBtnEl?.click?.();
        });
      };
      bindEnterToApply(titleInputEl);
      bindEnterToApply(line2InputEl);
      bindEnterToApply(line3InputEl);
    };
    bindPortalDisplayControls({
      portalKey: "portal1",
      titleInputEl: this.hostPortal1NameInputEl,
      modeSelectEl: this.hostPortal1ModeSelectEl,
      line2InputEl: this.hostPortal1Line2InputEl,
      line3InputEl: this.hostPortal1Line3InputEl,
      fileInputEl: this.hostPortal1ImageFileInputEl,
      applyBtnEl: this.hostPortal1ApplyBtnEl,
      resetBtnEl: this.hostPortal1ResetBtnEl
    });
    bindPortalDisplayControls({
      portalKey: "portal2",
      titleInputEl: this.hostPortal2NameInputEl,
      modeSelectEl: null,
      line2InputEl: null,
      line3InputEl: null,
      fileInputEl: this.hostPortal2ImageFileInputEl,
      applyBtnEl: this.hostPortal2ApplyBtnEl,
      resetBtnEl: this.hostPortal2ResetBtnEl
    });
    bindPortalDisplayControls({
      portalKey: "hall",
      titleInputEl: this.hostHallPortalTitleInputEl,
      modeSelectEl: this.hostHallPortalModeSelectEl,
      line2InputEl: this.hostHallPortalLine2InputEl,
      line3InputEl: this.hostHallPortalLine3InputEl,
      fileInputEl: null,
      applyBtnEl: this.hostHallPortalApplyBtnEl,
      resetBtnEl: this.hostHallPortalResetBtnEl
    });
    if (this.hostMainPortalAdFileInputEl) {
      this.hostMainPortalAdFileInputEl.addEventListener("change", () => {
        const file = this.hostMainPortalAdFileInputEl?.files?.[0] ?? null;
        this.handleHostMainPortalAdFileSelected(file);
        this.hostMainPortalAdFileInputEl.value = "";
      });
    }
    if (this.hostMainPortalAdApplyBtnEl) {
      this.hostMainPortalAdApplyBtnEl.addEventListener("click", () => {
        const dataUrl = String(this.hostMainPortalAdPendingDataUrl ?? "").trim();
        if (!dataUrl) {
          this.appendChatLine("", "먼저 메인 포탈 광고 이미지 파일을 선택하세요.", "system");
          this.hostMainPortalAdFileInputEl?.focus?.();
          return;
        }
        this.requestMainPortalAdSet(dataUrl, { announceErrors: true });
      });
    }
    if (this.hostMainPortalAdResetBtnEl) {
      this.hostMainPortalAdResetBtnEl.addEventListener("click", () => {
        this.requestMainPortalAdReset({ announceErrors: true });
      });
    }
    if (this.hostPlayRightVideoBtnEl) {
      this.hostPlayRightVideoBtnEl.addEventListener("click", () => {
        const videoId = String(this.hostRightVideoSelectEl?.value ?? "").trim();
        this.requestRightBillboardVideoPlay(videoId);
      });
    }
    for (const button of this.hostRightVideoQuickButtons ?? []) {
      button.addEventListener("click", () => {
        const videoId = this.normalizeRightBillboardVideoId(button.dataset.videoId ?? "");
        if (!videoId) {
          return;
        }
        if (this.hostRightVideoSelectEl) {
          this.hostRightVideoSelectEl.value = videoId;
        }
        this.requestRightBillboardVideoPlay(videoId);
      });
    }
    if (this.hostRightVideoSelectEl) {
      this.hostRightVideoSelectEl.addEventListener("keydown", (event) => {
        if (event.code !== "Enter") {
          return;
        }
        event.preventDefault();
        this.hostPlayRightVideoBtnEl?.click?.();
      });
    }
    if (this.hostResetRightVideoBtnEl) {
      this.hostResetRightVideoBtnEl.addEventListener("click", () => {
        this.requestRightBillboardReset({ announceErrors: true });
      });
    }
    if (this.hostBillboardVideoFileInputEl) {
      this.hostBillboardVideoFileInputEl.addEventListener("change", () => {
        const file = this.hostBillboardVideoFileInputEl?.files?.[0] ?? null;
        this.handleHostBillboardVideoFileSelected(file);
        this.hostBillboardVideoFileInputEl.value = "";
      });
    }
    const applyPendingBillboardVideo = (target) => {
      const dataUrl = this.normalizeBillboardVideoDataUrl(this.hostBillboardVideoPendingDataUrl);
      if (!dataUrl) {
        this.appendChatLine("", "먼저 실시간 MP4 파일을 선택하세요.", "system");
        this.hostBillboardVideoFileInputEl?.focus?.();
        return;
      }
      this.requestBillboardVideoDataSet(dataUrl, target);
    };
    if (this.hostBillboardVideoPlayLeftBtnEl) {
      this.hostBillboardVideoPlayLeftBtnEl.addEventListener("click", () => {
        applyPendingBillboardVideo("left");
      });
    }
    if (this.hostBillboardVideoPlayRightBtnEl) {
      this.hostBillboardVideoPlayRightBtnEl.addEventListener("click", () => {
        applyPendingBillboardVideo("right");
      });
    }
    if (this.hostBillboardVideoPlayBothBtnEl) {
      this.hostBillboardVideoPlayBothBtnEl.addEventListener("click", () => {
        applyPendingBillboardVideo("both");
      });
    }
    if (this.hostSecurityTestToggleBtnEl) {
      this.hostSecurityTestToggleBtnEl.addEventListener("click", () => {
        this.requestHostSecurityTestToggle(!this.securityTestState.enabled);
      });
    }
    if (this.hostLeftImageFileInputEl) {
      this.hostLeftImageFileInputEl.addEventListener("change", () => {
        const file = this.hostLeftImageFileInputEl?.files?.[0];
        if (!file) return;
        if (file.type && !file.type.startsWith("image/")) {
          this.appendChatLine("", "이미지 파일만 업로드할 수 있습니다.", "system");
          this.hostLeftImageFileInputEl.value = "";
          return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
          this.requestLeftBillboardImageSet(String(e.target?.result ?? ""));
        };
        reader.onerror = () => {
          this.appendChatLine("", "이미지 파일을 읽지 못했습니다.", "system");
        };
        reader.readAsDataURL(file);
        this.hostLeftImageFileInputEl.value = "";
      });
    }
    if (this.hostResetLeftImageBtnEl) {
      this.hostResetLeftImageBtnEl.addEventListener("click", () => {
        this.requestLeftBillboardReset({ announceErrors: true });
        if (this.hostLeftImageFileInputEl) this.hostLeftImageFileInputEl.value = "";
      });
    }
    if (this.hostMusicFileInputEl) {
      this.hostMusicFileInputEl.addEventListener("change", () => {
        const file = this.hostMusicFileInputEl?.files?.[0];
        if (!file) {
          return;
        }
        this.appendChatLine("", `선택된 음악: ${String(file.name ?? "").trim()}`, "system");
      });
    }
    if (this.hostMusicPlayBtnEl) {
      this.hostMusicPlayBtnEl.addEventListener("click", () => {
        void this.requestHostSharedMusicPlay();
      });
    }
    if (this.hostMusicStopBtnEl) {
      this.hostMusicStopBtnEl.addEventListener("click", () => {
        this.requestHostSharedMusicStop();
      });
    }

    if (this.surfacePainterCanvasEl) {
      this.surfacePainterCanvasEl.addEventListener("pointerdown", (event) => {
        this.beginSurfacePainterStrokeAt(event.clientX, event.clientY, event.pointerId, true);
      });
      this.surfacePainterCanvasEl.addEventListener("pointermove", (event) => {
        this.continueSurfacePainterStrokeAt(event.clientX, event.clientY, event.pointerId);
      });
      this.surfacePainterCanvasEl.addEventListener("pointerup", (event) => {
        this.endSurfacePainterStroke(event.pointerId, true);
      });
      this.surfacePainterCanvasEl.addEventListener("pointercancel", (event) => {
        this.endSurfacePainterStroke(event.pointerId, true);
      });
      this.surfacePainterCanvasEl.addEventListener("pointerleave", (event) => {
        this.endSurfacePainterStroke(event.pointerId, true);
      });
      this.surfacePainterCanvasEl.addEventListener(
        "touchstart",
        (event) => {
          if (!this.surfacePainterOpen) {
            return;
          }
          const touch = event.changedTouches?.[0] ?? event.touches?.[0];
          if (!touch) {
            return;
          }
          event.preventDefault();
          this.surfacePainterTouchId = touch.identifier;
          const syntheticPointerId = 10000 + touch.identifier;
          this.beginSurfacePainterStrokeAt(
            touch.clientX,
            touch.clientY,
            syntheticPointerId,
            false
          );
        },
        { passive: false }
      );
      this.surfacePainterCanvasEl.addEventListener(
        "touchmove",
        (event) => {
          if (!this.surfacePainterOpen || this.surfacePainterTouchId === null) {
            return;
          }
          const touch = Array.from(event.touches ?? []).find(
            (candidate) => candidate.identifier === this.surfacePainterTouchId
          );
          if (!touch) {
            return;
          }
          event.preventDefault();
          this.continueSurfacePainterStrokeAt(
            touch.clientX,
            touch.clientY,
            10000 + this.surfacePainterTouchId
          );
        },
        { passive: false }
      );
      const endTouchStroke = (event) => {
        if (this.surfacePainterTouchId === null) {
          return;
        }
        const ended = Array.from(event.changedTouches ?? []).some(
          (touch) => touch.identifier === this.surfacePainterTouchId
        );
        if (!ended) {
          return;
        }
        event.preventDefault();
        this.endSurfacePainterStroke(10000 + this.surfacePainterTouchId, false);
        this.surfacePainterTouchId = null;
      };
      this.surfacePainterCanvasEl.addEventListener("touchend", endTouchStroke, {
        passive: false
      });
      this.surfacePainterCanvasEl.addEventListener("touchcancel", endTouchStroke, {
        passive: false
      });
    }

    this.surfacePainterClearBtnEl?.addEventListener("click", () => {
      this.handleSurfacePainterDeleteAction();
    });
    this.surfacePainterCancelBtnEl?.addEventListener("click", () => {
      this.closeSurfacePainter();
    });
    this.surfacePainterSaveBtnEl?.addEventListener("click", () => {
      void this.saveSurfacePainter();
    });
    this.surfacePainterExportBtnEl?.addEventListener("click", () => {
      this.exportSurfacePainterAsPng();
    });
    this.surfacePainterImportBtnEl?.addEventListener("click", () => {
      this.triggerSurfacePainterPngImport();
    });
    this.surfacePainterImportInputEl?.addEventListener("change", (event) => {
      this.handleSurfacePainterImportInputChange(event);
    });
    this.surfacePainterPromoRepositionBtnEl?.addEventListener("click", () => {
      this.requestPromoRepositionFromSurfacePainter();
    });
    this.surfacePainterPromoRemoveBtnEl?.addEventListener("click", () => {
      this.requestPromoRemoveFromSurfacePainter();
    });
    this.surfacePainterPromoScaleDownBtnEl?.addEventListener("click", () => {
      this.requestPromoScaleFromSurfacePainter(-0.5);
    });
    this.surfacePainterPromoScaleUpBtnEl?.addEventListener("click", () => {
      this.requestPromoScaleFromSurfacePainter(0.5);
    });
    this.surfacePainterPromoShareToggleBtnEl?.addEventListener("click", () => {
      if (this.isHostControlledSurfaceId(this.surfacePainterTargetId)) {
        this.toggleHostControlledSurfaceAllowOthersDraw();
        return;
      }
      this.toggleSurfacePainterPromoAllowOthersDraw();
    });
    this.surfacePainterFillBtnEl?.addEventListener("click", () => {
      this.toggleSurfacePainterFillMode();
    });
    this.surfacePainterBgColorInputEl?.addEventListener("input", () => {
      this.applySurfacePainterBackgroundColor();
    });
    this.surfacePainterEraserBtnEl?.addEventListener("click", () => {
      this.setSurfacePainterEraserEnabled(!this.surfacePainterEraserEnabled);
    });
    this.surfacePainterActionsToggleBtnEl?.addEventListener("click", () => {
      this.toggleSurfacePainterActionsCollapsed();
    });

    const applyEditorSettingsFromPanel = () => {
      const platformLimit = Math.trunc(Number(this.editorPlatformLimitInputEl?.value));
      const ropeLimit = Math.trunc(Number(this.editorRopeLimitInputEl?.value));
      const platformScale = Number(this.editorPlatformScaleInputEl?.value);
      const ropeScale = Number(this.editorRopeScaleInputEl?.value);
      this.requestObjectEditorSettingsUpdate(
        {
          platformLimit,
          ropeLimit,
          platformScale,
          ropeScale,
          updatedAt: Date.now()
        },
        { announceErrors: true }
      );
    };

    this.editorSettingsApplyBtnEl?.addEventListener("click", () => {
      applyEditorSettingsFromPanel();
    });
    this.editorPlatformLimitInputEl?.addEventListener("keydown", (event) => {
      if (event.code !== "Enter") {
        return;
      }
      event.preventDefault();
      applyEditorSettingsFromPanel();
    });
    this.editorRopeLimitInputEl?.addEventListener("keydown", (event) => {
      if (event.code !== "Enter") {
        return;
      }
      event.preventDefault();
      applyEditorSettingsFromPanel();
    });
    this.editorPlatformScaleInputEl?.addEventListener("input", () => {
      const value = Number(this.editorPlatformScaleInputEl?.value);
      if (this.editorPlatformScaleValueEl && Number.isFinite(value)) {
        this.editorPlatformScaleValueEl.textContent = `${value.toFixed(2)}x`;
      }
    });
    this.editorRopeScaleInputEl?.addEventListener("input", () => {
      const value = Number(this.editorRopeScaleInputEl?.value);
      if (this.editorRopeScaleValueEl && Number.isFinite(value)) {
        this.editorRopeScaleValueEl.textContent = `${value.toFixed(2)}x`;
      }
    });

    this.platformEditorSaveBtnEl?.addEventListener("click", () => {
      if (this.socket && this.networkConnected && !this.hasHostPrivilege()) {
        this.appendChatLine("", "점프맵 저장은 방장만 가능합니다.", "system");
        this.requestPlatformState();
        this.requestRopeState();
        this.requestObjectState();
        return;
      }
      this.savePlatforms({ forceFlush: true });
      this.saveRopes({ forceFlush: true });
      this.saveObjectPositions({ forceFlush: true });
    });
    this.platformEditorDeleteOneBtnEl?.addEventListener("click", () => {
      this.requestDeletePlatformFromHostPanel();
    });
    this.platformEditorClearBtnEl?.addEventListener("click", () => {
      for (const mesh of this.jumpPlatformMeshes) {
        this.scene.remove(mesh);
        mesh.geometry.dispose();
        mesh.material.dispose();
      }
      this.jumpPlatforms = [];
      this.jumpPlatformMeshes = [];
      this.resetPlatformSpatialIndex();
      for (const mesh of this.jumpRopeMeshes) {
        this.scene.remove(mesh);
        mesh.geometry.dispose();
        mesh.material.dispose();
      }
      this.jumpRopes = [];
      this.jumpRopeMeshes = [];
      this.climbingRope = null;
      this.savePlatforms({ forceFlush: true });
      this.saveRopes({ forceFlush: true });
      this.updatePlatformEditorCount();
      this.updateRopeEditorCount();
    });
    this.editorModePlatformBtnEl?.addEventListener("click", () => {
      this.setEditorMode("platform");
    });
    this.editorModeRopeBtnEl?.addEventListener("click", () => {
      this.setEditorMode("rope");
    });
    this.editorModeObjBtnEl?.addEventListener("click", () => {
      this.setEditorMode("obj");
    });
    this.hostGrayObjectAddBtnEl?.addEventListener("click", () => {
      this.requestHostCustomPaintBlockAdd();
    });
    this.hostGrayObjectDeleteBtnEl?.addEventListener("click", () => {
      this.requestDeleteHostCustomPaintBlockFromHostPanel();
    });
    const handleHostGraySizeEnter = (event) => {
      if (event.code !== "Enter") {
        return;
      }
      event.preventDefault();
      this.requestHostCustomPaintBlockAdd();
    };
    const handleHostGraySizeInput = () => {
      this.getHostCustomBlockSizeFromPanel();
      if (this.hostCustomBlockPlacementPreviewActive) {
        this.updateHostCustomBlockPlacementPreview();
        this.syncHostControls();
      }
    };
    this.hostGrayObjectWidthInputEl?.addEventListener("keydown", handleHostGraySizeEnter);
    this.hostGrayObjectHeightInputEl?.addEventListener("keydown", handleHostGraySizeEnter);
    this.hostGrayObjectDepthInputEl?.addEventListener("keydown", handleHostGraySizeEnter);
    this.hostGrayObjectWidthInputEl?.addEventListener("input", handleHostGraySizeInput);
    this.hostGrayObjectHeightInputEl?.addEventListener("input", handleHostGraySizeInput);
    this.hostGrayObjectDepthInputEl?.addEventListener("input", handleHostGraySizeInput);
  }

  resolveUiElements() {
    if (!this.toolUiEl) {
      this.toolUiEl = document.getElementById("tool-ui");
    }
    if (!this.chatUiEl) {
      this.chatUiEl = document.getElementById("chat-ui");
    }
    if (!this.hubFlowUiEl) {
      this.hubFlowUiEl = document.getElementById("hub-flow-ui");
    }
    if (!this.hubPhaseTitleEl) {
      this.hubPhaseTitleEl = document.getElementById("hub-phase-title");
    }
    if (!this.hubPhaseSubtitleEl) {
      this.hubPhaseSubtitleEl = document.getElementById("hub-phase-subtitle");
    }
    if (!this.nicknameGateEl) {
      this.nicknameGateEl = document.getElementById("nickname-gate");
    }
    if (!this.nicknameFormEl) {
      this.nicknameFormEl = document.getElementById("nickname-form");
    }
    if (!this.nicknameInputEl) {
      this.nicknameInputEl = document.getElementById("nickname-input");
    }
    if (!this.nicknameErrorEl) {
      this.nicknameErrorEl = document.getElementById("nickname-error");
    }
    if (!this.npcChoiceGateEl) {
      this.npcChoiceGateEl = document.getElementById("npc-choice-gate");
    }
    if (!this.npcChoiceNicknameBtnEl) {
      this.npcChoiceNicknameBtnEl = document.getElementById("npc-choice-nickname");
    }
    if (!this.npcChoiceGuideBtnEl) {
      this.npcChoiceGuideBtnEl = document.getElementById("npc-choice-guide");
    }
    if (!this.npcChoicePlayBtnEl) {
      this.npcChoicePlayBtnEl = document.getElementById("npc-choice-play");
    }
    if (!this.introVideoOverlayEl) {
      this.introVideoOverlayEl = document.getElementById("intro-video-overlay");
    }
    if (!this.introVideoEl) {
      this.introVideoEl = document.getElementById("intro-video");
    }
    if (!this.portalTransitionEl) {
      this.portalTransitionEl = document.getElementById("portal-transition");
    }
    if (!this.portalTransitionTextEl) {
      this.portalTransitionTextEl = document.getElementById("portal-transition-text");
    }
    if (!this.hallPortalCountdownEl) {
      this.hallPortalCountdownEl = document.getElementById("hall-portal-countdown");
    }
    if (!this.boundaryWarningEl) {
      this.boundaryWarningEl = document.getElementById("boundary-warning");
    }
    if (!this.surfacePaintPromptEl) {
      this.surfacePaintPromptEl = document.getElementById("surface-paint-prompt");
    }
    if (!this.surfacePainterEl) {
      this.surfacePainterEl = document.getElementById("surface-painter");
    }
    if (!this.surfacePainterPanelEl) {
      this.surfacePainterPanelEl = document.getElementById("surface-painter-panel");
    }
    if (!this.surfacePainterTitleEl) {
      this.surfacePainterTitleEl = document.getElementById("surface-painter-title");
    }
    if (!this.surfacePainterCanvasEl) {
      this.surfacePainterCanvasEl = document.getElementById("surface-painter-canvas");
    }
    if (!this.surfacePainterContext && this.surfacePainterCanvasEl) {
      this.surfacePainterContext = this.surfacePainterCanvasEl.getContext("2d");
    }
    if (!this.surfacePainterColorInputEl) {
      this.surfacePainterColorInputEl = document.getElementById("surface-painter-color");
    }
    if (!this.surfacePainterBgColorInputEl) {
      this.surfacePainterBgColorInputEl = document.getElementById("surface-painter-bg");
    }
    if (!this.surfacePainterSizeInputEl) {
      this.surfacePainterSizeInputEl = document.getElementById("surface-painter-size");
    }
    if (!this.surfacePainterExportBtnEl) {
      this.surfacePainterExportBtnEl = document.getElementById("surface-painter-export");
    }
    if (!this.surfacePainterImportBtnEl) {
      this.surfacePainterImportBtnEl = document.getElementById("surface-painter-import");
    }
    if (!this.surfacePainterImportInputEl) {
      this.surfacePainterImportInputEl = document.getElementById("surface-painter-import-file");
    }
    if (!this.surfacePainterClearBtnEl) {
      this.surfacePainterClearBtnEl = document.getElementById("surface-painter-clear");
    }
    if (!this.surfacePainterCancelBtnEl) {
      this.surfacePainterCancelBtnEl = document.getElementById("surface-painter-cancel");
    }
    if (!this.surfacePainterSaveBtnEl) {
      this.surfacePainterSaveBtnEl = document.getElementById("surface-painter-save");
    }
    if (!this.surfacePainterPromoRepositionBtnEl) {
      this.surfacePainterPromoRepositionBtnEl = document.getElementById(
        "surface-painter-promo-reposition"
      );
    }
    if (!this.surfacePainterPromoRemoveBtnEl) {
      this.surfacePainterPromoRemoveBtnEl = document.getElementById("surface-painter-promo-remove");
    }
    if (!this.surfacePainterPromoScaleDownBtnEl) {
      this.surfacePainterPromoScaleDownBtnEl = document.getElementById(
        "surface-painter-promo-scale-down"
      );
    }
    if (!this.surfacePainterPromoScaleUpBtnEl) {
      this.surfacePainterPromoScaleUpBtnEl = document.getElementById(
        "surface-painter-promo-scale-up"
      );
    }
    if (!this.surfacePainterPromoShareToggleBtnEl) {
      this.surfacePainterPromoShareToggleBtnEl = document.getElementById(
        "surface-painter-promo-share-toggle"
      );
    }
    if (!this.surfacePainterActionsToggleBtnEl) {
      this.surfacePainterActionsToggleBtnEl = document.getElementById(
        "surface-painter-actions-toggle"
      );
    }
    if (!this.surfacePainterEraserBtnEl) {
      this.surfacePainterEraserBtnEl = document.getElementById("surface-painter-eraser");
    }
    if (!this.surfacePainterFillBtnEl) {
      this.surfacePainterFillBtnEl = document.getElementById("surface-painter-fill");
    }
    if (!this.chatLogEl) {
      this.chatLogEl = document.getElementById("chat-log");
    }
    if (!this.chatLiveFeedEl) {
      this.chatLiveFeedEl = document.getElementById("chat-live-feed");
    }
    if (!this.chatLiveLogEl) {
      this.chatLiveLogEl = document.getElementById("chat-live-log");
    }
    if (!this.chatTitleEl) {
      this.chatTitleEl = document.getElementById("chat-title");
    }
    if (!this.chatControlsEl) {
      this.chatControlsEl = document.getElementById("chat-controls");
    }
    if (!this.chatToggleBtnEl) {
      this.chatToggleBtnEl = document.getElementById("chat-toggle");
    }
    if (!this.chatExpandBtnEl) {
      this.chatExpandBtnEl = document.getElementById("chat-expand");
    }
    if (!this.hostChatToggleBtnEl) {
      this.hostChatToggleBtnEl = document.getElementById("host-chat-toggle");
    }
    if (!this.hostControlsToggleBtnEl) {
      this.hostControlsToggleBtnEl = document.getElementById("host-controls-toggle");
    }
    if (!this.chatInputEl) {
      this.chatInputEl = document.getElementById("chat-input");
    }
    if (!this.chatSendBtnEl) {
      this.chatSendBtnEl = document.getElementById("chat-send");
    }
    if (!this.toolHotbarEl) {
      this.toolHotbarEl = document.getElementById("tool-hotbar");
    }
    if (!this.chalkColorsEl) {
      this.chalkColorsEl = document.getElementById("chalk-colors");
    }
    if (!this.mobileUiEl) {
      this.mobileUiEl = document.getElementById("mobile-ui");
    }
    if (!this.mobileActionsEl) {
      this.mobileActionsEl = document.getElementById("mobile-actions");
    }
    if (!this.mobileMovePadEl) {
      this.mobileMovePadEl = document.getElementById("mobile-move-pad");
    }
    if (!this.mobileMoveStickEl) {
      this.mobileMoveStickEl = document.getElementById("mobile-move-stick");
    }
    if (!this.mobilePromoPlaceBtnEl) {
      this.mobilePromoPlaceBtnEl = document.getElementById("mobile-promo-place");
    }
    if (!this.mobileJumpBtnEl) {
      this.mobileJumpBtnEl = document.getElementById("mobile-jump");
    }
    if (!this.mobileSprintBtnEl) {
      this.mobileSprintBtnEl = document.getElementById("mobile-sprint");
    }
    if (!this.mobileChatBtnEl) {
      this.mobileChatBtnEl = document.getElementById("mobile-chat");
    }
    if (!this.mobilePaintBtnEl) {
      this.mobilePaintBtnEl = document.getElementById("mobile-paint");
    }
    if (!this.mobilePromoScaleWrapEl) {
      this.mobilePromoScaleWrapEl = document.getElementById("mobile-promo-scale-wrap");
    }
    if (!this.mobilePromoScaleInputEl) {
      this.mobilePromoScaleInputEl = document.getElementById("mobile-promo-scale");
    }
    if (!this.mobilePromoScaleValueEl) {
      this.mobilePromoScaleValueEl = document.getElementById("mobile-promo-scale-value");
    }
    if (!this.mobileRotateOverlayEl) {
      this.mobileRotateOverlayEl = document.getElementById("mobile-rotate-overlay");
    }
    if (!this.fullscreenToggleBtnEl) {
      this.fullscreenToggleBtnEl = document.getElementById("fullscreen-toggle");
    }
    if (!this.graphicsToggleBtnEl) {
      this.graphicsToggleBtnEl = document.getElementById("graphics-toggle");
    }
    if (!this.graphicsControlsEl) {
      this.graphicsControlsEl = document.getElementById("graphics-controls");
    }
    if (!this.graphicsQualitySelectEl) {
      this.graphicsQualitySelectEl = document.getElementById("graphics-quality-select");
    }
    if (!this.hostControlsEl) {
      this.hostControlsEl = document.getElementById("host-controls");
    }
    if (!this.hostOpenPortalBtnEl) {
      this.hostOpenPortalBtnEl = document.getElementById("host-open-portal");
    }
    if (!this.hostScheduleControlsEl) {
      this.hostScheduleControlsEl = document.getElementById("host-schedule-controls");
    }
    if (!this.hostDelayButtons || this.hostDelayButtons.length === 0) {
      this.hostDelayButtons = Array.from(document.querySelectorAll(".host-delay-btn[data-delay-min]"));
    }
    if (!this.hostDelayMinutesInputEl) {
      this.hostDelayMinutesInputEl = document.getElementById("host-delay-minutes");
    }
    if (!this.hostDelayUnitSelectEl) {
      this.hostDelayUnitSelectEl = document.getElementById("host-delay-unit");
    }
    if (!this.hostApplyDelayBtnEl) {
      this.hostApplyDelayBtnEl = document.getElementById("host-apply-delay");
    }
    if (!this.hostPortalTargetInputEl) {
      this.hostPortalTargetInputEl = document.getElementById("host-portal-target");
    }
    if (!this.hostPortalTargetApplyBtnEl) {
      this.hostPortalTargetApplyBtnEl = document.getElementById("host-portal-target-apply");
    }
    if (!this.hostAZonePortalTargetInputEl) {
      this.hostAZonePortalTargetInputEl = document.getElementById("host-a-zone-portal-target");
    }
    if (!this.hostAZonePortalTargetApplyBtnEl) {
      this.hostAZonePortalTargetApplyBtnEl = document.getElementById(
        "host-a-zone-portal-target-apply"
      );
    }
    if (!this.hostPortal1NameInputEl) {
      this.hostPortal1NameInputEl = document.getElementById("host-portal-1-name");
    }
    if (!this.hostPortal1ModeSelectEl) {
      this.hostPortal1ModeSelectEl = document.getElementById("host-portal-1-mode");
    }
    if (!this.hostPortal1Line2InputEl) {
      this.hostPortal1Line2InputEl = document.getElementById("host-portal-1-line2");
    }
    if (!this.hostPortal1Line3InputEl) {
      this.hostPortal1Line3InputEl = document.getElementById("host-portal-1-line3");
    }
    if (!this.hostPortal1ImageFileInputEl) {
      this.hostPortal1ImageFileInputEl = document.getElementById("host-portal-1-image-file");
    }
    if (!this.hostPortal1ApplyBtnEl) {
      this.hostPortal1ApplyBtnEl = document.getElementById("host-portal-1-apply");
    }
    if (!this.hostPortal1ResetBtnEl) {
      this.hostPortal1ResetBtnEl = document.getElementById("host-portal-1-reset");
    }
    if (!this.hostPortal2NameInputEl) {
      this.hostPortal2NameInputEl = document.getElementById("host-portal-2-name");
    }
    if (!this.hostPortal2ImageFileInputEl) {
      this.hostPortal2ImageFileInputEl = document.getElementById("host-portal-2-image-file");
    }
    if (!this.hostPortal2ApplyBtnEl) {
      this.hostPortal2ApplyBtnEl = document.getElementById("host-portal-2-apply");
    }
    if (!this.hostPortal2ResetBtnEl) {
      this.hostPortal2ResetBtnEl = document.getElementById("host-portal-2-reset");
    }
    if (!this.hostMainPortalAdFileInputEl) {
      this.hostMainPortalAdFileInputEl = document.getElementById("host-main-portal-ad-file");
    }
    if (!this.hostMainPortalAdApplyBtnEl) {
      this.hostMainPortalAdApplyBtnEl = document.getElementById("host-main-portal-ad-apply");
    }
    if (!this.hostMainPortalAdResetBtnEl) {
      this.hostMainPortalAdResetBtnEl = document.getElementById("host-main-portal-ad-reset");
    }
    if (!this.hostHallPortalModeSelectEl) {
      this.hostHallPortalModeSelectEl = document.getElementById("host-hall-portal-mode");
    }
    if (!this.hostHallPortalTitleInputEl) {
      this.hostHallPortalTitleInputEl = document.getElementById("host-hall-portal-title");
    }
    if (!this.hostHallPortalLine2InputEl) {
      this.hostHallPortalLine2InputEl = document.getElementById("host-hall-portal-line2");
    }
    if (!this.hostHallPortalLine3InputEl) {
      this.hostHallPortalLine3InputEl = document.getElementById("host-hall-portal-line3");
    }
    if (!this.hostHallPortalApplyBtnEl) {
      this.hostHallPortalApplyBtnEl = document.getElementById("host-hall-portal-apply");
    }
    if (!this.hostHallPortalResetBtnEl) {
      this.hostHallPortalResetBtnEl = document.getElementById("host-hall-portal-reset");
    }
    if (!this.hostRightVideoSelectEl) {
      this.hostRightVideoSelectEl = document.getElementById("host-right-video");
    }
    if (!this.hostRightVideoQuickButtons || this.hostRightVideoQuickButtons.length === 0) {
      this.hostRightVideoQuickButtons = Array.from(
        document.querySelectorAll(".host-video-quick-btn[data-video-id]")
      );
    }
    if (!this.hostPlayRightVideoBtnEl) {
      this.hostPlayRightVideoBtnEl = document.getElementById("host-right-play");
    }
    if (!this.hostResetRightVideoBtnEl) {
      this.hostResetRightVideoBtnEl = document.getElementById("host-right-reset");
    }
    if (!this.hostBillboardVideoFileInputEl) {
      this.hostBillboardVideoFileInputEl = document.getElementById("host-billboard-video-file");
    }
    if (!this.hostBillboardVideoPlayLeftBtnEl) {
      this.hostBillboardVideoPlayLeftBtnEl = document.getElementById("host-billboard-video-play-left");
    }
    if (!this.hostBillboardVideoPlayRightBtnEl) {
      this.hostBillboardVideoPlayRightBtnEl = document.getElementById("host-billboard-video-play-right");
    }
    if (!this.hostBillboardVideoPlayBothBtnEl) {
      this.hostBillboardVideoPlayBothBtnEl = document.getElementById("host-billboard-video-play-both");
    }
    if (!this.hostSecurityTestToggleBtnEl) {
      this.hostSecurityTestToggleBtnEl = document.getElementById("host-security-test-toggle");
    }
    if (!this.hostLeftImageFileInputEl) {
      this.hostLeftImageFileInputEl = document.getElementById("host-left-image-file");
    }
    if (!this.hostResetLeftImageBtnEl) {
      this.hostResetLeftImageBtnEl = document.getElementById("host-left-image-reset");
    }
    if (!this.hostMusicFileInputEl) {
      this.hostMusicFileInputEl = document.getElementById("host-music-file");
    }
    if (!this.hostMusicPlayBtnEl) {
      this.hostMusicPlayBtnEl = document.getElementById("host-music-play");
    }
    if (!this.hostMusicStopBtnEl) {
      this.hostMusicStopBtnEl = document.getElementById("host-music-stop");
    }
    if (!this.playerRosterEl) {
      this.playerRosterEl = document.getElementById("player-roster");
    }
    if (!this.playerRosterCountEl) {
      this.playerRosterCountEl = document.getElementById("player-roster-count");
    }
    if (!this.playerRosterListEl) {
      this.playerRosterListEl = document.getElementById("player-roster-list");
    }
    if (!this.editorModeObjBtnEl) {
      this.editorModeObjBtnEl = document.getElementById("editor-mode-obj");
    }
    if (!this.objEditorBarEl) {
      this.objEditorBarEl = document.getElementById("obj-editor-bar");
    }
    if (!this.objEditorInfoEl) {
      this.objEditorInfoEl = document.getElementById("obj-editor-info");
    }
    if (!this.promoPanelEl) {
      this.promoPanelEl = document.getElementById("promo-panel");
    }
    if (!this.promoPanelCloseBtnEl) {
      this.promoPanelCloseBtnEl = document.getElementById("promo-panel-close");
    }
    if (!this.promoScaleInputEl) {
      this.promoScaleInputEl = document.getElementById("promo-scale");
    }
    if (!this.promoScaleValueEl) {
      this.promoScaleValueEl = document.getElementById("promo-scale-value");
    }
    if (!this.promoTypeSelectEl) {
      this.promoTypeSelectEl = document.getElementById("promo-shape");
    }
    if (!this.promoLinkInputEl) {
      this.promoLinkInputEl = document.getElementById("promo-link-url");
    }
    if (!this.promoAllowOthersDrawRowEl) {
      this.promoAllowOthersDrawRowEl = document.getElementById("promo-allow-others-draw-row");
    }
    if (!this.promoAllowOthersDrawEl) {
      this.promoAllowOthersDrawEl = document.getElementById("promo-allow-others-draw");
    }
    if (!this.promoAllowOthersDrawStatusEl) {
      this.promoAllowOthersDrawStatusEl = document.getElementById("promo-allow-others-draw-status");
    }
    if (!this.promoDrawCanvasEl) {
      this.promoDrawCanvasEl = document.getElementById("promo-draw-canvas");
    }
    if (!this.promoDrawColorInputEl) {
      this.promoDrawColorInputEl = document.getElementById("promo-draw-color");
    }
    if (!this.promoDrawBgInputEl) {
      this.promoDrawBgInputEl = document.getElementById("promo-draw-bg");
    }
    if (!this.promoDrawBgLabelEl) {
      this.promoDrawBgLabelEl = document.getElementById("promo-draw-bg-label");
    }
    if (!this.promoDrawSizeInputEl) {
      this.promoDrawSizeInputEl = document.getElementById("promo-draw-size");
    }
    if (!this.promoDrawClearBtnEl) {
      this.promoDrawClearBtnEl = document.getElementById("promo-draw-clear-btn");
    }
    if (!this.promoDrawApplyBtnEl) {
      this.promoDrawApplyBtnEl = document.getElementById("promo-draw-apply-btn");
    }
    if (!this.promoDrawHelpEl) {
      this.promoDrawHelpEl = document.getElementById("promo-draw-help");
    }
    if (!this.promoMediaPickBtnEl) {
      this.promoMediaPickBtnEl = document.getElementById("promo-media-pick-btn");
    }
    if (!this.promoMediaFolderBtnEl) {
      this.promoMediaFolderBtnEl = document.getElementById("promo-media-folder-btn");
    }
    if (!this.promoMediaClearBtnEl) {
      this.promoMediaClearBtnEl = document.getElementById("promo-media-clear-btn");
    }
    if (!this.promoMediaPreviewEl) {
      this.promoMediaPreviewEl = document.getElementById("promo-media-preview");
    }
    if (!this.promoMediaPreviewImageEl) {
      this.promoMediaPreviewImageEl = document.getElementById("promo-media-preview-image");
    }
    if (!this.promoMediaPreviewVideoEl) {
      this.promoMediaPreviewVideoEl = document.getElementById("promo-media-preview-video");
    }
    if (!this.promoMediaFileInputEl) {
      this.promoMediaFileInputEl = document.getElementById("promo-media-file");
    }
    if (!this.promoMediaFolderInputEl) {
      this.promoMediaFolderInputEl = document.getElementById("promo-media-folder");
    }
    if (!this.promoMediaNameEl) {
      this.promoMediaNameEl = document.getElementById("promo-media-name");
    }
    if (!this.promoMediaHelpEl) {
      this.promoMediaHelpEl = document.getElementById("promo-media-help");
    }
    if (!this.promoPlaceBtnEl) {
      this.promoPlaceBtnEl = document.getElementById("promo-place-btn");
    }
    if (!this.promoSaveBtnEl) {
      this.promoSaveBtnEl = document.getElementById("promo-save-btn");
    }
    if (!this.promoRemoveBtnEl) {
      this.promoRemoveBtnEl = document.getElementById("promo-remove-btn");
    }
    if (!this.promoStatusEl) {
      this.promoStatusEl = document.getElementById("promo-panel-status");
    }
    if (!this.promoLinkPromptEl) {
      this.promoLinkPromptEl = document.getElementById("promo-link-prompt");
    }
    if (!this.promoLinkPromptTextEl) {
      this.promoLinkPromptTextEl = document.getElementById("promo-link-prompt-text");
    }
    if (!this.promoOpenLinkBtnEl) {
      this.promoOpenLinkBtnEl = document.getElementById("promo-open-link-btn");
    }
    if (!this.platformEditorCountEl) {
      this.platformEditorCountEl = document.getElementById("platform-editor-count");
    }
    if (!this.platformEditorDeleteOneBtnEl) {
      this.platformEditorDeleteOneBtnEl = document.getElementById("platform-editor-delete-one");
    }
    if (!this.ropeEditorCountEl) {
      this.ropeEditorCountEl = document.getElementById("rope-editor-count");
    }
    if (!this.editorPlatformLimitInputEl) {
      this.editorPlatformLimitInputEl = document.getElementById("editor-platform-limit");
    }
    if (!this.editorRopeLimitInputEl) {
      this.editorRopeLimitInputEl = document.getElementById("editor-rope-limit");
    }
    if (!this.editorPlatformScaleInputEl) {
      this.editorPlatformScaleInputEl = document.getElementById("editor-platform-scale");
    }
    if (!this.editorRopeScaleInputEl) {
      this.editorRopeScaleInputEl = document.getElementById("editor-rope-scale");
    }
    if (!this.editorPlatformScaleValueEl) {
      this.editorPlatformScaleValueEl = document.getElementById("editor-platform-scale-value");
    }
    if (!this.editorRopeScaleValueEl) {
      this.editorRopeScaleValueEl = document.getElementById("editor-rope-scale-value");
    }
    if (!this.editorSettingsApplyBtnEl) {
      this.editorSettingsApplyBtnEl = document.getElementById("editor-settings-apply");
    }
    if (!this.hostGrayObjectWidthInputEl) {
      this.hostGrayObjectWidthInputEl = document.getElementById("host-gray-object-width");
    }
    if (!this.hostGrayObjectHeightInputEl) {
      this.hostGrayObjectHeightInputEl = document.getElementById("host-gray-object-height");
    }
    if (!this.hostGrayObjectDepthInputEl) {
      this.hostGrayObjectDepthInputEl = document.getElementById("host-gray-object-depth");
    }
    if (!this.hostGrayObjectAddBtnEl) {
      this.hostGrayObjectAddBtnEl = document.getElementById("host-gray-object-add");
    }
    if (!this.hostGrayObjectDeleteBtnEl) {
      this.hostGrayObjectDeleteBtnEl = document.getElementById("host-gray-object-delete");
    }
    this.chalkColorButtons = Array.from(document.querySelectorAll(".chalk-color[data-color]"));
    this.toolButtons = Array.from(document.querySelectorAll(".tool-slot[data-tool]"));
  }

  setupToolState() {
    const chalkConfig = this.worldContent?.chalk ?? {};
    const fallbackColors = ["#f5f7ff", "#ffd86a", "#7ec9ff", "#ff9cc5", "#a9f89f"];
    const configColors = Array.isArray(chalkConfig.colors) ? chalkConfig.colors : [];
    const sourceColors = configColors.length > 0 ? configColors : fallbackColors;
    this.chalkPalette = sourceColors
      .map((color) => {
        try {
          return `#${new THREE.Color(color).getHexString()}`;
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    if (this.chalkPalette.length === 0) {
      this.chalkPalette = [...fallbackColors];
    }
    this.selectedChalkColor = this.chalkPalette[0] ?? fallbackColors[0];
    this.buildChalkPaletteButtons();
    const chalkEnabled = this.isChalkFeatureEnabled();
    this.hasChalk = chalkEnabled ? this.hasChalk : false;
    this.toolUiEl?.classList.toggle("hidden", !chalkEnabled);
    this.chalkPickupEl?.classList.add("hidden");
    this.surfacePaintPromptEl?.classList.add("hidden");
    if (this.mobilePaintBtnEl) {
      this.mobilePaintBtnEl.classList.add("hidden");
      this.mobilePaintBtnEl.disabled = true;
    }
    for (const button of this.toolButtons) {
      if (String(button?.dataset?.tool ?? "") === "chalk") {
        button.classList.toggle("hidden", !chalkEnabled);
        button.disabled = !chalkEnabled;
      }
    }
    this.setActiveTool("move");
    this.setChalkColor(this.selectedChalkColor);
  }

  buildChalkPaletteButtons() {
    if (!this.chalkColorsEl) {
      return;
    }

    this.chalkColorsEl.innerHTML = "";
    for (let index = 0; index < this.chalkPalette.length; index += 1) {
      const normalized = this.chalkPalette[index];

      const button = document.createElement("button");
      button.type = "button";
      button.className = "chalk-color";
      button.dataset.color = normalized;
      button.style.setProperty("--swatch", normalized);
      button.title = `${index + 1} ${normalized.toUpperCase()}`;
      this.chalkColorsEl.appendChild(button);
    }

    this.chalkColorButtons = Array.from(
      this.chalkColorsEl.querySelectorAll(".chalk-color[data-color]")
    );
  }

  setChatLiveOpen(open) {
    this.chatLiveOpen = Boolean(open);
    this.syncChatLiveUi();
  }

  updateChatLiveAnchorPosition() {
    if (!this.chatLiveFeedEl || typeof window === "undefined") {
      return;
    }
    const viewportHeight = Math.max(1, Number(window.innerHeight) || 1);
    const isVisibleRect = (element) => {
      if (!element || element.classList?.contains?.("hidden")) {
        return null;
      }
      const rect = element.getBoundingClientRect?.();
      if (!rect || !Number.isFinite(rect.top) || rect.height <= 0) {
        return null;
      }
      return rect;
    };

    let anchorRect = null;
    if (this.mobileEnabled) {
      anchorRect = isVisibleRect(this.mobileUiEl);
    } else {
      anchorRect = isVisibleRect(this.chatUiEl);
    }

    if (anchorRect) {
      const anchoredBottom = Math.max(18, Math.round(viewportHeight - anchorRect.top + 8));
      this.chatLiveFeedEl.style.bottom = `${anchoredBottom}px`;
      return;
    }
    this.chatLiveFeedEl.style.bottom = this.mobileEnabled ? "174px" : "148px";
  }

  syncChatLiveUi() {
    this.resolveUiElements();
    if (!this.chatLiveFeedEl) {
      return;
    }
    const portraitBlocked = this.isMobilePortraitBlocked();
    const canShowChat = this.canUseChatControls();
    const hideForMobileFullscreenChat = this.mobileEnabled && this.chatOpen;
    const visible = canShowChat && !portraitBlocked && !hideForMobileFullscreenChat;
    this.chatLiveFeedEl.classList.toggle("hidden", !visible);
    if (visible) {
      this.updateChatLiveAnchorPosition();
    }
  }

  syncChatHistoryExpandedUi() {
    this.resolveUiElements();
    if (this.chatUiEl) {
      this.chatUiEl.classList.toggle("history-expanded", this.chatOpen && this.chatHistoryExpanded);
    }
    if (!this.chatExpandBtnEl) {
      return;
    }
    const visible = this.chatOpen;
    const label = this.chatHistoryExpanded ? "접기" : "펼치기";
    this.chatExpandBtnEl.classList.toggle("hidden", !visible);
    this.chatExpandBtnEl.setAttribute("aria-pressed", this.chatHistoryExpanded ? "true" : "false");
    if (this.chatExpandBtnEl.textContent !== label) {
      this.chatExpandBtnEl.textContent = label;
    }
  }

  setChatHistoryExpanded(expanded, { requestHistory = false } = {}) {
    const nextExpanded = Boolean(expanded);
    this.chatHistoryExpanded = nextExpanded;
    this.syncChatHistoryExpandedUi();
    if (this.chatOpen) {
      this.scrollChatLogToLatest({ defer: true });
    }
    if (!requestHistory || !this.chatOpen || this.chatHistoryLoaded) {
      return;
    }
    this.requestChatHistory({ force: true });
  }

  setChatOpen(open) {
    if (open && !this.canUseChatControls()) {
      return;
    }

    this.chatOpen = Boolean(open);
    if (!this.chatOpen) {
      this.chatHistoryExpanded = false;
    }
    if (this.chatUiEl) {
      const collapsed = !this.chatOpen;
      this.chatUiEl.classList.toggle("collapsed", collapsed);
      this.chatUiEl.classList.toggle("mobile-fullscreen", this.mobileEnabled && this.chatOpen);
      this.chatUiEl.classList.toggle("hidden", this.mobileEnabled && !this.chatOpen);
    }
    if (this.chatControlsEl) {
      this.chatControlsEl.classList.toggle("hidden", !this.chatOpen);
    }
    if (typeof document !== "undefined" && document.body) {
      document.body.classList.toggle("chat-mobile-open", this.mobileEnabled && this.chatOpen);
    }
    if (this.chatTitleEl) {
      this.chatTitleEl.textContent = "채팅";
    }
    if (this.chatToggleBtnEl) {
      const label = this.chatOpen ? "닫기" : "채팅";
      if (this.chatToggleBtnEl.textContent !== label) {
        this.chatToggleBtnEl.textContent = label;
      }
      this.chatToggleBtnEl.setAttribute("aria-pressed", this.chatOpen ? "true" : "false");
      this.chatToggleBtnEl.classList.toggle("hidden", this.mobileEnabled && !this.chatOpen);
    }
    if (this.hostChatToggleBtnEl) {
      const hostLabel = this.chatOpen ? "채팅 닫기" : "채팅";
      if (this.hostChatToggleBtnEl.textContent !== hostLabel) {
        this.hostChatToggleBtnEl.textContent = hostLabel;
      }
      this.hostChatToggleBtnEl.setAttribute("aria-pressed", this.chatOpen ? "true" : "false");
    }
    if (this.mobileChatBtnEl) {
      this.mobileChatBtnEl.setAttribute("aria-pressed", this.chatOpen ? "true" : "false");
      const mobileLabel = this.chatOpen ? "채팅 닫기" : "채팅";
      if (this.mobileChatBtnEl.textContent !== mobileLabel) {
        this.mobileChatBtnEl.textContent = mobileLabel;
      }
    }
    this.syncChatHistoryExpandedUi();
    if (this.chatOpen) {
      this.chalkDrawingActive = false;
      this.chalkLastStamp = null;
      if (!this.chatHistoryLoaded) {
        this.requestChatHistory({ force: true });
      }
      this.scrollChatLogToLatest({ defer: true });
    }
    this.syncMobileUiState();
    this.syncChatLiveUi();
  }

  normalizeGraphicsQuality(rawQuality) {
    const quality = String(rawQuality ?? "").trim().toLowerCase();
    if (quality === "low" || quality === "high") {
      return quality;
    }
    return "medium";
  }

  loadGraphicsQualityPreference() {
    try {
      const saved = localStorage.getItem(this.graphicsQualityStorageKey);
      const text = String(saved ?? "").trim();
      if (!text) {
        return "high";
      }
      return this.normalizeGraphicsQuality(text);
    } catch {
      return "high";
    }
  }

  saveGraphicsQualityPreference() {
    try {
      localStorage.setItem(this.graphicsQualityStorageKey, this.graphicsQuality);
    } catch {
      // ignore
    }
  }

  applyGraphicsQualityOverrides() {
    const quality = this.normalizeGraphicsQuality(this.graphicsQuality);
    this.graphicsQuality = quality;

    const devicePixelRatio = window.devicePixelRatio || 1;
    let maxRatioCap = this.getDevicePixelRatioCap();
    let dynamicEnabled = Boolean(this.dynamicResolution.enabled);
    let minRatio = Number(this.dynamicResolution.minRatio) || GAME_CONSTANTS.DYNAMIC_RESOLUTION.desktopMinRatio;

    if (quality === "low") {
      dynamicEnabled = true;
      minRatio = this.mobileEnabled ? 0.5 : 0.62;
      maxRatioCap = this.mobileEnabled ? 0.95 : 1.0;
    } else if (quality === "medium") {
      dynamicEnabled = true;
      minRatio = this.mobileEnabled
        ? Math.max(minRatio, this.isLowSpecMobile ? 0.52 : 0.68)
        : Math.max(0.72, GAME_CONSTANTS.DYNAMIC_RESOLUTION.desktopMinRatio);
      maxRatioCap = this.getDevicePixelRatioCap();
    } else {
      dynamicEnabled = false;
      minRatio = this.mobileEnabled ? 0.86 : GAME_CONSTANTS.DYNAMIC_RESOLUTION.desktopMinRatio;
      maxRatioCap = this.mobileEnabled ? 1.7 : 1.9;
    }

    this.dynamicResolution.enabled = dynamicEnabled;
    this.dynamicResolution.minRatio = THREE.MathUtils.clamp(minRatio, 0.45, 1);

    this.maxPixelRatio = Math.min(devicePixelRatio, Math.max(0.7, maxRatioCap));
    const minPixelRatio = Math.max(
      0.45,
      Math.min(this.dynamicResolution.minRatio, this.maxPixelRatio)
    );

    let nextPixelRatio = this.currentPixelRatio;
    if (quality === "high") {
      nextPixelRatio = this.maxPixelRatio;
    } else if (quality === "low") {
      nextPixelRatio = minPixelRatio;
    }
    nextPixelRatio = THREE.MathUtils.clamp(nextPixelRatio, minPixelRatio, this.maxPixelRatio);

    if (Math.abs(nextPixelRatio - this.currentPixelRatio) < 0.01) {
      this.syncGraphicsControlsUi();
      return;
    }

    this.currentPixelRatio = Number(nextPixelRatio.toFixed(2));
    this.renderer.setPixelRatio(this.currentPixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    if (this.composer) {
      this.composer.setPixelRatio(this.currentPixelRatio);
      this.composer.setSize(window.innerWidth, window.innerHeight);
    }
    this.syncGraphicsControlsUi();
  }

  setGraphicsQuality(rawQuality, { persist = true } = {}) {
    const nextQuality = this.normalizeGraphicsQuality(rawQuality);
    this.graphicsQuality = nextQuality;
    if (persist) {
      this.saveGraphicsQualityPreference();
    }
    this.applyDeviceRuntimeProfile();
    this.syncGraphicsControlsUi();
  }

  syncGraphicsControlsUi() {
    const quality = this.normalizeGraphicsQuality(this.graphicsQuality);
    this.graphicsQuality = quality;
    const labelMap = {
      high: "최대",
      medium: "기본",
      low: "최하"
    };
    const buttonLabel = `그래픽: ${labelMap[quality] ?? "기본"}`;
    const blocked = this.isMobilePortraitBlocked();
    if (blocked && this.graphicsPanelOpen) {
      this.graphicsPanelOpen = false;
    }

    if (this.graphicsToggleBtnEl) {
      this.graphicsToggleBtnEl.textContent = buttonLabel;
      this.graphicsToggleBtnEl.classList.toggle("hidden", blocked);
      this.graphicsToggleBtnEl.setAttribute("aria-pressed", this.graphicsPanelOpen ? "true" : "false");
    }
    if (this.graphicsQualitySelectEl) {
      if (this.graphicsQualitySelectEl.value !== quality) {
        this.graphicsQualitySelectEl.value = quality;
      }
    }
    if (this.graphicsControlsEl) {
      this.graphicsControlsEl.classList.toggle("hidden", blocked || !this.graphicsPanelOpen);
    }
  }

  setActiveTool(tool) {
    const chalkAllowed = this.isChalkFeatureEnabled() && this.hasChalk;
    const nextTool = tool === "chalk" && chalkAllowed ? "chalk" : "move";
    this.activeTool = nextTool;
    for (const button of this.toolButtons) {
      const isActive = String(button?.dataset?.tool ?? "") === nextTool;
      button.classList.toggle("active", isActive);
    }
    if (this.chalkColorsEl) {
      this.chalkColorsEl.classList.toggle("hidden", nextTool !== "chalk");
    }
    if (nextTool !== "chalk") {
      this.chalkDrawingActive = false;
      this.chalkLastStamp = null;
    }
  }

  getColorDigitIndex(code) {
    if (!code || !code.startsWith("Digit")) {
      return -1;
    }
    const digit = Number(code.slice(5));
    if (!Number.isInteger(digit) || digit < 1) {
      return -1;
    }
    return digit - 1;
  }

  setChalkColorByIndex(index) {
    if (!this.isChalkFeatureEnabled()) {
      return;
    }
    if (!Number.isInteger(index) || index < 0 || index >= this.chalkPalette.length) {
      return;
    }
    this.setActiveTool("chalk");
    this.setChalkColor(this.chalkPalette[index]);
  }

  setChalkColor(rawColor) {
    let normalized = "#f5f7ff";
    try {
      normalized = `#${new THREE.Color(rawColor).getHexString()}`;
    } catch {
      return;
    }
    this.selectedChalkColor = normalized;
    for (const button of this.chalkColorButtons) {
      const buttonColor = String(button?.dataset?.color ?? "").toLowerCase();
      button.classList.toggle("active", buttonColor === normalized.toLowerCase());
    }
  }

  isChalkFeatureEnabled() {
    return Boolean(this.worldContent?.chalk?.enabled);
  }

  isSurfacePaintFeatureEnabled() {
    const explicit = this.worldContent?.surfacePaint?.enabled;
    if (typeof explicit === "boolean") {
      return explicit;
    }
    return true;
  }

  isDrawingInteractionEnabled() {
    return this.isChalkFeatureEnabled();
  }

  tryPointerLock() {
    if (!this.canUsePointerLock()) {
      return;
    }
    if (!this.pointerLockSupported || this.pointerLocked) {
      return;
    }
    const maybePromise = this.renderer.domElement.requestPointerLock();
    if (maybePromise && typeof maybePromise.catch === "function") {
      maybePromise.catch(() => {
        this.hud.setStatus(this.getStatusText());
      });
    }
  }

  connectNetwork() {
    const endpoint = this.resolveSocketEndpoint();
    this.socketEndpoint = endpoint;
    if (!endpoint) {
      this.networkConnected = false;
      this.localPlayerId = null;
      this.roomHostId = null;
      this.isRoomHost = false;
      this.platformSaveInFlight = false;
      this.platformSavePending = false;
      this.platformSavePendingForceFlush = false;
      this.platformStateRevision = 0;
      this.platformStateDirty = false;
      this.platformStateAutosaveClock = 0;
      this.ropeSaveInFlight = false;
      this.ropeSavePending = false;
      this.ropeSavePendingForceFlush = false;
      this.ropeStateRevision = 0;
      this.ropeStateDirty = false;
      this.ropeStateAutosaveClock = 0;
      this.objectStateSaveInFlight = false;
      this.objectStateSavePending = false;
      this.objectStateSavePendingForceFlush = false;
      this.objectStateRevision = 0;
      this.objectStateDirty = false;
      this.objectStateAutosaveClock = 0;
      this.leftBillboardSetInFlight = false;
      this.rightBillboardResetInFlight = false;
      this.billboardVideoSetInFlight = false;
      this.portalDisplaySetInFlight.portal1 = false;
      this.portalDisplaySetInFlight.portal2 = false;
      this.portalDisplaySetInFlight.hall = false;
      this.mainPortalAdSetInFlight = false;
      this.hostMusicSetInFlight = false;
      this.applySharedMusicState({ mode: "idle" }, { announce: false });
      this.portalForceOpenInFlight = false;
      this.clearRemotePlayers();
      this.clearPromoObjectVisuals();
      this.promoObjects.clear();
      this.clearPromoPlacementPreview({ syncUi: false });
      this.clearHostCustomBlockPlacementPreview({ syncUi: false });
      this.nearestPromoLinkObject = null;
      this.updateRoomPlayerSnapshot([]);
      this.setPlayerRosterVisible(false);
      this.syncHostControls();
      this.syncPromoPanelUi();
      this.updatePromoLinkPrompt();
      this.hud.setStatus(this.getStatusText());
      this.hud.setPlayers(0);
      this.updateSurfacePainterSaveAvailability();
      this.showSurfacePaintLinkWarningOnce();
      return;
    }

    const socket = io(endpoint, {
      transports: ["websocket", "polling"],
      timeout: 12000,
      reconnection: true,
      reconnectionDelay: 900,
      reconnectionDelayMax: 5000,
      auth: {
        linkGateVersion: this.socketLinkGateVersion,
        linkGateMode: this.socketLinkGateMode || "player",
        playerKey: this.promoOwnerKey
      }
    });

    this.socket = socket;

    socket.on("connect", () => {
      this.networkConnected = true;
      this.localPlayerId = socket.id;
      this.roomHostId = null;
      this.isRoomHost = false;
      this.autoHostClaimLastAttemptMs = 0;
      this.hostPortalTargetSynced = false;
      this.hostAZonePortalTargetSynced = false;
      this.localRoomZone = "lobby";
      this.entryZoneSwitchRequested = false;
      this.portalTargetSetInFlight = false;
      this.aZonePortalTargetSetInFlight = false;
      this.portalForceOpenInFlight = false;
      this.portalCloseInFlight = false;
      this.portalScheduleSetInFlight = false;
      this.portalZoneSwitchInFlight = false;
      this.platformSaveInFlight = false;
      this.platformSavePending = false;
      this.platformSavePendingForceFlush = false;
      this.platformStateRevision = 0;
      this.platformStateDirty = false;
      this.platformStateAutosaveClock = 0;
      this.ropeSaveInFlight = false;
      this.ropeSavePending = false;
      this.ropeSavePendingForceFlush = false;
      this.ropeStateRevision = 0;
      this.ropeStateDirty = false;
      this.ropeStateAutosaveClock = 0;
      this.objectStateSaveInFlight = false;
      this.objectStateSavePending = false;
      this.objectStateSavePendingForceFlush = false;
      this.objectStateRevision = 0;
      this.objectStateDirty = false;
      this.objectStateAutosaveClock = 0;
      this.leftBillboardSetInFlight = false;
      this.rightBillboardResetInFlight = false;
      this.billboardVideoSetInFlight = false;
      this.portalDisplaySetInFlight.portal1 = false;
      this.portalDisplaySetInFlight.portal2 = false;
      this.portalDisplaySetInFlight.hall = false;
      this.mainPortalAdSetInFlight = false;
      this.hostMusicSetInFlight = false;
      this.remoteSyncClock = 0;
      this.remoteUpdateClock = 0;
      this.lastSentInput = null;
      this.localInputSeq = 0;
      this.lastAckInputSeq = 0;
      this.pendingInputQueue.length = 0;
      this.netPingPending.clear();
      this.clientRttMs = 0;
      this.clientRttSmoothedMs = 0;
      this.clearChatLogs({ clearSeenIds: true });
      this.resetLocalChatSendLimiter();
      this.lastChatHistoryRequestAt = 0;
      this.pendingAuthoritativeStateSync = true;
      this.authoritativeSyncGraceUntil = performance.now() + 2200;
      this.updateRoomPlayerSnapshot([]);
      this.clearPromoObjectVisuals();
      this.promoObjects.clear();
      this.runtimePolicyState = {
        promoMode: "",
        surfacePaintMode: "",
        persistentStateAvailable: null,
        persistentStateReason: "",
        coreMemory: null,
        surfacePaintCoreMemory: null
      };
      this.clearPromoPlacementPreview({ syncUi: false });
      this.clearHostCustomBlockPlacementPreview({ syncUi: false });
      this.nearestPromoLinkObject = null;
      this.syncHostControls();
      this.hud.setStatus(this.getStatusText());
      this.syncFullscreenRestoreFlag();
      this.requestAuthoritativeStateSync();
      this.syncPlayerNameIfConnected({
        onJoined: () => {
          this.requestInitialZoneSwitch();
        }
      });
      this.requestSurfacePaintSnapshot();
      this.socket.emit("player:key:set", { key: this.promoOwnerKey }, (response = {}) => {
        if (response?.ok) {
          this.requestPromoState();
          return;
        }
        if (String(response?.error ?? "").trim().toLowerCase() === "duplicate session") {
          this.appendChatLine("", "중복 접속이 감지되어 현재 창 연결이 제한됩니다.", "system");
        }
      });
      this.requestPlatformState();
      this.requestRopeState();
      this.requestObjectState();
      this.requestChatHistory({ force: true });
      if (this.surfacePaintRetryQueue.size > 0) {
        this.scheduleSurfacePaintRetry(240);
      }
      this.updateSurfacePainterSaveAvailability();
      this.startNetworkPing();
      this.requestHostClaim();
      this.syncPromoPanelUi();
    });

    socket.on("session:duplicate", () => {
      this.appendChatLine("", "같은 계정 키로 이미 접속 중인 창이 있어 연결이 종료됩니다.", "system");
    });

    socket.on("session:blocked", (payload = {}) => {
      const reason = String(payload?.reason ?? "").trim().toLowerCase();
      let message = "세션 연결이 차단되었습니다.";
      if (reason === "session key required") {
        message = "세션 키가 없어 접속이 차단되었습니다. 새로고침 후 다시 시도하세요.";
      } else if (reason === "ip temporarily banned") {
        message = "짧은 시간에 너무 많은 접속이 감지되어 잠시 차단되었습니다.";
      } else if (reason === "ip concurrent limit reached") {
        message = "같은 네트워크에서 동시에 접속할 수 있는 수를 초과했습니다.";
      } else if (reason === "ip connect rate limited") {
        message = "짧은 시간에 너무 많은 재접속이 감지되었습니다.";
      }
      this.appendChatLine("", message, "system");
    });

    socket.on("runtime:policy", (payload = {}) => {
      this.applyRuntimePolicyState(payload ?? {});
    });

    socket.on("disconnect", () => {
      this.networkConnected = false;
      this.localPlayerId = null;
      this.roomHostId = null;
      this.isRoomHost = false;
      this.autoHostClaimLastAttemptMs = 0;
      this.hostPortalTargetSynced = false;
      this.hostAZonePortalTargetSynced = false;
      this.localRoomZone = "lobby";
      this.portalTargetSetInFlight = false;
      this.aZonePortalTargetSetInFlight = false;
      this.portalForceOpenInFlight = false;
      this.portalCloseInFlight = false;
      this.portalScheduleSetInFlight = false;
      this.portalZoneSwitchInFlight = false;
      this.platformSaveInFlight = false;
      this.platformSavePending = false;
      this.platformSavePendingForceFlush = false;
      this.platformStateRevision = 0;
      this.platformStateDirty = false;
      this.platformStateAutosaveClock = 0;
      this.ropeSaveInFlight = false;
      this.ropeSavePending = false;
      this.ropeSavePendingForceFlush = false;
      this.ropeStateRevision = 0;
      this.ropeStateDirty = false;
      this.ropeStateAutosaveClock = 0;
      this.objectStateSaveInFlight = false;
      this.objectStateSavePending = false;
      this.objectStateSavePendingForceFlush = false;
      this.objectStateRevision = 0;
      this.objectStateDirty = false;
      this.objectStateAutosaveClock = 0;
      this.leftBillboardSetInFlight = false;
      this.rightBillboardResetInFlight = false;
      this.billboardVideoSetInFlight = false;
      this.portalDisplaySetInFlight.portal1 = false;
      this.portalDisplaySetInFlight.portal2 = false;
      this.portalDisplaySetInFlight.hall = false;
      this.mainPortalAdSetInFlight = false;
      this.hostMusicSetInFlight = false;
      this.securityTestSetInFlight = false;
      this.authoritativeStateSyncInFlight = false;
      this.remoteSyncClock = 0;
      this.remoteUpdateClock = 0;
      this.lastSentInput = null;
      this.pendingJumpInput = false;
      this.pendingInputQueue.length = 0;
      this.netPingPending.clear();
      this.clientRttMs = 0;
      this.clientRttSmoothedMs = 0;
      this.resetLocalChatSendLimiter();
      this.stopNetworkPing();
      this.authoritativeSyncGraceUntil = 0;
      this.clearRemotePlayers();
      this.clearPromoObjectVisuals();
      this.promoObjects.clear();
      this.runtimePolicyState = {
        promoMode: "",
        surfacePaintMode: "",
        persistentStateAvailable: null,
        persistentStateReason: "",
        coreMemory: null,
        surfacePaintCoreMemory: null
      };
      this.clearPromoPlacementPreview({ syncUi: false });
      this.clearHostCustomBlockPlacementPreview({ syncUi: false });
      this.nearestPromoLinkObject = null;
      this.updateRoomPlayerSnapshot([]);
      this.setPlayerRosterVisible(false);
      this.applySharedMusicState({ mode: "idle" }, { announce: false });
      this.applySecurityTestState({ enabled: false }, { announce: false });
      this.syncHostControls();
      this.syncPromoPanelUi();
      this.updatePromoLinkPrompt();
      this.hud.setStatus(this.getStatusText());
      this.hud.setPlayers(0);
      this.updateSurfacePainterSaveAvailability();
    });

    socket.on("connect_error", (error) => {
      const connectErrorMessage = String(error?.message ?? "").toLowerCase();
      if (connectErrorMessage.includes("link gate denied")) {
        this.socketEndpointValidationError = "허용된 접속 링크만 사용할 수 있습니다.";
        this.socketEndpointLinkRequired = true;
      } else if (connectErrorMessage.includes("session key required")) {
        this.socketEndpointValidationError = "세션 키가 없어 접속이 차단되었습니다. 새로고침 후 다시 시도하세요.";
      } else if (connectErrorMessage.includes("ip temporarily banned")) {
        this.socketEndpointValidationError =
          "짧은 시간에 너무 많은 접속이 감지되어 잠시 차단되었습니다.";
      }
      this.networkConnected = false;
      this.localPlayerId = null;
      this.roomHostId = null;
      this.isRoomHost = false;
      this.portalScheduleSetInFlight = false;
      this.portalForceOpenInFlight = false;
      this.portalCloseInFlight = false;
      this.portalZoneSwitchInFlight = false;
      this.platformSaveInFlight = false;
      this.platformSavePending = false;
      this.platformSavePendingForceFlush = false;
      this.platformStateRevision = 0;
      this.platformStateDirty = false;
      this.platformStateAutosaveClock = 0;
      this.ropeSaveInFlight = false;
      this.ropeSavePending = false;
      this.ropeSavePendingForceFlush = false;
      this.ropeStateRevision = 0;
      this.ropeStateDirty = false;
      this.ropeStateAutosaveClock = 0;
      this.objectStateSaveInFlight = false;
      this.objectStateSavePending = false;
      this.objectStateSavePendingForceFlush = false;
      this.objectStateRevision = 0;
      this.objectStateDirty = false;
      this.objectStateAutosaveClock = 0;
      this.leftBillboardSetInFlight = false;
      this.rightBillboardResetInFlight = false;
      this.billboardVideoSetInFlight = false;
      this.mainPortalAdSetInFlight = false;
      this.hostMusicSetInFlight = false;
      this.securityTestSetInFlight = false;
      this.authoritativeStateSyncInFlight = false;
      this.remoteSyncClock = 0;
      this.remoteUpdateClock = 0;
      this.lastSentInput = null;
      this.pendingJumpInput = false;
      this.pendingInputQueue.length = 0;
      this.clientRttMs = 0;
      this.clientRttSmoothedMs = 0;
      this.authoritativeSyncGraceUntil = 0;
      this.resetLocalChatSendLimiter();
      this.clearRemotePlayers();
      this.clearPromoObjectVisuals();
      this.promoObjects.clear();
      this.runtimePolicyState = {
        promoMode: "",
        surfacePaintMode: "",
        persistentStateAvailable: null,
        persistentStateReason: "",
        coreMemory: null,
        surfacePaintCoreMemory: null
      };
      this.clearPromoPlacementPreview({ syncUi: false });
      this.clearHostCustomBlockPlacementPreview({ syncUi: false });
      this.nearestPromoLinkObject = null;
      this.updateRoomPlayerSnapshot([]);
      this.setPlayerRosterVisible(false);
      this.applySharedMusicState({ mode: "idle" }, { announce: false });
      this.applySecurityTestState({ enabled: false }, { announce: false });
      this.syncHostControls();
      this.syncPromoPanelUi();
      this.updatePromoLinkPrompt();
      this.stopNetworkPing();
      this.hud.setStatus(this.getStatusText());
      this.hud.setPlayers(0);
      this.updateSurfacePainterSaveAvailability();
    });

    socket.on("room:update", (room) => {
      this.handleRoomUpdate(room);
    });

    socket.on("portal:target:update", (payload = {}) => {
      const changed = this.applyPortalTargetUpdate(payload?.targetUrl ?? payload?.url ?? "");
      if (changed) {
        this.updatePortalTimeBillboard(0, true);
      }
    });

    socket.on("portal:a-zone-target:update", (payload = {}) => {
      this.applyAZonePortalTargetUpdate(payload?.targetUrl ?? payload?.url ?? "");
    });

    socket.on("portal:display:update", (payload = {}) => {
      this.applyPortalDisplayCollection(payload ?? {}, { force: true });
    });

    socket.on("portal:ad:update", (payload = {}) => {
      this.applyMainPortalAdState(payload ?? {}, { force: true });
    });

    socket.on("portal:schedule:update", (payload = {}) => {
      this.applyPortalScheduleUpdate(payload ?? {}, { announce: false });
    });

    socket.on("portal:force-open", (payload = {}) => {
      const hostId = String(payload?.hostId ?? "").trim();
      const localId = String(this.localPlayerId ?? "").trim();
      this.handlePortalForceOpen(payload, { announce: Boolean(hostId && hostId !== localId) });
    });

    socket.on("portal:force-close", (payload = {}) => {
      const hostId = String(payload?.hostId ?? "").trim();
      const localId = String(this.localPlayerId ?? "").trim();
      this.handlePortalForceClose(payload, { announce: Boolean(hostId && hostId !== localId) });
    });

    socket.on("paint:state", (payload = {}) => {
      this.applySurfacePaintSnapshot(payload);
      if (this.surfacePaintRetryQueue.size > 0) {
        this.scheduleSurfacePaintRetry(900);
      }
    });

    socket.on("paint:surface:update", (payload = {}) => {
      this.applySurfacePaintUpdate(payload);
    });

    socket.on("billboard:left:update", (payload = {}) => {
      this.applyLeftBillboardState(payload ?? {}, { force: true });
    });

    socket.on("billboard:right:update", (payload = {}) => {
      this.applyRightBillboardState(payload ?? {}, { force: true });
    });

    socket.on("music:state", (payload = {}) => {
      this.applySharedMusicState(payload?.state ?? payload ?? {}, { announce: false });
    });

    socket.on("music:update", (payload = {}) => {
      const hostId = String(payload?.hostId ?? "").trim();
      const localId = String(this.localPlayerId ?? "").trim();
      const announce = Boolean(hostId && localId && hostId !== localId);
      this.applySharedMusicState(payload?.state ?? payload ?? {}, { announce });
    });

    socket.on("snapshot:world", (payload) => {
      this.handleWorldSnapshot(payload);
    });

    socket.on("ack:input", (payload) => {
      this.handleInputAck(payload);
    });

    socket.on("net:pong", (payload) => {
      const id = Math.trunc(Number(payload?.id) || 0);
      if (!id) {
        return;
      }
      const sentAt = this.netPingPending.get(id);
      if (!Number.isFinite(sentAt)) {
        return;
      }
      this.netPingPending.delete(id);
      const rttMs = Math.max(0, performance.now() - sentAt);
      this.clientRttMs = rttMs;
      this.clientRttSmoothedMs =
        this.clientRttSmoothedMs > 0
          ? THREE.MathUtils.lerp(this.clientRttSmoothedMs, rttMs, 0.25)
          : rttMs;
      if (this.socket && this.networkConnected) {
        this.socket.emit("net:rtt", { rttMs: Math.round(rttMs) });
      }
    });

    socket.on("chat:message", (payload) => {
      this.handleChatMessage(payload);
    });

    socket.on("chat:history", (payload = {}) => {
      this.handleChatHistory(payload);
    });

    socket.on("chat:blocked", (payload = {}) => {
      const reason = String(payload?.reason ?? "").trim().toLowerCase();
      let message = "채팅 전송이 제한되었습니다. 잠시 후 다시 시도하세요.";
      if (reason === "chat duplicate blocked") {
        message = "같은 메시지는 연속으로 도배할 수 없습니다.";
      } else if (reason === "chat rate limited") {
        message = "짧은 시간에 보낼 수 있는 채팅 수를 초과했습니다.";
      } else if (reason === "chat too fast") {
        message = "채팅 전송 간격이 너무 빠릅니다.";
      }
      this.showChatRateLimitNotice(message);
    });

    socket.on("promo:state", (payload = {}) => {
      this.applyPromoState(payload?.objects ?? payload?.promoObjects ?? []);
    });

    socket.on("platform:state", (payload = {}) => {
      this.applyPlatformState(payload?.platforms ?? [], { revision: payload?.revision });
    });
    socket.on("rope:state", (payload = {}) => {
      this.applyRopeState(payload?.ropes ?? [], { revision: payload?.revision });
    });
    socket.on("object:state", (payload = {}) => {
      this.applyObjectPositionsState(payload?.positions ?? payload?.objectPositions ?? {}, {
        revision: payload?.revision
      });
    });
  }

  startNetworkPing() {
    this.stopNetworkPing();
    if (!this.socket || !this.networkConnected) {
      return;
    }

    const sendPing = () => {
      if (!this.socket || !this.networkConnected) {
        return;
      }
      const id = ++this.netPingNonce;
      this.netPingPending.set(id, performance.now());
      if (this.netPingPending.size > 6) {
        const oldest = this.netPingPending.keys().next().value;
        if (oldest) {
          this.netPingPending.delete(oldest);
        }
      }
      this.socket.emit("net:ping", { id, t: Date.now() });
    };

    sendPing();
    this.netPingTimer = window.setInterval(sendPing, 5000);
  }

  stopNetworkPing() {
    if (this.netPingTimer) {
      window.clearInterval(this.netPingTimer);
      this.netPingTimer = null;
    }
  }

  resolveSocketEndpoint() {
    if (typeof window === "undefined") {
      return null;
    }

    this.socketEndpointValidationError = "";
    this.socketEndpointLinkRequired = false;
    this.socketLinkGateMode = this.isHostEntryLink ? "host" : "player";
    const pushEndpointError = (message, linkRequired = false) => {
      this.socketEndpointValidationError = String(message ?? "").trim();
      this.socketEndpointLinkRequired = Boolean(linkRequired);
      this.socketLinkGateMode = "";
      return null;
    };
    const normalizeEndpoint = (raw, sourceLabel = "server") => {
      const value = String(raw ?? "").trim();
      if (!value) {
        return null;
      }
      try {
        const parsed = new URL(value, window.location.href);
        if (parsed.protocol === "ws:") {
          parsed.protocol = "http:";
        } else if (parsed.protocol === "wss:") {
          parsed.protocol = "https:";
        }
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          return pushEndpointError(`${sourceLabel} 주소는 http/https 형식이어야 합니다.`, true);
        }
        parsed.hash = "";
        const pathname = parsed.pathname.replace(/\/+$/, "");
        const normalizedPath = pathname && pathname !== "/" ? pathname : "";
        return `${parsed.origin}${normalizedPath}${parsed.search}`;
      } catch {
        return pushEndpointError(`${sourceLabel} 주소를 확인하세요.`, true);
      }
    };
    const normalizeOrigin = (raw) => {
      try {
        return new URL(String(raw ?? "").trim()).origin.toLowerCase();
      } catch {
        return "";
      }
    };
    const pagesCanonicalEndpoint = "https://emptines-chat-2.onrender.com";
    const pagesLegacyEndpoint = "https://emptines-chat.onrender.com";
    const pagesLegacyOrigin = normalizeOrigin(pagesLegacyEndpoint);
    const isGithubPagesHost = String(window.location.hostname ?? "").endsWith("github.io");
    const envEndpoint = String(
      import.meta.env?.VITE_SOCKET_ENDPOINT ?? import.meta.env?.VITE_CHAT_SERVER ?? ""
    ).trim();
    if (envEndpoint) {
      return normalizeEndpoint(envEndpoint, "환경변수 서버");
    }

    const query = new URLSearchParams(window.location.search);
    const queryEndpoint = String(query.get("server") ?? "").trim();
    const hasSocketAliasParam = query.has("socket") || query.has("ws");
    const pagesHostLinkKey = "5aba6e452e7e403bb5f8648e34a7a4e9";
    const pagesHostLinkName = "HOST";
    if (isGithubPagesHost) {
      if (hasSocketAliasParam) {
        return pushEndpointError("허용된 접속 링크만 사용할 수 있습니다.", true);
      }
      if (!queryEndpoint) {
        return pushEndpointError("허용된 접속 링크로 접속하세요.", true);
      }
    }
    if (queryEndpoint) {
      const normalizedQueryEndpoint = normalizeEndpoint(queryEndpoint, "URL server 파라미터");
      if (!normalizedQueryEndpoint) {
        return null;
      }
      if (isGithubPagesHost) {
        const canonicalEndpoint = normalizeEndpoint(pagesCanonicalEndpoint, "기본 Pages 서버");
        if (!canonicalEndpoint) {
          return null;
        }
        const queryOrigin = normalizeOrigin(normalizedQueryEndpoint);
        const canonicalOrigin = normalizeOrigin(canonicalEndpoint);
        if (queryOrigin === pagesLegacyOrigin) {
          return pushEndpointError("구 링크는 차단되었습니다. 새 링크로 접속하세요.", true);
        }
        if (!queryOrigin || queryOrigin !== canonicalOrigin) {
          return pushEndpointError("허용된 접속 링크로 접속하세요.", true);
        }
        const queryEntries = [...query.entries()];
        const hasOnlyPlayerLinkKeys = queryEntries.length === 1 && query.has("server");
        const hasOnlyHostLinkKeys =
          queryEntries.length === 4 &&
          query.has("server") &&
          query.has("host") &&
          query.has("hostKey") &&
          query.has("name");
        const hostFlagValue = String(query.get("host") ?? "").trim();
        const hostKeyValue = String(query.get("hostKey") ?? "").trim();
        const hostNameValue = String(query.get("name") ?? "").trim();
        const isExactPlayerLink = hasOnlyPlayerLinkKeys && normalizedQueryEndpoint === canonicalEndpoint;
        const isExactHostLink =
          hasOnlyHostLinkKeys &&
          normalizedQueryEndpoint === canonicalEndpoint &&
          hostFlagValue === "1" &&
          hostKeyValue === pagesHostLinkKey &&
          hostNameValue === pagesHostLinkName;
        if (!isExactPlayerLink && !isExactHostLink) {
          return pushEndpointError("허용된 접속 링크만 사용할 수 있습니다.", true);
        }
        this.socketLinkGateMode = isExactHostLink ? "host" : "player";
      }
      return normalizedQueryEndpoint;
    }

    const globalEndpoint = String(window.__EMPTINES_SOCKET_ENDPOINT ?? "").trim();
    if (globalEndpoint) {
      return normalizeEndpoint(globalEndpoint, "전역 서버");
    }

    const { protocol, hostname } = window.location;

    if (protocol === "file:") {
      return "http://localhost:3001";
    }

    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return `${protocol}//${hostname}:3001`;
    }

    if (hostname.endsWith("github.io")) {
      const defaultPagesEndpoint = pagesCanonicalEndpoint;
      return normalizeEndpoint(defaultPagesEndpoint, "기본 Pages 서버");
    }

    return `${protocol}//${hostname}`;
  }

  handleRoomUpdate(room) {
    const previousHostState = this.isRoomHost;
    const nextHostId = String(room?.hostId ?? "").trim();
    this.roomHostId = nextHostId || null;
    this.isRoomHost = Boolean(this.localPlayerId && nextHostId && this.localPlayerId === nextHostId);
    if (typeof room?.portalTarget === "string") {
      const portalTargetChanged = this.applyPortalTargetUpdate(room.portalTarget);
      if (portalTargetChanged) {
        this.updatePortalTimeBillboard(0, true);
      }
    }
    if (typeof room?.aZonePortalTarget === "string") {
      this.applyAZonePortalTargetUpdate(room.aZonePortalTarget);
    }
    if (room?.portalSchedule && typeof room.portalSchedule === "object") {
      this.applyPortalScheduleUpdate(room.portalSchedule, { announce: false });
    }
    if (room?.portalDisplays && typeof room.portalDisplays === "object") {
      this.applyPortalDisplayCollection(room.portalDisplays);
    }
    if (room?.mainPortalAd && typeof room.mainPortalAd === "object") {
      this.applyMainPortalAdState(room.mainPortalAd);
    }
    if (room?.leftBillboard && typeof room.leftBillboard === "object") {
      this.applyLeftBillboardState(room.leftBillboard);
    }
    if (room?.rightBillboard && typeof room.rightBillboard === "object") {
      // No force: same-video state won't restart playback when another player joins
      this.applyRightBillboardState(room.rightBillboard);
    }
    if (room?.securityTest && typeof room.securityTest === "object") {
      this.applySecurityTestState(room.securityTest, { announce: false });
    }
    if (room?.objectEditor && typeof room.objectEditor === "object") {
      this.applyObjectEditorSettings(room.objectEditor, {
        persistLocal: true,
        syncUi: true
      });
    }
    if (room?.surfacePolicies && typeof room.surfacePolicies === "object") {
      this.applySurfacePaintPolicyState(room.surfacePolicies);
    }
    if (Array.isArray(room?.promoObjects)) {
      this.applyPromoState(room.promoObjects);
    }

    const players = Array.isArray(room?.players) ? room.players : [];
    this.updateRoomPlayerSnapshot(players);
    const seen = new Set();
    const remotePool = [];

    for (const player of players) {
      const id = String(player?.id ?? "");
      if (!id) {
        continue;
      }
      if (id === this.localPlayerId) {
        this.localPlayerName = this.formatPlayerName(player?.name);
        const nextZone = this.normalizeRoomZone(player?.zone ?? "", this.localRoomZone || "lobby");
        if (nextZone) {
          this.localRoomZone = nextZone;
        }
        continue;
      }
      remotePool.push(player);
    }

    if (remotePool.length > this.remoteHardCap) {
      remotePool.sort((a, b) => {
        const da = this.getRemoteDistanceScore(a?.state);
        const db = this.getRemoteDistanceScore(b?.state);
        return da - db;
      });
      remotePool.length = this.remoteHardCap;
    }

    for (const player of remotePool) {
      const id = String(player?.id ?? "");
      if (!id) {
        continue;
      }
      seen.add(id);
      this.upsertRemotePlayer(id, player.state ?? null, player?.name);
    }

    for (const id of this.remotePlayers.keys()) {
      if (!seen.has(id)) {
        this.removeRemotePlayer(id);
      }
    }

    if (!this.isRoomHost && this.autoHostClaimEnabled) {
      this.requestHostClaim();
    }
    if (this.pendingAuthoritativeStateSync) {
      this.requestAuthoritativeStateSync();
    }
    if (this.isRoomHost) {
      this.syncHostPortalTargetCandidate();
      this.syncHostAZonePortalTargetCandidate();
    }
    if (previousHostState !== this.isRoomHost) {
      this.hud.setStatus(this.getStatusText());
      this.updateSurfacePainterSaveAvailability();
    }
    this.syncHostControls();

    const localPlayer = this.networkConnected ? 1 : 0;
    this.hud.setPlayers(this.remotePlayers.size + localPlayer);
    if (this.surfacePaintRetryQueue.size > 0) {
      this.scheduleSurfacePaintRetry(350);
    }
  }

  parsePackedSnapshotState(rawState) {
    if (!Array.isArray(rawState) || rawState.length < 5) {
      return null;
    }
    return {
      x: Number(rawState[0]) || 0,
      y: Number(rawState[1]) || GAME_CONSTANTS.PLAYER_HEIGHT,
      z: Number(rawState[2]) || 0,
      yaw: Number(rawState[3]) || 0,
      pitch: Number(rawState[4]) || 0
    };
  }

  parseChatMessageState(rawState) {
    if (!rawState || typeof rawState !== "object") {
      return null;
    }
    const x = Number(rawState.x);
    const y = Number(rawState.y);
    const z = Number(rawState.z);
    const yaw = Number(rawState.yaw);
    const pitch = Number(rawState.pitch);
    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !Number.isFinite(z) ||
      !Number.isFinite(yaw) ||
      !Number.isFinite(pitch)
    ) {
      return null;
    }
    return { x, y, z, yaw, pitch };
  }

  handleInputAck(payload = {}) {
    const ackSeq = Math.max(0, Math.trunc(Number(payload?.seq) || 0));
    if (!ackSeq || ackSeq <= this.lastAckInputSeq) {
      return;
    }
    this.lastAckInputSeq = ackSeq;
    if (this.pendingInputQueue.length > 0) {
      this.pendingInputQueue = this.pendingInputQueue.filter((entry) => entry.seq > ackSeq);
    }
  }

  applyAuthoritativeSelfState(state, ackSeq) {
    if (!state || !this.networkConnected || !this.socket) {
      return;
    }

    if (ackSeq > 0) {
      this.handleInputAck({ seq: ackSeq });
    }

    const targetX = Number(state.x) || 0;
    const targetY = Math.max(GAME_CONSTANTS.PLAYER_HEIGHT, Number(state.y) || GAME_CONSTANTS.PLAYER_HEIGHT);
    const targetZ = Number(state.z) || 0;
    const targetYaw = this.normalizeYawAngle(Number(state.yaw) || 0);
    const targetPitch = THREE.MathUtils.clamp(Number(state.pitch) || 0, -1.52, 1.52);

    const dx = targetX - this.playerPosition.x;
    const dy = targetY - this.playerPosition.y;
    const dz = targetZ - this.playerPosition.z;
    const errorSq = dx * dx + dy * dy + dz * dz;
    const now = performance.now();
    const recentlyMoving = now - this.lastActiveMoveInputAt < 240;
    const inReconnectStateSyncGrace =
      this.pendingAuthoritativeStateSync && now < this.authoritativeSyncGraceUntil;
    const measuredRttMs = Math.max(
      0,
      Number(this.clientRttSmoothedMs) || Number(this.clientRttMs) || 0
    );
    const rttFactor = this.mobileEnabled
      ? THREE.MathUtils.clamp((measuredRttMs - 70) / 210, 0, 1)
      : THREE.MathUtils.clamp((measuredRttMs - 90) / 260, 0, 1);

    // XZ-only error for snap decision: ignore Y so a jump doesn't cause a snap.
    const xzErrorSq = dx * dx + dz * dz;

    if (xzErrorSq > 64) {
      if (inReconnectStateSyncGrace) {
        return;
      }
      // XZ error > 8 m: hard snap XZ to server. Only move Y if server is above (floor correction).
      this.playerPosition.x = targetX;
      this.playerPosition.z = targetZ;
      if (dy > 0) {
        this.playerPosition.y = targetY;
        this.verticalVelocity = 0;
        this.onGround = targetY <= GAME_CONSTANTS.PLAYER_HEIGHT + 0.001;
      }
      if (!this.pointerLocked && !this.mobileEnabled) {
        this.yaw = targetYaw;
        this.pitch = targetPitch;
      }
      return;
    }

    // Soften correction while actively moving to avoid visible tug-of-war on higher RTT links.
    let xzThresholdSq = recentlyMoving ? 1.44 : 0.36;
    if (this.mobileEnabled) {
      xzThresholdSq *= 1 + rttFactor * 2.2;
    } else {
      xzThresholdSq *= 1 + rttFactor * 0.8;
    }
    if (xzErrorSq > xzThresholdSq) {
      const baseAlpha = recentlyMoving
        ? xzErrorSq > 9
          ? 0.09
          : 0.04
        : xzErrorSq > 9
          ? 0.16
          : xzErrorSq > 2.25
            ? 0.09
            : 0.05;
      const latencyDampen = this.mobileEnabled
        ? THREE.MathUtils.clamp(0.9 - rttFactor * 0.42, 0.42, 0.9)
        : THREE.MathUtils.clamp(1 - rttFactor * 0.22, 0.7, 1);
      let correctionX = dx * (baseAlpha * latencyDampen);
      let correctionZ = dz * (baseAlpha * latencyDampen);
      const correctionLen = Math.hypot(correctionX, correctionZ);
      const correctionStepCap = this.mobileEnabled
        ? this.authoritativeCorrectionStepCapMobile
        : this.authoritativeCorrectionStepCapDesktop;
      if (correctionLen > correctionStepCap && correctionStepCap > 0.001) {
        const scale = correctionStepCap / correctionLen;
        correctionX *= scale;
        correctionZ *= scale;
      }
      this.playerPosition.x += correctionX;
      this.playerPosition.z += correctionZ;
    }

    // Vertical correction:
    // - Always allow upward correction (client below server).
    // - Allow downward correction only while descending/grounded to avoid canceling jump ascent.
    const ascendingFast = !this.onGround && this.verticalVelocity > 1.2;
    const descendingAirborne = !this.onGround && this.verticalVelocity < -0.8;
    const allowDownwardAirCorrection = !ascendingFast && !descendingAirborne;
    const shouldCorrectUpward = dy > (this.onGround ? 0.18 : 0.26);
    const shouldCorrectDownward =
      (this.onGround && dy < -0.24) ||
      (!this.onGround && allowDownwardAirCorrection && dy < -0.85);
    if (shouldCorrectUpward || shouldCorrectDownward) {
      const yAlpha = dy > 0
        ? this.onGround
          ? 0.14
          : 0.09
        : this.onGround
          ? 0.08
          : 0.045;
      const yStepCap = dy > 0
        ? this.onGround
          ? 0.42
          : 0.18
        : this.onGround
          ? 0.18
          : 0.08;
      const correctionY = THREE.MathUtils.clamp(dy * yAlpha, -yStepCap, yStepCap);
      this.playerPosition.y += correctionY;
      if (Math.abs(correctionY) > 0.04) {
        // Dampen velocity so correction doesn't immediately bounce back and jitter.
        this.verticalVelocity *= 0.7;
      }
      if (Math.abs(dy) > 1.8) {
        this.verticalVelocity = 0;
        this.onGround = targetY <= GAME_CONSTANTS.PLAYER_HEIGHT + 0.001;
      }
    }

    // Avoid camera tug-of-war while the player is actively looking around.
    if (!this.pointerLocked && !this.mobileEnabled) {
      const yawDelta = Math.abs(
        Math.atan2(Math.sin(targetYaw - this.yaw), Math.cos(targetYaw - this.yaw))
      );
      if (yawDelta > 0.14) {
        this.yaw = lerpAngle(this.yaw, targetYaw, 0.18);
      }

      const pitchDelta = Math.abs(targetPitch - this.pitch);
      if (pitchDelta > 0.08) {
        this.pitch = THREE.MathUtils.lerp(this.pitch, targetPitch, 0.18);
      }
    }
  }

  handleWorldSnapshot(payload) {
    if (!payload || typeof payload !== "object") {
      return;
    }

    const selfState = this.parsePackedSnapshotState(payload?.self?.s);
    const selfSeq = Math.max(0, Math.trunc(Number(payload?.self?.seq) || 0));
    if (selfState) {
      if (this.pendingAuthoritativeStateSync) {
        if (selfSeq > 0) {
          this.handleInputAck({ seq: selfSeq });
        }
        this.requestAuthoritativeStateSync();
      } else {
        this.applyAuthoritativeSelfState(selfState, selfSeq);
      }
    } else if (selfSeq > 0) {
      this.handleInputAck({ seq: selfSeq });
    }

    const players = Array.isArray(payload?.players) ? payload.players : [];
    for (const player of players) {
      const id = String(player?.id ?? "");
      if (!id || id === this.localPlayerId) {
        continue;
      }
      if (!this.remotePlayers.has(id) && this.remotePlayers.size >= this.remoteHardCap) {
        continue;
      }

      const nextState = this.parsePackedSnapshotState(player?.s);
      const nextName = String(player?.n ?? "").trim();
      this.upsertRemotePlayer(id, nextState, nextName || null);
    }

    const gone = Array.isArray(payload?.gone) ? payload.gone : [];
    for (const idRaw of gone) {
      const id = String(idRaw ?? "");
      if (!id || id === this.localPlayerId) {
        continue;
      }
      this.removeRemotePlayer(id);
    }

    const localPlayer = this.networkConnected ? 1 : 0;
    this.hud.setPlayers(this.remotePlayers.size + localPlayer);
  }

  upsertRemotePlayer(id, state, name) {
    let remote = this.remotePlayers.get(id);
    if (!remote) {
      const root = new THREE.Group();

      const body = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.2, 0.64, 4, 8),
        new THREE.MeshStandardMaterial({
          color: 0x5f7086,
          roughness: 0.44,
          metalness: 0.06,
          emissive: 0x2d4057,
          emissiveIntensity: 0.18
        })
      );
      body.position.y = 0.92;
      body.castShadow = false;
      body.receiveShadow = false;

      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.22, 12, 12),
        new THREE.MeshStandardMaterial({
          color: 0x7e8e9b,
          roughness: 0.36,
          metalness: 0.05,
          emissive: 0x3e4f63,
          emissiveIntensity: 0.2
        })
      );
      head.position.y = 1.62;
      head.castShadow = false;
      head.receiveShadow = false;

      const nameLabel = this.createTextLabel("?뚮젅?댁뼱", "name");
      nameLabel.position.set(0, 2.12, 0);

      const chatLabel = this.createTextLabel("", "chat");
      chatLabel.position.set(0, 2.5, 0);
      chatLabel.visible = false;

      root.add(body, head, nameLabel, chatLabel);
      root.position.set(0, 0, 0);
      this.scene.add(root);

      remote = {
        mesh: root,
        nameLabel,
        chatLabel,
        name: "?뚮젅?댁뼱",
        chatExpireAt: 0,
        targetPosition: new THREE.Vector3(0, 0, 0),
        targetYaw: 0,
        nextLodUpdateAt: 0,
        lastSeen: performance.now()
      };

      this.remotePlayers.set(id, remote);
    }

    const hasName = typeof name === "string" && String(name).trim().length > 0;
    if (hasName) {
      const nextName = this.formatPlayerName(name);
      if (nextName !== remote.name) {
        remote.name = nextName;
        this.setTextLabel(remote.nameLabel, nextName, "name");
      }
    }

    if (state) {
      remote.targetPosition.set(
        Number(state.x) || 0,
        Math.max(
          0,
          (Number(state.y) || GAME_CONSTANTS.PLAYER_HEIGHT) - GAME_CONSTANTS.PLAYER_HEIGHT
        ),
        Number(state.z) || 0
      );
      remote.targetYaw = Number(state.yaw) || 0;
      remote.lastSeen = performance.now();
    }
  }

  removeRemotePlayer(id) {
    const remote = this.remotePlayers.get(id);
    if (!remote) {
      return;
    }

    this.disposeTextLabel(remote.nameLabel);
    this.disposeTextLabel(remote.chatLabel);
    this.scene.remove(remote.mesh);
    disposeMeshTree(remote.mesh);
    this.remotePlayers.delete(id);
  }

  clearRemotePlayers() {
    for (const id of this.remotePlayers.keys()) {
      this.removeRemotePlayer(id);
    }
  }

  tick(delta) {
    const safeDelta = THREE.MathUtils.clamp(Number(delta) || 0, 0, 0.2);
    if (safeDelta <= 0) {
      return;
    }

    this.elapsedSeconds += safeDelta;
    this.mobileUiRefreshClock += safeDelta;
    this.spatialAudioMixClock += safeDelta;
    this.applyPendingMouseLookInput();
    const movementSubstepMax = this.mobileEnabled
      ? this.movementSubstepMaxMobile
      : this.movementSubstepMaxDesktop;
    const movementStep = Math.max(1 / 180, Number(movementSubstepMax) || 1 / 60);
    const maxMovementSubsteps = Math.max(
      1,
      Math.trunc(
        this.mobileEnabled ? this.movementSubstepMaxCountMobile : this.movementSubstepMaxCountDesktop
      ) || 1
    );
    let movementRemaining = safeDelta;
    let movementSubsteps = 0;
    while (movementRemaining > 0 && movementSubsteps < maxMovementSubsteps) {
      const dt = Math.min(movementRemaining, movementStep);
      this.updateMovement(dt);
      movementRemaining -= dt;
      movementSubsteps += 1;
    }
    if (movementRemaining > 0) {
      this.updateMovement(movementRemaining);
    }
    this.updateHubFlow(safeDelta);
    this.updateChalkPickupPrompt(safeDelta);
    this.updateSurfacePaintPrompt(safeDelta);
    this.updatePortalTimeBillboard(safeDelta);
    this.updateHallPortalCountdownOverlay();
    if (this.mobileUiRefreshClock >= 0.12) {
      this.mobileUiRefreshClock = 0;
      this.syncMobileUiState();
    }
    this.updateChalkDrawing();
    const nowMs = typeof performance !== "undefined" ? performance.now() : Date.now();
    const recentLookInputMs = Math.max(0, nowMs - (Number(this.lastLookInputAtMs) || 0));
    const cloudInterval =
      recentLookInputMs < this.dynamicResolutionInputQuietMs
        ? this.cloudUpdateTurningInterval
        : this.cloudUpdateInterval;
    this.cloudUpdateClock += safeDelta;
    if (this.cloudUpdateClock >= cloudInterval) {
      this.updateCloudLayer(this.cloudUpdateClock);
      this.cloudUpdateClock = 0;
    }
    const oceanInterval =
      recentLookInputMs < this.dynamicResolutionInputQuietMs
        ? this.oceanUpdateTurningInterval
        : this.oceanUpdateInterval;
    this.oceanUpdateClock += safeDelta;
    if (this.oceanUpdateClock >= oceanInterval) {
      this.updateOcean(this.oceanUpdateClock);
      this.oceanUpdateClock = 0;
    }
    this.updateRemotePlayers(safeDelta);
    this.updateLocalChatBubble();
    this.emitLocalSync(safeDelta);
    if (this.spatialAudioMixClock >= this.spatialAudioMixInterval) {
      this.spatialAudioMixClock = 0;
      this.updateSpatialAudioMix();
    }
    this.updateDynamicResolution(safeDelta);
    this.updateHud(safeDelta);
    this.updatePlatformEditor();
    this.updatePlatformStateAutosave(safeDelta);
    this.updateRopeStateAutosave(safeDelta);
    this.updateObjectStateAutosave(safeDelta);
    this.updateRopeProximity(safeDelta);
    this.updatePromoPlacementPreview();
    this.updateHostCustomBlockPlacementPreview();
    this.updatePromoLinkPrompt(safeDelta);
    if (this.securityTestState?.enabled) {
      this.securityTestLabelRefreshClock += safeDelta;
      if (this.securityTestLabelRefreshClock >= this.securityTestLabelRefreshInterval) {
        this.securityTestLabelRefreshClock = 0;
        this.updateSecurityTestObjectLabelPositions();
      }
    }
  }

  getMovementIntent() {
    const movementEnabled = this.canMovePlayer();
    const keyboardForward = movementEnabled
      ? (this.keys.has("KeyW") || this.keys.has("ArrowUp") ? 1 : 0) -
        (this.keys.has("KeyS") || this.keys.has("ArrowDown") ? 1 : 0)
      : 0;
    const keyboardStrafe = movementEnabled
      ? (this.keys.has("KeyD") || this.keys.has("ArrowRight") ? 1 : 0) -
        (this.keys.has("KeyA") || this.keys.has("ArrowLeft") ? 1 : 0)
      : 0;
    const mobileForward = movementEnabled && this.mobileEnabled
      ? THREE.MathUtils.clamp(-this.mobileMoveVector.y, -1, 1)
      : 0;
    const mobileStrafe = movementEnabled && this.mobileEnabled
      ? THREE.MathUtils.clamp(this.mobileMoveVector.x, -1, 1)
      : 0;
    const forward = THREE.MathUtils.clamp(keyboardForward + mobileForward, -1, 1);
    const strafe = THREE.MathUtils.clamp(keyboardStrafe + mobileStrafe, -1, 1);
    const sprinting =
      movementEnabled &&
      (this.keys.has("ShiftLeft") || this.keys.has("ShiftRight") || this.mobileSprintHeld);

    return {
      movementEnabled,
      forward,
      strafe,
      sprinting
    };
  }

  registerStaticWorldBoxCollider(centerX, centerZ, width, depth, minY = -2, maxY = 220) {
    const safeWidth = Math.max(0.2, Number(width) || 0);
    const safeDepth = Math.max(0.2, Number(depth) || 0);
    if (safeWidth <= 0 || safeDepth <= 0) {
      return;
    }
    const cx = Number(centerX) || 0;
    const cz = Number(centerZ) || 0;
    const halfW = safeWidth * 0.5;
    const halfD = safeDepth * 0.5;
    const yMin = Number.isFinite(Number(minY)) ? Number(minY) : -2;
    const yMax = Number.isFinite(Number(maxY)) ? Number(maxY) : 220;
    this.staticWorldColliders.push({
      minX: cx - halfW,
      maxX: cx + halfW,
      minZ: cz - halfD,
      maxZ: cz + halfD,
      minY: Math.min(yMin, yMax),
      maxY: Math.max(yMin, yMax)
    });
    return this.staticWorldColliders.length - 1;
  }

  resolveStaticWorldCollisions(position, radius = this.playerCollisionRadius) {
    const promoColliders = Array.isArray(this.promoCollisionBoxes) ? this.promoCollisionBoxes : [];
    if (!position || (!this.staticWorldColliders.length && promoColliders.length <= 0)) {
      return;
    }

    const collisionRadius = Math.max(0.12, Number(radius) || this.playerCollisionRadius);
    const radiusSq = collisionRadius * collisionRadius;
    const feetY = position.y - GAME_CONSTANTS.PLAYER_HEIGHT;
    const headY = position.y + 0.18;
    const epsilon = 0.0001;

    for (let pass = 0; pass < 3; pass += 1) {
      let adjusted = false;
      const colliderGroups = [this.staticWorldColliders, promoColliders];
      for (const colliders of colliderGroups) {
        for (const collider of colliders) {
          if (!collider) {
            continue;
          }
          if (headY < collider.minY || feetY > collider.maxY) {
            continue;
          }

          const nearestX = THREE.MathUtils.clamp(position.x, collider.minX, collider.maxX);
          const nearestZ = THREE.MathUtils.clamp(position.z, collider.minZ, collider.maxZ);
          let offsetX = position.x - nearestX;
          let offsetZ = position.z - nearestZ;
          let distSq = offsetX * offsetX + offsetZ * offsetZ;
          if (distSq >= radiusSq - epsilon) {
            continue;
          }

          if (distSq > epsilon) {
            const dist = Math.sqrt(distSq);
            const push = collisionRadius - dist + epsilon;
            position.x += (offsetX / dist) * push;
            position.z += (offsetZ / dist) * push;
          } else {
            const pushLeft = Math.abs(position.x - collider.minX);
            const pushRight = Math.abs(collider.maxX - position.x);
            const pushBack = Math.abs(position.z - collider.minZ);
            const pushFront = Math.abs(collider.maxZ - position.z);
            const smallest = Math.min(pushLeft, pushRight, pushBack, pushFront);
            if (smallest === pushLeft) {
              position.x = collider.minX - collisionRadius - epsilon;
            } else if (smallest === pushRight) {
              position.x = collider.maxX + collisionRadius + epsilon;
            } else if (smallest === pushBack) {
              position.z = collider.minZ - collisionRadius - epsilon;
            } else {
              position.z = collider.maxZ + collisionRadius + epsilon;
            }
          }

          offsetX = position.x - nearestX;
          offsetZ = position.z - nearestZ;
          distSq = offsetX * offsetX + offsetZ * offsetZ;
          if (distSq < radiusSq) {
            adjusted = true;
          }
        }
      }

      if (!adjusted) {
        break;
      }
    }
  }

  updateMovement(delta) {
    if (this.climbingRope) {
      this.updateClimbing(delta);
      return;
    }
    const movement = this.getMovementIntent();
    const movementEnabled = movement.movementEnabled;
    const keyForward = movement.forward;
    const keyStrafe = movement.strafe;
    const sprinting = movement.sprinting;
    this.yaw = this.normalizeYawAngle(this.yaw);
    if (movementEnabled && (Math.abs(keyForward) > 0.001 || Math.abs(keyStrafe) > 0.001)) {
      this.lastActiveMoveInputAt = performance.now();
    }
    const baseSpeed = sprinting ? GAME_CONSTANTS.PLAYER_SPRINT : GAME_CONSTANTS.PLAYER_SPEED;
    const speed = this.onGround ? baseSpeed : baseSpeed * 1.35;

    if (this.flyModeActive) {
      // 카메라가 보는 방향(피치 포함) 그대로 3D 자유비행
      const flySpeed = sprinting ? GAME_CONSTANTS.PLAYER_SPRINT : GAME_CONSTANTS.PLAYER_SPEED;
      if (keyForward !== 0 || keyStrafe !== 0) {
        const sinYaw = Math.sin(this.yaw);
        const cosYaw = Math.cos(this.yaw);
        const cosPitch = Math.cos(this.pitch);
        const sinPitch = Math.sin(this.pitch);
        // 앞/뒤: 카메라 3D 방향 (Y 포함)
        const fwdX = -sinYaw * cosPitch;
        const fwdY = sinPitch;
        const fwdZ = -cosYaw * cosPitch;
        // 좌/우: 항상 수평
        const rightX = cosYaw;
        const rightZ = -sinYaw;
        const dx = fwdX * keyForward + rightX * keyStrafe;
        const dy = fwdY * keyForward;
        const dz = fwdZ * keyForward + rightZ * keyStrafe;
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (len > 0.0001) {
          const step = flySpeed * delta / len;
          const worldLimit = this.getBoundaryHardLimit();
          this.playerPosition.x = THREE.MathUtils.clamp(this.playerPosition.x + dx * step, -worldLimit, worldLimit);
          this.playerPosition.y += dy * step;
          this.playerPosition.z = THREE.MathUtils.clamp(this.playerPosition.z + dz * step, -worldLimit, worldLimit);
        }
      }
      this.playerPosition.y = Math.max(GAME_CONSTANTS.PLAYER_HEIGHT, this.playerPosition.y);
      this.verticalVelocity = 0;
      this.onGround = false;
      this.mobileJumpQueued = false;
    } else {
      if (keyForward !== 0 || keyStrafe !== 0) {
        const sinYaw = Math.sin(this.yaw);
        const cosYaw = Math.cos(this.yaw);

        this.moveForwardVec.set(-sinYaw, 0, -cosYaw);
        this.moveRightVec.set(cosYaw, 0, -sinYaw);

        this.moveVec
          .set(0, 0, 0)
          .addScaledVector(this.moveForwardVec, keyForward)
          .addScaledVector(this.moveRightVec, keyStrafe);

        if (this.moveVec.lengthSq() > 0.0001) {
          this.moveVec.normalize();
        }

        const moveStep = speed * delta;
        const worldLimit = this.getBoundaryHardLimit();
        this.playerPosition.x = THREE.MathUtils.clamp(
          this.playerPosition.x + this.moveVec.x * moveStep,
          -worldLimit,
          worldLimit
        );
        this.playerPosition.z = THREE.MathUtils.clamp(
          this.playerPosition.z + this.moveVec.z * moveStep,
          -worldLimit,
          worldLimit
        );
      }
      this.resolveStaticWorldCollisions(this.playerPosition, this.playerCollisionRadius);
      const prevFeetY = this.playerPosition.y - GAME_CONSTANTS.PLAYER_HEIGHT;
      this.verticalVelocity += GAME_CONSTANTS.PLAYER_GRAVITY * delta;
      this.playerPosition.y += this.verticalVelocity * delta;

      let platformTopY = null;
      if (this.verticalVelocity <= 0.1) {
        const feetY = this.playerPosition.y - GAME_CONSTANTS.PLAYER_HEIGHT;
        const candidatePlatforms = this.getNearbyPlatformCandidates(
          this.playerPosition.x,
          this.playerPosition.z
        );
        const promoPlatforms = this.getNearbyPromoPlatformCandidates(
          this.playerPosition.x,
          this.playerPosition.z
        );
        if (promoPlatforms.length > 0) {
          for (const promoPlatform of promoPlatforms) {
            candidatePlatforms.push(promoPlatform);
          }
        }
        if (candidatePlatforms.length > 0) {
          for (const p of candidatePlatforms) {
            const halfW = Math.max(0.1, Number(p.w) || 0) * 0.5 + 0.28;
            const halfD = Math.max(0.1, Number(p.d) || 0) * 0.5 + 0.28;
            if (
              Math.abs(this.playerPosition.x - (Number(p.x) || 0)) >= halfW ||
              Math.abs(this.playerPosition.z - (Number(p.z) || 0)) >= halfD
            ) {
              continue;
            }
            const topY = (Number(p.y) || 0) + Math.max(0.05, Number(p.h) || 0.3) * 0.5;
            const swept = prevFeetY >= topY && feetY <= topY; // swept through from above
            const nearTop = feetY >= topY - 0.6 && feetY <= topY + 0.1;
            if (swept || nearTop) {
              if (platformTopY === null || topY > platformTopY) {
                platformTopY = topY;
              }
            }
          }
        }
      }

      if (platformTopY !== null) {
        this.playerPosition.y = platformTopY + GAME_CONSTANTS.PLAYER_HEIGHT;
        this.verticalVelocity = 0;
        this.onGround = true;
        if (movementEnabled && this.mobileJumpQueued) {
          this.verticalVelocity = GAME_CONSTANTS.JUMP_FORCE;
          this.onGround = false;
        }
      } else if (this.playerPosition.y <= GAME_CONSTANTS.PLAYER_HEIGHT) {
        this.playerPosition.y = GAME_CONSTANTS.PLAYER_HEIGHT;
        this.verticalVelocity = 0;
        this.onGround = true;
        if (movementEnabled && this.mobileJumpQueued) {
          this.verticalVelocity = GAME_CONSTANTS.JUMP_FORCE;
          this.onGround = false;
        }
      } else {
        this.onGround = false;
      }
      this.mobileJumpQueued = false;
    }

    this.updateBoundaryGuard(delta);
    this.camera.position.copy(this.playerPosition);
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
  }

  updateRemotePlayers(delta) {
    const now = performance.now();
    const recentLookInputMs = Math.max(0, now - (Number(this.lastLookInputAtMs) || 0));
    const turningPeersThreshold = Math.max(2, Math.trunc(Number(this.remoteUpdateTurningPeerThreshold) || 0));
    if (
      recentLookInputMs < this.dynamicResolutionInputQuietMs &&
      this.remotePlayers.size >= turningPeersThreshold
    ) {
      this.remoteUpdateClock += Math.max(0, Number(delta) || 0);
      const turningInterval = Math.max(0.016, Number(this.remoteUpdateTurningInterval) || 0.033);
      if (this.remoteUpdateClock < turningInterval) {
        return;
      }
      this.remoteUpdateClock = 0;
    } else {
      this.remoteUpdateClock = 0;
    }
    const alpha = THREE.MathUtils.clamp(1 - Math.exp(-this.remoteLerpSpeed * delta), 0, 1);
    const nowSec = this.elapsedSeconds;

    for (const [id, remote] of this.remotePlayers) {
      const distanceScore = this.getRemoteDistanceScore(remote.targetPosition);
      const withinMeshRange = distanceScore <= this.remoteMeshDistanceSq;
      const meshVisible = withinMeshRange || remote.chatLabel.visible;
      remote.mesh.visible = meshVisible;
      if (!meshVisible) {
        remote.nameLabel.visible = false;
      } else {
        const labelVisible = distanceScore <= this.remoteLabelDistanceSq || remote.chatLabel.visible;
        remote.nameLabel.visible = labelVisible;

        let shouldUpdateTransform = true;
        if (distanceScore > this.remoteFarDistanceSq) {
          if (nowSec < (Number(remote.nextLodUpdateAt) || 0)) {
            shouldUpdateTransform = false;
          } else {
            remote.nextLodUpdateAt =
              nowSec + (Number(RUNTIME_TUNING.REMOTE_FAR_UPDATE_INTERVAL_SECONDS) || 0.11);
          }
        } else {
          remote.nextLodUpdateAt = nowSec;
        }

        if (remote.chatLabel.visible) {
          shouldUpdateTransform = true;
        }
        if (shouldUpdateTransform) {
          remote.mesh.position.lerp(remote.targetPosition, alpha);
          remote.mesh.rotation.y = lerpAngle(remote.mesh.rotation.y, remote.targetYaw, alpha);
        }
      }

      if (remote.chatLabel.visible) {
        const remaining = remote.chatExpireAt - now;
        if (remaining <= 0) {
          remote.chatLabel.visible = false;
          remote.chatLabel.material.opacity = 1;
        } else if (remaining < this.chatBubbleFadeMs) {
          remote.chatLabel.material.opacity = remaining / this.chatBubbleFadeMs;
        } else {
          remote.chatLabel.material.opacity = 1;
        }
      }
      if (!remote.chatLabel.visible && !withinMeshRange) {
        remote.mesh.visible = false;
      }

      if (now - remote.lastSeen > this.remoteStaleTimeoutMs) {
        this.removeRemotePlayer(id);
      }
    }
  }

  normalizeChatMessageId(rawValue) {
    const value = String(rawValue ?? "").trim();
    if (!value) {
      return "";
    }
    return value.replace(/[^a-zA-Z0-9:_-]/g, "").slice(0, 80);
  }

  pruneSeenChatMessageIds(nowMs = Date.now()) {
    const ttlMs = Math.max(20_000, Math.trunc(Number(this.chatSeenMessageIdTtlMs) || 0));
    for (const [messageId, seenAt] of this.chatSeenMessageIds.entries()) {
      if (nowMs - seenAt > ttlMs) {
        this.chatSeenMessageIds.delete(messageId);
      }
    }

    const maxTracked = 512;
    while (this.chatSeenMessageIds.size > maxTracked) {
      const oldestKey = this.chatSeenMessageIds.keys().next().value;
      if (!oldestKey) {
        break;
      }
      this.chatSeenMessageIds.delete(oldestKey);
    }
  }

  hasSeenChatMessageId(messageId, nowMs = Date.now()) {
    const normalized = this.normalizeChatMessageId(messageId);
    if (!normalized) {
      return false;
    }
    this.pruneSeenChatMessageIds(nowMs);
    return this.chatSeenMessageIds.has(normalized);
  }

  rememberSeenChatMessageId(messageId, nowMs = Date.now()) {
    const normalized = this.normalizeChatMessageId(messageId);
    if (!normalized) {
      return "";
    }
    this.chatSeenMessageIds.set(normalized, nowMs);
    this.pruneSeenChatMessageIds(nowMs);
    return normalized;
  }

  createClientChatMessageId() {
    const localId = String(this.localPlayerId ?? "local")
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "")
      .slice(-12) || "local";
    this.chatMessageSeq = (this.chatMessageSeq + 1) % 1_000_000_000;
    const seq = this.chatMessageSeq.toString(36);
    const stamp = Date.now().toString(36);
    return `c_${localId}_${stamp}_${seq}`;
  }

  clearChatLogs({ clearSeenIds = false } = {}) {
    this.resolveUiElements();
    if (this.chatLogEl) {
      this.chatLogEl.textContent = "";
    }
    if (this.chatLiveLogEl) {
      this.chatLiveLogEl.textContent = "";
    }
    if (clearSeenIds) {
      this.chatSeenMessageIds.clear();
      this.chatMessageSeq = 0;
    }
    this.chatHistoryLoaded = false;
  }

  scrollChatLogToLatest({ defer = false } = {}) {
    this.resolveUiElements();
    if (!this.chatLogEl) {
      return;
    }
    const apply = () => {
      if (!this.chatLogEl) {
        return;
      }
      this.chatLogEl.scrollTop = this.chatLogEl.scrollHeight;
    };
    if (defer && typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => {
        apply();
        requestAnimationFrame(apply);
      });
      return;
    }
    apply();
  }

  requestChatHistory({ force = false, mode = "", beforeCreatedAtMs = 0, replace = false } = {}) {
    if (!this.socket || !this.networkConnected) {
      return false;
    }
    const nowMs = Date.now();
    if (
      !force &&
      nowMs - this.lastChatHistoryRequestAt <
        Math.max(0, Math.trunc(Number(this.chatHistoryRequestMinIntervalMs) || 0))
    ) {
      return false;
    }
    this.lastChatHistoryRequestAt = nowMs;
    const payload = {};
    const normalizedMode = String(mode ?? "").trim().toLowerCase();
    if (normalizedMode) {
      payload.mode = normalizedMode;
    }
    const beforeMs = Math.max(0, Math.trunc(Number(beforeCreatedAtMs) || 0));
    if (beforeMs > 0) {
      payload.beforeCreatedAtMs = beforeMs;
    }
    if (replace) {
      payload.replace = true;
    }
    if (Object.keys(payload).length > 0) {
      this.socket.emit("chat:history:request", payload);
    } else {
      this.socket.emit("chat:history:request");
    }
    return true;
  }

  handleChatHistory(payload) {
    const replaceExisting = Boolean(payload?.replace);
    const messages = Array.isArray(payload?.messages)
      ? payload.messages
      : Array.isArray(payload)
        ? payload
        : [];
    if (replaceExisting) {
      this.clearChatLogs({ clearSeenIds: true });
    }
    this.chatHistoryLoaded = true;
    if (!messages.length) {
      if (replaceExisting && this.chatHistoryExpanded) {
        this.appendChatLine("", "어제까지 불러올 채팅 기록이 없습니다.", "system");
        this.scrollChatLogToLatest({ defer: true });
      }
      return;
    }

    const sortedMessages = messages
      .map((entry, index) => {
        const createdAt = Math.max(0, Math.trunc(Number(entry?.createdAt) || 0));
        return { entry, index, createdAt };
      })
      .sort((left, right) => {
        if (left.createdAt === right.createdAt) {
          return left.index - right.index;
        }
        return left.createdAt - right.createdAt;
      })
      .map((item) => item.entry);

    for (const entry of sortedMessages) {
      const text = String(entry?.text ?? "").trim().slice(0, 120);
      if (!text) {
        continue;
      }
      const messageId = this.normalizeChatMessageId(
        entry?.messageId ?? entry?.clientMessageId ?? ""
      );
      const nowMs = Date.now();
      if (messageId && this.hasSeenChatMessageId(messageId, nowMs)) {
        continue;
      }
      if (messageId) {
        this.rememberSeenChatMessageId(messageId, nowMs);
      }
      const senderId = String(entry?.id ?? "");
      const senderName = this.formatPlayerName(entry?.name);
      if (senderId && senderId === this.localPlayerId) {
        this.localPlayerName = senderName;
      }
      const lineType =
        senderId && this.localPlayerId && senderId === this.localPlayerId ? "self" : "remote";
      this.appendChatLine(senderName, text, lineType);
    }
    if (replaceExisting) {
      this.scrollChatLogToLatest({ defer: true });
    }
  }

  handleChatMessage(payload) {
    const messageId = this.normalizeChatMessageId(
      payload?.messageId ?? payload?.clientMessageId ?? ""
    );
    const nowMs = Date.now();
    if (messageId && this.hasSeenChatMessageId(messageId, nowMs)) {
      return;
    }
    if (messageId) {
      this.rememberSeenChatMessageId(messageId, nowMs);
    }

    const text = String(payload?.text ?? "").trim().slice(0, 120);
    if (!text) {
      return;
    }

    const senderId = String(payload?.id ?? "");
    const senderName = this.formatPlayerName(payload?.name);
    const signature = `${senderName}|${text}`;

    if (senderId && senderId === this.localPlayerId) {
      this.localPlayerName = senderName;
      const elapsed = performance.now() - this.lastLocalChatEchoAt;
      const isRecentEcho =
        this.lastLocalChatEcho === signature && elapsed < RUNTIME_TUNING.CHAT_ECHO_DEDUP_MS;
      if (!isRecentEcho) {
        this.appendChatLine(senderName, text, "self");
      }
      this.showLocalChatBubble(text);
      this.lastLocalChatEcho = "";
      this.lastLocalChatEchoAt = 0;
      return;
    }

    this.appendChatLine(senderName, text, "remote");

    const senderState = this.parseChatMessageState(payload?.state);
    let remote = null;
    if (senderId) {
      this.upsertRemotePlayer(senderId, senderState, senderName);
      remote = this.remotePlayers.get(senderId) ?? null;
    } else {
      remote = this.findRemotePlayerByName(senderName);
    }
    if (!remote) {
      return;
    }

    if (senderName !== remote.name) {
      remote.name = senderName;
      this.setTextLabel(remote.nameLabel, senderName, "name");
    }

    this.setTextLabel(remote.chatLabel, text, "chat");
    remote.chatLabel.visible = true;
    remote.chatExpireAt = performance.now() + this.chatBubbleLifetimeMs;
    remote.lastSeen = performance.now();
  }

  appendChatLine(name, text, type = "remote") {
    this.resolveUiElements();
    const hasMainLog = Boolean(this.chatLogEl);
    const hasLiveLog = Boolean(this.chatLiveLogEl);
    if (!hasMainLog && !hasLiveLog) {
      return false;
    }

    const nearBottom = hasMainLog
      ? this.chatLogEl.scrollHeight - this.chatLogEl.scrollTop - this.chatLogEl.clientHeight < 20
      : false;

    const createLineElement = () => {
      const line = document.createElement("p");
      line.className = `chat-line ${type}`;

      if (type === "system") {
        line.textContent = String(text ?? "").trim();
        return line;
      }

      const safeName = this.formatPlayerName(name);
      const safeText = String(text ?? "").trim();
      if (!safeText) {
        return null;
      }

      const nameEl = document.createElement("span");
      nameEl.className = "chat-name";
      nameEl.textContent = `${safeName}:`;

      const textEl = document.createElement("span");
      textEl.textContent = safeText;

      line.append(nameEl, textEl);
      return line;
    };

    const mainLine = createLineElement();
    if (!mainLine) {
      return false;
    }

    let appended = false;
    if (hasMainLog) {
      this.chatLogEl.appendChild(mainLine);
      while (this.chatLogEl.childElementCount > this.chatLogMaxEntries) {
        this.chatLogEl.firstElementChild?.remove();
      }
      if (nearBottom || type === "self" || !this.chatOpen) {
        this.chatLogEl.scrollTop = this.chatLogEl.scrollHeight;
      }
      appended = true;
    }

    if (hasLiveLog) {
      const liveLine = mainLine.cloneNode(true);
      this.chatLiveLogEl.appendChild(liveLine);
      while (this.chatLiveLogEl.childElementCount > this.chatLiveMaxEntries) {
        this.chatLiveLogEl.firstElementChild?.remove();
      }
      this.chatLiveLogEl.scrollTop = this.chatLiveLogEl.scrollHeight;
      appended = true;
      const liveLineLifetimeMs = Math.max(
        4_000,
        Math.trunc(Number(this.chatLiveLineLifetimeMs) || 0)
      );
      const liveLineFadeMs = Math.max(220, Math.trunc(Number(this.chatLiveLineFadeMs) || 0));
      // Auto-fade-remove live feed line after configured lifetime
      setTimeout(() => {
        liveLine.style.transition = `opacity ${Math.max(0.22, liveLineFadeMs / 1000).toFixed(2)}s ease`;
        liveLine.style.opacity = "0";
        setTimeout(() => liveLine.remove(), liveLineFadeMs + 40);
      }, liveLineLifetimeMs);
    }

    return appended;
  }

  resetLocalChatSendLimiter() {
    this.lastChatSendAt = 0;
    this.chatSendWindowStartAt = 0;
    this.chatSendWindowCount = 0;
    this.chatLastNormalizedText = "";
    this.chatSameTextStreak = 0;
    this.lastChatRateLimitNoticeAt = 0;
  }

  normalizeChatRateLimitText(text) {
    return String(text ?? "")
      .toLowerCase()
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 120);
  }

  showChatRateLimitNotice(message) {
    const nowMs = Date.now();
    const cooldownMs = Math.max(300, Math.trunc(Number(this.chatRateLimitNoticeCooldownMs) || 0));
    if (nowMs - this.lastChatRateLimitNoticeAt < cooldownMs) {
      return;
    }
    this.lastChatRateLimitNoticeAt = nowMs;
    this.appendChatLine("", message, "system");
  }

  consumeLocalChatSendBudget(text) {
    const nowMs = Date.now();
    const minIntervalMs = Math.max(120, Math.trunc(Number(this.chatSendMinIntervalMs) || 0));
    if (this.lastChatSendAt > 0 && nowMs - this.lastChatSendAt < minIntervalMs) {
      this.showChatRateLimitNotice("채팅 전송 간격이 너무 빠릅니다.");
      return false;
    }

    const windowMs = Math.max(1_000, Math.trunc(Number(this.chatSendWindowMs) || 0));
    if (this.chatSendWindowStartAt <= 0 || nowMs - this.chatSendWindowStartAt > windowMs) {
      this.chatSendWindowStartAt = nowMs;
      this.chatSendWindowCount = 0;
    }
    const maxPerWindow = Math.max(1, Math.trunc(Number(this.chatSendMaxPerWindow) || 0));
    if (this.chatSendWindowCount >= maxPerWindow) {
      this.showChatRateLimitNotice("짧은 시간에 보낼 수 있는 채팅 수를 초과했습니다.");
      return false;
    }

    const normalizedText = this.normalizeChatRateLimitText(text);
    if (normalizedText && normalizedText === this.chatLastNormalizedText) {
      const maxStreak = Math.max(1, Math.trunc(Number(this.chatSameTextStreakMax) || 0));
      if (this.chatSameTextStreak >= maxStreak) {
        this.showChatRateLimitNotice("같은 메시지는 연속으로 도배할 수 없습니다.");
        return false;
      }
      this.chatSameTextStreak += 1;
    } else {
      this.chatLastNormalizedText = normalizedText;
      this.chatSameTextStreak = 1;
    }

    this.chatSendWindowCount += 1;
    this.lastChatSendAt = nowMs;
    return true;
  }

  sendChatMessage() {
    this.resolveUiElements();
    if (!this.chatInputEl) {
      return;
    }

    const rawInput = String(this.chatInputEl.value ?? "").trim();
    if (!rawInput) {
      return;
    }
    if (this.handleChatCommand(rawInput)) {
      this.chatInputEl.value = "";
      if (this.shouldKeepChatOpenAfterSend()) {
        this.setChatOpen(true);
        this.chatInputEl.focus();
      } else {
        this.setChatOpen(false);
        this.chatInputEl.blur();
      }
      return;
    }

    const text = rawInput.slice(0, 120);
    if (!this.consumeLocalChatSendBudget(text)) {
      return;
    }
    const messageId = this.createClientChatMessageId();

    const senderName = this.formatPlayerName(this.localPlayerName);
    this.localPlayerName = senderName;
    const appended = this.appendChatLine(senderName, text, "self");
    if (appended) {
      this.lastLocalChatEcho = `${senderName}|${text}`;
      this.lastLocalChatEchoAt = performance.now();
      this.rememberSeenChatMessageId(messageId);
    }
    this.showLocalChatBubble(text);

    if (this.socket && this.networkConnected) {
      this.socket.emit("chat:send", {
        name: senderName,
        text,
        clientMessageId: messageId
      });
    }

    this.chatInputEl.value = "";
    if (this.shouldKeepChatOpenAfterSend()) {
      this.setChatOpen(true);
      this.chatInputEl.focus();
    } else {
      this.setChatOpen(false);
      this.chatInputEl.blur();
    }
  }

  showLocalChatBubble(text) {
    if (!text) return;
    if (!this.localChatLabel) {
      this.localChatLabel = this.createTextLabel("", "chat");
      this.localChatLabel.renderOrder = 40;
      this.scene.add(this.localChatLabel);
    }
    this.setTextLabel(this.localChatLabel, text, "chat");
    this.localChatLabel.visible = true;
    this.localChatLabel.material.opacity = 1;
    this.localChatExpireAt = performance.now() + this.chatBubbleLifetimeMs;
  }

  updateLocalChatBubble() {
    if (!this.localChatLabel?.visible) return;
    // float above player's head
    this.localChatLabel.position.set(
      this.playerPosition.x,
      this.playerPosition.y + 0.5,
      this.playerPosition.z
    );
    const remaining = this.localChatExpireAt - performance.now();
    if (remaining <= 0) {
      this.localChatLabel.visible = false;
      this.localChatLabel.material.opacity = 1;
    } else if (remaining < this.chatBubbleFadeMs) {
      this.localChatLabel.material.opacity = remaining / this.chatBubbleFadeMs;
    }
  }

  focusChatInput() {
    this.resolveUiElements();
    if (!this.chatInputEl) {
      return;
    }
    if (!this.canUseChatControls()) {
      return;
    }
    this.setChatOpen(true);
    this.keys.clear();
    if (document.pointerLockElement === this.renderer.domElement) {
      document.exitPointerLock?.();
    }
    this.chatInputEl.focus();
    if (!this.mobileEnabled) {
      this.chatInputEl.select();
    }
  }

  isTextInputTarget(target) {
    if (typeof HTMLElement === "undefined" || !(target instanceof HTMLElement)) {
      return false;
    }
    if (target.isContentEditable) {
      return true;
    }
    const tagName = target.tagName;
    return tagName === "INPUT" || tagName === "TEXTAREA";
  }

  findRemotePlayerByName(name) {
    const targetName = this.formatPlayerName(name);
    for (const remote of this.remotePlayers.values()) {
      if (remote.name === targetName) {
        return remote;
      }
    }
    return null;
  }

  getRemoteDistanceScore(state) {
    const sx = Number(state?.x);
    const sz = Number(state?.z);
    if (!Number.isFinite(sx) || !Number.isFinite(sz)) {
      return Number.POSITIVE_INFINITY;
    }
    const dx = sx - this.playerPosition.x;
    const dz = sz - this.playerPosition.z;
    return dx * dx + dz * dz;
  }

  formatPlayerName(rawName) {
    const name = String(rawName ?? "")
      .trim()
      .replace(/\s+/g, "_")
      .slice(0, 16);
    if (!name) {
      return "PLAYER";
    }
    if (/^PLAYER(?:_\d+)?$/i.test(name)) {
      return name.toUpperCase();
    }
    return name;
  }

  createTextLabel(text, kind = "name") {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = kind === "chat" ? 210 : 112;

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;

    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false
    });
    material.toneMapped = false;

    const label = new THREE.Sprite(material);
    label.renderOrder = 40;
    label.userData = {
      canvas,
      context: canvas.getContext("2d"),
      text: "",
      kind
    };

    this.setTextLabel(label, text, kind);
    return label;
  }

  setTextLabel(label, rawText, kind = "name") {
    const context = label?.userData?.context;
    const canvas = label?.userData?.canvas;
    if (!context || !canvas) {
      return;
    }

    const maxLength = kind === "chat" ? 120 : 16;
    const fallback = kind === "name" ? "PLAYER" : "";
    const text = String(rawText ?? "").trim().slice(0, maxLength) || fallback;
    if (label.userData.text === text) {
      return;
    }

    const width = canvas.width;
    const height = canvas.height;
    context.clearRect(0, 0, width, height);

    if (text) {
      if (kind === "chat") {
        const BUBBLE_TOP = 10;
        const BUBBLE_H = 150;
        const TAIL_H = 36;
        const TAIL_HW = 22;
        const cx = width / 2;

        context.fillStyle = "rgba(8, 20, 36, 0.88)";
        context.strokeStyle = "rgba(160, 210, 255, 0.95)";
        context.lineWidth = 6;

        // bubble body
        this.drawRoundedRect(context, 12, BUBBLE_TOP, width - 24, BUBBLE_H, 24);
        context.fill();
        context.stroke();

        // tail pointing down toward player head
        context.beginPath();
        context.moveTo(cx - TAIL_HW, BUBBLE_TOP + BUBBLE_H - 4);
        context.lineTo(cx + TAIL_HW, BUBBLE_TOP + BUBBLE_H - 4);
        context.lineTo(cx, BUBBLE_TOP + BUBBLE_H + TAIL_H);
        context.closePath();
        context.fillStyle = "rgba(8, 20, 36, 0.88)";
        context.fill();
        context.strokeStyle = "rgba(160, 210, 255, 0.95)";
        context.lineWidth = 5;
        context.beginPath();
        context.moveTo(cx - TAIL_HW, BUBBLE_TOP + BUBBLE_H - 2);
        context.lineTo(cx, BUBBLE_TOP + BUBBLE_H + TAIL_H);
        context.lineTo(cx + TAIL_HW, BUBBLE_TOP + BUBBLE_H - 2);
        context.stroke();

        // word-wrap into max 2 lines
        const fontSize = 38;
        context.font = `600 ${fontSize}px Bahnschrift, "Trebuchet MS", "Segoe UI", sans-serif`;
        const maxLineW = width - 56;
        const words = text.split(" ");
        const lines = [];
        let cur = "";
        for (const w of words) {
          const test = cur ? `${cur} ${w}` : w;
          if (context.measureText(test).width > maxLineW && cur) {
            lines.push(cur);
            cur = w;
          } else {
            cur = test;
          }
        }
        if (cur) lines.push(cur);
        const draw = lines.slice(0, 2);
        const lineH = 48;
        const midY = BUBBLE_TOP + BUBBLE_H / 2 + 4;
        const startY = midY - ((draw.length - 1) * lineH) / 2;

        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillStyle = "#e8f6ff";
        for (let i = 0; i < draw.length; i++) {
          context.fillText(draw[i], cx, startY + i * lineH);
        }

        const approxChars = Math.max(...draw.map((l) => l.length));
        const minScaleX = 2.2;
        const maxScaleX = 5.0;
        const scaleX = THREE.MathUtils.clamp(
          minScaleX + approxChars * 0.052,
          minScaleX,
          maxScaleX
        );
        label.scale.set(scaleX, scaleX * (height / width), 1);
      } else {
        context.fillStyle = "rgba(6, 18, 32, 0.86)";
        context.strokeStyle = "rgba(173, 233, 255, 0.88)";
        context.lineWidth = 5;
        this.drawRoundedRect(context, 12, 12, width - 24, height - 24, 22);
        context.fill();
        context.stroke();

        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillStyle = "#e8f8ff";
        context.font = "700 38px Bahnschrift, \"Trebuchet MS\", \"Segoe UI\", sans-serif";
        context.fillText(text, width * 0.5, height * 0.53);

        const minScaleX = 1.5;
        const maxScaleX = 3.3;
        const scaleX = THREE.MathUtils.clamp(
          minScaleX + text.length * 0.075,
          minScaleX,
          maxScaleX
        );
        label.scale.set(scaleX, 0.4, 1);
      }
    }

    label.userData.text = text;
    label.material.map.needsUpdate = true;
  }

  drawRoundedRect(context, x, y, width, height, radius) {
    const r = Math.min(radius, width * 0.5, height * 0.5);
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + width, y, x + width, y + height, r);
    context.arcTo(x + width, y + height, x, y + height, r);
    context.arcTo(x, y + height, x, y, r);
    context.arcTo(x, y, x + width, y, r);
    context.closePath();
  }

  disposeTextLabel(label) {
    const map = label?.material?.map;
    map?.dispose?.();
  }

  emitLocalSync(delta) {
    if (!this.socket || !this.networkConnected) {
      return;
    }

    this.emitInputCommand(delta);
    const airborne = this.playerPosition.y > GAME_CONSTANTS.PLAYER_HEIGHT + 0.08;
    if (this.flyModeActive || this.climbingRope) {
      this.requestAuthoritativeStateSync({
        minIntervalMs: this.flyModeActive ? 120 : 180
      });
    } else if (airborne && this.pendingAuthoritativeStateSync) {
      this.requestAuthoritativeStateSync({
        minIntervalMs: 260
      });
    }
  }

  emitInputCommand(delta) {
    const crowdSize = this.remotePlayers.size;
    let intervalScale = 1;
    if (crowdSize >= 50) {
      intervalScale = 1.55;
    } else if (crowdSize >= 30) {
      intervalScale = 1.3;
    } else if (crowdSize >= 16) {
      intervalScale = 1.12;
    }

    const targetInterval = this.inputSendBaseInterval * intervalScale;
    this.remoteSyncClock += delta;
    if (this.remoteSyncClock < targetInterval) {
      return;
    }
    this.remoteSyncClock = 0;

    const movement = this.getMovementIntent();
    const normalizedYaw = this.normalizeYawAngle(this.yaw);
    this.yaw = normalizedYaw;
    const outboundInput = {
      moveX: movement.strafe,
      moveZ: movement.forward,
      sprint: movement.sprinting,
      jump: Boolean(this.pendingJumpInput),
      yaw: normalizedYaw,
      pitch: this.pitch
    };

    if (this.lastSentInput) {
      const moveXDelta = Math.abs(outboundInput.moveX - this.lastSentInput.moveX);
      const moveZDelta = Math.abs(outboundInput.moveZ - this.lastSentInput.moveZ);
      const yawDelta = Math.abs(
        Math.atan2(
          Math.sin(outboundInput.yaw - this.lastSentInput.yaw),
          Math.cos(outboundInput.yaw - this.lastSentInput.yaw)
        )
      );
      const pitchDelta = Math.abs(outboundInput.pitch - this.lastSentInput.pitch);
      const heartbeatElapsed = this.elapsedSeconds - (Number(this.lastSentInput.sentAt) || 0);
      const movementChanged =
        moveXDelta >= 0.05 ||
        moveZDelta >= 0.05 ||
        yawDelta >= this.localSyncMinYaw ||
        pitchDelta >= this.localSyncMinPitch ||
        outboundInput.sprint !== this.lastSentInput.sprint;

      if (!movementChanged && !outboundInput.jump && heartbeatElapsed < this.inputHeartbeatSeconds) {
        return;
      }
    }

    const quantize = (value, precision = 1000) =>
      Math.round((Number(value) || 0) * precision) / precision;
    const seq = ++this.localInputSeq;
    this.socket.emit("input:cmd", {
      seq,
      moveX: quantize(outboundInput.moveX, 1000),
      moveZ: quantize(outboundInput.moveZ, 1000),
      sprint: outboundInput.sprint,
      jump: outboundInput.jump,
      yaw: quantize(outboundInput.yaw, 10000),
      pitch: quantize(outboundInput.pitch, 10000),
      t: Date.now()
    });

    this.pendingInputQueue.push({
      seq,
      sentAt: this.elapsedSeconds
    });
    if (this.pendingInputQueue.length > 120) {
      this.pendingInputQueue.splice(0, this.pendingInputQueue.length - 120);
    }

    this.lastSentInput = {
      ...outboundInput,
      sentAt: this.elapsedSeconds
    };
    this.pendingJumpInput = false;
  }

  updateHud(delta) {
    if (!this.hud.enabled) {
      return;
    }

    const fpsState = this.fpsState;
    fpsState.sampleTime += delta;
    fpsState.frameCount += 1;

    if (fpsState.sampleTime >= RUNTIME_TUNING.HUD_FPS_SAMPLE_SECONDS) {
      fpsState.fps = fpsState.frameCount / fpsState.sampleTime;
      fpsState.sampleTime = 0;
      fpsState.frameCount = 0;
    }

    this.hudRefreshClock += delta;
    if (this.hudRefreshClock < RUNTIME_TUNING.HUD_REFRESH_INTERVAL_SECONDS) {
      return;
    }
    this.hudRefreshClock = 0;

    const localPlayer = this.networkConnected ? 1 : 0;
    this.hud.update({
      status: this.getStatusText(),
      players: this.remotePlayers.size + localPlayer,
      x: this.playerPosition.x,
      z: this.playerPosition.z,
      fps: fpsState.fps
    });

    if (this.playerRosterVisible && this.roomPlayerSnapshot.length === 0) {
      this.renderPlayerRoster();
    }
  }

  getStatusText() {
    const withHostTag = (text) =>
      this.networkConnected && this.isRoomHost ? `${text} / 호스트` : text;

    if (this.hubFlowEnabled) {
      if (this.flowStage === "boot_intro") {
        return this.networkConnected
          ? withHostTag("온라인 / 입장 확인")
          : "오프라인 / 입장 확인";
      }
      if (this.flowStage === "bridge_approach") {
        return this.networkConnected
          ? withHostTag("온라인 / 다리 접근")
          : "오프라인 / 다리 접근";
      }
      if (this.flowStage === "bridge_dialogue") {
        return this.networkConnected
          ? withHostTag("온라인 / NPC 대화")
          : "오프라인 / NPC 대화";
      }
      if (this.flowStage === "bridge_name") {
        return this.networkConnected
          ? withHostTag("온라인 / 이름 확인")
          : "오프라인 / 이름 확인";
      }
      if (this.flowStage === "bridge_mirror") {
        return this.networkConnected
          ? withHostTag("온라인 / 신사문 통과")
          : "오프라인 / 신사문 통과";
      }
      if (this.flowStage === "city_intro") {
        return this.networkConnected
          ? withHostTag("온라인 / 도시 이동")
          : "오프라인 / 도시 이동";
      }
      if (this.flowStage === "portal_transfer") {
        return "포탈 / 이동 중";
      }
    }

    if (!this.networkConnected) {
      if (this.socketEndpointLinkRequired) {
        return "링크 차단 / 새 링크 사용";
      }
      return this.socketEndpoint ? "오프라인" : "오프라인 / 서버 필요";
    }
    const zoneLabel = this.getRoomZoneLabel(this.localRoomZone);
    if (this.pointerLockSupported && !this.pointerLocked && !this.mobileEnabled) {
      return withHostTag(`온라인 / ${zoneLabel} / 클릭해 고정`);
    }
    return withHostTag(`온라인 / ${zoneLabel}`);
  }

  loop() {
    // Keep a tighter cap to avoid one-frame movement jumps during frame drops.
    const delta = Math.min(this.clock.getDelta(), this.mobileEnabled ? 0.09 : 0.1);
    this.tick(delta);
    if (this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
    requestAnimationFrame(this.loopRafCallback);
  }

  updateDynamicResolution(delta) {
    const config = this.dynamicResolution;
    if (!config || !config.enabled || !Number.isFinite(delta) || delta <= 0) {
      return;
    }
    const nowMs = typeof performance !== "undefined" ? performance.now() : Date.now();
    const recentLookInputMs = Math.max(0, nowMs - (Number(this.lastLookInputAtMs) || 0));
    if (recentLookInputMs < this.dynamicResolutionInputQuietMs) {
      return;
    }

    config.sampleTime += delta;
    config.frameCount += 1;
    config.cooldown = Math.max(0, config.cooldown - delta);

    if (config.sampleTime < 0.8) {
      return;
    }

    const fps = config.frameCount / config.sampleTime;
    config.sampleTime = 0;
    config.frameCount = 0;

    if (config.cooldown > 0) {
      return;
    }

    const floorRatio = Math.max(0.5, Math.min(config.minRatio, this.maxPixelRatio));
    let targetRatio = this.currentPixelRatio;

    if (fps < 50 && this.currentPixelRatio > floorRatio) {
      targetRatio = Math.max(floorRatio, this.currentPixelRatio - 0.1);
      config.cooldown = 0.8;
    } else if (fps > 58 && this.currentPixelRatio < this.maxPixelRatio) {
      targetRatio = Math.min(this.maxPixelRatio, this.currentPixelRatio + 0.05);
      config.cooldown = 1.5;
    } else {
      config.cooldown = 0.4;
    }

    if (Math.abs(targetRatio - this.currentPixelRatio) < 0.01) {
      return;
    }

    this.currentPixelRatio = Number(targetRatio.toFixed(2));
    this.renderer.setPixelRatio(this.currentPixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    if (this.composer) {
      this.composer.setPixelRatio(this.currentPixelRatio);
      this.composer.setSize(window.innerWidth, window.innerHeight);
    }
  }

  isLikelyLowSpecMobileDevice() {
    if (!this.mobileEnabled || typeof navigator === "undefined") {
      return false;
    }

    const memoryGb = Number(navigator.deviceMemory) || 0;
    const cpuCores = Number(navigator.hardwareConcurrency) || 0;
    const lowMemory = memoryGb > 0 && memoryGb <= 4;
    const lowCpu = cpuCores > 0 && cpuCores <= 6;
    return lowMemory || lowCpu;
  }

  getDevicePixelRatioCap() {
    if (!this.mobileEnabled) {
      return 1.1;
    }
    return this.isLowSpecMobile ? 1.25 : 1.5;
  }

  applyDeviceRuntimeProfile() {
    this.isLowSpecMobile = this.isLikelyLowSpecMobileDevice();

    if (this.mobileEnabled) {
      const remoteHardCap = this.isLowSpecMobile ? 28 : 40;
      const meshDistance = this.isLowSpecMobile ? 70 : 86;
      const labelDistance = this.isLowSpecMobile ? 18 : 24;
      const farDistance = this.isLowSpecMobile ? 36 : 46;

      this.remoteHardCap = Math.min(this.baseRemoteHardCap, remoteHardCap);
      this.remoteMeshDistanceSq = Math.pow(meshDistance, 2);
      this.remoteLabelDistanceSq = Math.pow(labelDistance, 2);
      this.remoteFarDistanceSq = Math.pow(farDistance, 2);

      this.inputSendBaseInterval = this.isLowSpecMobile ? 1 / 14 : 1 / 16;
      this.inputHeartbeatSeconds = this.isLowSpecMobile ? 0.3 : 0.26;
      this.localSyncMinYaw = this.isLowSpecMobile ? 0.02 : 0.016;
      this.localSyncMinPitch = this.isLowSpecMobile ? 0.02 : 0.016;
      this.dynamicResolution.minRatio = this.isLowSpecMobile
        ? 0.52
        : GAME_CONSTANTS.DYNAMIC_RESOLUTION.mobileMinRatio;
      this.dynamicResolution.enabled = true;
    } else {
      const remoteHardCap = Math.min(this.baseRemoteHardCap, 24);
      const meshDistance = Math.min(Math.sqrt(this.baseRemoteMeshDistanceSq), 72);
      const labelDistance = Math.min(Math.sqrt(this.baseRemoteLabelDistanceSq), 22);
      const farDistance = Math.min(Math.sqrt(this.baseRemoteFarDistanceSq), 40);
      this.remoteHardCap = remoteHardCap;
      this.remoteMeshDistanceSq = Math.pow(meshDistance, 2);
      this.remoteLabelDistanceSq = Math.pow(labelDistance, 2);
      this.remoteFarDistanceSq = Math.pow(farDistance, 2);

      this.inputSendBaseInterval = 1 / 20;
      this.inputHeartbeatSeconds = 0.22;
      this.localSyncMinYaw = 0.012;
      this.localSyncMinPitch = 0.012;
      this.dynamicResolution.minRatio = GAME_CONSTANTS.DYNAMIC_RESOLUTION.desktopMinRatio;
      this.dynamicResolution.enabled = false;
      this.dynamicResolution.sampleTime = 0;
      this.dynamicResolution.frameCount = 0;
      this.dynamicResolution.cooldown = 0;
    }

    this.applyGraphicsQualityOverrides();
  }

  applyQualityProfile() {
    const shadowEnabled = !this.mobileEnabled;
    this.renderer.shadowMap.enabled = shadowEnabled;
    // Shadows are mostly static in this map; avoid per-frame shadow-map renders.
    this.renderer.shadowMap.autoUpdate = false;

    if (this.sunLight) {
      const sunConfig = this.worldContent.lights.sun;
      this.sunLight.castShadow = shadowEnabled;
      const shadowMapSize = this.mobileEnabled
        ? sunConfig.shadowMobileSize
        : sunConfig.shadowDesktopSize;
      if (
        this.sunLight.shadow.mapSize.x !== shadowMapSize ||
        this.sunLight.shadow.mapSize.y !== shadowMapSize
      ) {
        this.sunLight.shadow.mapSize.set(shadowMapSize, shadowMapSize);
        this.sunLight.shadow.needsUpdate = true;
      }
      if (shadowEnabled) {
        this.sunLight.shadow.needsUpdate = true;
      }
    }

    this.setupCloudLayer();
    this.setupBoundaryWalls(this.worldContent.boundary);
    this.setupBeachLayer(this.worldContent.beach, this.worldContent.ocean);
    this.setupOceanLayer(this.worldContent.ocean);
    this.setupHubFlowWorld();
    this.setupPostProcessing();
  }

  onResize() {
    const wasMobile = this.mobileEnabled;
    this.mobileEnabled = isLikelyTouchDevice();

    if (this.mobileEnabled !== wasMobile) {
      this.applyQualityProfile();
    }

    this.applyDeviceRuntimeProfile();
    this.syncBodyUiModeClass();

    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    if (this.composer) {
      this.composer.setPixelRatio(this.currentPixelRatio);
      this.composer.setSize(window.innerWidth, window.innerHeight);
    }
    this.updateFullscreenToggleState();
    this.syncGraphicsControlsUi();
    this.syncMobileUiState();
    this.updateChatLiveAnchorPosition();
  }

  ensureSecurityTestLabelGroup() {
    if (this.securityTestLabelGroup?.parent) {
      return this.securityTestLabelGroup;
    }
    const group = this.securityTestLabelGroup ?? new THREE.Group();
    group.name = "security_test_labels";
    group.visible = true;
    this.securityTestLabelGroup = group;
    this.scene.add(group);
    return group;
  }

  clearSecurityTestObjectLabels() {
    for (const entry of this.securityTestObjectLabels.values()) {
      const label = entry?.label;
      if (!label) {
        continue;
      }
      label.parent?.remove?.(label);
      this.disposeTextLabel(label);
    }
    this.securityTestObjectLabels.clear();
    if (this.securityTestLabelGroup) {
      this.securityTestLabelGroup.parent?.remove?.(this.securityTestLabelGroup);
      this.securityTestLabelGroup = null;
    }
    this.securityTestLabelRefreshClock = 0;
  }

  getSortedSecurityTestEntries() {
    const entries = [];
    for (const entry of this.movableObjects) {
      if (!entry?.mesh || !entry?.id) {
        continue;
      }
      entries.push(entry);
    }
    entries.sort((a, b) =>
      String(a.id).localeCompare(String(b.id), undefined, {
        numeric: true,
        sensitivity: "base"
      })
    );
    return entries;
  }

  updateSecurityTestLabelForEntry(entry, label = null) {
    const mesh = entry?.mesh;
    const targetLabel = label ?? this.securityTestObjectLabels.get(entry?.id)?.label;
    if (!mesh || !targetLabel) {
      return;
    }
    if (!mesh.visible) {
      targetLabel.visible = false;
      return;
    }
    mesh.updateMatrixWorld(true);
    this.securityTestBounds.setFromObject(mesh);
    if (this.securityTestBounds.isEmpty()) {
      targetLabel.visible = false;
      return;
    }
    const center = this.securityTestBounds.getCenter(this.securityTestBoundsCenter);
    const size = this.securityTestBounds.getSize(this.securityTestBoundsSize);
    const yOffset = Math.max(0.8, size.y * 0.22);
    targetLabel.position.set(center.x, this.securityTestBounds.max.y + yOffset, center.z);
    targetLabel.visible = true;
  }

  refreshSecurityTestObjectLabels() {
    const enabled = Boolean(this.securityTestState?.enabled);
    if (!enabled) {
      this.clearSecurityTestObjectLabels();
      return;
    }

    const labelGroup = this.ensureSecurityTestLabelGroup();
    const sortedEntries = this.getSortedSecurityTestEntries();
    const nextMap = new Map();
    for (let index = 0; index < sortedEntries.length; index += 1) {
      const entry = sortedEntries[index];
      const key = String(entry.id);
      const labelText = `A${index + 1}`;
      const existing = this.securityTestObjectLabels.get(key);
      const label = existing?.label ?? this.createTextLabel(labelText, "name");
      if (!existing?.label) {
        label.renderOrder = 65;
        label.material.depthTest = false;
        label.material.depthWrite = false;
        label.material.toneMapped = false;
      }
      if (label.parent !== labelGroup) {
        labelGroup.add(label);
      }
      this.setTextLabel(label, labelText, "name");
      this.updateSecurityTestLabelForEntry(entry, label);
      nextMap.set(key, { entry, label });
    }

    for (const [key, prev] of this.securityTestObjectLabels.entries()) {
      if (nextMap.has(key)) {
        continue;
      }
      const label = prev?.label;
      if (!label) {
        continue;
      }
      label.parent?.remove?.(label);
      this.disposeTextLabel(label);
    }

    this.securityTestObjectLabels = nextMap;
    this.securityTestLabelRefreshClock = 0;
  }

  updateSecurityTestObjectLabelPositions() {
    if (!this.securityTestObjectLabels.size) {
      return;
    }
    for (const value of this.securityTestObjectLabels.values()) {
      this.updateSecurityTestLabelForEntry(value?.entry, value?.label ?? null);
    }
  }

  registerMovableObject(mesh, id, colliderIndex, options = {}) {
    if (!mesh) {
      return null;
    }
    const normalizedId = String(id ?? "").trim();
    const normalizedColliderIndex = Math.trunc(Number(colliderIndex));
    if (!normalizedId || !Number.isFinite(normalizedColliderIndex) || normalizedColliderIndex < 0) {
      return null;
    }
    if (!this.staticWorldColliders[normalizedColliderIndex]) {
      return null;
    }
    const entry = {
      id: normalizedId,
      mesh,
      colliderIndex: normalizedColliderIndex,
      defaultPosition: mesh.position.clone(),
      defaultScale: mesh.scale.clone(),
      defaultRotation: mesh.rotation.clone(),
      defaultVisible: mesh.visible !== false,
      disableColliderSync: Boolean(options?.disableColliderSync),
      editorLocked: Boolean(options?.editorLocked),
      isHostCustomPaintBlock: false,
      _savedHighlightMaterials: null,
      _savedEmissive: null,
      _savedEmissiveIntensity: null
    };
    if (entry.disableColliderSync) {
      this.parkMovableObjectCollider(entry);
    }
    this.movableObjects.push(entry);
    if (this.securityTestState?.enabled) {
      this.refreshSecurityTestObjectLabels();
    }
    return entry;
  }

  updateMovableObjectCollider(entry) {
    if (!entry?.mesh) {
      return false;
    }
    if (entry.disableColliderSync) {
      return this.parkMovableObjectCollider(entry);
    }
    const colliderIndex = Math.trunc(Number(entry.colliderIndex));
    const collider = this.staticWorldColliders[colliderIndex];
    if (!collider) {
      return false;
    }
    const mesh = entry.mesh;
    if (!mesh.visible) {
      return this.parkMovableObjectCollider(entry);
    }
    mesh.updateMatrixWorld(true);
    const worldBounds = new THREE.Box3().setFromObject(mesh);
    if (worldBounds.isEmpty()) {
      return this.parkMovableObjectCollider(entry);
    }

    collider.minX = worldBounds.min.x;
    collider.maxX = worldBounds.max.x;
    collider.minZ = worldBounds.min.z;
    collider.maxZ = worldBounds.max.z;
    collider.minY = worldBounds.min.y - 0.05;
    collider.maxY = worldBounds.max.y + 0.05;
    return true;
  }

  parkMovableObjectCollider(entry) {
    const colliderIndex = Math.trunc(Number(entry?.colliderIndex));
    const collider = this.staticWorldColliders[colliderIndex];
    if (!collider) {
      return false;
    }
    collider.minX = 1000000;
    collider.maxX = 1000000.2;
    collider.minZ = 1000000;
    collider.maxZ = 1000000.2;
    collider.minY = -1000000;
    collider.maxY = -999900;
    return true;
  }

  setMovableObjectVisibility(entry, visible) {
    if (!entry?.mesh) {
      return false;
    }
    const nextVisible = Boolean(visible);
    entry.mesh.visible = nextVisible;
    if (entry.disableColliderSync) {
      return this.parkMovableObjectCollider(entry);
    }
    if (nextVisible) {
      return this.updateMovableObjectCollider(entry);
    }
    return this.parkMovableObjectCollider(entry);
  }

  updateObjEditorMouseFromClient(clientX, clientY) {
    const canvasRect = this.renderer?.domElement?.getBoundingClientRect?.();
    if (canvasRect && canvasRect.width > 0 && canvasRect.height > 0) {
      this.objEditorMouseNdc.x = ((clientX - canvasRect.left) / canvasRect.width) * 2 - 1;
      this.objEditorMouseNdc.y = -((clientY - canvasRect.top) / canvasRect.height) * 2 + 1;
      return;
    }

    const width = Math.max(1, Number(window.innerWidth) || 1);
    const height = Math.max(1, Number(window.innerHeight) || 1);
    this.objEditorMouseNdc.x = (clientX / width) * 2 - 1;
    this.objEditorMouseNdc.y = -(clientY / height) * 2 + 1;
  }

  findMovableEntryForObject(object) {
    if (!object || !this.movableObjects.length) {
      return null;
    }
    let current = object;
    while (current) {
      const entry = this.movableObjects.find((candidate) => candidate?.mesh === current) ?? null;
      if (entry) {
        return entry;
      }
      current = current.parent ?? null;
    }
    return null;
  }

  pickMovableObjectAtClient(clientX, clientY) {
    if (!this.camera || !this.movableObjects.length) {
      return null;
    }
    const meshes = [];
    for (const entry of this.movableObjects) {
      if (entry?.mesh && entry?.editorLocked !== true) {
        meshes.push(entry.mesh);
      }
    }
    if (!meshes.length) {
      return null;
    }

    this.updateObjEditorMouseFromClient(clientX, clientY);
    this.objEditorRaycaster.setFromCamera(this.objEditorMouseNdc, this.camera);
    const intersections = this.objEditorRaycaster.intersectObjects(meshes, true);
    if (!intersections.length) {
      return null;
    }
    for (const intersection of intersections) {
      const hitMesh = intersection?.object;
      const entry = this.findMovableEntryForObject(hitMesh);
      if (entry) {
        return { entry, intersection };
      }
    }
    return null;
  }

  pickMovableEntryAtScreenCenter() {
    if (!this.camera || !this.movableObjects.length) {
      return null;
    }
    this.objEditorMouseNdc.set(0, 0);
    this.objEditorRaycaster.setFromCamera(this.objEditorMouseNdc, this.camera);
    const meshes = [];
    for (const entry of this.movableObjects) {
      if (entry?.mesh?.visible && entry?.editorLocked !== true) {
        meshes.push(entry.mesh);
      }
    }
    if (!meshes.length) {
      return null;
    }
    const intersections = this.objEditorRaycaster.intersectObjects(meshes, true);
    if (!intersections.length) {
      return null;
    }
    for (const intersection of intersections) {
      const entry = this.findMovableEntryForObject(intersection?.object);
      if (entry?.mesh) {
        return entry;
      }
    }
    return null;
  }

  collectObjEditorHighlightTargets(root) {
    if (!root) {
      return [];
    }
    const targets = [];
    const seen = new Set();
    const collectFromObject = (object) => {
      const materials = Array.isArray(object?.material) ? object.material : [object?.material];
      for (const material of materials) {
        if (!material || seen.has(material)) {
          continue;
        }
        seen.add(material);
        if (material?.emissive && typeof material.emissive.clone === "function") {
          targets.push({
            material,
            savedEmissive: material.emissive.clone(),
            savedIntensity: Number(material.emissiveIntensity) || 0
          });
        }
      }
    };

    if (typeof root.traverse === "function") {
      root.traverse((object) => {
        collectFromObject(object);
      });
    } else {
      collectFromObject(root);
    }
    return targets;
  }

  selectObjEditorEntry(entry) {
    if (!entry || !entry.mesh) {
      this.clearObjEditorSelection();
      return;
    }
    if (this.objEditorSelected === entry) {
      this.updateObjEditorInfoEl(entry);
      return;
    }
    this.clearObjEditorSelection();

    entry._savedHighlightMaterials = this.collectObjEditorHighlightTargets(entry.mesh);
    for (const target of entry._savedHighlightMaterials) {
      const material = target.material;
      if (!material?.emissive || typeof material.emissive.setHex !== "function") {
        continue;
      }
      material.emissive.setHex(0x00aaff);
      material.emissiveIntensity = Math.max(0.55, Number(material.emissiveIntensity) || 0);
    }

    this.objEditorSelected = entry;
    this.updateObjEditorInfoEl(entry);
  }

  clearObjEditorSelection() {
    const entry = this.objEditorSelected;
    if (!entry?.mesh) {
      this.objEditorSelected = null;
      this.updateObjEditorInfoEl(null);
      return;
    }

    const savedTargets = Array.isArray(entry?._savedHighlightMaterials)
      ? entry._savedHighlightMaterials
      : [];
    for (const target of savedTargets) {
      const material = target?.material;
      if (!material?.emissive || typeof material.emissive.copy !== "function") {
        continue;
      }
      material.emissive.copy(target.savedEmissive);
      material.emissiveIntensity = Number(target.savedIntensity) || 0;
    }
    entry._savedHighlightMaterials = null;
    entry._savedEmissive = null;
    entry._savedEmissiveIntensity = null;
    this.objEditorSelected = null;
    this.updateObjEditorInfoEl(null);
  }

  updateObjEditorInfoEl(entry) {
    if (!this.objEditorInfoEl) {
      return;
    }
    if (!entry?.mesh) {
      this.objEditorInfoEl.textContent = `선택 없음 · 등록 ${this.movableObjects.length}개`;
      return;
    }
    const pos = entry.mesh.position;
    const yawDeg = THREE.MathUtils.radToDeg(this.normalizeYawAngle(entry.mesh.rotation.y || 0));
    this.objEditorInfoEl.textContent =
      `ID:${entry.id} (${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)}) yaw:${yawDeg.toFixed(1)}°`;
  }

  beginObjEditorDrag(clientX, clientY) {
    if (!this.objEditorActive || !this.flyModeActive || !this.canUseObjectEditor()) {
      return false;
    }
    const picked = this.pickMovableObjectAtClient(clientX, clientY);
    if (!picked) {
      this.clearObjEditorSelection();
      return false;
    }

    const entry = picked.entry;
    const intersection = picked.intersection;
    this.selectObjEditorEntry(entry);
    entry.mesh.getWorldPosition(this.objEditorDragTargetWorld);
    this.objEditorDragPlane.constant = -this.objEditorDragTargetWorld.y;

    let hitPoint = this.objEditorRaycaster.ray.intersectPlane(
      this.objEditorDragPlane,
      this.objEditorDragHitPoint
    );
    if (!hitPoint && intersection?.point) {
      this.objEditorDragHitPoint.copy(intersection.point);
      hitPoint = this.objEditorDragHitPoint;
    }
    if (!hitPoint) {
      return false;
    }

    this.objEditorDragOffset.copy(this.objEditorDragTargetWorld).sub(this.objEditorDragHitPoint);
    this.objEditorDragging = true;
    return true;
  }

  updateObjEditorDrag(clientX, clientY) {
    if (
      !this.objEditorActive ||
      !this.objEditorDragging ||
      !this.objEditorSelected?.mesh ||
      !this.canUseObjectEditor()
    ) {
      return false;
    }
    this.updateObjEditorMouseFromClient(clientX, clientY);
    this.objEditorRaycaster.setFromCamera(this.objEditorMouseNdc, this.camera);
    let hitPoint = this.objEditorRaycaster.ray.intersectPlane(
      this.objEditorDragPlane,
      this.objEditorDragHitPoint
    );
    if (!hitPoint) {
      const ray = this.objEditorRaycaster.ray;
      const fallbackDistance = Math.max(0.001, ray.origin.distanceTo(this.objEditorDragTargetWorld));
      this.objEditorDragHitPoint
        .copy(ray.direction)
        .multiplyScalar(fallbackDistance)
        .add(ray.origin);
      this.objEditorDragHitPoint.y = -this.objEditorDragPlane.constant;
      hitPoint = this.objEditorDragHitPoint;
    }

    const entry = this.objEditorSelected;
    const mesh = entry.mesh;
    this.objEditorDragTargetWorld
      .copy(this.objEditorDragHitPoint)
      .add(this.objEditorDragOffset);
    if (mesh.parent) {
      mesh.parent.worldToLocal(this.objEditorDragTargetWorld);
    }

    const previousX = Number(mesh.position.x) || 0;
    const previousZ = Number(mesh.position.z) || 0;
    mesh.position.x = this.objEditorDragTargetWorld.x;
    mesh.position.z = this.objEditorDragTargetWorld.z;
    if (Math.abs(mesh.position.x - previousX) > 0.0005 || Math.abs(mesh.position.z - previousZ) > 0.0005) {
      if (entry.isHostCustomPaintBlock === true) {
        this.markObjectStateDirty();
      }
    }
    this.updateMovableObjectCollider(entry);
    this.updateSecurityTestLabelForEntry(entry);
    this.syncPortalAnchorsFromMovableObjects();
    this.updateObjEditorInfoEl(entry);
    return true;
  }

  adjustSelectedObjEditorHeight(deltaY = 0) {
    const entry = this.objEditorSelected;
    if (!this.objEditorActive || !entry?.mesh || !this.canUseObjectEditor()) {
      return false;
    }
    const previousY = Number(entry.mesh.position.y) || 0;
    const nextY = previousY + (Number(deltaY) || 0);
    entry.mesh.position.y = THREE.MathUtils.clamp(nextY, -10, 260);
    this.updateMovableObjectCollider(entry);
    this.updateSecurityTestLabelForEntry(entry);
    this.syncPortalAnchorsFromMovableObjects();
    this.updateObjEditorInfoEl(entry);
    if (Math.abs(entry.mesh.position.y - previousY) > 0.0005 && entry.isHostCustomPaintBlock === true) {
      this.markObjectStateDirty();
    }
    if (entry.isHostCustomPaintBlock === true) {
      this.saveObjectPositions();
    }
    return true;
  }

  rotateSelectedObjEditorYaw(
    stepRadians = OBJECT_EDITOR_ROTATE_STEP_RAD,
    { snap = false, snapStepRadians = OBJECT_EDITOR_ROTATE_SNAP_STEP_RAD } = {}
  ) {
    const entry = this.objEditorSelected;
    if (!this.objEditorActive || !entry?.mesh || !this.canUseObjectEditor()) {
      return false;
    }

    const safeStep = Number(stepRadians);
    if (!Number.isFinite(safeStep) || Math.abs(safeStep) < 0.00001) {
      return false;
    }

    const prevYaw = this.normalizeYawAngle(Number(entry.mesh.rotation?.y) || 0);
    let nextYaw = prevYaw + safeStep;
    if (snap) {
      const safeSnapStep = Math.max(
        Math.PI / 180,
        Math.abs(Number(snapStepRadians) || OBJECT_EDITOR_ROTATE_SNAP_STEP_RAD)
      );
      nextYaw = Math.round(nextYaw / safeSnapStep) * safeSnapStep;
    }
    nextYaw = this.normalizeYawAngle(nextYaw);
    if (Math.abs(nextYaw - prevYaw) < 0.00001) {
      return false;
    }

    entry.mesh.rotation.y = nextYaw;
    this.updateMovableObjectCollider(entry);
    this.updateSecurityTestLabelForEntry(entry);
    this.syncPortalAnchorsFromMovableObjects({ force: true });
    this.updateObjEditorInfoEl(entry);
    if (entry.isHostCustomPaintBlock === true) {
      this.markObjectStateDirty();
      this.saveObjectPositions();
    }
    return true;
  }

  resetHostCustomPaintBlockEntryToDefault(entry) {
    if (!entry?.mesh || entry?.isHostCustomPaintBlock !== true) {
      return false;
    }
    const fallbackPosition = entry.defaultPosition ?? entry.mesh.position;
    const fallbackScale = entry.defaultScale ?? entry.mesh.scale;
    const fallbackRotation = entry.defaultRotation ?? entry.mesh.rotation;
    const fallbackVisible = typeof entry.defaultVisible === "boolean" ? entry.defaultVisible : false;
    entry.mesh.position.set(
      Number(fallbackPosition?.x) || 0,
      Number(fallbackPosition?.y) || 0,
      Number(fallbackPosition?.z) || 0
    );
    entry.mesh.scale.set(
      Number(fallbackScale?.x) || 1,
      Number(fallbackScale?.y) || 1,
      Number(fallbackScale?.z) || 1
    );
    if (Number.isFinite(Number(fallbackRotation?.y))) {
      entry.mesh.rotation.y = this.normalizeYawAngle(Number(fallbackRotation.y) || 0);
    }
    this.setMovableObjectVisibility(entry, fallbackVisible);
    this.updateMovableObjectCollider(entry);
    this.updateSecurityTestLabelForEntry(entry);
    return true;
  }

  collectObjectPositionsPayload() {
    const payload = {};
    for (const entry of this.getVisibleHostCustomPaintBlockEntries()) {
      if (!entry?.mesh || !entry?.id) {
        continue;
      }
      const pos = entry.mesh.position;
      const scale = entry.mesh.scale;
      payload[entry.id] = {
        x: Math.round((Number(pos.x) || 0) * 1000) / 1000,
        y: Math.round((Number(pos.y) || 0) * 1000) / 1000,
        z: Math.round((Number(pos.z) || 0) * 1000) / 1000,
        ry: Math.round(this.normalizeYawAngle(Number(entry.mesh.rotation?.y) || 0) * 1000) / 1000,
        sx: Math.round((Number(scale.x) || 1) * 1000) / 1000,
        sy: Math.round((Number(scale.y) || 1) * 1000) / 1000,
        sz: Math.round((Number(scale.z) || 1) * 1000) / 1000,
        visible: entry.mesh.visible !== false
      };
    }
    return payload;
  }

  filterPersistedHostCustomBlockPositions(rawPositions = {}) {
    const source = rawPositions && typeof rawPositions === "object" ? rawPositions : {};
    const filtered = {};
    for (const [rawId, rawEntry] of Object.entries(source)) {
      const id = String(rawId ?? "").trim();
      if (!HOST_CUSTOM_BLOCK_ID_PATTERN.test(id) || !rawEntry || typeof rawEntry !== "object") {
        continue;
      }
      filtered[id] = rawEntry;
    }
    return filtered;
  }

  markObjectStateDirty() {
    this.objectStateDirty = true;
    const interval = Math.max(0.14, Number(this.objectStateAutosaveInterval) || 0.22);
    this.objectStateAutosaveClock = Math.min(interval, this.objectStateAutosaveClock + interval * 0.6);
  }

  updateObjectStateAutosave(delta = 0) {
    if (!this.objectStateDirty) {
      return;
    }
    if (!(this.socket && this.networkConnected) || !this.hasHostPrivilege()) {
      return;
    }
    this.objectStateAutosaveClock += Math.max(0, Number(delta) || 0);
    const interval = Math.max(0.14, Number(this.objectStateAutosaveInterval) || 0.22);
    if (this.objectStateAutosaveClock < interval) {
      return;
    }
    this.objectStateAutosaveClock = 0;
    this.saveObjectPositions({ announceErrors: false });
  }

  applyObjectPositionsState(rawPositions = {}, { persistLocal = true, revision = null } = {}) {
    if (!this.movableObjects.length) {
      return;
    }
    const nextRevision = Math.trunc(Number(revision));
    if (this.objectStateDirty) {
      if (Number.isFinite(nextRevision) && nextRevision >= 0) {
        if (nextRevision <= this.objectStateRevision) {
          return;
        }
      } else if (this.objEditorDragging || this.objectStateSaveInFlight || this.objectStateSavePending) {
        return;
      }
    }
    if (Number.isFinite(nextRevision) && nextRevision >= 0) {
      if (nextRevision < this.objectStateRevision) {
        return;
      }
      this.objectStateRevision = nextRevision;
    }
    const source = this.filterPersistedHostCustomBlockPositions(rawPositions);
    const sourceKeys = Object.keys(source);
    const hasAnySourceEntries = sourceKeys.length > 0;
    for (const entry of this.movableObjects) {
      if (!entry?.mesh || !entry?.id) {
        continue;
      }
      if (this.objEditorDragging && this.objEditorSelected?.id === entry.id) {
        continue;
      }
      const position = source[entry.id];
      const hasServerPosition = position && typeof position === "object";
      const fallback = entry.defaultPosition ?? entry.mesh.position;
      const fallbackScale = entry.defaultScale ?? entry.mesh.scale;
      const fallbackRotation = entry.defaultRotation ?? entry.mesh.rotation;
      const fallbackVisible = typeof entry.defaultVisible === "boolean" ? entry.defaultVisible : true;
      let x = Number.NaN;
      let y = Number.NaN;
      let z = Number.NaN;
      let sx = Number.NaN;
      let sy = Number.NaN;
      let sz = Number.NaN;
      let ry = Number.NaN;
      let visible = null;
      if (hasServerPosition) {
        x = Number(position?.x);
        y = Number(position?.y);
        z = Number(position?.z);
        sx = Number(position?.sx);
        sy = Number(position?.sy);
        sz = Number(position?.sz);
        if (Object.prototype.hasOwnProperty.call(position, "ry")) {
          ry = Number(position?.ry);
        }
        if (typeof position?.visible === "boolean") {
          visible = position.visible;
        } else if (position?.visible === 1 || position?.visible === "1") {
          visible = true;
        } else if (position?.visible === 0 || position?.visible === "0") {
          visible = false;
        } else {
          visible = true;
        }
      } else if (entry.isHostCustomPaintBlock === true) {
        this.resetHostCustomPaintBlockEntryToDefault(entry);
        continue;
      } else if (!hasAnySourceEntries) {
        // Full-empty state means explicit reset to map defaults.
        x = Number(fallback?.x);
        y = Number(fallback?.y);
        z = Number(fallback?.z);
        sx = Number(fallbackScale?.x);
        sy = Number(fallbackScale?.y);
        sz = Number(fallbackScale?.z);
        ry = Number(fallbackRotation?.y);
        visible = fallbackVisible;
      } else {
        // Partial updates should not snap unspecified objects back to defaults.
        continue;
      }
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
        continue;
      }
      entry.mesh.position.set(x, y, z);
      if (Number.isFinite(sx) && Number.isFinite(sy) && Number.isFinite(sz)) {
        entry.mesh.scale.set(
          THREE.MathUtils.clamp(sx, OBJECT_EDITOR_MIN_SCALE, HOST_CUSTOM_BLOCK_MAX_SIZE),
          THREE.MathUtils.clamp(sy, OBJECT_EDITOR_MIN_SCALE, HOST_CUSTOM_BLOCK_MAX_SIZE),
          THREE.MathUtils.clamp(sz, OBJECT_EDITOR_MIN_SCALE, HOST_CUSTOM_BLOCK_MAX_SIZE)
        );
      }
      if (Number.isFinite(ry)) {
        entry.mesh.rotation.y = this.normalizeYawAngle(ry);
      }
      if (visible === null) {
        if (entry.mesh.visible) {
          this.updateMovableObjectCollider(entry);
        } else {
          this.parkMovableObjectCollider(entry);
        }
      } else {
        this.setMovableObjectVisibility(entry, visible);
      }
      this.updateSecurityTestLabelForEntry(entry);
    }
    this.syncPortalAnchorsFromMovableObjects({ force: true });
    this.updateObjEditorInfoEl(this.objEditorSelected);
    if (!this.objectStateSaveInFlight && !this.objectStateSavePending && !this.objEditorDragging) {
      this.objectStateDirty = false;
      this.objectStateAutosaveClock = 0;
    }
    if (persistLocal) {
      try {
        localStorage.setItem(
          this.objectPositionsStorageKey,
          JSON.stringify(this.collectObjectPositionsPayload())
        );
      } catch {
        // ignore
      }
    }
  }

  saveObjectPositions({ announceErrors = true, forceFlush = false } = {}) {
    if (!this.movableObjects.length) {
      return;
    }
    const payload = this.collectObjectPositionsPayload();
    try {
      localStorage.setItem(this.objectPositionsStorageKey, JSON.stringify(payload));
    } catch {
      // ignore
    }
    if (this.socket && this.networkConnected) {
      if (this.objectStateSaveInFlight) {
        this.objectStateSavePending = true;
        this.objectStateDirty = true;
        this.objectStateSavePendingForceFlush =
          this.objectStateSavePendingForceFlush || Boolean(forceFlush);
        return;
      }
      if (!this.hasHostPrivilege()) {
        this.objectStateSavePending = false;
        this.objectStateSavePendingForceFlush = false;
        this.objectStateDirty = false;
        this.objectStateAutosaveClock = 0;
        if (announceErrors) {
          this.appendChatLine("", "오브젝트 저장은 방장만 가능합니다.", "system");
        }
        this.requestObjectState();
        return;
      }
      const coreMemoryAvailable =
        typeof this.runtimePolicyState?.coreMemory?.available === "boolean"
          ? this.runtimePolicyState.coreMemory.available
          : this.runtimePolicyState?.persistentStateAvailable;
      if (coreMemoryAvailable === false) {
        this.objectStateSavePending = false;
        this.objectStateSavePendingForceFlush = false;
        this.objectStateDirty = false;
        this.objectStateAutosaveClock = 0;
        if (announceErrors) {
          this.appendChatLine("", this.getCoreMemoryUnavailableMessage("회색 오브젝트"), "system");
        }
        this.requestObjectState();
        return;
      }
      this.objectStateSaveInFlight = true;
      this.objectStateDirty = true;
      this.objectStateAutosaveClock = 0;
      this.socket.emit("object:state:set", { positions: payload, forceFlush: Boolean(forceFlush) }, (res = {}) => {
        this.objectStateSaveInFlight = false;
        const ackRevision = Math.trunc(Number(res?.revision));
        if (Number.isFinite(ackRevision) && ackRevision >= 0) {
          this.objectStateRevision = Math.max(this.objectStateRevision, ackRevision);
        }
        if (!res?.ok) {
          this.objectStateSavePending = false;
          this.objectStateSavePendingForceFlush = false;
          this.objectStateAutosaveClock = 0;
          if (announceErrors) {
            const reason = String(res?.error ?? "").trim() || "unknown";
            this.appendChatLine("", `오브젝트 저장 실패: ${reason}`, "system");
          }
          this.requestObjectState();
          return;
        }
        if (this.objectStateSavePending) {
          const nextForceFlush = this.objectStateSavePendingForceFlush;
          this.objectStateSavePending = false;
          this.objectStateSavePendingForceFlush = false;
          this.saveObjectPositions({ announceErrors: false, forceFlush: nextForceFlush });
          return;
        }
        this.objectStateSavePendingForceFlush = false;
        this.objectStateDirty = false;
        this.objectStateAutosaveClock = 0;
        this.requestObjectState();
      });
      return;
    }
    this.objectStateDirty = false;
    this.objectStateAutosaveClock = 0;
  }

  loadSavedObjectPositions() {
    if (!this.movableObjects.length) {
      return;
    }
    try {
      const savedRaw = localStorage.getItem(this.objectPositionsStorageKey);
      if (!savedRaw) {
        return;
      }
      const saved = JSON.parse(savedRaw);
      if (!saved || typeof saved !== "object") {
        return;
      }
      this.applyObjectPositionsState(this.filterPersistedHostCustomBlockPositions(saved), {
        persistLocal: false
      });
    } catch {
      // ignore
    }
  }

  // ── Platform Editor ──────────────────────────────────────────────────────

  toggleFlyMode() {
    const exitingObjEditor = this.flyModeActive && this.objEditorActive;
    this.climbingRope = null;
    this.flyModeActive = !this.flyModeActive;
    if (this.flyModeActive) {
      if (this.editorMode === "obj" && !this.canUseObjectEditor()) {
        this.editorMode = "platform";
        this.editorModePlatformBtnEl?.classList.add("active");
        this.editorModeRopeBtnEl?.classList.remove("active");
        this.editorModeObjBtnEl?.classList.remove("active");
      }
      if (!this.platformEditorPreviewMesh) {
        const geo = new THREE.BoxGeometry(
          this.platformEditorSize.w,
          this.platformEditorSize.h,
          this.platformEditorSize.d
        );
        const mat = new THREE.MeshStandardMaterial({
          color: 0xa7adb4,
          emissive: 0x1e2328,
          emissiveIntensity: 0.28,
          opacity: 0.42,
          transparent: true,
        });
        this.platformEditorPreviewMesh = new THREE.Mesh(geo, mat);
        this.scene.add(this.platformEditorPreviewMesh);
      }
      this.platformEditorPreviewMesh.visible = this.editorMode === "platform";
      if (this.ropeEditorPreviewMesh) this.ropeEditorPreviewMesh.visible = this.editorMode === "rope";
      this.platformEditorEl?.classList.remove("hidden");
      if (this.editorMode === "obj" && this.canUseObjectEditor()) {
        this.objEditorActive = true;
        this.objEditorBarEl?.classList.remove("hidden");
        if (this.platformEditorPreviewMesh) this.platformEditorPreviewMesh.visible = false;
        if (this.ropeEditorPreviewMesh) this.ropeEditorPreviewMesh.visible = false;
        if (document.pointerLockElement === this.renderer.domElement) {
          document.exitPointerLock?.();
        }
      } else {
        this.objEditorActive = false;
        this.objEditorBarEl?.classList.add("hidden");
      }
    } else {
      if (this.platformEditorPreviewMesh) this.platformEditorPreviewMesh.visible = false;
      if (this.ropeEditorPreviewMesh) this.ropeEditorPreviewMesh.visible = false;
      this.platformEditorEl?.classList.add("hidden");
      this.objEditorDragging = false;
      this.objEditorActive = false;
      this.objEditorBarEl?.classList.add("hidden");
      if (exitingObjEditor) {
        this.saveObjectPositions({ announceErrors: false, forceFlush: true });
      }
      this.clearObjEditorSelection();
      if (exitingObjEditor && !this.pointerLocked) {
        this.tryPointerLock();
      }
    }
  }

  updatePlatformEditor() {
    if (!this.flyModeActive) return;
    if (this.editorMode === "obj") {
      if (this.platformEditorPreviewMesh) this.platformEditorPreviewMesh.visible = false;
      if (this.ropeEditorPreviewMesh) this.ropeEditorPreviewMesh.visible = false;
      return;
    }
    if (this.editorMode === "rope") {
      if (this.platformEditorPreviewMesh) this.platformEditorPreviewMesh.visible = false;
      this.updateRopeEditorPreview();
      return;
    }
    if (this.ropeEditorPreviewMesh) this.ropeEditorPreviewMesh.visible = false;
    if (!this.platformEditorPreviewMesh) return;
    // Use horizontal-only direction so platform doesn't float to ceiling when looking up
    const dir = this.editorPreviewDirection;
    this.camera.getWorldDirection(dir);
    dir.y = 0;
    if (dir.lengthSq() < 0.001) dir.set(0, 0, -1);
    dir.normalize();
    const pos = this.editorPreviewPosition
      .copy(this.playerPosition)
      .addScaledVector(dir, this.platformEditorDist);
    // Snap to 0.5 grid; Y stays at player foot level by default
    pos.x = Math.round(pos.x * 2) / 2;
    pos.y = Math.round((this.playerPosition.y - GAME_CONSTANTS.PLAYER_HEIGHT) * 2) / 2;
    pos.z = Math.round(pos.z * 2) / 2;
    this.platformEditorPreviewMesh.position.copy(pos);
  }

  placePlatformAtPreview() {
    if (!this.platformEditorPreviewMesh) return;
    const platformLimit = Math.max(
      OBJECT_EDITOR_MIN_LIMIT,
      Math.trunc(Number(this.objectEditorSettings?.platformLimit) || 0)
    );
    if (this.jumpPlatforms.length >= platformLimit) {
      this.appendChatLine("", `발판 최대 개수(${platformLimit})에 도달했습니다.`, "system");
      return;
    }
    const pos = this.platformEditorPreviewMesh.position;
    const p = {
      x: pos.x, y: pos.y, z: pos.z,
      w: this.platformEditorSize.w,
      h: this.platformEditorSize.h,
      d: this.platformEditorSize.d,
    };
    this.spawnPlatformMesh(p);
    this.jumpPlatforms.push(p);
    this.indexPlatformSpatialEntry(p);
    this.updatePlatformEditorCount();
    this.savePlatforms();
  }

  getHostCustomPaintBlockEntries() {
    return this.movableObjects.filter((entry) => entry?.isHostCustomPaintBlock && entry?.mesh);
  }

  getVisibleHostCustomPaintBlockEntries() {
    return this.getHostCustomPaintBlockEntries().filter((entry) => entry?.mesh?.visible === true);
  }

  getHostCustomPaintBlockAvailableCount() {
    return this.getHostCustomPaintBlockEntries().filter((entry) => entry.mesh.visible !== true).length;
  }

  getAvailableHostCustomPaintBlockEntry() {
    const entries = this.getHostCustomPaintBlockEntries();
    if (!entries.length) {
      return null;
    }
    return entries.find((entry) => entry?.mesh?.visible !== true) ?? null;
  }

  removeHostCustomPaintBlockEntry(
    entry,
    { announce = true, announceErrors = true, forceFlush = true } = {}
  ) {
    if (!entry?.mesh || entry?.isHostCustomPaintBlock !== true) {
      if (announceErrors) {
        this.appendChatLine("", "삭제할 회색 오브젝트를 찾지 못했습니다.", "system");
      }
      return false;
    }
    const objectId = String(entry.id ?? "").trim() || "host_custom_block";
    if (entry === this.objEditorSelected) {
      this.clearObjEditorSelection();
    }

    this.setMovableObjectVisibility(entry, false);
    const defaultPosition = entry.defaultPosition;
    if (defaultPosition && Number.isFinite(defaultPosition.x)) {
      entry.mesh.position.copy(defaultPosition);
    } else {
      entry.mesh.position.set(0, -920, 0);
    }
    const defaultScale = entry.defaultScale;
    if (defaultScale && Number.isFinite(defaultScale.x)) {
      entry.mesh.scale.copy(defaultScale);
    } else {
      entry.mesh.scale.set(1, 1, 1);
    }
    this.updateMovableObjectCollider(entry);
    this.updateSecurityTestLabelForEntry(entry);
    this.updateObjEditorInfoEl(this.objEditorSelected);
    this.markObjectStateDirty();
    this.saveObjectPositions({ announceErrors, forceFlush });
    this.syncHostControls();
    if (announce) {
      this.appendChatLine("", `회색 오브젝트 삭제: ${objectId}`, "system");
    }
    return true;
  }

  requestDeleteHostCustomPaintBlockFromHostPanel() {
    if (!this.hasHostPrivilege()) {
      if (this.socket && this.networkConnected) {
        this.requestHostClaim({ manual: true });
      }
      this.appendChatLine("", "회색 오브젝트 삭제는 방장만 가능합니다.", "system");
      return false;
    }
    if (this.hostCustomBlockPlacementPreviewActive) {
      this.clearHostCustomBlockPlacementPreview({ syncUi: true });
    }

    const selected = this.objEditorSelected;
    if (selected?.isHostCustomPaintBlock && selected?.mesh?.visible === true) {
      return this.removeHostCustomPaintBlockEntry(selected, { announce: true, forceFlush: true });
    }

    const centerEntry = this.pickMovableEntryAtScreenCenter();
    if (centerEntry?.isHostCustomPaintBlock && centerEntry?.mesh?.visible === true) {
      this.selectObjEditorEntry(centerEntry);
      return this.removeHostCustomPaintBlockEntry(centerEntry, { announce: true, forceFlush: true });
    }

    this.appendChatLine("", "삭제할 회색 오브젝트를 선택하거나 화면 중앙에 맞춰주세요.", "system");
    return false;
  }

  normalizeHostCustomBlockSize(rawValue, fallback = HOST_CUSTOM_BLOCK_DEFAULT_SIZE) {
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    const clamped = THREE.MathUtils.clamp(parsed, HOST_CUSTOM_BLOCK_MIN_SIZE, HOST_CUSTOM_BLOCK_MAX_SIZE);
    return Math.round(clamped * 10) / 10;
  }

  getHostCustomBlockSizeFromPanel() {
    const candidateValues = [
      this.hostGrayObjectWidthInputEl?.value,
      this.hostGrayObjectHeightInputEl?.value,
      this.hostGrayObjectDepthInputEl?.value
    ];
    let sourceSize = Number.NaN;
    for (const rawValue of candidateValues) {
      const parsed = Number(rawValue);
      if (Number.isFinite(parsed)) {
        sourceSize = parsed;
        break;
      }
    }
    const uniformSize = this.normalizeHostCustomBlockSize(sourceSize);
    const width = uniformSize;
    const height = uniformSize;
    const depth = uniformSize;
    if (this.hostGrayObjectWidthInputEl) {
      this.hostGrayObjectWidthInputEl.value = width.toFixed(1);
    }
    if (this.hostGrayObjectHeightInputEl) {
      this.hostGrayObjectHeightInputEl.value = height.toFixed(1);
    }
    if (this.hostGrayObjectDepthInputEl) {
      this.hostGrayObjectDepthInputEl.value = depth.toFixed(1);
    }
    return { width, height, depth };
  }

  getHostCustomBlockPlacementTransform({ width, height, depth }) {
    const direction = this.editorPreviewDirection;
    if (this.camera?.getWorldDirection) {
      this.camera.getWorldDirection(direction);
      direction.y = 0;
    } else {
      direction.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    }
    if (direction.lengthSq() < 0.0001) {
      direction.set(0, 0, -1);
    } else {
      direction.normalize();
    }

    const spawnDistance = THREE.MathUtils.clamp(Math.max(width, depth) * 1.1 + 3.4, 4, 20);
    const footY = this.playerPosition.y - GAME_CONSTANTS.PLAYER_HEIGHT;
    const x = Math.round((this.playerPosition.x + direction.x * spawnDistance) * 2) / 2;
    const z = Math.round((this.playerPosition.z + direction.z * spawnDistance) * 2) / 2;
    const y = Math.round((footY + height * 0.5) * 2) / 2;
    return { x, y, z };
  }

  ensureHostCustomBlockPlacementPreviewMesh() {
    if (this.hostCustomBlockPlacementPreviewMesh) {
      return this.hostCustomBlockPlacementPreviewMesh;
    }

    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial({
      color: 0x31ff9d,
      emissive: 0x31ff9d,
      emissiveIntensity: 0.44,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      roughness: 0.58,
      metalness: 0.06
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.visible = false;
    mesh.renderOrder = 24;
    this.scene.add(mesh);
    this.hostCustomBlockPlacementPreviewMesh = mesh;
    return mesh;
  }

  clearHostCustomBlockPlacementPreview({ syncUi = true } = {}) {
    this.hostCustomBlockPlacementPreviewActive = false;
    this.hostCustomBlockPlacementPreviewTargetId = "";
    this.hostCustomBlockPlacementPreviewTransform = null;
    if (this.hostCustomBlockPlacementPreviewMesh) {
      this.hostCustomBlockPlacementPreviewMesh.visible = false;
    }
    if (syncUi) {
      this.syncHostControls();
    }
  }

  updateHostCustomBlockPlacementPreview() {
    if (!this.hostCustomBlockPlacementPreviewActive) {
      if (this.hostCustomBlockPlacementPreviewMesh) {
        this.hostCustomBlockPlacementPreviewMesh.visible = false;
      }
      return;
    }
    if (!this.hasHostPrivilege()) {
      this.clearHostCustomBlockPlacementPreview({ syncUi: true });
      return;
    }

    const entries = this.getHostCustomPaintBlockEntries();
    const targetId = String(this.hostCustomBlockPlacementPreviewTargetId ?? "").trim();
    const targetEntry =
      entries.find(
        (entry) => String(entry?.id ?? "").trim() === targetId && entry?.mesh?.visible !== true
      ) ??
      entries.find((entry) => entry?.mesh?.visible !== true) ??
      null;
    if (!targetEntry) {
      this.clearHostCustomBlockPlacementPreview({ syncUi: true });
      return;
    }
    this.hostCustomBlockPlacementPreviewTargetId = String(targetEntry.id ?? "");
    const { width, height, depth } = this.getHostCustomBlockSizeFromPanel();
    const transform = this.getHostCustomBlockPlacementTransform({ width, height, depth });
    this.hostCustomBlockPlacementPreviewTransform = {
      ...transform,
      width,
      height,
      depth
    };

    const previewMesh = this.ensureHostCustomBlockPlacementPreviewMesh();
    previewMesh.scale.set(width, height, depth);
    previewMesh.position.set(transform.x, transform.y, transform.z);
    previewMesh.visible = true;
  }

  beginHostCustomBlockPlacementPreview() {
    if (!this.hasHostPrivilege()) {
      if (this.socket && this.networkConnected) {
        this.requestHostClaim({ manual: true });
      }
      this.appendChatLine("", "회색 오브젝트 추가는 방장만 가능합니다.", "system");
      return false;
    }
    const targetEntry = this.getAvailableHostCustomPaintBlockEntry();
    if (!targetEntry) {
      const total = this.getHostCustomPaintBlockEntries().length;
      if (total <= 0) {
        this.appendChatLine("", "추가 가능한 회색 오브젝트 슬롯이 없습니다.", "system");
      } else {
        this.appendChatLine("", `회색 오브젝트 최대 개수(${total})에 도달했습니다.`, "system");
      }
      return false;
    }
    if (this.promoPlacementPreviewActive) {
      this.clearPromoPlacementPreview({ syncUi: true });
    }
    this.hostCustomBlockPlacementPreviewActive = true;
    this.hostCustomBlockPlacementPreviewTargetId = String(targetEntry.id ?? "");
    this.ensureHostCustomBlockPlacementPreviewMesh();
    this.updateHostCustomBlockPlacementPreview();
    this.syncHostControls();
    this.appendChatLine(
      "",
      "회색 오브젝트 미리보기 시작: 휠(PC)/크기 입력(모바일) 조절 후 클릭 또는 버튼으로 확정",
      "system"
    );
    return true;
  }

  startRightBillboardVideoDataPlayback(rawVideoDataUrl) {
    const videoDataUrl = this.normalizeBillboardVideoDataUrl(rawVideoDataUrl);
    if (!videoDataUrl || !this.plazaBillboardRightScreenMaterial) {
      this.showDefaultBillboardAdOnRight();
      return false;
    }

    if (
      this.rightBillboardActiveVideoDataUrl === videoDataUrl &&
      this.plazaBillboardRightVideoEl &&
      !this.plazaBillboardRightVideoEl.ended
    ) {
      return true;
    }

    this.stopRightBillboardVideoPlayback();

    const video = document.createElement("video");
    video.preload = "metadata";
    video.playsInline = true;
    video.muted = false;
    video.loop = true;
    video.crossOrigin = "anonymous";
    video.disablePictureInPicture = true;
    video.setAttribute("playsinline", "true");
    video.setAttribute("webkit-playsinline", "true");
    video.setAttribute("disableremoteplayback", "true");
    video.src = videoDataUrl;
    video.currentTime = 0;

    const texture = new THREE.VideoTexture(video);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;

    this.plazaBillboardRightVideoEl = video;
    this.plazaBillboardRightVideoTexture = texture;
    this.rightBillboardActiveVideoId = "";
    this.rightBillboardActiveVideoDataUrl = videoDataUrl;

    video.addEventListener(
      "canplay",
      () => {
        if (this.plazaBillboardRightVideoEl !== video) return;
        if (this.plazaBillboardRightScreenMaterial) {
          this.plazaBillboardRightScreenMaterial.map = texture;
          this.plazaBillboardRightScreenMaterial.needsUpdate = true;
        }
      },
      { once: true }
    );

    const finishPlayback = () => {
      if (this.plazaBillboardRightVideoEl !== video) {
        return;
      }
      this.handleRightBillboardVideoDataFinished(videoDataUrl);
    };
    video.onended = null;
    video.onerror = finishPlayback;

    video.play().then(
      () => {
        this.updateSpatialAudioMix();
      },
      () => {
        video.muted = true;
        video.play().then(
          () => {
            this.updateSpatialAudioMix();
          },
          () => {
            finishPlayback();
          }
        );
      }
    );
    return true;
  }

  confirmHostCustomBlockPlacementPreview() {
    if (!this.hostCustomBlockPlacementPreviewActive) {
      return false;
    }
    if (!this.hasHostPrivilege()) {
      this.clearHostCustomBlockPlacementPreview({ syncUi: true });
      this.appendChatLine("", "회색 오브젝트 추가는 방장만 가능합니다.", "system");
      return false;
    }

    this.updateHostCustomBlockPlacementPreview();
    const targetId = String(this.hostCustomBlockPlacementPreviewTargetId ?? "").trim();
    const targetEntry = this.getHostCustomPaintBlockEntries().find(
      (entry) => String(entry?.id ?? "").trim() === targetId && entry?.mesh
    );
    if (!targetEntry || targetEntry.mesh.visible === true) {
      this.clearHostCustomBlockPlacementPreview({ syncUi: true });
      this.appendChatLine("", "배치 가능한 회색 오브젝트 슬롯이 없습니다.", "system");
      return false;
    }

    const placement = this.hostCustomBlockPlacementPreviewTransform;
    const { width, height, depth } = this.getHostCustomBlockSizeFromPanel();
    const hasPlacement =
      Number.isFinite(Number(placement?.x)) &&
      Number.isFinite(Number(placement?.y)) &&
      Number.isFinite(Number(placement?.z));
    const transform = hasPlacement
      ? placement
      : this.getHostCustomBlockPlacementTransform({ width, height, depth });

    targetEntry.mesh.scale.set(width, height, depth);
    targetEntry.mesh.position.set(
      Number(transform.x) || 0,
      Number(transform.y) || 0,
      Number(transform.z) || 0
    );
    this.setMovableObjectVisibility(targetEntry, true);
    this.updateSecurityTestLabelForEntry(targetEntry);
    if (this.objEditorActive) {
      this.selectObjEditorEntry(targetEntry);
    }
    this.updateObjEditorInfoEl(this.objEditorSelected);
    this.markObjectStateDirty();
    this.saveObjectPositions({ announceErrors: true, forceFlush: true });
    this.clearHostCustomBlockPlacementPreview({ syncUi: false });
    this.syncHostControls();
    return true;
  }

  adjustHostCustomBlockPlacementPreviewSize(delta = 0) {
    if (!this.hostCustomBlockPlacementPreviewActive) {
      return;
    }
    const step = Number(delta);
    if (!Number.isFinite(step) || Math.abs(step) < 0.0001) {
      return;
    }
    const size = this.getHostCustomBlockSizeFromPanel();
    const current = Number(size.width) || HOST_CUSTOM_BLOCK_DEFAULT_SIZE;
    const nextUniform = this.normalizeHostCustomBlockSize(current + step, current);
    const nextWidth = nextUniform;
    const nextHeight = nextUniform;
    const nextDepth = nextUniform;
    if (this.hostGrayObjectWidthInputEl) {
      this.hostGrayObjectWidthInputEl.value = nextWidth.toFixed(1);
    }
    if (this.hostGrayObjectHeightInputEl) {
      this.hostGrayObjectHeightInputEl.value = nextHeight.toFixed(1);
    }
    if (this.hostGrayObjectDepthInputEl) {
      this.hostGrayObjectDepthInputEl.value = nextDepth.toFixed(1);
    }
    this.updateHostCustomBlockPlacementPreview();
    this.syncHostControls();
  }

  requestHostCustomPaintBlockAdd() {
    if (this.hostCustomBlockPlacementPreviewActive) {
      return this.confirmHostCustomBlockPlacementPreview();
    }
    return this.beginHostCustomBlockPlacementPreview();
  }

  findPlatformMeshIndexForObject(object) {
    if (!object || !this.jumpPlatformMeshes.length) {
      return -1;
    }
    let current = object;
    while (current) {
      const index = this.jumpPlatformMeshes.indexOf(current);
      if (index >= 0) {
        return index;
      }
      current = current.parent ?? null;
    }
    return -1;
  }

  pickPlatformIndexAtScreenCenter() {
    if (!this.camera || !this.jumpPlatformMeshes.length) {
      return -1;
    }
    this.objEditorMouseNdc.set(0, 0);
    this.objEditorRaycaster.setFromCamera(this.objEditorMouseNdc, this.camera);
    const intersections = this.objEditorRaycaster.intersectObjects(this.jumpPlatformMeshes, true);
    if (!intersections.length) {
      return -1;
    }
    for (const intersection of intersections) {
      const index = this.findPlatformMeshIndexForObject(intersection?.object);
      if (index >= 0) {
        return index;
      }
    }
    return -1;
  }

  removePlatformAtIndex(index, { announce = true, forceFlush = true } = {}) {
    const safeIndex = Math.trunc(Number(index));
    if (safeIndex < 0 || safeIndex >= this.jumpPlatforms.length || safeIndex >= this.jumpPlatformMeshes.length) {
      return false;
    }

    const removedPlatform = this.jumpPlatforms.splice(safeIndex, 1)[0];
    const removedMesh = this.jumpPlatformMeshes.splice(safeIndex, 1)[0];
    if (removedMesh) {
      this.scene.remove(removedMesh);
      removedMesh.geometry?.dispose?.();
      removedMesh.material?.dispose?.();
    }
    this.rebuildPlatformSpatialIndex();
    this.updatePlatformEditorCount();
    this.savePlatforms({ forceFlush });
    if (announce && removedPlatform) {
      this.appendChatLine(
        "",
        `발판 삭제 (${(Number(removedPlatform.x) || 0).toFixed(1)}, ${(Number(removedPlatform.y) || 0).toFixed(1)}, ${(Number(removedPlatform.z) || 0).toFixed(1)})`,
        "system"
      );
    }
    return true;
  }

  requestDeletePlatformFromHostPanel() {
    if (!this.hasHostPrivilege()) {
      if (this.socket && this.networkConnected) {
        this.requestHostClaim({ manual: true });
      }
      this.appendChatLine("", "발판 삭제는 방장만 가능합니다.", "system");
      return false;
    }
    if (!this.jumpPlatforms.length) {
      this.appendChatLine("", "삭제할 발판이 없습니다.", "system");
      return false;
    }

    const targetIndex = this.pickPlatformIndexAtScreenCenter();
    if (targetIndex < 0) {
      this.appendChatLine("", "삭제할 발판을 화면 중앙에 맞춰주세요.", "system");
      return false;
    }
    return this.removePlatformAtIndex(targetIndex, { announce: true, forceFlush: true });
  }

  undoLastPlatform() {
    if (this.jumpPlatforms.length === 0) return;
    this.jumpPlatforms.pop();
    this.rebuildPlatformSpatialIndex();
    const mesh = this.jumpPlatformMeshes.pop();
    if (mesh) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    this.updatePlatformEditorCount();
    this.savePlatforms();
  }

  spawnPlatformMesh(p) {
    const geo = new THREE.BoxGeometry(p.w, p.h, p.d);
    const mat = new THREE.MeshStandardMaterial({
      color: PLAYER_PLACEABLE_BLOCK_BASE_COLOR,
      emissive: PLAYER_PLACEABLE_BLOCK_EMISSIVE_COLOR,
      emissiveIntensity: PLAYER_PLACEABLE_BLOCK_EMISSIVE_INTENSITY,
      roughness: 0.64,
      metalness: 0.06,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(p.x, p.y, p.z);
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.jumpPlatformMeshes.push(mesh);
  }

  loadSavedPlatforms() {
    // If connected to server, server will push platform:state on join — skip localStorage load.
    // Offline / local host: load from localStorage as fallback.
    if (this.socket && this.networkConnected) return;
    try {
      const saved = localStorage.getItem("jumpPlatforms_v1");
      if (!saved) return;
      const platforms = JSON.parse(saved);
      if (!Array.isArray(platforms)) return;
      for (const p of platforms) {
        if (typeof p.x !== "number" || typeof p.y !== "number" || typeof p.z !== "number") continue;
        this.spawnPlatformMesh(p);
        this.jumpPlatforms.push(p);
      }
      this.rebuildPlatformSpatialIndex();
      this.updatePlatformEditorCount();
    } catch {
      // ignore
    }
  }

  resetPlatformSpatialIndex() {
    this.platformSpatialIndex.clear();
    this.platformCollisionCandidateBuffer.length = 0;
    this.platformCollisionCandidateSeen.clear();
    this.platformCollisionMaxHalfExtent = 0.5;
  }

  indexPlatformSpatialEntry(platform) {
    if (!platform || typeof platform !== "object") {
      return;
    }
    const x = Number(platform.x);
    const z = Number(platform.z);
    const w = Math.max(0.1, Number(platform.w) || 3);
    const d = Math.max(0.1, Number(platform.d) || 3);
    if (!Number.isFinite(x) || !Number.isFinite(z)) {
      return;
    }
    const halfW = w * 0.5;
    const halfD = d * 0.5;
    this.platformCollisionMaxHalfExtent = Math.max(
      this.platformCollisionMaxHalfExtent,
      Math.max(halfW, halfD)
    );
    const pad = Math.max(0.24, Number(this.playerCollisionRadius) || 0.35) + 0.4;
    const minX = x - halfW - pad;
    const maxX = x + halfW + pad;
    const minZ = z - halfD - pad;
    const maxZ = z + halfD + pad;
    const cellSize = Math.max(1, Number(this.platformSpatialCellSize) || 10);
    const minCellX = Math.floor(minX / cellSize);
    const maxCellX = Math.floor(maxX / cellSize);
    const minCellZ = Math.floor(minZ / cellSize);
    const maxCellZ = Math.floor(maxZ / cellSize);
    for (let cx = minCellX; cx <= maxCellX; cx += 1) {
      for (let cz = minCellZ; cz <= maxCellZ; cz += 1) {
        const key = `${cx}|${cz}`;
        let bucket = this.platformSpatialIndex.get(key);
        if (!bucket) {
          bucket = [];
          this.platformSpatialIndex.set(key, bucket);
        }
        bucket.push(platform);
      }
    }
  }

  rebuildPlatformSpatialIndex() {
    this.resetPlatformSpatialIndex();
    for (const platform of this.jumpPlatforms) {
      this.indexPlatformSpatialEntry(platform);
    }
  }

  getNearbyPlatformCandidates(x, z) {
    const candidates = this.platformCollisionCandidateBuffer;
    candidates.length = 0;
    if (this.jumpPlatforms.length === 0) {
      return candidates;
    }
    if (this.platformSpatialIndex.size === 0) {
      for (const platform of this.jumpPlatforms) {
        candidates.push(platform);
      }
      return candidates;
    }
    const seen = this.platformCollisionCandidateSeen;
    seen.clear();
    const px = Number(x) || 0;
    const pz = Number(z) || 0;
    const searchRadius =
      Math.max(0.5, Number(this.platformCollisionMaxHalfExtent) || 0.5) +
      Math.max(0.24, Number(this.playerCollisionRadius) || 0.35) +
      0.6;
    const cellSize = Math.max(1, Number(this.platformSpatialCellSize) || 10);
    const minCellX = Math.floor((px - searchRadius) / cellSize);
    const maxCellX = Math.floor((px + searchRadius) / cellSize);
    const minCellZ = Math.floor((pz - searchRadius) / cellSize);
    const maxCellZ = Math.floor((pz + searchRadius) / cellSize);
    for (let cx = minCellX; cx <= maxCellX; cx += 1) {
      for (let cz = minCellZ; cz <= maxCellZ; cz += 1) {
        const bucket = this.platformSpatialIndex.get(`${cx}|${cz}`);
        if (!bucket) {
          continue;
        }
        for (const platform of bucket) {
          if (seen.has(platform)) {
            continue;
          }
          seen.add(platform);
          candidates.push(platform);
        }
      }
    }
    return candidates;
  }

  getNearbyPromoPlatformCandidates(x, z) {
    const candidates = this.promoPlatformCandidateBuffer;
    candidates.length = 0;
    if (!Array.isArray(this.promoCollisionBoxes) || this.promoCollisionBoxes.length === 0) {
      return candidates;
    }
    const px = Number(x) || 0;
    const pz = Number(z) || 0;
    for (const collider of this.promoCollisionBoxes) {
      const platform = collider?.platform;
      if (!platform) {
        continue;
      }
      const halfW = Math.max(0.1, Number(platform.w) || 0) * 0.5 + 0.9;
      const halfD = Math.max(0.1, Number(platform.d) || 0) * 0.5 + 0.9;
      if (
        Math.abs(px - (Number(platform.x) || 0)) > halfW ||
        Math.abs(pz - (Number(platform.z) || 0)) > halfD
      ) {
        continue;
      }
      candidates.push(platform);
    }
    return candidates;
  }

  markPlatformStateDirty() {
    this.platformStateDirty = true;
    const interval = Math.max(0.16, Number(this.platformStateAutosaveInterval) || 0.24);
    this.platformStateAutosaveClock = Math.min(interval, this.platformStateAutosaveClock + interval * 0.6);
  }

  updatePlatformStateAutosave(delta = 0) {
    if (!this.platformStateDirty) {
      return;
    }
    if (!(this.socket && this.networkConnected) || !this.hasHostPrivilege()) {
      return;
    }
    this.platformStateAutosaveClock += Math.max(0, Number(delta) || 0);
    const interval = Math.max(0.16, Number(this.platformStateAutosaveInterval) || 0.24);
    if (this.platformStateAutosaveClock < interval) {
      return;
    }
    this.platformStateAutosaveClock = 0;
    this.savePlatforms({ announceErrors: false });
  }

  applyPlatformState(rawPlatforms, { revision = null } = {}) {
    const nextRevision = Math.trunc(Number(revision));
    if (this.platformStateDirty) {
      if (Number.isFinite(nextRevision) && nextRevision >= 0) {
        if (nextRevision <= this.platformStateRevision) {
          return;
        }
      } else if (this.platformSaveInFlight || this.platformSavePending) {
        return;
      }
    }
    if (Number.isFinite(nextRevision) && nextRevision >= 0) {
      if (nextRevision < this.platformStateRevision) {
        return;
      }
      this.platformStateRevision = nextRevision;
    }
    // Clear existing platform meshes
    for (const mesh of this.jumpPlatformMeshes) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    this.jumpPlatforms = [];
    this.jumpPlatformMeshes = [];

    const platforms = Array.isArray(rawPlatforms) ? rawPlatforms : [];
    for (const p of platforms) {
      if (typeof p.x !== "number") continue;
      this.spawnPlatformMesh(p);
      this.jumpPlatforms.push(p);
    }
    this.rebuildPlatformSpatialIndex();
    this.updatePlatformEditorCount();
    if (!this.platformSaveInFlight && !this.platformSavePending) {
      this.platformStateDirty = false;
      this.platformStateAutosaveClock = 0;
    }

    // Also persist locally as backup
    try {
      localStorage.setItem("jumpPlatforms_v1", JSON.stringify(this.jumpPlatforms));
    } catch {
      // ignore
    }
  }

  savePlatforms({ announceErrors = true, forceFlush = false } = {}) {
    try {
      localStorage.setItem("jumpPlatforms_v1", JSON.stringify(this.jumpPlatforms));
    } catch {
      // ignore
    }
    // Sync to server so all players see the platforms
    if (this.socket && this.networkConnected) {
      if (this.platformSaveInFlight) {
        this.platformSavePending = true;
        this.platformStateDirty = true;
        this.platformSavePendingForceFlush =
          this.platformSavePendingForceFlush || Boolean(forceFlush);
        return;
      }
      if (!this.hasHostPrivilege()) {
        this.platformSavePending = false;
        this.platformSavePendingForceFlush = false;
        this.platformStateDirty = false;
        this.platformStateAutosaveClock = 0;
        if (announceErrors) {
          this.appendChatLine("", "점프대 저장은 방장만 가능합니다.", "system");
        }
        this.requestPlatformState();
        return;
      }
      this.platformSaveInFlight = true;
      this.platformStateDirty = true;
      this.platformStateAutosaveClock = 0;
      this.socket.emit(
        "platform:state:set",
        { platforms: this.jumpPlatforms, forceFlush: Boolean(forceFlush) },
        (res = {}) => {
        this.platformSaveInFlight = false;
        const ackRevision = Math.trunc(Number(res?.revision));
        if (Number.isFinite(ackRevision) && ackRevision >= 0) {
          this.platformStateRevision = Math.max(this.platformStateRevision, ackRevision);
        }
        if (!res?.ok) {
          this.platformSavePending = false;
          this.platformSavePendingForceFlush = false;
          this.platformStateAutosaveClock = 0;
          if (announceErrors) {
            const reason = String(res?.error ?? "").trim() || "unknown";
            this.appendChatLine("", `점프대 저장 실패: ${reason}`, "system");
          }
          console.warn("[platform] save rejected:", res?.error);
          this.requestPlatformState();
          return;
        }
        if (this.platformSavePending) {
          const nextForceFlush = this.platformSavePendingForceFlush;
          this.platformSavePending = false;
          this.platformSavePendingForceFlush = false;
          this.savePlatforms({ announceErrors: false, forceFlush: nextForceFlush });
          return;
        }
        this.platformSavePendingForceFlush = false;
        this.platformStateDirty = false;
        this.platformStateAutosaveClock = 0;
        // Pull canonical state from server to prevent local/server drift.
        this.requestPlatformState();
      });
      return;
    }
    this.platformStateDirty = false;
    this.platformStateAutosaveClock = 0;
  }

  updatePlatformEditorCount() {
    if (this.platformEditorCountEl) {
      const limit = Math.max(
        OBJECT_EDITOR_MIN_LIMIT,
        Math.trunc(Number(this.objectEditorSettings?.platformLimit) || 0)
      );
      this.platformEditorCountEl.textContent = `발판: ${this.jumpPlatforms.length}/${limit}개`;
    }
  }

  // ── Rope Editor ───────────────────────────────────────────────────────

  setEditorMode(mode) {
    let normalized = mode === "rope" || mode === "obj" ? mode : "platform";
    if (normalized === "obj" && !this.canUseObjectEditor()) {
      normalized = "platform";
    }
    const wasObjMode = this.objEditorActive;
    this.editorMode = normalized;
    this.editorModePlatformBtnEl?.classList.toggle("active", normalized === "platform");
    this.editorModeRopeBtnEl?.classList.toggle("active", normalized === "rope");
    this.editorModeObjBtnEl?.classList.toggle("active", normalized === "obj");

    if (normalized === "obj" && !this.flyModeActive) {
      if (this.canUseObjectEditor()) {
        this.toggleFlyMode();
      }
    }

    if (normalized === "obj" && this.flyModeActive) {
      this.objEditorActive = true;
      this.objEditorDragging = false;
      this.objEditorBarEl?.classList.remove("hidden");
      this.updateObjEditorInfoEl(this.objEditorSelected);
      if (this.platformEditorPreviewMesh) this.platformEditorPreviewMesh.visible = false;
      if (this.ropeEditorPreviewMesh) this.ropeEditorPreviewMesh.visible = false;
      if (document.pointerLockElement === this.renderer.domElement) {
        document.exitPointerLock?.();
      }
      return;
    }

    this.objEditorActive = false;
    this.objEditorDragging = false;
    this.objEditorBarEl?.classList.add("hidden");
    if (wasObjMode) {
      this.saveObjectPositions({ announceErrors: false, forceFlush: true });
    }
    this.clearObjEditorSelection();

    if (this.flyModeActive) {
      if (this.platformEditorPreviewMesh) this.platformEditorPreviewMesh.visible = normalized === "platform";
      if (this.ropeEditorPreviewMesh) this.ropeEditorPreviewMesh.visible = normalized === "rope";
      if (wasObjMode && !this.pointerLocked) {
        this.tryPointerLock();
      }
    }
  }

  updateRopeEditorPreview() {
    if (!this.flyModeActive) return;
    if (!this.ropeEditorPreviewMesh) {
      const geo = new THREE.CylinderGeometry(0.07, 0.07, this.ropeEditorHeight, 8);
      const mat = new THREE.MeshStandardMaterial({
        color: 0xd4a96a,
        emissive: 0xd4a96a,
        emissiveIntensity: 0.5,
        opacity: 0.55,
        transparent: true,
      });
      this.ropeEditorPreviewMesh = new THREE.Mesh(geo, mat);
      this.scene.add(this.ropeEditorPreviewMesh);
    }
    this.ropeEditorPreviewMesh.visible = true;
    // Position: horizontal direction in front of player, bottom at foot level
    const dir = this.editorPreviewDirection;
    this.camera.getWorldDirection(dir);
    dir.y = 0;
    if (dir.lengthSq() < 0.001) dir.set(0, 0, -1);
    dir.normalize();
    const footY = this.playerPosition.y - GAME_CONSTANTS.PLAYER_HEIGHT;
    const px = Math.round((this.playerPosition.x + dir.x * this.platformEditorDist) * 2) / 2;
    const pz = Math.round((this.playerPosition.z + dir.z * this.platformEditorDist) * 2) / 2;
    this.ropeEditorPreviewMesh.position.set(px, footY + this.ropeEditorHeight / 2, pz);
    this.ropeEditorPreviewMesh.rotation.set(0, 0, 0);
  }

  placeRopeAtPreview() {
    if (!this.ropeEditorPreviewMesh) return;
    const ropeLimit = Math.max(
      OBJECT_EDITOR_MIN_LIMIT,
      Math.trunc(Number(this.objectEditorSettings?.ropeLimit) || 0)
    );
    if (this.jumpRopes.length >= ropeLimit) {
      this.appendChatLine("", `줄 최대 개수(${ropeLimit})에 도달했습니다.`, "system");
      return;
    }
    const pos = this.ropeEditorPreviewMesh.position;
    const r = {
      x: pos.x,
      y: pos.y - this.ropeEditorHeight / 2,
      z: pos.z,
      height: this.ropeEditorHeight,
    };
    this.spawnRopeMesh(r);
    this.jumpRopes.push(r);
    this.updateRopeEditorCount();
    this.saveRopes();
  }

  undoLastRope() {
    if (this.jumpRopes.length === 0) return;
    this.jumpRopes.pop();
    const mesh = this.jumpRopeMeshes.pop();
    if (mesh) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    if (this.climbingRope && !this.jumpRopes.includes(this.climbingRope)) {
      this.climbingRope = null;
    }
    this.updateRopeEditorCount();
    this.saveRopes();
  }

  spawnRopeMesh(r) {
    const geo = new THREE.CylinderGeometry(0.07, 0.07, r.height, 8);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xc8a464,
      emissive: 0x7a5c28,
      emissiveIntensity: 0.2,
      roughness: 0.85,
      metalness: 0.0,
    });
    const mesh = new THREE.Mesh(geo, mat);
    // Bottom of rope at r.y, center at r.y + height/2
    mesh.position.set(r.x, r.y + r.height / 2, r.z);
    mesh.castShadow = true;
    this.scene.add(mesh);
    this.jumpRopeMeshes.push(mesh);
  }

  updateRopeProximity(delta = 0) {
    if (this.flyModeActive || !this.canUseGameplayControls()) {
      this.ropeProximityClock = this.ropeProximityInterval;
      this.ropeClimbPromptEl?.classList.add("hidden");
      return;
    }
    this.ropeProximityClock += Math.max(0, Number(delta) || 0);
    if (this.ropeProximityClock < this.ropeProximityInterval) {
      return;
    }
    this.ropeProximityClock = 0;
    const nearRope = this.getNearestClimbableRope();
    if (nearRope && !this.climbingRope) {
      this.ropeClimbPromptEl?.classList.remove("hidden");
    } else {
      this.ropeClimbPromptEl?.classList.add("hidden");
    }
  }

  getNearestClimbableRope() {
    const px = this.playerPosition.x;
    const py = this.playerPosition.y - GAME_CONSTANTS.PLAYER_HEIGHT;
    const pz = this.playerPosition.z;
    for (const r of this.jumpRopes) {
      const dx = Math.abs(px - r.x);
      const dz = Math.abs(pz - r.z);
      if (dx > 0.9 || dz > 0.9) continue;
      if (py < r.y - 0.5 || py > r.y + r.height + 0.5) continue;
      return r;
    }
    return null;
  }

  tryClimbRope() {
    // If already climbing, F = dismount
    if (this.climbingRope) {
      this.climbingRope = null;
      return true;
    }
    const rope = this.getNearestClimbableRope();
    if (!rope) return false;
    this.climbingRope = rope;
    this.verticalVelocity = 0;
    this.onGround = false;
    // Snap X,Z to rope center
    this.playerPosition.x = rope.x;
    this.playerPosition.z = rope.z;
    return true;
  }

  updateClimbing(delta) {
    const r = this.climbingRope;
    if (!r || !this.jumpRopes.includes(r)) {
      this.climbingRope = null;
      return;
    }
    const climbSpeed = 5.5;
    const movement = this.getMovementIntent();
    // W = 위, S = 아래
    const upInput = movement.forward;
    this.playerPosition.y += upInput * climbSpeed * delta;
    // Clamp to rope bounds
    const ropeBottom = r.y + GAME_CONSTANTS.PLAYER_HEIGHT;
    const ropeTop = r.y + r.height + GAME_CONSTANTS.PLAYER_HEIGHT;
    if (this.playerPosition.y <= ropeBottom) {
      this.playerPosition.y = ropeBottom;
      if (upInput < 0) {
        // S키로 바닥까지 내려오면 줄에서 내림
        this.climbingRope = null;
        this.onGround = true;
        this.verticalVelocity = 0;
      }
    } else if (this.playerPosition.y >= ropeTop) {
      this.playerPosition.y = ropeTop;
      this.climbingRope = null;
      this.onGround = false;
    }
    // Lock X,Z to rope
    this.playerPosition.x = r.x;
    this.playerPosition.z = r.z;
    this.verticalVelocity = 0;
    this.camera.position.copy(this.playerPosition);
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
    this.updateBoundaryGuard(delta);
  }

  loadSavedRopes() {
    if (this.socket && this.networkConnected) return;
    try {
      const saved = localStorage.getItem("jumpRopes_v1");
      if (!saved) return;
      const ropes = JSON.parse(saved);
      if (!Array.isArray(ropes)) return;
      for (const r of ropes) {
        if (typeof r.x !== "number") continue;
        this.spawnRopeMesh(r);
        this.jumpRopes.push(r);
      }
      this.updateRopeEditorCount();
    } catch {
      // ignore
    }
  }

  markRopeStateDirty() {
    this.ropeStateDirty = true;
    const interval = Math.max(0.18, Number(this.ropeStateAutosaveInterval) || 0.26);
    this.ropeStateAutosaveClock = Math.min(interval, this.ropeStateAutosaveClock + interval * 0.6);
  }

  updateRopeStateAutosave(delta = 0) {
    if (!this.ropeStateDirty) {
      return;
    }
    if (!(this.socket && this.networkConnected) || !this.hasHostPrivilege()) {
      return;
    }
    this.ropeStateAutosaveClock += Math.max(0, Number(delta) || 0);
    const interval = Math.max(0.18, Number(this.ropeStateAutosaveInterval) || 0.26);
    if (this.ropeStateAutosaveClock < interval) {
      return;
    }
    this.ropeStateAutosaveClock = 0;
    this.saveRopes({ announceErrors: false });
  }

  applyRopeState(rawRopes, { revision = null } = {}) {
    const nextRevision = Math.trunc(Number(revision));
    if (this.ropeStateDirty) {
      if (Number.isFinite(nextRevision) && nextRevision >= 0) {
        if (nextRevision <= this.ropeStateRevision) {
          return;
        }
      } else if (this.ropeSaveInFlight || this.ropeSavePending) {
        return;
      }
    }
    if (Number.isFinite(nextRevision) && nextRevision >= 0) {
      if (nextRevision < this.ropeStateRevision) {
        return;
      }
      this.ropeStateRevision = nextRevision;
    }
    for (const mesh of this.jumpRopeMeshes) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    this.jumpRopes = [];
    this.jumpRopeMeshes = [];
    this.climbingRope = null;
    const ropes = Array.isArray(rawRopes) ? rawRopes : [];
    for (const r of ropes) {
      if (typeof r.x !== "number") continue;
      this.spawnRopeMesh(r);
      this.jumpRopes.push(r);
    }
    this.updateRopeEditorCount();
    if (!this.ropeSaveInFlight && !this.ropeSavePending) {
      this.ropeStateDirty = false;
      this.ropeStateAutosaveClock = 0;
    }
    try {
      localStorage.setItem("jumpRopes_v1", JSON.stringify(this.jumpRopes));
    } catch { /* ignore */ }
  }

  saveRopes({ announceErrors = true, forceFlush = false } = {}) {
    try {
      localStorage.setItem("jumpRopes_v1", JSON.stringify(this.jumpRopes));
    } catch { /* ignore */ }
    if (this.socket && this.networkConnected) {
      if (this.ropeSaveInFlight) {
        this.ropeSavePending = true;
        this.ropeStateDirty = true;
        this.ropeSavePendingForceFlush = this.ropeSavePendingForceFlush || Boolean(forceFlush);
        return;
      }
      if (!this.hasHostPrivilege()) {
        this.ropeSavePending = false;
        this.ropeSavePendingForceFlush = false;
        this.ropeStateDirty = false;
        this.ropeStateAutosaveClock = 0;
        if (announceErrors) {
          this.appendChatLine("", "로프 저장은 방장만 가능합니다.", "system");
        }
        this.requestRopeState();
        return;
      }
      this.ropeSaveInFlight = true;
      this.ropeStateDirty = true;
      this.ropeStateAutosaveClock = 0;
      this.socket.emit("rope:state:set", { ropes: this.jumpRopes, forceFlush: Boolean(forceFlush) }, (res = {}) => {
        this.ropeSaveInFlight = false;
        const ackRevision = Math.trunc(Number(res?.revision));
        if (Number.isFinite(ackRevision) && ackRevision >= 0) {
          this.ropeStateRevision = Math.max(this.ropeStateRevision, ackRevision);
        }
        if (!res?.ok) {
          this.ropeSavePending = false;
          this.ropeSavePendingForceFlush = false;
          this.ropeStateAutosaveClock = 0;
          if (announceErrors) {
            const reason = String(res?.error ?? "").trim() || "unknown";
            this.appendChatLine("", `로프 저장 실패: ${reason}`, "system");
          }
          console.warn("[rope] save rejected:", res?.error);
          this.requestRopeState();
          return;
        }
        if (this.ropeSavePending) {
          const nextForceFlush = this.ropeSavePendingForceFlush;
          this.ropeSavePending = false;
          this.ropeSavePendingForceFlush = false;
          this.saveRopes({ announceErrors: false, forceFlush: nextForceFlush });
          return;
        }
        this.ropeSavePendingForceFlush = false;
        this.ropeStateDirty = false;
        this.ropeStateAutosaveClock = 0;
        this.requestRopeState();
      });
      return;
    }
    this.ropeStateDirty = false;
    this.ropeStateAutosaveClock = 0;
  }

  updateRopeEditorCount() {
    if (this.ropeEditorCountEl) {
      const limit = Math.max(
        OBJECT_EDITOR_MIN_LIMIT,
        Math.trunc(Number(this.objectEditorSettings?.ropeLimit) || 0)
      );
      this.ropeEditorCountEl.textContent = `줄: ${this.jumpRopes.length}/${limit}개`;
    }
  }
}
