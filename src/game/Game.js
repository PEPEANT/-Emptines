import * as THREE from "three";
import { Sky } from "three/addons/objects/Sky.js";
import { EnemyManager } from "./EnemyManager.js";
import { WeaponSystem } from "./WeaponSystem.js";
import { HUD } from "./HUD.js";
import { VoxelWorld } from "./build/VoxelWorld.js";
import { BuildSystem } from "./build/BuildSystem.js";
import { SoundSystem } from "./audio/SoundSystem.js";

const PLAYER_HEIGHT = 1.75;
const DEFAULT_FOV = 75;
const AIM_FOV = 48;
const PLAYER_SPEED = 8.4;
const PLAYER_SPRINT = 12.6;
const PLAYER_GRAVITY = -22;
const JUMP_FORCE = 9.2;
const WORLD_LIMIT = 20000;
const PLAYER_RADIUS = 0.34;
const POINTER_LOCK_FALLBACK_MS = 900;
const MOBILE_LOOK_SENSITIVITY_X = 0.0032;
const MOBILE_LOOK_SENSITIVITY_Y = 0.0028;
const VOID_WORLD_MODE = true;
const ONLINE_ROOM_CODE = "GLOBAL";
const ONLINE_MAX_PLAYERS = 50;
const REMOTE_SYNC_INTERVAL = 1 / 12;
const REMOTE_NAME_TAG_DISTANCE = 72;
const PVP_HIT_SCORE = 10;
const PVP_KILL_SCORE = 100;
const WORLD_PHASE_DECONSTRUCT = "deconstruct";
const WORLD_PHASE_COMBAT = "combat";

function isLikelyTouchDevice() {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }

  const coarse = window.matchMedia?.("(pointer: coarse)")?.matches ?? false;
  const touchPoints = navigator.maxTouchPoints ?? 0;
  const ua = String(navigator.userAgent ?? "").toLowerCase();
  const uaMobile =
    ua.includes("android") ||
    ua.includes("iphone") ||
    ua.includes("ipad") ||
    ua.includes("ipod") ||
    ua.includes("mobile");

  return coarse && (touchPoints > 0 || uaMobile);
}

export class Game {
  constructor(mount, options = {}) {
    this.mount = mount;
    this.clock = new THREE.Clock();
    this.chat = options.chat ?? null;
    const likelyTouchDevice = isLikelyTouchDevice();
    const initialPixelRatio = Math.min(window.devicePixelRatio || 1, 2);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x9fd9ff);
    this.scene.fog = new THREE.Fog(0x9fd9ff, 420, 2600);

    this.camera = new THREE.PerspectiveCamera(
      DEFAULT_FOV,
      window.innerWidth / window.innerHeight,
      0.1,
      500
    );

    this.renderer = new THREE.WebGLRenderer({
      antialias: !likelyTouchDevice,
      powerPreference: "high-performance"
    });
    this.maxPixelRatio = initialPixelRatio;
    this.currentPixelRatio = initialPixelRatio;
    this.renderer.setPixelRatio(this.currentPixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    this.renderer.shadowMap.enabled = !likelyTouchDevice;
    this.renderer.shadowMap.autoUpdate = !likelyTouchDevice;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.mobileEnabled = likelyTouchDevice;

    this.textureLoader = new THREE.TextureLoader();
    this.graphics = this.loadGraphics();
    this.sound = new SoundSystem();

    this.hud = new HUD();
    this.voxelWorld = new VoxelWorld(this.scene, this.textureLoader);
    this.weapon = new WeaponSystem();
    this.enemyManager = new EnemyManager(this.scene, {
      enemyMap: this.graphics.enemyMap,
      muzzleFlashMap: this.graphics.muzzleFlashMap,
      canHitTarget: (from, to) => this.voxelWorld.hasLineOfSight(from, to),
      isBlockedAt: (x, y, z) => this.voxelWorld.hasBlockAtWorld(x, y, z)
    });
    this.raycaster = new THREE.Raycaster();
    this.buildSystem = new BuildSystem({
      world: this.voxelWorld,
      camera: this.camera,
      raycaster: this.raycaster,
      onModeChanged: (mode) => {
        if (mode !== "gun") {
          this.rightMouseAiming = false;
          this.isAiming = false;
          this.handlePrimaryActionUp();
        }
        this.updateVisualMode(mode);
        this.syncMobileUtilityButtons();
        this.syncCursorVisibility();
      },
      onBlockChanged: (change) => this.handleLocalBlockChanged(change),
      onStatus: (text, isAlert = false, duration = 0.5) =>
        this.hud.setStatus(text, isAlert, duration)
    });

    this.playerPosition = new THREE.Vector3(0, PLAYER_HEIGHT, 0);
    this.verticalVelocity = 0;
    this.onGround = true;
    this.yaw = 0;
    this.pitch = 0;
    this.keys = new Set();
    this.moveForwardVec = new THREE.Vector3();
    this.moveRightVec = new THREE.Vector3();
    this.moveVec = new THREE.Vector3();

    this.weaponFlash = null;
    this.weaponFlashLight = null;
    this.weaponView = this.createWeaponView();
    this.shovelView = this.createShovelView();
    this.weaponRecoil = 0;
    this.weaponBobClock = 0;
    this.isAiming = false;
    this.rightMouseAiming = false;
    this.leftMouseDown = false;
    this.aimBlend = 0;
    this.hitSparks = [];
    this.voidWorldMode = VOID_WORLD_MODE;
    this.worldPhase = WORLD_PHASE_DECONSTRUCT;
    this.combatWorldInitialized = false;
    this.deconstructGround = null;
    this.deconstructCharacter = null;
    this.skyDome = null;
    this.skySun = new THREE.Vector3();
    this.sunLight = null;

    this.isRunning = false;
    this.isGameOver = false;
    this.pointerLocked = false;
    this.pointerLockFallbackTimer = null;

    this.state = {
      health: 100,
      score: 0,
      kills: 0,
      captures: 0,
      controlPercent: 0,
      controlOwner: "neutral",
      objectiveText: "Mission: capture enemy flag",
      killStreak: 0,
      lastKillTime: 0
    };

    this._wasReloading = false;
    this.lastDryFireAt = -10;
    this.chatIntroShown = false;
    this.menuMode = "online";
    this.activeMatchMode = "single";

    this.pointerLockSupported =
      "pointerLockElement" in document &&
      typeof this.renderer.domElement.requestPointerLock === "function";
    this.allowUnlockedLook = !this.pointerLockSupported;
    this.mouseLookEnabled = this.allowUnlockedLook;
    this.mobileEnabled = likelyTouchDevice;
    if (this.mobileEnabled) {
      this.allowUnlockedLook = true;
      this.mouseLookEnabled = true;
    }
    this.dynamicResolution = {
      enabled: true,
      minRatio: this.mobileEnabled ? 0.65 : 0.85,
      sampleTime: 0,
      frameCount: 0,
      cooldown: 0
    };

    this.mobileControlsEl = document.getElementById("mobile-controls");
    this.mobileJoystickEl = document.getElementById("mobile-joystick");
    this.mobileJoystickKnobEl = document.getElementById("mobile-joystick-knob");
    this.mobileFireButtonEl = document.getElementById("mobile-fire");
    this.mobileModePlaceBtn = document.getElementById("mobile-mode-place");
    this.mobileModeDigBtn = document.getElementById("mobile-mode-dig");
    this.mobileModeGunBtn = document.getElementById("mobile-mode-gun");
    this.mobileAimBtn = document.getElementById("mobile-aim");
    this.mobileJumpBtn = document.getElementById("mobile-jump");
    this.mobileReloadBtn = document.getElementById("mobile-reload");
    this.mobileState = {
      moveForward: 0,
      moveStrafe: 0,
      stickPointerId: null,
      stickCenterX: 0,
      stickCenterY: 0,
      stickRadius: 46,
      lookPointerId: null,
      lookLastX: 0,
      lookLastY: 0,
      aimPointerId: null
    };
    this._mobileBound = false;

    this.startButton = document.getElementById("start-button");
    this.restartButton = document.getElementById("restart-button");
    this.mpStatusEl = document.getElementById("mp-status");
    this.mpCreateBtn = document.getElementById("mp-create");
    this.mpJoinBtn = document.getElementById("mp-join");
    this.mpStartBtn = document.getElementById("mp-start");
    this.mpRefreshBtn = document.getElementById("mp-refresh");
    this.mpNameInput = document.getElementById("mp-name");
    this.mpCodeInput = document.getElementById("mp-code");
    this.mpRoomListEl = document.getElementById("mp-room-list");
    this.mpLobbyEl = document.getElementById("mp-lobby");
    this.mpRoomTitleEl = document.getElementById("mp-room-title");
    this.mpRoomSubtitleEl = document.getElementById("mp-room-subtitle");
    this.mpPlayerListEl = document.getElementById("mp-player-list");
    this.mpCopyCodeBtn = document.getElementById("mp-copy-code");
    this.mpLeaveBtn = document.getElementById("mp-leave");
    this.mpTeamAlphaBtn = document.getElementById("mp-team-alpha");
    this.mpTeamBravoBtn = document.getElementById("mp-team-bravo");
    this.mpTeamAlphaCountEl = document.getElementById("mp-team-alpha-count");
    this.mpTeamBravoCountEl = document.getElementById("mp-team-bravo-count");
    this.lastAppliedFov = DEFAULT_FOV;
    this._lobbySocketBound = false;
    this._joiningDefaultRoom = false;
    this._nextAutoJoinAt = 0;

    this.lobbyState = {
      roomCode: null,
      hostId: null,
      players: [],
      selectedTeam: null
    };
    this.remotePlayers = new Map();
    this.remoteSyncClock = 0;
    this._toRemote = new THREE.Vector3();
    this._remoteHead = new THREE.Vector3();
    this._pvpBox = new THREE.Box3();
    this._pvpBoxMin = new THREE.Vector3();
    this._pvpBoxMax = new THREE.Vector3();
    this._pvpHitPoint = new THREE.Vector3();

    this.objective = {
      alphaBase: new THREE.Vector3(),
      bravoBase: new THREE.Vector3(),
      alphaFlagHome: new THREE.Vector3(),
      bravoFlagHome: new THREE.Vector3(),
      playerHasEnemyFlag: false,
      controlPoint: new THREE.Vector3(),
      controlRadius: 6.4,
      controlProgress: 0,
      controlOwner: "neutral",
      controlBonusTimer: 0,
      controlStatusCooldown: 0,
      controlPulse: 0
    };
    this.alphaFlag = null;
    this.bravoFlag = null;
    this.controlBeacon = null;
    this.controlRing = null;
    this.controlCore = null;
    this.objectiveMarkers = [];

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
    this.camera.add(this.weaponView);
    this.camera.add(this.shovelView);
    this.setupWorld();
    this.setWorldPhase(WORLD_PHASE_COMBAT);
    this.bindEvents();
    this.setupMobileControls();
    this.resetState();
    this.updateVisualMode(this.buildSystem.getToolMode());

    if (this.chat?.setFocusChangeHandler) {
      this.chat.setFocusChangeHandler((focused) => this.onChatFocusChanged(focused));
    }
    this.setupLobbySocket();
    this.refreshOnlineStatus();

    this.syncCursorVisibility();
    this.loop();
  }

  loadGraphics() {
    const maxAnisotropy = this.renderer.capabilities.getMaxAnisotropy();
    const targetAnisotropy = this.mobileEnabled ? Math.min(4, maxAnisotropy) : maxAnisotropy;

    const configureColorTexture = (url, repeatX = 1, repeatY = 1) => {
      const texture = this.textureLoader.load(url);
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(repeatX, repeatY);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = targetAnisotropy;
      return texture;
    };

    const configureSpriteTexture = (url) => {
      const texture = this.textureLoader.load(url);
      texture.colorSpace = THREE.SRGBColorSpace;
      return texture;
    };

    return {
      groundMap: configureColorTexture("/assets/graphics/world/textures/ground.svg", 420, 420),
      concreteMap: configureColorTexture("/assets/graphics/world/textures/concrete.svg", 1.4, 1.4),
      metalMap: configureColorTexture("/assets/graphics/world/textures/metal.svg", 1.2, 1.2),
      enemyMap: configureColorTexture("/assets/graphics/world/textures/metal.svg", 1, 1),
      muzzleFlashMap: configureSpriteTexture("/assets/graphics/world/sprites/muzzleflash.svg"),
      sparkMap: configureSpriteTexture("/assets/graphics/world/sprites/spark.svg")
    };
  }

  setupWorld() {
    const hemiLight = new THREE.HemisphereLight(0xb9e4ff, 0x7cbf68, 1.28);
    this.scene.add(hemiLight);

    const sun = new THREE.DirectionalLight(0xffffff, 1.36);
    sun.position.set(68, 120, 38);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1536, 1536);
    sun.shadow.camera.left = -280;
    sun.shadow.camera.right = 280;
    sun.shadow.camera.top = 280;
    sun.shadow.camera.bottom = -280;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 420;
    sun.shadow.bias = -0.00018;
    sun.shadow.normalBias = 0.02;
    this.scene.add(sun);
    this.sunLight = sun;
    this.applyQualityProfile();

    const fill = new THREE.DirectionalLight(0xb7e0ff, 0.48);
    fill.position.set(-72, 56, -32);
    this.scene.add(fill);
    this.setupSky({ sunDirection: sun.position.clone().normalize() });
    this.buildDeconstructScaffold();
  }

  applyQualityProfile() {
    const shadowEnabled = !this.mobileEnabled;
    this.renderer.shadowMap.enabled = shadowEnabled;
    this.renderer.shadowMap.autoUpdate = shadowEnabled;

    if (this.sunLight) {
      this.sunLight.castShadow = shadowEnabled;
      const shadowMapSize = this.mobileEnabled ? 1024 : 1536;
      if (
        this.sunLight.shadow.mapSize.x !== shadowMapSize ||
        this.sunLight.shadow.mapSize.y !== shadowMapSize
      ) {
        this.sunLight.shadow.mapSize.set(shadowMapSize, shadowMapSize);
        this.sunLight.shadow.needsUpdate = true;
      }
    }
  }

  setWorldPhase(phase) {
    this.worldPhase = phase === WORLD_PHASE_COMBAT ? WORLD_PHASE_COMBAT : WORLD_PHASE_DECONSTRUCT;
    document.body.classList.toggle("world-mode-combat", this.worldPhase === WORLD_PHASE_COMBAT);
    document.body.classList.toggle(
      "world-mode-deconstruct",
      this.worldPhase === WORLD_PHASE_DECONSTRUCT
    );
  }

  isCombatMode() {
    return this.worldPhase === WORLD_PHASE_COMBAT;
  }

  isDeconstructMode() {
    return this.worldPhase === WORLD_PHASE_DECONSTRUCT;
  }

  getDeconstructFloorY() {
    return PLAYER_HEIGHT;
  }

  clearObjectiveVisuals() {
    for (const marker of this.objectiveMarkers) {
      this.scene.remove(marker);
    }
    this.objectiveMarkers.length = 0;
    this.controlBeacon = null;
    this.controlRing = null;
    this.controlCore = null;

    if (this.alphaFlag) {
      this.scene.remove(this.alphaFlag);
      this.alphaFlag = null;
    }
    if (this.bravoFlag) {
      this.scene.remove(this.bravoFlag);
      this.bravoFlag = null;
    }
  }

  buildDeconstructScaffold() {
    if (!this.deconstructGround) {
      this.deconstructGround = new THREE.Mesh(
        new THREE.PlaneGeometry(160000, 160000, 1, 1),
        new THREE.MeshStandardMaterial({
          color: 0x8ed084,
          map: this.graphics.groundMap,
          roughness: 0.96,
          metalness: 0,
          emissive: 0x1f6a39,
          emissiveIntensity: 0.11
        })
      );
      this.deconstructGround.rotation.x = -Math.PI / 2;
      this.deconstructGround.position.set(0, 0, 0);
      this.deconstructGround.receiveShadow = true;
      this.scene.add(this.deconstructGround);
    } else {
      this.deconstructGround.visible = true;
    }

    if (!this.deconstructCharacter) {
      const group = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.18, 0.62, 4, 8),
        new THREE.MeshStandardMaterial({
          color: 0x5f6d7f,
          emissive: 0x364e67,
          emissiveIntensity: 0.22,
          roughness: 0.45
        })
      );
      body.position.set(0, 0.95, -2.2);
      body.castShadow = true;
      body.receiveShadow = true;

      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.22, 12, 12),
        new THREE.MeshStandardMaterial({
          color: 0x7d8a96,
          emissive: 0x405266,
          emissiveIntensity: 0.26,
          roughness: 0.36
        })
      );
      head.position.set(0, 1.62, -2.2);
      head.castShadow = true;
      head.receiveShadow = true;

      group.add(body, head);
      this.deconstructCharacter = group;
      this.scene.add(this.deconstructCharacter);
    } else {
      this.deconstructCharacter.visible = true;
    }
    this.deconstructCharacter.position.set(0, 0.02, -2.2);
  }

  clearDeconstructScaffold() {
    if (this.voidWorldMode) {
      if (this.deconstructGround) {
        this.deconstructGround.visible = true;
      }
      if (this.deconstructCharacter) {
        this.deconstructCharacter.visible = false;
      }
      return;
    }

    if (this.deconstructGround) {
      this.deconstructGround.visible = false;
    }
    if (this.deconstructCharacter) {
      this.deconstructCharacter.visible = false;
    }
  }

  buildCombatWorld() {
    if (this.voidWorldMode) {
      this.voxelWorld.clear();
      this.buildDeconstructScaffold();
      if (this.deconstructGround) {
        this.deconstructGround.visible = true;
      }
      if (this.deconstructCharacter) {
        this.deconstructCharacter.visible = false;
      }
      this.clearObjectiveVisuals();
      this.state.objectiveText = "VOID FIELD: move and expand.";
      this.state.controlPercent = 0;
      this.state.controlOwner = "neutral";
      this.combatWorldInitialized = true;
      return;
    }

    this.voxelWorld.generateTerrain();
    this.setupObjectives();
    this.combatWorldInitialized = true;
    this.clearDeconstructScaffold();
  }

  clearCombatWorld() {
    this.voxelWorld.clear();
    this.enemyManager.reset();
    this.clearObjectiveVisuals();
    this.clearRemotePlayers();
    this.combatWorldInitialized = false;
  }

  enterDeconstructMode() {
    if (this.voidWorldMode) {
      this.enterCombatMode({ force: true });
      return;
    }

    this.setWorldPhase(WORLD_PHASE_DECONSTRUCT);
    this.clearCombatWorld();
    this.buildDeconstructScaffold();
    this.playerPosition.set(0, this.getDeconstructFloorY(), 0);
    this.verticalVelocity = 0;
    this.onGround = true;
    this.yaw = 0;
    this.pitch = 0;
    this.camera.position.set(0, 0, 0).add(this.playerPosition);
    this.camera.fov = DEFAULT_FOV;
    this.camera.updateProjectionMatrix();
    this.lastAppliedFov = DEFAULT_FOV;
    this.weaponRecoil = 0;
    this.aimBlend = 0;
    this.weaponBobClock = 0;
    this.weaponView.visible = false;
    this.shovelView.visible = false;
    if (this.weaponFlashLight) {
      this.weaponFlashLight.intensity = 0;
    }
    if (this.weaponFlash) {
      this.weaponFlash.material.opacity = 0;
    }
    this.hud.showDeconstructOverlay(true);
    this.hud.setStatus("World has been reduced to one signal field.", false, 8);
    this.state.objectiveText = "Phase: deconstruction";
    this.updateVisualMode("gun");
  }

  enterCombatMode(options = {}) {
    const force = options.force === true;
    if (this.isCombatMode() && !force) {
      return;
    }

    this.setWorldPhase(WORLD_PHASE_COMBAT);
    this.hud.showDeconstructOverlay(false);
    if (!this.combatWorldInitialized) {
      this.buildCombatWorld();
    }
    this.weaponView.visible = false;
    this.shovelView.visible = true;
    this.weaponRecoil = 0;
    this.aimBlend = 0;
    this.lastAppliedFov = DEFAULT_FOV;
    this.camera.fov = DEFAULT_FOV;
    this.camera.updateProjectionMatrix();

    if (this.activeMatchMode === "online") {
      this.setOnlineSpawnFromLobby();
      this.syncRemotePlayersFromLobby();
      this.emitLocalPlayerSync(REMOTE_SYNC_INTERVAL, true);
      this.hud.setStatus("Void world online", false, 0.8);
    } else {
      const spawnY = this.voxelWorld.getSurfaceYAt(0, 0);
      this.playerPosition.set(0, (spawnY ?? 0) + PLAYER_HEIGHT, 0);
      this.yaw = 0;
      this.pitch = 0;
    }

    this.camera.position.copy(this.playerPosition);
    this.onGround = true;
    this.verticalVelocity = 0;
    this.camera.rotation.order = "YXZ";
  }

  setupSky(options = {}) {
    if (this.skyDome) {
      const oldMaterial = this.skyDome.material;
      const oldGeometry = this.skyDome.geometry;
      this.scene.remove(this.skyDome);
      oldGeometry?.dispose?.();
      if (Array.isArray(oldMaterial)) {
        for (const material of oldMaterial) {
          material?.dispose?.();
        }
      } else {
        oldMaterial?.dispose?.();
      }
      this.skyDome = null;
    }

    const sky = new Sky();
    sky.scale.setScalar(450000);
    const uniforms = sky.material.uniforms;
    uniforms.turbidity.value = 3.1;
    uniforms.rayleigh.value = 2.4;
    uniforms.mieCoefficient.value = 0.005;
    uniforms.mieDirectionalG.value = 0.79;

    const sunDirection = options.sunDirection ?? new THREE.Vector3(0.35, 0.8, 0.22).normalize();
    this.skySun.copy(sunDirection).multiplyScalar(450000);
    uniforms.sunPosition.value.copy(this.skySun);

    this.skyDome = sky;
    this.scene.add(this.skyDome);
  }

  setupObjectives() {
    this.clearObjectiveVisuals();

    const arena = this.voxelWorld.getArenaMeta?.() ?? {
      alphaBase: { x: -42, z: 0 },
      bravoBase: { x: 42, z: 0 },
      alphaFlag: { x: -42, z: 0 },
      bravoFlag: { x: 42, z: 0 },
      mid: { x: 0, z: 0 }
    };

    const alphaY = this.voxelWorld.getSurfaceYAt(arena.alphaBase.x, arena.alphaBase.z) ?? 0;
    const bravoY = this.voxelWorld.getSurfaceYAt(arena.bravoBase.x, arena.bravoBase.z) ?? 0;
    const midY = this.voxelWorld.getSurfaceYAt(arena.mid.x, arena.mid.z) ?? 0;

    this.objective.alphaBase.set(arena.alphaBase.x, alphaY, arena.alphaBase.z);
    this.objective.bravoBase.set(arena.bravoBase.x, bravoY, arena.bravoBase.z);
    this.objective.alphaFlagHome.set(arena.alphaFlag.x, alphaY, arena.alphaFlag.z);
    this.objective.bravoFlagHome.set(arena.bravoFlag.x, bravoY, arena.bravoFlag.z);
    this.objective.controlPoint.set(arena.mid.x, midY, arena.mid.z);
    this.objective.playerHasEnemyFlag = false;
    this.objective.controlProgress = 0;
    this.objective.controlOwner = "neutral";
    this.objective.controlBonusTimer = 0;
    this.objective.controlStatusCooldown = 0;
    this.objective.controlPulse = 0;
    this.state.controlPercent = 0;
    this.state.controlOwner = "neutral";

    this.alphaFlag = this.createFlagMesh(0x6fbeff, 0xb7e9ff);
    this.alphaFlag.position.copy(this.objective.alphaFlagHome);
    this.scene.add(this.alphaFlag);

    this.bravoFlag = this.createFlagMesh(0xff7d6a, 0xffc8ba);
    this.bravoFlag.position.copy(this.objective.bravoFlagHome);
    this.scene.add(this.bravoFlag);

    const alphaBeacon = this.createBaseMarker(this.objective.alphaBase, 0x5db2ff);
    const bravoBeacon = this.createBaseMarker(this.objective.bravoBase, 0xff7b66);
    const controlBeacon = this.createControlBeacon(this.objective.controlPoint);
    this.controlBeacon = controlBeacon;
    this.controlRing = controlBeacon.userData.ring ?? null;
    this.controlCore = controlBeacon.userData.core ?? null;
    this.objectiveMarkers.push(alphaBeacon, bravoBeacon, controlBeacon);
    this.scene.add(alphaBeacon, bravoBeacon, controlBeacon);
    this.applyControlVisual(0);
    this.state.objectiveText = this.getObjectiveText();
  }

  createBaseMarker(position, color) {
    const group = new THREE.Group();

    const ring = new THREE.Mesh(
      new THREE.CylinderGeometry(2.7, 2.7, 0.08, 24),
      new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.32,
        roughness: 0.52,
        metalness: 0.24,
        transparent: true,
        opacity: 0.9
      })
    );
    ring.position.set(position.x, position.y + 0.04, position.z);
    ring.receiveShadow = true;

    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 2.3, 10),
      new THREE.MeshStandardMaterial({
        color: 0xd8e8ff,
        roughness: 0.3,
        metalness: 0.7
      })
    );
    pole.position.set(position.x, position.y + 1.15, position.z);
    pole.castShadow = true;

    group.add(ring, pole);
    return group;
  }

  createFlagMesh(poleColor, flagColor) {
    const group = new THREE.Group();

    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.045, 2.4, 12),
      new THREE.MeshStandardMaterial({
        color: poleColor,
        roughness: 0.35,
        metalness: 0.58
      })
    );
    pole.position.y = 1.2;
    pole.castShadow = true;

    const cloth = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.82, 0.04),
      new THREE.MeshStandardMaterial({
        color: flagColor,
        emissive: flagColor,
        emissiveIntensity: 0.15,
        roughness: 0.48,
        metalness: 0.1
      })
    );
    cloth.position.set(0.2, 1.72, 0);
    cloth.castShadow = true;

    const tip = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 10, 10),
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xaad9ff,
        emissiveIntensity: 0.22
      })
    );
    tip.position.y = 2.42;
    tip.castShadow = true;

    group.add(pole, cloth, tip);
    return group;
  }

  createControlBeacon(position) {
    const group = new THREE.Group();
    group.position.set(position.x, position.y, position.z);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(2.25, 0.14, 16, 36),
      new THREE.MeshStandardMaterial({
        color: 0x96deff,
        emissive: 0x96deff,
        emissiveIntensity: 0.26,
        roughness: 0.34,
        metalness: 0.62,
        transparent: true,
        opacity: 0.74
      })
    );
    ring.rotation.x = Math.PI * 0.5;
    ring.position.y = 0.2;
    ring.castShadow = false;
    ring.receiveShadow = true;

    const core = new THREE.Mesh(
      new THREE.CylinderGeometry(0.36, 0.42, 3.0, 18),
      new THREE.MeshStandardMaterial({
        color: 0xbceaff,
        emissive: 0x9ad7ff,
        emissiveIntensity: 0.28,
        roughness: 0.2,
        metalness: 0.72
      })
    );
    core.position.y = 1.5;
    core.castShadow = true;

    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 16, 16),
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xc7ecff,
        emissiveIntensity: 0.35
      })
    );
    cap.position.y = 3.06;
    cap.castShadow = true;

    group.add(ring, core, cap);
    group.userData.ring = ring;
    group.userData.core = core;
    return group;
  }

  applyControlVisual(pulse = 0) {
    if (!this.controlRing || !this.controlCore) {
      return;
    }

    const owner = this.objective.controlOwner;
    const progress = this.objective.controlProgress;
    const isAlpha = owner === "alpha";
    const baseColor = isAlpha ? 0x62b7ff : 0x96deff;
    const coreColor = isAlpha ? 0xc4e9ff : 0xbceaff;

    this.controlRing.material.color.setHex(baseColor);
    this.controlRing.material.emissive.setHex(baseColor);
    this.controlRing.material.opacity = THREE.MathUtils.clamp(
      0.52 + progress * 0.32 + pulse * 0.12,
      0.42,
      0.96
    );
    this.controlRing.material.emissiveIntensity = 0.2 + progress * 0.34 + pulse * 0.14;
    this.controlRing.scale.setScalar(1 + progress * 0.22 + pulse * 0.05);

    this.controlCore.material.color.setHex(coreColor);
    this.controlCore.material.emissive.setHex(baseColor);
    this.controlCore.material.emissiveIntensity = 0.2 + progress * 0.26 + pulse * 0.22;
    this.controlCore.scale.y = 0.86 + progress * 0.42;
  }

  getObjectiveText() {
    if (this.objective.playerHasEnemyFlag) {
      return "\uBAA9\uD45C: \uC544\uAD70 \uAC70\uC810\uC73C\uB85C \uBCF5\uADC0\uD558\uC138\uC694";
    }

    if (this.objective.controlOwner === "alpha") {
      return "\uBAA9\uD45C: \uC801 \uAE43\uBC1C \uD0C8\uCDE8 (\uC911\uC559 \uAC70\uC810 \uD655\uBCF4)";
    }

    const controlPercent = Math.round(this.objective.controlProgress * 100);
    if (controlPercent > 0) {
      return "\uBAA9\uD45C: \uC801 \uAE43\uBC1C \uD0C8\uCDE8 \uB610\uB294 \uC911\uC559 \uAC70\uC810 \uC810\uB839 " + controlPercent + "%";
    }

    return "\uBAA9\uD45C: \uC801 \uAE43\uBC1C\uC744 \uD655\uBCF4\uD558\uAC70\uB098 \uC911\uC559 \uAC70\uC810\uC744 \uC810\uB839\uD558\uC138\uC694";
  }

  resetObjectives() {
    this.objective.playerHasEnemyFlag = false;
    this.objective.controlProgress = 0;
    this.objective.controlOwner = "neutral";
    this.objective.controlBonusTimer = 0;
    this.objective.controlStatusCooldown = 0;
    this.objective.controlPulse = 0;
    this.state.controlPercent = 0;
    this.state.controlOwner = "neutral";
    this.state.objectiveText = this.voidWorldMode
      ? "VOID FIELD: move and expand."
      : this.getObjectiveText();
    this.applyControlVisual(0);

    if (this.alphaFlag) {
      this.alphaFlag.visible = true;
      this.alphaFlag.position.copy(this.objective.alphaFlagHome);
    }
    if (this.bravoFlag) {
      this.bravoFlag.visible = true;
      this.bravoFlag.position.copy(this.objective.bravoFlagHome);
    }
  }

  distanceXZ(from, to) {
    const dx = from.x - to.x;
    const dz = from.z - to.z;
    return Math.hypot(dx, dz);
  }

  updateObjectives(delta) {
    if (this.voidWorldMode || !this.isRunning || this.isGameOver || !this.bravoFlag) {
      return;
    }

    if (!this.objective.playerHasEnemyFlag) {
      const nearEnemyFlag = this.distanceXZ(this.playerPosition, this.objective.bravoFlagHome) <= 2.25;
      if (nearEnemyFlag) {
        this.objective.playerHasEnemyFlag = true;
        this.bravoFlag.visible = false;
        this.state.objectiveText = this.getObjectiveText();
        this.hud.setStatus(
          "\uC801 \uAE43\uBC1C \uD655\uBCF4! \uC544\uAD70 \uAC70\uC810\uC73C\uB85C \uBCF5\uADC0",
          false,
          1.2
        );
        this.addChatMessage(
          "\uC801 \uAE43\uBC1C\uC744 \uD655\uBCF4\uD588\uC2B5\uB2C8\uB2E4.",
          "info"
        );
      }
    } else {
      const reachedHome = this.distanceXZ(this.playerPosition, this.objective.alphaBase) <= 3.1;
      if (reachedHome) {
        this.objective.playerHasEnemyFlag = false;
        this.state.captures += 1;
        this.state.score += 500;
        this.state.health = Math.min(100, this.state.health + 20);

        this.bravoFlag.visible = true;
        this.bravoFlag.position.copy(this.objective.bravoFlagHome);

        this.enemyManager.maxEnemies = Math.min(36, this.enemyManager.maxEnemies + 1);
        this.hud.setStatus(
          "\uAE43\uBC1C \uD0C8\uCDE8 \uC131\uACF5 +500 (\uCD1D " + this.state.captures + "\uD68C)",
          false,
          1.3
        );
        this.addChatMessage(
          "\uAE43\uBC1C \uD0C8\uCDE8 \uC131\uACF5 (" + this.state.captures + "\uD68C)",
          "kill"
        );
      }
    }

    this.objective.controlStatusCooldown = Math.max(0, this.objective.controlStatusCooldown - delta);

    const controlRadius = this.objective.controlRadius;
    const playerInControl = this.distanceXZ(this.playerPosition, this.objective.controlPoint) <= controlRadius;
    const enemiesInControl = this.enemyManager.countEnemiesNear(
      this.objective.controlPoint,
      controlRadius + 1.25
    );

    let controlProgress = this.objective.controlProgress;
    if (playerInControl && enemiesInControl === 0) {
      controlProgress = Math.min(1, controlProgress + delta / 5.4);
    } else if (!playerInControl && enemiesInControl > 0) {
      const pressure = Math.min(0.5, enemiesInControl * 0.07);
      controlProgress = Math.max(0, controlProgress - delta * (0.22 + pressure));
    } else if (playerInControl && enemiesInControl > 0) {
      controlProgress = Math.max(0, controlProgress - delta * Math.min(0.2, enemiesInControl * 0.04));
      if (this.objective.controlStatusCooldown <= 0) {
        this.hud.setStatus("\uC911\uC559 \uAC70\uC810 \uAD50\uC804 \uC911", true, 0.42);
        this.objective.controlStatusCooldown = 1.8;
      }
    } else if (this.objective.controlOwner === "alpha") {
      controlProgress = Math.max(0.68, controlProgress - delta * 0.014);
    } else {
      controlProgress = Math.max(0, controlProgress - delta * 0.05);
    }

    const prevOwner = this.objective.controlOwner;
    if (controlProgress >= 1 && prevOwner !== "alpha") {
      this.objective.controlOwner = "alpha";
      this.objective.controlBonusTimer = 0;
      this.state.score += 150;
      this.state.health = Math.min(100, this.state.health + 8);
      this.hud.setStatus("\uC911\uC559 \uAC70\uC810 \uD655\uBCF4 +150", false, 1.1);
      this.addChatMessage("\uC911\uC559 \uAC70\uC810\uC744 \uD655\uBCF4\uD588\uC2B5\uB2C8\uB2E4.", "info");
    } else if (
      controlProgress <= 0.02 &&
      prevOwner === "alpha" &&
      !playerInControl &&
      enemiesInControl > 0
    ) {
      this.objective.controlOwner = "neutral";
      this.objective.controlBonusTimer = 0;
      this.hud.setStatus("\uC911\uC559 \uAC70\uC810 \uC0C1\uC2E4", true, 1);
      this.addChatMessage("??????????겸뵛??????????????????????거??????輿????????????耀붾굝?????????????", "warning");
    }

    this.objective.controlProgress = controlProgress;
    this.state.controlPercent = Math.round(controlProgress * 100);
    this.state.controlOwner = this.objective.controlOwner;

    if (this.objective.controlOwner === "alpha") {
      this.objective.controlBonusTimer += delta;
      while (this.objective.controlBonusTimer >= 8) {
        this.objective.controlBonusTimer -= 8;
        this.state.score += 40;
        this.weapon.reserve = Math.min(this.weapon.defaultReserve * 4, this.weapon.reserve + 6);
        if (playerInControl) {
          this.state.health = Math.min(100, this.state.health + 2);
        }
      }
    } else {
      this.objective.controlBonusTimer = 0;
    }

    this.objective.controlPulse += delta * (2.4 + controlProgress * 2);
    const pulse = (Math.sin(this.objective.controlPulse) + 1) * 0.5;
    if (this.controlBeacon) {
      this.controlBeacon.rotation.y += delta * 0.4;
    }

    this.applyControlVisual(pulse);
    this.state.objectiveText = this.getObjectiveText();
  }

  createWeaponView() {
    const group = new THREE.Group();

    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0x5f8da6,
      roughness: 0.35,
      metalness: 0.7
    });
    const gripMaterial = new THREE.MeshStandardMaterial({
      color: 0x1c2f3d,
      roughness: 0.65,
      metalness: 0.18
    });
    const accentMaterial = new THREE.MeshStandardMaterial({
      color: 0xb4efff,
      roughness: 0.2,
      metalness: 0.58,
      emissive: 0x4af5f5,
      emissiveIntensity: 0.45
    });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.2, 0.72), bodyMaterial);
    body.castShadow = true;
    body.position.set(0, 0, -0.1);

    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.052, 0.052, 0.62, 14),
      bodyMaterial
    );
    barrel.rotation.x = Math.PI * 0.5;
    barrel.position.set(0.02, 0.03, -0.52);

    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.24, 0.16), gripMaterial);
    grip.rotation.x = -0.28;
    grip.position.set(-0.02, -0.2, 0.08);

    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 0.2), accentMaterial);
    rail.position.set(0.01, 0.11, -0.12);

    const muzzleFlash = new THREE.Mesh(
      new THREE.PlaneGeometry(0.18, 0.18),
      new THREE.MeshBasicMaterial({
        map: this.graphics.muzzleFlashMap,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    muzzleFlash.rotation.y = Math.PI;
    muzzleFlash.position.set(0.02, 0.03, -0.84);

    const muzzleLight = new THREE.PointLight(0xffd8a8, 0, 4.4, 2.2);
    muzzleLight.position.set(0.02, 0.03, -0.78);

    group.add(body, barrel, grip, rail, muzzleFlash, muzzleLight);
    group.position.set(0.38, -0.38, -0.76);
    group.rotation.set(-0.22, -0.06, 0.02);

    this.weaponFlash = muzzleFlash;
    this.weaponFlashLight = muzzleLight;
    return group;
  }

  createShovelView() {
    const group = new THREE.Group();

    const skinMaterial = new THREE.MeshStandardMaterial({
      color: 0xf0c9a8,
      roughness: 0.68,
      metalness: 0.02
    });
    const sleeveMaterial = new THREE.MeshStandardMaterial({
      color: 0x33495f,
      roughness: 0.72,
      metalness: 0.08
    });

    const rightPalm = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 12, 10),
      skinMaterial
    );
    rightPalm.scale.set(1, 0.82, 1.2);
    rightPalm.position.set(0.3, -0.23, -0.54);
    rightPalm.castShadow = true;

    const rightSleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.22, 4, 8), sleeveMaterial);
    rightSleeve.rotation.z = -0.42;
    rightSleeve.position.set(0.37, -0.28, -0.46);
    rightSleeve.castShadow = true;

    const leftPalm = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 12, 10),
      skinMaterial
    );
    leftPalm.scale.set(1, 0.84, 1.2);
    leftPalm.position.set(0.12, -0.29, -0.5);
    leftPalm.castShadow = true;

    const leftSleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.2, 4, 8), sleeveMaterial);
    leftSleeve.rotation.z = -0.16;
    leftSleeve.position.set(0.17, -0.34, -0.42);
    leftSleeve.castShadow = true;

    group.add(rightSleeve, rightPalm, leftSleeve, leftPalm);
    group.position.set(0.18, -0.1, -0.06);
    group.rotation.set(-0.05, -0.12, 0.02);
    group.visible = true;
    return group;
  }

  getMySocketId() {
    return this.chat?.socket?.id ?? "";
  }

  getMyTeam() {
    const myId = this.getMySocketId();
    const fromLobby = this.lobbyState.players.find((player) => String(player?.id ?? "") === myId);
    const team = fromLobby?.team ?? this.lobbyState.selectedTeam ?? null;
    return team === "alpha" || team === "bravo" ? team : null;
  }

  isEnemyTeam(team) {
    const myTeam = this.getMyTeam();
    return Boolean(myTeam && team && team !== myTeam);
  }

  getTeamColor(team) {
    if (team === "alpha") {
      return 0x63b9ff;
    }
    if (team === "bravo") {
      return 0xff7d67;
    }
    return 0x88a3b8;
  }

  createRemoteNameTag(name, team) {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    const safeName = String(name ?? "PLAYER").slice(0, 16);
    const teamLabel = team === "alpha" ? "ALPHA" : team === "bravo" ? "BRAVO" : "NEUTRAL";
    const displayName = `[${teamLabel}] ${safeName}`;

    if (ctx) {
      const teamColor = this.getTeamColor(team);
      const r = (teamColor >> 16) & 0xff;
      const g = (teamColor >> 8) & 0xff;
      const b = teamColor & 0xff;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "rgba(8, 14, 23, 0.72)";
      ctx.fillRect(12, 24, canvas.width - 24, 80);
      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.95)`;
      ctx.lineWidth = 4;
      ctx.strokeRect(12, 24, canvas.width - 24, 80);
      ctx.font = "700 46px Segoe UI, Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(225, 242, 255, 0.98)";
      ctx.fillText(displayName, canvas.width * 0.5, canvas.height * 0.5 + 2);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;

    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      depthTest: false
    });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(2.9, 0.72, 1);
    sprite.renderOrder = 6;
    return sprite;
  }

  createRemotePlayer(player = {}) {
    const team = player.team ?? null;
    const color = this.getTeamColor(team);
    const group = new THREE.Group();
    group.visible = true;

    const bodyMaterial = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.48,
      metalness: 0.26,
      emissive: 0x0f2030,
      emissiveIntensity: 0.35
    });
    const headMaterial = new THREE.MeshStandardMaterial({
      color: 0xffc29f,
      roughness: 0.6,
      metalness: 0.05
    });
    const detailMaterial = new THREE.MeshStandardMaterial({
      color: 0x1b2a38,
      roughness: 0.4,
      metalness: 0.56
    });

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.96, 0.34), bodyMaterial);
    torso.position.y = 1.15;
    torso.castShadow = true;
    torso.receiveShadow = true;

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), headMaterial);
    head.position.y = 1.85;
    head.castShadow = true;
    head.receiveShadow = true;

    const heldItem = this.voidWorldMode
      ? new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 10), detailMaterial)
      : new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.72), detailMaterial);
    heldItem.position.set(0, 1.42, -0.48);
    heldItem.castShadow = true;

    const nameTag = this.createRemoteNameTag(player.name, team);
    nameTag.position.set(0, 2.45, 0);

    group.add(torso, head, heldItem, nameTag);
    this.scene.add(group);

    return {
      id: String(player.id ?? ""),
      name: String(player.name ?? "PLAYER"),
      team,
      group,
      nameTag,
      bodyMaterial,
      headMaterial,
      detailMaterial,
      targetPosition: new THREE.Vector3(),
      targetYaw: 0,
      yaw: 0
    };
  }

  updateRemoteVisual(remote, { name, team }) {
    const nextName = String(name ?? remote.name ?? "PLAYER");
    const nextTeam = team ?? null;
    const teamChanged = remote.team !== nextTeam;
    const nameChanged = remote.name !== nextName;
    if (!teamChanged && !nameChanged) {
      return;
    }

    remote.name = nextName;
    remote.team = nextTeam;
    remote.bodyMaterial.color.setHex(this.getTeamColor(nextTeam));

    if (remote.nameTag) {
      remote.group.remove(remote.nameTag);
      remote.nameTag.material.map?.dispose();
      remote.nameTag.material.dispose();
    }
    remote.nameTag = this.createRemoteNameTag(remote.name, remote.team);
    remote.nameTag.position.set(0, 2.45, 0);
    remote.group.add(remote.nameTag);
  }

  ensureRemotePlayer(player) {
    const id = String(player?.id ?? "");
    if (!id) {
      return null;
    }

    let remote = this.remotePlayers.get(id);
    if (!remote) {
      remote = this.createRemotePlayer(player);
      this.remotePlayers.set(id, remote);
    } else {
      this.updateRemoteVisual(remote, player);
    }
    return remote;
  }

  removeRemotePlayer(id) {
    const key = String(id ?? "");
    if (!key) {
      return;
    }

    const remote = this.remotePlayers.get(key);
    if (!remote) {
      return;
    }

    this.scene.remove(remote.group);
    remote.group.traverse((child) => {
      if (child.isMesh) {
        child.geometry?.dispose?.();
      }
    });
    remote.nameTag?.material?.map?.dispose?.();
    remote.nameTag?.material?.dispose?.();
    remote.bodyMaterial.dispose();
    remote.headMaterial.dispose();
    remote.detailMaterial.dispose();
    this.remotePlayers.delete(key);
  }

  clearRemotePlayers() {
    for (const id of this.remotePlayers.keys()) {
      this.removeRemotePlayer(id);
    }
  }

  applyRemoteState(remote, state, snap = false) {
    if (!remote || !state) {
      return;
    }

    const x = Number(state.x);
    const y = Number(state.y);
    const z = Number(state.z);
    const yaw = Number(state.yaw);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      return;
    }

    remote.targetPosition.set(x, y - PLAYER_HEIGHT, z);
    remote.targetYaw = Number.isFinite(yaw) ? yaw : 0;

    if (snap) {
      remote.group.position.copy(remote.targetPosition);
      remote.yaw = remote.targetYaw;
      remote.group.rotation.y = remote.yaw;
    }
  }

  syncRemotePlayersFromLobby() {
    if (this.activeMatchMode !== "online") {
      this.clearRemotePlayers();
      return;
    }

    const myId = this.getMySocketId();
    const players = Array.isArray(this.lobbyState.players) ? this.lobbyState.players : [];
    const liveIds = new Set();

    for (const player of players) {
      const id = String(player?.id ?? "");
      if (!id || id === myId) {
        continue;
      }

      liveIds.add(id);
      const remote = this.ensureRemotePlayer(player);
      if (!remote) {
        continue;
      }
      if (player.state) {
        this.applyRemoteState(remote, player.state, true);
      }
    }

    for (const id of this.remotePlayers.keys()) {
      if (!liveIds.has(id)) {
        this.removeRemotePlayer(id);
      }
    }
  }

  handleRemotePlayerSync(payload = {}) {
    const id = String(payload.id ?? "");
    if (!id || id === this.getMySocketId()) {
      return;
    }

    const remote = this.ensureRemotePlayer({
      id,
      name: payload.name ?? "PLAYER",
      team: payload.team ?? null
    });
    if (!remote) {
      return;
    }

    this.applyRemoteState(remote, payload.state, false);
  }

  updateRemotePlayers(delta) {
    if (this.activeMatchMode !== "online" || this.remotePlayers.size === 0) {
      return;
    }

    const smooth = THREE.MathUtils.clamp(delta * 11, 0.08, 0.92);

    for (const remote of this.remotePlayers.values()) {
      remote.group.position.lerp(remote.targetPosition, smooth);
      const yawDiff = Math.atan2(
        Math.sin(remote.targetYaw - remote.yaw),
        Math.cos(remote.targetYaw - remote.yaw)
      );
      remote.yaw += yawDiff * smooth;
      remote.group.rotation.y = remote.yaw;

      this._remoteHead.copy(remote.group.position);
      this._remoteHead.y += PLAYER_HEIGHT + 0.72;
      this._toRemote.copy(this._remoteHead).sub(this.camera.position);
      const distance = this._toRemote.length();

      if (remote.nameTag) {
        const hideEnemyName = this.isEnemyTeam(remote.team);
        remote.nameTag.visible = !hideEnemyName && distance <= REMOTE_NAME_TAG_DISTANCE;
      }
    }
  }

  setOnlineSpawnFromLobby() {
    if (this.activeMatchMode !== "online") {
      return;
    }

    const myId = this.getMySocketId();
    const players = Array.isArray(this.lobbyState.players) ? this.lobbyState.players : [];
    const me = players.find((player) => String(player?.id ?? "") === myId) ?? null;
    const team = me?.team ?? null;

    let seed = 0;
    for (const ch of String(myId || "offline")) {
      seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
    }
    const angle = ((seed % 360) * Math.PI) / 180;

    let anchorX = 0;
    let anchorZ = 0;
    let faceYaw = 0;
    let ring = 2.8 + ((seed >> 8) % 5) * 0.55;

    if (this.voidWorldMode) {
      if (team === "alpha") {
        anchorX = -68;
        faceYaw = -Math.PI * 0.35;
      } else if (team === "bravo") {
        anchorX = 68;
        faceYaw = Math.PI * 0.35;
      } else {
        const leftSide = (seed & 1) === 0;
        anchorX = leftSide ? -38 : 38;
        faceYaw = leftSide ? -Math.PI * 0.28 : Math.PI * 0.28;
      }
      anchorZ = ((seed >> 5) % 41) - 20;
      ring = 12 + ((seed >> 9) % 17);
    } else if (team === "alpha") {
      anchorX = this.objective.alphaBase.x;
      anchorZ = this.objective.alphaBase.z;
      faceYaw = -Math.PI * 0.5;
    } else if (team === "bravo") {
      anchorX = this.objective.bravoBase.x;
      anchorZ = this.objective.bravoBase.z;
      faceYaw = Math.PI * 0.5;
    } else {
      const leftSide = (seed & 1) === 0;
      anchorX = leftSide ? this.objective.alphaBase.x + 4 : this.objective.bravoBase.x - 4;
      anchorZ = 0;
      faceYaw = leftSide ? -Math.PI * 0.4 : Math.PI * 0.4;
    }

    const spawnX = anchorX + Math.cos(angle) * ring;
    const spawnZ = anchorZ + Math.sin(angle) * ring;
    const spawnY = (this.voxelWorld.getSurfaceYAt(spawnX, spawnZ) ?? 0) + PLAYER_HEIGHT;

    this.playerPosition.set(spawnX, spawnY, spawnZ);
    this.verticalVelocity = 0;
    this.onGround = true;
    this.yaw = faceYaw;
    this.pitch = 0;
    this.camera.position.copy(this.playerPosition);
    this.camera.rotation.order = "YXZ";
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
  }

  emitLocalPlayerSync(delta, force = false) {
    if (this.activeMatchMode !== "online" || !this.isRunning || this.isGameOver) {
      return;
    }

    const socket = this.chat?.socket;
    if (!socket?.connected || !this.lobbyState.roomCode) {
      return;
    }

    this.remoteSyncClock += delta;
    if (!force && this.remoteSyncClock < REMOTE_SYNC_INTERVAL) {
      return;
    }
    this.remoteSyncClock = 0;

    socket.emit("player:sync", {
      x: Number(this.playerPosition.x.toFixed(3)),
      y: Number(this.playerPosition.y.toFixed(3)),
      z: Number(this.playerPosition.z.toFixed(3)),
      yaw: Number(this.yaw.toFixed(4)),
      pitch: Number(this.pitch.toFixed(4))
    });
  }

  findOnlineShotTarget(maxDistance) {
    if (this.activeMatchMode !== "online" || this.remotePlayers.size === 0) {
      return null;
    }

    const myTeam = this.getMyTeam();
    if (!myTeam) {
      return null;
    }

    let best = null;
    let bestDistance = Number.isFinite(maxDistance) ? maxDistance : Infinity;

    for (const remote of this.remotePlayers.values()) {
      if (!this.isEnemyTeam(remote.team)) {
        continue;
      }

      const base = remote.group.position;
      this._pvpBoxMin.set(base.x - 0.38, base.y + 0.02, base.z - 0.38);
      this._pvpBoxMax.set(base.x + 0.38, base.y + PLAYER_HEIGHT + 0.28, base.z + 0.38);
      this._pvpBox.set(this._pvpBoxMin, this._pvpBoxMax);

      const hitPoint = this.raycaster.ray.intersectBox(this._pvpBox, this._pvpHitPoint);
      if (!hitPoint) {
        continue;
      }

      const distance = hitPoint.distanceTo(this.camera.position);
      if (distance > bestDistance) {
        continue;
      }

      bestDistance = distance;
      best = {
        id: remote.id,
        distance,
        point: hitPoint.clone()
      };
    }

    return best;
  }

  emitPvpShot(targetId) {
    if (!targetId || this.activeMatchMode !== "online") {
      return;
    }

    const socket = this.chat?.socket;
    if (!socket?.connected || !this.lobbyState.roomCode) {
      return;
    }

    socket.emit("pvp:shoot", { targetId });
  }

  handlePvpDamage(payload = {}) {
    if (this.activeMatchMode !== "online") {
      return;
    }

    const attackerId = String(payload.attackerId ?? "");
    const victimId = String(payload.victimId ?? "");
    const damage = Math.max(0, Number(payload.damage ?? 0));
    const killed = Boolean(payload.killed);
    const victimHealth = Number(payload.victimHealth);
    const myId = this.getMySocketId();

    if (!myId) {
      return;
    }

    if (attackerId === myId) {
      if (killed) {
        this.state.kills += 1;
        this.state.score += PVP_KILL_SCORE;
        this.hud.pulseHitmarker();
        this.hud.setStatus(`+${PVP_KILL_SCORE} 처치`, false, 0.55);

        const now = this.clock.getElapsedTime();
        if (now - this.state.lastKillTime < 4.0) {
          this.state.killStreak += 1;
        } else {
          this.state.killStreak = 1;
        }
        this.state.lastKillTime = now;
        this.hud.setKillStreak(this.state.killStreak);
      } else if (damage > 0) {
        this.state.score += PVP_HIT_SCORE;
        this.hud.pulseHitmarker();
      }
    }

    if (victimId === myId) {
      this.hud.flashDamage();

      if (killed) {
        this.state.health = 100;
        this.state.killStreak = 0;
        this.hud.setKillStreak(0);
        this.hud.setStatus("사망 - 리스폰", true, 0.9);
        this.setOnlineSpawnFromLobby();
        this.emitLocalPlayerSync(REMOTE_SYNC_INTERVAL, true);
      } else {
        const nextHealth = Number.isFinite(victimHealth)
          ? victimHealth
          : Math.max(0, this.state.health - damage);
        this.state.health = Math.max(0, Math.min(100, nextHealth));
        this.hud.setStatus(`피해 -${damage}`, true, 0.35);
      }
    }
  }

  handleLocalBlockChanged(change) {
    if (this.activeMatchMode !== "online") {
      return;
    }

    const socket = this.chat?.socket;
    if (!socket?.connected || !this.lobbyState.roomCode) {
      return;
    }

    const action = change?.action === "place" ? "place" : change?.action === "remove" ? "remove" : null;
    if (!action) {
      return;
    }

    const rawX = Number(change.x);
    const rawY = Number(change.y);
    const rawZ = Number(change.z);
    if (!Number.isFinite(rawX) || !Number.isFinite(rawY) || !Number.isFinite(rawZ)) {
      return;
    }

    const payload = {
      action,
      x: Math.trunc(rawX),
      y: Math.trunc(rawY),
      z: Math.trunc(rawZ)
    };

    if (action === "place") {
      const typeId = Number(change.typeId);
      if (!Number.isFinite(typeId)) {
        return;
      }
      payload.typeId = Math.trunc(typeId);
    }

    socket.emit("block:update", payload);
  }

  applyRemoteBlockUpdate(payload = {}) {
    if (this.voidWorldMode || this.activeMatchMode !== "online") {
      return;
    }

    const sourceId = String(payload.id ?? "");
    if (sourceId && sourceId === this.getMySocketId()) {
      return;
    }

    const action = payload.action === "place" ? "place" : payload.action === "remove" ? "remove" : null;
    if (!action) {
      return;
    }

    const rawX = Number(payload.x);
    const rawY = Number(payload.y);
    const rawZ = Number(payload.z);
    if (!Number.isFinite(rawX) || !Number.isFinite(rawY) || !Number.isFinite(rawZ)) {
      return;
    }

    const x = Math.trunc(rawX);
    const y = Math.trunc(rawY);
    const z = Math.trunc(rawZ);

    if (action === "place") {
      const typeId = Number(payload.typeId);
      if (!Number.isFinite(typeId)) {
        return;
      }
      if (this.isPlayerIntersectingBlock(x, y, z)) {
        return;
      }
      this.voxelWorld.setBlock(x, y, z, Math.trunc(typeId));
      return;
    }

    this.voxelWorld.removeBlock(x, y, z);
  }

  updateMobileControlsVisibility() {
    if (!this.mobileControlsEl) {
      return;
    }

    this.syncMobileUtilityButtons();
    const visible =
      this.mobileEnabled &&
      this.isRunning &&
      !this.isGameOver &&
      !this.chat?.isInputFocused;
    this.mobileControlsEl.classList.toggle("is-active", visible);

    if (!visible) {
      this.mobileState.moveForward = 0;
      this.mobileState.moveStrafe = 0;
      this.mobileState.stickPointerId = null;
      this.mobileState.lookPointerId = null;
      this.mobileState.aimPointerId = null;
      this.leftMouseDown = false;
      if (this.mobileEnabled) {
        this.isAiming = false;
      }
      if (this.mobileJoystickKnobEl) {
        this.mobileJoystickKnobEl.style.transform = "translate(-50%, -50%)";
      }
      this.syncMobileUtilityButtons();
    }
  }

  updateMobileStickFromClient(clientX, clientY) {
    const dx = clientX - this.mobileState.stickCenterX;
    const dy = clientY - this.mobileState.stickCenterY;
    const maxRadius = this.mobileState.stickRadius;
    const distance = Math.hypot(dx, dy);
    const ratio = distance > maxRadius ? maxRadius / distance : 1;
    const clampedX = dx * ratio;
    const clampedY = dy * ratio;

    const clampedDistance = Math.hypot(clampedX, clampedY);
    const normDistance = maxRadius > 0 ? Math.min(1, clampedDistance / maxRadius) : 0;
    const deadZone = 0.12;
    const activeDistance =
      normDistance <= deadZone ? 0 : (normDistance - deadZone) / (1 - deadZone);
    const easedDistance = activeDistance * activeDistance;
    const dirX = clampedDistance > 0.0001 ? clampedX / clampedDistance : 0;
    const dirY = clampedDistance > 0.0001 ? clampedY / clampedDistance : 0;

    this.mobileState.moveStrafe = dirX * easedDistance;
    this.mobileState.moveForward = -dirY * easedDistance;
    if (this.mobileJoystickKnobEl) {
      this.mobileJoystickKnobEl.style.transform =
        `translate(calc(-50% + ${clampedX}px), calc(-50% + ${clampedY}px))`;
    }
  }

  resetMobileStick() {
    this.mobileState.moveForward = 0;
    this.mobileState.moveStrafe = 0;
    if (this.mobileJoystickKnobEl) {
      this.mobileJoystickKnobEl.style.transform = "translate(-50%, -50%)";
    }
  }

  handlePrimaryActionDown() {
    if (!this.isRunning || this.isGameOver || this.chat?.isInputFocused || !this.isCombatMode()) {
      return;
    }

    if (this.voidWorldMode) {
      return;
    }

    if (this.buildSystem.isBuildMode()) {
      this.buildSystem.handlePointerAction(0, (x, y, z) =>
        !this.isPlayerIntersectingBlock(x, y, z)
      );
      return;
    }

    this.leftMouseDown = true;
    this.fire();
  }

  handlePrimaryActionUp() {
    this.leftMouseDown = false;
  }

  syncMobileUtilityButtons() {
    if (this.voidWorldMode) {
      this.mobileModePlaceBtn?.classList.remove("is-active");
      this.mobileModeDigBtn?.classList.remove("is-active");
      this.mobileModeGunBtn?.classList.remove("is-active");
      this.mobileAimBtn?.classList.remove("is-active");
      return;
    }

    const mode = this.buildSystem?.getToolMode?.() ?? "gun";
    this.mobileModePlaceBtn?.classList.toggle("is-active", mode === "place");
    this.mobileModeDigBtn?.classList.toggle("is-active", mode === "dig");
    this.mobileModeGunBtn?.classList.toggle("is-active", mode === "gun");
    this.mobileAimBtn?.classList.toggle(
      "is-active",
      mode === "gun" && (this.isAiming || this.rightMouseAiming)
    );
  }

  setupMobileControls() {
    if (
      this._mobileBound ||
      !this.mobileEnabled ||
      !this.mobileControlsEl ||
      !this.mobileJoystickEl ||
      !this.mobileJoystickKnobEl ||
      !this.mobileFireButtonEl ||
      !this.mobileModePlaceBtn ||
      !this.mobileModeDigBtn ||
      !this.mobileModeGunBtn ||
      !this.mobileAimBtn ||
      !this.mobileJumpBtn ||
      !this.mobileReloadBtn
    ) {
      this.updateMobileControlsVisibility();
      return;
    }

    this._mobileBound = true;
    const acceptPointer = (event) => event.pointerType === "touch" || event.pointerType === "pen";

    this.mobileJoystickEl.addEventListener("pointerdown", (event) => {
      if (!acceptPointer(event)) {
        return;
      }

      event.preventDefault();
      this.sound.unlock();
      this.mobileState.stickPointerId = event.pointerId;
      const rect = this.mobileJoystickEl.getBoundingClientRect();
      const knobRect = this.mobileJoystickKnobEl.getBoundingClientRect();
      this.mobileState.stickCenterX = rect.left + rect.width / 2;
      this.mobileState.stickCenterY = rect.top + rect.height / 2;
      this.mobileState.stickRadius = Math.max(24, rect.width * 0.5 - knobRect.width * 0.5);
      this.mobileJoystickEl.setPointerCapture(event.pointerId);
      this.updateMobileStickFromClient(event.clientX, event.clientY);
    });

    this.mobileJoystickEl.addEventListener("pointermove", (event) => {
      if (!acceptPointer(event) || event.pointerId !== this.mobileState.stickPointerId) {
        return;
      }
      event.preventDefault();
      this.updateMobileStickFromClient(event.clientX, event.clientY);
    });

    const endStick = (event) => {
      if (event.pointerId !== this.mobileState.stickPointerId) {
        return;
      }
      this.mobileState.stickPointerId = null;
      this.resetMobileStick();
      if (this.mobileJoystickEl.hasPointerCapture?.(event.pointerId)) {
        this.mobileJoystickEl.releasePointerCapture(event.pointerId);
      }
    };

    this.mobileJoystickEl.addEventListener("pointerup", endStick);
    this.mobileJoystickEl.addEventListener("pointercancel", endStick);

    this.mobileFireButtonEl.addEventListener("pointerdown", (event) => {
      if (!acceptPointer(event)) {
        return;
      }
      event.preventDefault();
      if (!this.isCombatMode()) {
        if (this.isRunning && !this.isGameOver && !this.chat?.isInputFocused) {
          this.tryPointerLock();
        }
        return;
      }
      this.sound.unlock();
      this.handlePrimaryActionDown();
      this.mobileFireButtonEl.setPointerCapture(event.pointerId);
    });

    const endFire = (event) => {
      if (!acceptPointer(event)) {
        return;
      }
      this.handlePrimaryActionUp();
      if (this.mobileFireButtonEl.hasPointerCapture?.(event.pointerId)) {
        this.mobileFireButtonEl.releasePointerCapture(event.pointerId);
      }
    };
    this.mobileFireButtonEl.addEventListener("pointerup", endFire);
    this.mobileFireButtonEl.addEventListener("pointercancel", endFire);

    const bindUtilityTap = (button, action) => {
      button.addEventListener("pointerdown", (event) => {
        if (!acceptPointer(event)) {
          return;
        }
        event.preventDefault();
        this.sound.unlock();
        action();
      });
    };

    bindUtilityTap(this.mobileModePlaceBtn, () => {
      if (this.voidWorldMode) {
        return;
      }
      this.buildSystem.setToolMode("place");
      this.syncMobileUtilityButtons();
    });
    bindUtilityTap(this.mobileModeDigBtn, () => {
      if (this.voidWorldMode) {
        return;
      }
      this.buildSystem.setToolMode("dig");
      this.syncMobileUtilityButtons();
    });
    bindUtilityTap(this.mobileModeGunBtn, () => {
      if (this.voidWorldMode) {
        return;
      }
      this.buildSystem.setToolMode("gun");
      this.syncMobileUtilityButtons();
    });
    this.mobileAimBtn.addEventListener("pointerdown", (event) => {
      if (!acceptPointer(event)) {
        return;
      }
      event.preventDefault();
      if (!this.isCombatMode()) {
        return;
      }
      if (this.voidWorldMode) {
        return;
      }
      this.sound.unlock();
      if (!this.isRunning || this.isGameOver || this.chat?.isInputFocused) {
        return;
      }
      if (!this.buildSystem.isGunMode()) {
        this.buildSystem.setToolMode("gun");
      }
      this.mobileState.aimPointerId = event.pointerId;
      this.isAiming = true;
      this.syncMobileUtilityButtons();
      this.mobileAimBtn.setPointerCapture?.(event.pointerId);
    });
    const endAim = (event) => {
      if (!acceptPointer(event) || event.pointerId !== this.mobileState.aimPointerId) {
        return;
      }
      this.mobileState.aimPointerId = null;
      this.isAiming = false;
      this.syncMobileUtilityButtons();
      this.mobileAimBtn.releasePointerCapture?.(event.pointerId);
    };
    this.mobileAimBtn.addEventListener("pointerup", endAim);
    this.mobileAimBtn.addEventListener("pointercancel", endAim);

    bindUtilityTap(this.mobileJumpBtn, () => {
      if (!this.isCombatMode()) {
        return;
      }
      if (this.onGround && this.isRunning && !this.isGameOver) {
        this.verticalVelocity = JUMP_FORCE;
        this.onGround = false;
      }
    });
    bindUtilityTap(this.mobileReloadBtn, () => {
      if (!this.isCombatMode()) {
        this.hud.setStatus("Combat not active yet", true, 0.7);
        return;
      }
      if (this.voidWorldMode) {
        return;
      }
      if (!this.buildSystem.isGunMode()) {
        this.hud.setStatus("Switch to gun mode to reload", true, 0.75);
        return;
      }
      if (this.weapon.startReload()) {
        this.hud.setStatus("???????..", true, 0.55);
      }
    });

    this.renderer.domElement.addEventListener("pointerdown", (event) => {
      if (
        !acceptPointer(event) ||
        !this.mobileEnabled ||
        !this.isRunning ||
        this.isGameOver ||
        this.chat?.isInputFocused
      ) {
        return;
      }

      if (event.clientX < window.innerWidth * 0.38) {
        return;
      }

      this.mobileState.lookPointerId = event.pointerId;
      this.mobileState.lookLastX = event.clientX;
      this.mobileState.lookLastY = event.clientY;
      this.mouseLookEnabled = true;
      this.renderer.domElement.setPointerCapture?.(event.pointerId);
    });

    document.addEventListener("pointermove", (event) => {
      if (
        !acceptPointer(event) ||
        event.pointerId !== this.mobileState.lookPointerId ||
        !this.isRunning ||
        this.isGameOver ||
        this.chat?.isInputFocused
      ) {
        return;
      }

      event.preventDefault();
      const deltaX = event.clientX - this.mobileState.lookLastX;
      const deltaY = event.clientY - this.mobileState.lookLastY;
      this.mobileState.lookLastX = event.clientX;
      this.mobileState.lookLastY = event.clientY;

      const currentAim = this.isAiming || this.rightMouseAiming;
      const lookScale = currentAim ? 0.58 : 1;
      this.yaw -= deltaX * MOBILE_LOOK_SENSITIVITY_X * lookScale;
      this.pitch -= deltaY * MOBILE_LOOK_SENSITIVITY_Y * lookScale;
      this.pitch = THREE.MathUtils.clamp(this.pitch, -1.45, 1.45);
    });

    const endLook = (event) => {
      if (event.pointerId !== this.mobileState.lookPointerId) {
        return;
      }
      this.mobileState.lookPointerId = null;
      this.renderer.domElement.releasePointerCapture?.(event.pointerId);
    };
    document.addEventListener("pointerup", endLook);
    document.addEventListener("pointercancel", endLook);

    this.syncMobileUtilityButtons();
    this.updateMobileControlsVisibility();
  }

  bindEvents() {
    window.addEventListener("resize", () => this.onResize());
    window.addEventListener("blur", () => {
      this.keys.clear();
      this.isAiming = false;
      this.rightMouseAiming = false;
      this.handlePrimaryActionUp();
      this.mobileState.lookPointerId = null;
      this.mobileState.aimPointerId = null;
      this.resetMobileStick();
    });

    const controlKeys = new Set([
      "KeyW",
      "KeyA",
      "KeyS",
      "KeyD",
      "KeyQ",
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "Space",
      "ShiftLeft",
      "ShiftRight",
      "KeyR",
      "Digit1",
      "Digit2",
      "Digit3",
      "Digit4",
      "Digit5",
      "Digit6",
      "Digit7",
      "Digit8",
      "Numpad1",
      "Numpad2",
      "Numpad3",
      "Numpad4",
      "Numpad5",
      "Numpad6",
      "Numpad7",
      "Numpad8"
    ]);

    document.addEventListener("keydown", (event) => {
      if (this.isRunning && !this.chat?.isInputFocused && event.code === "KeyF") {
        if (this.isDeconstructMode()) {
          event.preventDefault();
          this.enterCombatMode();
          return;
        }
      }

      if (
        this.isRunning &&
        this.chat &&
        !this.chat.isInputFocused &&
        (event.code === "KeyT" || event.code === "Enter")
      ) {
        event.preventDefault();
        this.keys.clear();
        this.isAiming = false;
        this.rightMouseAiming = false;
        this.handlePrimaryActionUp();
        this.mobileState.lookPointerId = null;
        this.mobileState.aimPointerId = null;
        this.resetMobileStick();
        this.mouseLookEnabled = false;

        if (
          this.pointerLockSupported &&
          document.pointerLockElement === this.renderer.domElement
        ) {
          document.exitPointerLock();
        }

        this.chat.open();
        this.syncCursorVisibility();
        return;
      }

      if (this.chat?.isInputFocused) {
        return;
      }

      if (!this.voidWorldMode && this.buildSystem.handleKeyDown(event)) {
        event.preventDefault();
        if (this.isDeconstructMode()) {
          return;
        }
        return;
      }

      if (controlKeys.has(event.code)) {
        event.preventDefault();
      }
      this.keys.add(event.code);

      if (event.code === "KeyR") {
        if (this.voidWorldMode) {
          return;
        }
        if (!this.isCombatMode()) {
          return;
        }
        if (!this.buildSystem.isGunMode()) {
          this.hud.setStatus("Press 3 to switch to gun mode", true, 0.9);
        } else if (this.weapon.startReload()) {
          this.hud.setStatus("???????..", true, 0.6);
        }
      }

      if (
        event.code === "Space" &&
        this.onGround &&
        this.isRunning &&
        !this.isGameOver &&
        this.isCombatMode()
      ) {
        this.verticalVelocity = JUMP_FORCE;
        this.onGround = false;
      }

      if (event.code === "ArrowRight" && this.isCombatMode()) {
        if (this.voidWorldMode) {
          return;
        }
        this.isAiming = true;
      }
    });

    document.addEventListener("keyup", (event) => {
      if (this.chat?.isInputFocused) {
        return;
      }

      if (controlKeys.has(event.code)) {
        event.preventDefault();
      }
      this.keys.delete(event.code);

      if (event.code === "ArrowRight" && this.isCombatMode()) {
        this.isAiming = false;
      }
    });

    document.addEventListener("pointerlockchange", () => {
      const active = document.pointerLockElement === this.renderer.domElement;
      this.pointerLocked = active;
      if (!active) {
        this.leftMouseDown = false;
        this.rightMouseAiming = false;
      }

      if (!this.pointerLockSupported) {
        this.mouseLookEnabled = true;
        this.hud.showPauseOverlay(false);
        this.syncCursorVisibility();
        return;
      }

      if (!this.isRunning || this.isGameOver) {
        this.mouseLookEnabled = active || this.allowUnlockedLook;
        this.hud.showPauseOverlay(false);
        this.syncCursorVisibility();
        return;
      }

      if (this.chat?.isInputFocused) {
        this.mouseLookEnabled = false;
        this.hud.showPauseOverlay(false);
        this.syncCursorVisibility();
        return;
      }

      if (active) {
        this.mouseLookEnabled = true;
        this.hud.showPauseOverlay(false);
        this.syncCursorVisibility();
        return;
      }

      if (this.allowUnlockedLook) {
        this.mouseLookEnabled = true;
        this.hud.showPauseOverlay(false);
        this.syncCursorVisibility();
        return;
      }

      this.mouseLookEnabled = false;
      this.hud.showPauseOverlay(true);
      this.syncCursorVisibility();
    });

    document.addEventListener("pointerlockerror", () => {
      if (!this.isRunning || this.isGameOver) {
        return;
      }

      this.mouseLookEnabled = false;
      this.hud.showPauseOverlay(true);
      this.hud.setStatus("\uB9C8\uC6B0\uC2A4\uB97C \uB2E4\uC2DC \uD074\uB9AD\uD574 \uACE0\uC815\uD558\uC138\uC694", true, 1.1);
      this.syncCursorVisibility();
    });

    document.addEventListener("mousemove", (event) => {
      if (
        !this.isRunning ||
        this.isGameOver ||
        !this.mouseLookEnabled ||
        this.chat?.isInputFocused
      ) {
        return;
      }

      const currentAim = this.isAiming || this.rightMouseAiming;
      const lookScale = currentAim ? 0.58 : 1;
      this.yaw -= event.movementX * 0.0022 * lookScale;
      this.pitch -= event.movementY * 0.002 * lookScale;
      this.pitch = THREE.MathUtils.clamp(this.pitch, -1.45, 1.45);
    });

    document.addEventListener(
      "wheel",
      (event) => {
        if (this.chat?.isInputFocused || !this.isRunning || this.isGameOver) {
          return;
        }
        if (!this.voidWorldMode && this.buildSystem.handleWheel(event)) {
          event.preventDefault();
        }
      },
      { passive: false }
    );

    const isGameplayMouseEvent = (event) =>
      this.pointerLocked || event.target === this.renderer.domElement;

    document.addEventListener("contextmenu", (event) => {
      if (
        this.isRunning &&
        !this.isGameOver &&
        (this.pointerLocked || event.target === this.renderer.domElement)
      ) {
        event.preventDefault();
      }
    });

    document.addEventListener("mousedown", (event) => {
      if (!isGameplayMouseEvent(event)) {
        return;
      }
      event.preventDefault();

      if (!this.isRunning || this.isGameOver) {
        return;
      }
      this.sound.unlock();

      const shouldTryPointerLock =
        this.pointerLockSupported &&
        !this.pointerLocked &&
        !this.mouseLookEnabled &&
        !this.chat?.isInputFocused;

      if (this.isDeconstructMode()) {
        if (shouldTryPointerLock) {
          this.tryPointerLock();
        }
        return;
      }

      if (this.voidWorldMode) {
        if (shouldTryPointerLock) {
          this.tryPointerLock();
        }
        return;
      }

      if (this.buildSystem.isBuildMode()) {
        if (event.button === 0 || event.button === 2) {
          this.buildSystem.handlePointerAction(event.button, (x, y, z) =>
            !this.isPlayerIntersectingBlock(x, y, z)
          );
          return;
        }
      }

      if (event.button === 2) {
        this.rightMouseAiming = true;
        if (shouldTryPointerLock) {
          this.tryPointerLock();
        }
        return;
      }

      if (event.button !== 0) {
        return;
      }

      this.handlePrimaryActionDown();
      if (shouldTryPointerLock) {
        this.tryPointerLock();
      }
    });

    document.addEventListener("mouseup", (event) => {
      if (this.isDeconstructMode()) {
        if (event.button === 0) {
          this.handlePrimaryActionUp();
        }
        return;
      }
      if (this.voidWorldMode) {
        if (event.button === 0) {
          this.handlePrimaryActionUp();
        }
        return;
      }
      if (event.button === 0) {
        this.handlePrimaryActionUp();
      }
      if (this.buildSystem.isBuildMode()) {
        return;
      }

      if (event.button === 2) {
        this.rightMouseAiming = false;
      }
    });

    const switchTab = (active, inactive, showPanel, hidePanel) => {
      if (!active || !inactive || !showPanel || !hidePanel) {
        return;
      }
      active.classList.add("is-active");
      active.setAttribute("aria-selected", "true");
      inactive.classList.remove("is-active");
      inactive.setAttribute("aria-selected", "false");
      showPanel.classList.remove("hidden");
      hidePanel.classList.add("hidden");
    };

    const btnSingle = document.getElementById("mode-single");
    const btnOnline = document.getElementById("mode-online");
    const panelSingle = document.getElementById("single-panel");
    const panelOnline = document.getElementById("online-panel");

    btnSingle?.addEventListener("click", () => {
      switchTab(btnSingle, btnOnline, panelSingle, panelOnline);
      this.menuMode = "single";
    });

    btnOnline?.addEventListener("click", () => {
      switchTab(btnOnline, btnSingle, panelOnline, panelSingle);
      this.menuMode = "online";
      this.refreshOnlineStatus();
      this.requestRoomList();
    });

    if (btnSingle && btnOnline && panelSingle && panelOnline) {
      switchTab(btnSingle, btnOnline, panelSingle, panelOnline);
      this.menuMode = "online";
    }

    if (this.startButton) {
      this.startButton.textContent = "PLAY";
    }

    this.startButton?.addEventListener("click", () => {
      this.applyLobbyNickname();
      this.joinDefaultRoom({ force: true });
      this.start({ mode: "online" });
    });

    this.mpCreateBtn?.addEventListener("click", () => {
      this.applyLobbyNickname();
      this.createRoom();
    });
    this.mpJoinBtn?.addEventListener("click", () => {
      this.applyLobbyNickname();
      this.joinRoomByInputCode();
    });
    this.mpStartBtn?.addEventListener("click", () => {
      this.startOnlineMatch();
    });
    this.mpRefreshBtn?.addEventListener("click", () => {
      this.refreshOnlineStatus();
      this.requestRoomList();
    });

    this.mpNameInput?.addEventListener("change", () => {
      this.applyLobbyNickname();
    });
    this.mpCodeInput?.addEventListener("input", () => {
      this.mpCodeInput.value = this.mpCodeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    });

    this.mpLeaveBtn?.addEventListener("click", () => {
      this.leaveRoom();
    });
    this.mpCopyCodeBtn?.addEventListener("click", () => {
      this.copyCurrentRoomCode();
    });
    this.mpTeamAlphaBtn?.addEventListener("click", () => {
      this.setTeam("alpha");
    });
    this.mpTeamBravoBtn?.addEventListener("click", () => {
      this.setTeam("bravo");
    });

    this.restartButton?.addEventListener("click", () => {
      this.start({ mode: this.activeMatchMode });
    });

    this.hud.pauseOverlayEl?.addEventListener("click", () => {
      if (this.isRunning && !this.isGameOver) {
        if (this.allowUnlockedLook) {
          this.mouseLookEnabled = true;
          this.hud.showPauseOverlay(false);
          this.syncCursorVisibility();
          return;
        }
        this.tryPointerLock();
      }
    });

  }

  onChatFocusChanged(focused) {
    if (!this.isRunning || this.isGameOver) {
      this.syncCursorVisibility();
      return;
    }

    if (focused) {
      this.keys.clear();
      this.isAiming = false;
      this.rightMouseAiming = false;
      this.handlePrimaryActionUp();
      this.mobileState.lookPointerId = null;
      this.mobileState.aimPointerId = null;
      this.resetMobileStick();
      this.mouseLookEnabled = false;
      this.hud.showPauseOverlay(false);

      if (
        this.pointerLockSupported &&
        document.pointerLockElement === this.renderer.domElement
      ) {
        document.exitPointerLock();
      }

      this.syncCursorVisibility();
      return;
    }

    if (this.pointerLocked || this.allowUnlockedLook) {
      this.mouseLookEnabled = true;
      this.hud.showPauseOverlay(false);
      this.syncCursorVisibility();
      return;
    }

    this.tryPointerLock();
  }

  start(options = {}) {
    const mode = options.mode ?? this.menuMode;
    this.activeMatchMode = mode === "online" ? "online" : "single";
    this.resetState();
    this.hud.showStartOverlay(false);
    this.hud.showPauseOverlay(false);
    this.hud.hideGameOver();
    this.isRunning = true;
    this.isGameOver = false;
    this.mouseLookEnabled = this.allowUnlockedLook;
    this.syncCursorVisibility();
    this.clock.start();
    this.tryPointerLock();

    if (!this.pointerLockSupported) {
      this.hud.setStatus("Pointer lock unavailable: free-look mode enabled", true, 1.2);
    }

    if (this.voidWorldMode) {
      this.addChatMessage("Void field initialized.", "info");
      this.addChatMessage("Controls: WASD, SPACE, SHIFT", "info");
    } else {
      this.addChatMessage("Operation started. Survive and score points.", "info");
      this.addChatMessage("Objective: capture flags and hold the center point.", "info");
      this.addChatMessage("Controls: WASD, SPACE, 1/2/3, R, NumPad1-8", "info");
    }
    if (this.activeMatchMode === "online") {
      this.joinDefaultRoom({ force: true });
      this.hud.setStatus("Void initialized.", false, 1);
      this.syncRemotePlayersFromLobby();
    }
    this.refreshOnlineStatus();
  }

  schedulePointerLockFallback() {
    if (this.pointerLockFallbackTimer !== null) {
      window.clearTimeout(this.pointerLockFallbackTimer);
      this.pointerLockFallbackTimer = null;
    }

    if (!this.pointerLockSupported || this.allowUnlockedLook || !this.mobileEnabled) {
      return;
    }

    this.pointerLockFallbackTimer = window.setTimeout(() => {
      this.pointerLockFallbackTimer = null;

      if (
        !this.isRunning ||
        this.isGameOver ||
        this.pointerLocked ||
        this.allowUnlockedLook ||
        this.chat?.isInputFocused
      ) {
        return;
      }

      this.allowUnlockedLook = true;
      this.mouseLookEnabled = true;
      this.hud.showPauseOverlay(false);
      this.hud.setStatus("Pointer lock fallback enabled", true, 1);
      this.syncCursorVisibility();
    }, POINTER_LOCK_FALLBACK_MS);
  }

  resetState() {
    if (this.pointerLockFallbackTimer !== null) {
      window.clearTimeout(this.pointerLockFallbackTimer);
      this.pointerLockFallbackTimer = null;
    }

    this.keys.clear();
    this.remoteSyncClock = 0;
    this.mobileState.lookPointerId = null;
    this.mobileState.stickPointerId = null;
    this.mobileState.aimPointerId = null;
    this.resetMobileStick();
    this.handlePrimaryActionUp();
    this.weapon.reset();
    this.enemyManager.reset();
    this.playerPosition.set(0, PLAYER_HEIGHT, 0);
    this.verticalVelocity = 0;
    this.onGround = true;
    this.yaw = 0;
    this.pitch = 0;
    this.weaponRecoil = 0;
    this.weaponBobClock = 0;
    this.isAiming = false;
    this.rightMouseAiming = false;
    this.leftMouseDown = false;
    this.aimBlend = 0;
    this.buildSystem.setToolMode("gun", { silentStatus: true });
    this.updateVisualMode(this.buildSystem.getToolMode());
    this.camera.fov = DEFAULT_FOV;
    this.camera.updateProjectionMatrix();
    this.lastAppliedFov = DEFAULT_FOV;

    for (const spark of this.hitSparks) {
      this.scene.remove(spark.sprite);
      spark.sprite.material.dispose();
    }
    this.hitSparks.length = 0;

    this.state.health = 100;
    this.state.score = 0;
    this.state.kills = 0;
    this.state.captures = 0;
    this.state.controlPercent = 0;
    this.state.controlOwner = "neutral";
    this.state.killStreak = 0;
    this.state.lastKillTime = 0;
    this._wasReloading = false;
    this.lastDryFireAt = -10;
    this.chatIntroShown = false;
    this.resetObjectives();
    this.clearRemotePlayers();
    this.clearChatMessages();
    this.hud.setKillStreak(0);
    this.camera.position.copy(this.playerPosition);
    this.camera.rotation.set(0, 0, 0);
    this.clearCombatWorld();
    this.enterCombatMode({ force: true });
    this.syncCursorVisibility();

    this.hud.update(0, { ...this.state, ...this.weapon.getState() });
    if (this.weaponFlashLight) {
      this.weaponFlashLight.intensity = 0;
    }
  }

  fire() {
    if (
      this.voidWorldMode ||
      !this.isRunning ||
      this.isGameOver ||
      !this.isCombatMode() ||
      this.chat?.isInputFocused ||
      !this.buildSystem.isGunMode()
    ) {
      return;
    }

    const shot = this.weapon.tryShoot();
    if (!shot.success) {
      if (shot.reason === "empty") {
        const now = this.clock.getElapsedTime();
        if (now - this.lastDryFireAt > 0.22) {
          this.lastDryFireAt = now;
          this.hud.setStatus("No ammo", true, 0.55);
          this.sound.play("dry", { rateJitter: 0.08 });
        }
      }
      return;
    }

    this.weaponRecoil = 1;
    this.sound.play("shot", { rateJitter: 0.035 });
    this.hud.pulseCrosshair();
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    const blockHit = this.voxelWorld.raycast(this.raycaster, 120);
    const maxEnemyDistance = blockHit ? Math.max(0, blockHit.distance - 0.001) : Infinity;

    if (this.activeMatchMode === "online") {
      if (!this.getMyTeam()) {
        this.hud.setStatus("팀 선택 후 공격 가능", true, 0.7);
        if (blockHit?.point) {
          this.spawnHitSpark(blockHit.point);
        }
        return;
      }

      const remoteHit = this.findOnlineShotTarget(maxEnemyDistance);
      if (!remoteHit) {
        if (blockHit?.point) {
          this.spawnHitSpark(blockHit.point);
        }
        return;
      }

      this.spawnHitSpark(remoteHit.point);
      this.emitPvpShot(remoteHit.id);
      return;
    }

    const result = this.enemyManager.handleShot(this.raycaster, maxEnemyDistance);

    if (!result.didHit) {
      if (blockHit?.point) {
        this.spawnHitSpark(blockHit.point);
      }
      return;
    }

    this.hud.pulseHitmarker();
    if (result.hitPoint) {
      this.spawnHitSpark(result.hitPoint);
    }
    this.state.score += result.points;

    if (result.didKill) {
      this.state.kills += 1;
      const now = this.clock.getElapsedTime();
      if (now - this.state.lastKillTime < 4.0) {
        this.state.killStreak += 1;
      } else {
        this.state.killStreak = 1;
      }
      this.state.lastKillTime = now;
      this.hud.setStatus("+100 kill", false, 0.45);
      this.hud.setKillStreak(this.state.killStreak);

      if (this.state.killStreak >= 3) {
        this.addChatMessage(
          `${this.state.killStreak}??????????? ??????濾????????????????븐뼐?????????룸챷援??????| ???????????ㅻ깹???????+${this.state.kills * 10}`,
          "streak"
        );
      } else {
        this.addChatMessage(`????????濾????????????????븐뼐?????????룸챷援??????+100 (??????????獄쏅챶留덌┼??????????????筌롈살젔??${this.state.kills}??`, "kill");
      }
    }
  }

  applyMovement(delta) {
    const mobileForward = this.mobileEnabled ? this.mobileState.moveForward : 0;
    const mobileStrafe = this.mobileEnabled ? this.mobileState.moveStrafe : 0;
    const mobileMoveMagnitude = this.mobileEnabled ? Math.hypot(mobileForward, mobileStrafe) : 0;
    const keyForward =
      (this.keys.has("KeyW") || this.keys.has("ArrowUp") ? 1 : 0) -
      (this.keys.has("KeyS") || this.keys.has("ArrowDown") ? 1 : 0);
    const keyStrafe =
      (this.keys.has("KeyD") ? 1 : 0) -
      (this.keys.has("KeyA") || this.keys.has("ArrowLeft") ? 1 : 0);
    const forward = THREE.MathUtils.clamp(keyForward + mobileForward, -1, 1);
    const strafe = THREE.MathUtils.clamp(keyStrafe + mobileStrafe, -1, 1);
    const sprinting =
      this.keys.has("ShiftLeft") ||
      this.keys.has("ShiftRight") ||
      (this.mobileEnabled && mobileMoveMagnitude > 0.88);
    const speed = sprinting ? PLAYER_SPRINT : PLAYER_SPEED;

    if (forward !== 0 || strafe !== 0) {
      const sinYaw = Math.sin(this.yaw);
      const cosYaw = Math.cos(this.yaw);

      this.moveForwardVec.set(-sinYaw, 0, -cosYaw);
      this.moveRightVec.set(cosYaw, 0, -sinYaw);
      this.moveVec
        .set(0, 0, 0)
        .addScaledVector(this.moveForwardVec, forward)
        .addScaledVector(this.moveRightVec, strafe);
      const moveMagnitude = Math.min(1, this.moveVec.length());
      if (moveMagnitude > 0.0001) {
        this.moveVec.normalize();
      }

      const usingMobileAnalog = this.mobileEnabled && mobileMoveMagnitude > 0.0001;
      const moveScale = usingMobileAnalog ? moveMagnitude : Math.max(0.36, moveMagnitude);
      const moveStep = speed * delta * moveScale;
      const totalMoveX = this.moveVec.x * moveStep;
      const totalMoveZ = this.moveVec.z * moveStep;
      const horizontalDistance = Math.hypot(totalMoveX, totalMoveZ);
      const horizontalSteps = Math.max(1, Math.ceil(horizontalDistance / 0.18));
      const stepX = totalMoveX / horizontalSteps;
      const stepZ = totalMoveZ / horizontalSteps;

      for (let i = 0; i < horizontalSteps; i += 1) {
        if (stepX !== 0) {
          const nextX = THREE.MathUtils.clamp(
            this.playerPosition.x + stepX,
            -WORLD_LIMIT,
            WORLD_LIMIT
          );
          if (!this.isPlayerCollidingAt(nextX, this.playerPosition.y, this.playerPosition.z)) {
            this.playerPosition.x = nextX;
          }
        }

        if (stepZ !== 0) {
          const nextZ = THREE.MathUtils.clamp(
            this.playerPosition.z + stepZ,
            -WORLD_LIMIT,
            WORLD_LIMIT
          );
          if (!this.isPlayerCollidingAt(this.playerPosition.x, this.playerPosition.y, nextZ)) {
            this.playerPosition.z = nextZ;
          }
        }
      }
    }

    this.verticalVelocity += PLAYER_GRAVITY * delta;
    const verticalMove = this.verticalVelocity * delta;
    const verticalSteps = Math.max(1, Math.ceil(Math.abs(verticalMove) / 0.2));
    const verticalStep = verticalMove / verticalSteps;

    for (let i = 0; i < verticalSteps; i += 1) {
      const nextY = this.playerPosition.y + verticalStep;
      if (!this.isPlayerCollidingAt(this.playerPosition.x, nextY, this.playerPosition.z)) {
        this.playerPosition.y = nextY;
      } else {
        if (this.verticalVelocity > 0) {
          this.playerPosition.y = Math.floor(this.playerPosition.y) + 0.999;
        }
        this.verticalVelocity = 0;
        break;
      }
    }

    const surfaceY = this.voxelWorld.getSurfaceYAt(this.playerPosition.x, this.playerPosition.z);
    const floorY = (surfaceY ?? 0) + PLAYER_HEIGHT;
    if (this.playerPosition.y <= floorY + 0.04) {
      this.playerPosition.y = floorY;
      this.verticalVelocity = 0;
      this.onGround = true;
    } else {
      this.onGround = false;
    }
  }

  updateCamera(delta) {
    if (this.isDeconstructMode()) {
      if (this.weaponFlash) {
        this.weaponFlash.material.opacity = 0;
      }
      if (this.weaponFlashLight) {
        this.weaponFlashLight.intensity = 0;
      }
      this.weaponView.visible = false;
      if (this.shovelView) {
        this.shovelView.visible = false;
      }

      if (Math.abs(DEFAULT_FOV - this.lastAppliedFov) > 0.01 || this.camera.fov !== DEFAULT_FOV) {
        this.camera.fov = DEFAULT_FOV;
        this.camera.updateProjectionMatrix();
        this.lastAppliedFov = DEFAULT_FOV;
      }

      this.camera.position.copy(this.playerPosition);
      this.camera.rotation.order = "YXZ";
      this.camera.rotation.y = this.yaw;
      this.camera.rotation.x = this.pitch;
      return;
    }

    if (this.voidWorldMode) {
      const mobileMoveMagnitude = this.mobileEnabled
        ? Math.hypot(this.mobileState.moveForward, this.mobileState.moveStrafe)
        : 0;
      const isMoving =
        this.keys.has("KeyW") ||
        this.keys.has("KeyA") ||
        this.keys.has("KeyS") ||
        this.keys.has("KeyD") ||
        this.keys.has("ArrowUp") ||
        this.keys.has("ArrowDown") ||
        this.keys.has("ArrowLeft") ||
        mobileMoveMagnitude > 0.06;
      const sprinting =
        this.keys.has("ShiftLeft") ||
        this.keys.has("ShiftRight") ||
        (this.mobileEnabled && mobileMoveMagnitude > 0.88);
      const bobSpeed = sprinting ? 10 : 7;
      this.weaponBobClock += delta * (isMoving ? bobSpeed : 2.5);
      const bobX = Math.sin(this.weaponBobClock) * 0.009;
      const bobY = Math.abs(Math.cos(this.weaponBobClock * 2)) * 0.008;

      this.weaponView.visible = false;
      if (this.weaponFlash) {
        this.weaponFlash.material.opacity = 0;
      }
      if (this.weaponFlashLight) {
        this.weaponFlashLight.intensity = 0;
      }
      if (this.shovelView) {
        this.shovelView.visible = true;
        this.shovelView.position.set(0.18 + bobX * 0.8, -0.1 - bobY, -0.06);
        this.shovelView.rotation.set(-0.05 + bobY * 0.4, -0.12 + bobX * 0.45, 0.02 + bobX * 0.28);
      }

      if (Math.abs(DEFAULT_FOV - this.lastAppliedFov) > 0.01 || this.camera.fov !== DEFAULT_FOV) {
        this.camera.fov = DEFAULT_FOV;
        this.camera.updateProjectionMatrix();
        this.lastAppliedFov = DEFAULT_FOV;
      }

      this.camera.position.copy(this.playerPosition);
      this.camera.rotation.order = "YXZ";
      this.camera.rotation.y = this.yaw;
      this.camera.rotation.x = this.pitch;
      return;
    }

    const gunMode = this.buildSystem.isGunMode();
    const digMode = this.buildSystem.isDigMode();
    const mobileMoveMagnitude = this.mobileEnabled
      ? Math.hypot(this.mobileState.moveForward, this.mobileState.moveStrafe)
      : 0;
    const isMoving =
      this.keys.has("KeyW") ||
      this.keys.has("KeyA") ||
      this.keys.has("KeyS") ||
      this.keys.has("KeyD") ||
      this.keys.has("ArrowUp") ||
      this.keys.has("ArrowDown") ||
      this.keys.has("ArrowLeft") ||
      mobileMoveMagnitude > 0.06;
    const sprinting =
      this.keys.has("ShiftLeft") ||
      this.keys.has("ShiftRight") ||
      (this.mobileEnabled && mobileMoveMagnitude > 0.88);
    const aiming =
      gunMode &&
      (this.isAiming || this.rightMouseAiming) &&
      this.isRunning &&
      !this.isGameOver &&
      !this.chat?.isInputFocused;
    this.aimBlend = THREE.MathUtils.damp(this.aimBlend, aiming ? 1 : 0, 12, delta);

    const bobSpeed = sprinting ? 13 : 9;
    this.weaponBobClock += delta * (isMoving ? bobSpeed : 3);

    const bobAmount = (isMoving ? 1 : 0.2) * (1 - this.aimBlend * 0.85);
    const bobX = Math.sin(this.weaponBobClock) * 0.012 * bobAmount;
    const bobY = Math.abs(Math.cos(this.weaponBobClock * 2)) * 0.012 * bobAmount;

    this.weaponRecoil = Math.max(0, this.weaponRecoil - delta * 8.5);
    const recoil = this.weaponRecoil * 0.07 * (1 - this.aimBlend * 0.6);

    const targetWeaponX = THREE.MathUtils.lerp(0.38, 0.0, this.aimBlend);
    const targetWeaponY = THREE.MathUtils.lerp(-0.38, -0.24, this.aimBlend);
    const targetWeaponZ = THREE.MathUtils.lerp(-0.76, -0.36, this.aimBlend);
    this.weaponView.position.set(
      targetWeaponX + bobX,
      targetWeaponY - bobY,
      targetWeaponZ + recoil
    );
    this.weaponView.rotation.set(
      THREE.MathUtils.lerp(-0.22, -0.05, this.aimBlend) -
        this.weaponRecoil * 0.18 +
        bobY * 0.45,
      THREE.MathUtils.lerp(-0.06, 0, this.aimBlend) + bobX * 1.4,
      THREE.MathUtils.lerp(0.02, 0, this.aimBlend)
    );
    if (this.shovelView) {
      this.shovelView.position.set(0.48 + bobX * 0.85, -0.44 - bobY * 0.9, -0.72 + recoil * 0.2);
      this.shovelView.rotation.set(-0.28 + bobY * 0.4, -0.18 + bobX * 0.55, 0.34 + bobX * 0.9);
    }

    if (this.weaponFlash) {
      this.weaponFlash.material.opacity = gunMode
        ? Math.max(0, (this.weaponRecoil - 0.62) * 2.6)
        : 0;
    }
    if (this.weaponFlashLight) {
      if (gunMode) {
        const flare = Math.max(0, (this.weaponRecoil - 0.56) * 8.2);
        this.weaponFlashLight.intensity = flare * THREE.MathUtils.randFloat(1.2, 1.7);
      } else {
        this.weaponFlashLight.intensity = 0;
      }
    }

    this.weaponView.visible = gunMode;
    if (this.shovelView) {
      this.shovelView.visible = digMode;
    }
    const nextFov = gunMode
      ? THREE.MathUtils.lerp(DEFAULT_FOV, AIM_FOV, this.aimBlend)
      : DEFAULT_FOV;
    if (Math.abs(nextFov - this.lastAppliedFov) > 0.01) {
      this.camera.fov = nextFov;
      this.camera.updateProjectionMatrix();
      this.lastAppliedFov = nextFov;
    }
    this.camera.position.copy(this.playerPosition);
    this.camera.rotation.order = "YXZ";
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
  }

  tick(delta) {
    this.updateSparks(delta);
    const isChatting = !!this.chat?.isInputFocused;
    const gunMode = this.buildSystem.isGunMode();
    const isCombatMode = this.isCombatMode();
    const weaponEnabled = !this.voidWorldMode;
    const aiEnabled = weaponEnabled && isCombatMode && this.activeMatchMode !== "online";

    if (weaponEnabled && gunMode && isCombatMode) {
      this.weapon.update(delta);
    }

    if (this.activeMatchMode === "online") {
      this.updateRemotePlayers(delta);
      this.emitLocalPlayerSync(delta);
    }

    if (!this.isRunning || this.isGameOver || (!this.mouseLookEnabled && !isChatting)) {
      this.hud.update(delta, {
        ...this.state,
        ...this.weapon.getState(),
        enemyCount: aiEnabled ? this.enemyManager.enemies.length : 0
      });
      return;
    }

    if (weaponEnabled && gunMode && this.leftMouseDown) {
      this.fire();
    }

    if (!isCombatMode) {
      this.applyMovement(delta);
      this.updateCamera(delta);
      this.hud.update(delta, {
        ...this.state,
        ...this.weapon.getState(),
        enemyCount: 0
      });
      return;
    }

    this.applyMovement(delta);
    this.updateCamera(delta);
    if (!this.voidWorldMode) {
      this.updateObjectives(delta);
    }

    const weapState = this.weapon.getState();
    if (weaponEnabled && gunMode && !this._wasReloading && weapState.reloading) {
      this.sound.play("reload", { gain: 0.9, rateJitter: 0.03 });
    }
    if (weaponEnabled && gunMode && this._wasReloading && !weapState.reloading) {
      this.addChatMessage("Reload complete", "info");
    }
    this._wasReloading = weaponEnabled && gunMode ? weapState.reloading : false;

    if (aiEnabled) {
      const combatResult = this.enemyManager.update(delta, this.playerPosition, {
        alphaBase: this.objective.alphaBase,
        bravoBase: this.objective.bravoBase,
        controlPoint: this.objective.controlPoint,
        controlRadius: this.objective.controlRadius,
        controlOwner: this.objective.controlOwner,
        playerHasEnemyFlag: this.objective.playerHasEnemyFlag
      });

      const damage = combatResult.damage ?? 0;
      if (damage > 0) {
        this.state.health = Math.max(0, this.state.health - damage);
        this.hud.flashDamage();
        this.hud.setStatus(`?????????거????????遺얘턁????????熬곣뫖????????????-${damage}`, true, 0.35);
        this.addChatMessage(`?????????거????????遺얘턁????????熬곣뫖????????????-${damage} HP`, "damage");
        if (this.state.health <= 25 && this.state.health > 0) {
          this.addChatMessage("Low health", "warning");
        }
      } else if (combatResult.firedShots > 0) {
        this.hud.setStatus("??????????????????", true, 0.16);
      }
    }

    if (this.state.health <= 0) {
      this.isGameOver = true;
      this.isRunning = false;
      this.leftMouseDown = false;
      this.rightMouseAiming = false;
      if (this.objective.playerHasEnemyFlag) {
        this.objective.playerHasEnemyFlag = false;
        if (this.bravoFlag) {
          this.bravoFlag.visible = true;
          this.bravoFlag.position.copy(this.objective.bravoFlagHome);
        }
      }
      this.addChatMessage("??????????????????????????嶺??? ?????????????????ㅻ깹???", "warning");
      this.hud.showGameOver(this.state.score);
      this.syncCursorVisibility();
      if (document.pointerLockElement === this.renderer.domElement) {
        document.exitPointerLock();
      }
    }

    this.hud.update(delta, {
      ...this.state,
      ...weapState,
      enemyCount: aiEnabled ? this.enemyManager.enemies.length : 0
    });
  }

  loop() {
    const delta = Math.min(this.clock.getDelta(), 0.05);
    this.tick(delta);
    this.updateDynamicResolution(delta);
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(() => this.loop());
  }

  updateDynamicResolution(delta) {
    const config = this.dynamicResolution;
    if (!config || !config.enabled || !Number.isFinite(delta) || delta <= 0) {
      return;
    }

    if (!this.isRunning || this.isGameOver) {
      config.sampleTime = 0;
      config.frameCount = 0;
      config.cooldown = 0;
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

    const floorRatio = Math.max(
      0.5,
      Math.min(config.minRatio, this.maxPixelRatio)
    );
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
  }

  onResize() {
    const wasMobile = this.mobileEnabled;
    this.mobileEnabled = isLikelyTouchDevice();
    if (this.mobileEnabled !== wasMobile) {
      this.applyQualityProfile();
    }
    if (this.dynamicResolution) {
      this.dynamicResolution.minRatio = this.mobileEnabled ? 0.65 : 0.85;
    }
    const nextMaxPixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    this.maxPixelRatio = nextMaxPixelRatio;
    const minPixelRatio = Math.max(
      0.5,
      Math.min(this.dynamicResolution?.minRatio ?? 0.5, this.maxPixelRatio)
    );
    const clampedPixelRatio = THREE.MathUtils.clamp(
      this.currentPixelRatio,
      minPixelRatio,
      this.maxPixelRatio
    );
    if (Math.abs(clampedPixelRatio - this.currentPixelRatio) > 0.01) {
      this.currentPixelRatio = Number(clampedPixelRatio.toFixed(2));
      this.renderer.setPixelRatio(this.currentPixelRatio);
    }
    if (this.mobileEnabled && !this._mobileBound) {
      this.setupMobileControls();
    }
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.lastAppliedFov = this.camera.fov;
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.updateMobileControlsVisibility();
  }

  tryPointerLock() {
    if (!this.pointerLockSupported || this.pointerLocked || this.chat?.isInputFocused) {
      return;
    }

    const maybePromise = this.renderer.domElement.requestPointerLock();
    if (maybePromise && typeof maybePromise.catch === "function") {
      maybePromise.catch(() => {
        if (!this.isRunning || this.isGameOver) {
          return;
        }
        this.hud.showPauseOverlay(true);
        this.hud.setStatus("??????????????????濾??????????? ???????????????嫄???????????????????살몝????", true, 1);
        this.syncCursorVisibility();
      });
    }
  }

  syncCursorVisibility() {
    this.updateMobileControlsVisibility();
    if (this.mobileEnabled) {
      document.body.style.cursor = "";
      this.renderer.domElement.style.cursor = "";
      return;
    }

    const hideCursor =
      this.isRunning &&
      !this.isGameOver &&
      (this.mouseLookEnabled || this.rightMouseAiming || this.isAiming) &&
      !this.chat?.isInputFocused;
    const cursor = hideCursor ? "none" : "";
    document.body.style.cursor = cursor;
    this.renderer.domElement.style.cursor = cursor;
  }

  updateVisualMode(mode) {
    const build = !this.voidWorldMode && mode !== "gun" && mode !== "weapon";
    document.body.classList.toggle("ui-mode-build", build);
    document.body.classList.toggle("ui-mode-combat", !build);
  }

  isPlayerCollidingAt(positionX, positionY, positionZ) {
    const feetY = positionY - PLAYER_HEIGHT;
    const headY = positionY;
    const minX = Math.floor(positionX - PLAYER_RADIUS);
    const maxX = Math.floor(positionX + PLAYER_RADIUS);
    const minY = Math.floor(feetY);
    const maxY = Math.floor(headY - 0.0001);
    const minZ = Math.floor(positionZ - PLAYER_RADIUS);
    const maxZ = Math.floor(positionZ + PLAYER_RADIUS);

    const playerMinX = positionX - PLAYER_RADIUS;
    const playerMaxX = positionX + PLAYER_RADIUS;
    const playerMinY = feetY;
    const playerMaxY = headY;
    const playerMinZ = positionZ - PLAYER_RADIUS;
    const playerMaxZ = positionZ + PLAYER_RADIUS;

    for (let x = minX; x <= maxX; x += 1) {
      for (let y = minY; y <= maxY; y += 1) {
        for (let z = minZ; z <= maxZ; z += 1) {
          if (!this.voxelWorld.hasBlock(x, y, z)) {
            continue;
          }

          const blockMinX = x;
          const blockMaxX = x + 1;
          const blockMinY = y;
          const blockMaxY = y + 1;
          const blockMinZ = z;
          const blockMaxZ = z + 1;

          const separated =
            playerMaxX <= blockMinX ||
            playerMinX >= blockMaxX ||
            playerMaxY <= blockMinY ||
            playerMinY >= blockMaxY ||
            playerMaxZ <= blockMinZ ||
            playerMinZ >= blockMaxZ;

          if (!separated) {
            return true;
          }
        }
      }
    }

    return false;
  }

  isPlayerIntersectingBlock(blockX, blockY, blockZ) {
    const feetY = this.playerPosition.y - PLAYER_HEIGHT;
    const headY = this.playerPosition.y;

    const playerMinX = this.playerPosition.x - PLAYER_RADIUS;
    const playerMaxX = this.playerPosition.x + PLAYER_RADIUS;
    const playerMinY = feetY;
    const playerMaxY = headY;
    const playerMinZ = this.playerPosition.z - PLAYER_RADIUS;
    const playerMaxZ = this.playerPosition.z + PLAYER_RADIUS;

    const blockMinX = blockX;
    const blockMaxX = blockX + 1;
    const blockMinY = blockY;
    const blockMaxY = blockY + 1;
    const blockMinZ = blockZ;
    const blockMaxZ = blockZ + 1;

    return !(
      playerMaxX <= blockMinX ||
      playerMinX >= blockMaxX ||
      playerMaxY <= blockMinY ||
      playerMinY >= blockMaxY ||
      playerMaxZ <= blockMinZ ||
      playerMinZ >= blockMaxZ
    );
  }

  spawnHitSpark(position) {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.graphics.sparkMap,
        color: 0xd6eeff,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    sprite.scale.setScalar(0.75);
    sprite.position.copy(position);
    sprite.position.y += 0.35;
    this.scene.add(sprite);
    this.hitSparks.push({
      sprite,
      life: 0.18,
      ttl: 0.18
    });
  }

  updateSparks(delta) {
    for (let i = this.hitSparks.length - 1; i >= 0; i -= 1) {
      const spark = this.hitSparks[i];
      spark.life -= delta;
      const t = Math.max(0, spark.life / spark.ttl);
      spark.sprite.material.opacity = t;
      spark.sprite.scale.setScalar(0.75 + (1 - t) * 0.6);

      if (spark.life <= 0) {
        this.scene.remove(spark.sprite);
        spark.sprite.material.dispose();
        this.hitSparks.splice(i, 1);
      }
    }
  }

  addChatMessage(text, type = "info") {
    if (!this.chat) {
      return;
    }
    if (this.chatIntroShown && type !== "intro") {
      return;
    }
    this.chatIntroShown = true;
    this.chat.addSystemMessage(text, "system");
  }

  clearChatMessages() {
    this.chat?.clear();
  }

  setupLobbySocket() {
    const socket = this.chat?.socket;
    if (!socket || this._lobbySocketBound) {
      return;
    }

    this._lobbySocketBound = true;

    socket.on("connect", () => {
      this.refreshOnlineStatus();
      this.requestRoomList();
      this.joinDefaultRoom();
    });

    socket.on("disconnect", () => {
      this._joiningDefaultRoom = false;
      this.refreshOnlineStatus();
      this.setLobbyState(null);
      this.renderRoomList([]);
      this.clearRemotePlayers();
    });

    socket.on("room:list", (rooms) => {
      this.renderRoomList(rooms);
    });

    socket.on("room:update", (room) => {
      this.setLobbyState(room);
      this.requestRoomList();
    });

    socket.on("player:sync", (payload) => {
      this.handleRemotePlayerSync(payload);
    });

    socket.on("block:update", (payload) => {
      this.applyRemoteBlockUpdate(payload);
    });

    socket.on("pvp:damage", (payload) => {
      this.handlePvpDamage(payload);
    });

    socket.on("room:started", ({ code }) => {
      if (!code || this.lobbyState.roomCode !== code) {
        return;
      }
      this.hud.setStatus(`??????濾?????????????????嫄????????????????(${code})`, false, 1);
      this.start({ mode: "online" });
    });

    socket.on("room:error", (message) => {
      const text = String(message ?? "Lobby error");
      this.hud.setStatus(text, true, 1.2);
      if (this.mpStatusEl) {
        this.mpStatusEl.textContent = `????????嫄???????????? ${text}`;
        this.mpStatusEl.dataset.state = "error";
      }
    });

    this.requestRoomList();
    this.joinDefaultRoom();
  }

  requestRoomList() {
    const socket = this.chat?.socket;
    if (!socket || !socket.connected) {
      this.renderRoomList([]);
      return;
    }
    socket.emit("room:list");
  }

  joinDefaultRoom({ force = false } = {}) {
    const socket = this.chat?.socket;
    if (!socket || !socket.connected) {
      return;
    }

    if (this.lobbyState.roomCode === ONLINE_ROOM_CODE) {
      return;
    }

    const now = Date.now();
    if (!force && now < this._nextAutoJoinAt) {
      return;
    }
    if (this._joiningDefaultRoom) {
      return;
    }

    this._joiningDefaultRoom = true;
    socket.emit("room:quick-join", { name: this.chat?.playerName }, (response = {}) => {
      this._joiningDefaultRoom = false;
      if (!response.ok) {
        this._nextAutoJoinAt = Date.now() + 1800;
        this.hud.setStatus(response.error ?? "Online room join failed", true, 1);
        this.refreshOnlineStatus();
        return;
      }
      this._nextAutoJoinAt = 0;
      this.setLobbyState(response.room ?? null);
      this.refreshOnlineStatus();
    });
  }

  renderRoomList(rooms) {
    if (!this.mpRoomListEl) {
      return;
    }

    const list = Array.isArray(rooms) ? rooms : [];
    const connected = !!this.chat?.isConnected?.();
    if (!connected) {
      this.mpRoomListEl.innerHTML = '<div class="mp-empty">????????嫄?????????????????????????곕춴????????????????????????꾩룆梨띰쭕?뚢뵾??????꿔꺂??????..</div>';
      return;
    }

    const globalRoom =
      list.find((room) => String(room.code ?? "").toUpperCase() === ONLINE_ROOM_CODE) ??
      list[0] ??
      null;
    if (!globalRoom) {
      this.mpRoomListEl.innerHTML = '<div class="mp-empty">GLOBAL ?????????????롪퍓梨????????釉먮폁???????????????????????룸챷援??????..</div>';
      return;
    }

    const playerCount = Number(globalRoom.count ?? this.lobbyState.players.length ?? 0);
    this.mpRoomListEl.innerHTML =
      `<div class="mp-room-row is-single">` +
      `<div class="mp-room-label">${ONLINE_ROOM_CODE}  ${playerCount}/${ONLINE_MAX_PLAYERS}` +
      `<span class="mp-room-host">24H OPEN</span>` +
      `</div>` +
      `</div>`;
  }

  setLobbyState(room) {
    if (!room) {
      this.lobbyState.roomCode = null;
      this.lobbyState.hostId = null;
      this.lobbyState.players = [];
      this.lobbyState.selectedTeam = null;
      this.clearRemotePlayers();
      this.mpLobbyEl?.classList.add("hidden");
      if (this.mpRoomTitleEl) {
        this.mpRoomTitleEl.textContent = "LOBBY";
      }
      if (this.mpRoomSubtitleEl) {
        this.mpRoomSubtitleEl.textContent = "Not joined";
      }
      if (this.mpPlayerListEl) {
        this.mpPlayerListEl.innerHTML = '<div class="mp-empty">Waiting for players...</div>';
      }
      this.mpTeamAlphaBtn?.classList.remove("is-active");
      this.mpTeamBravoBtn?.classList.remove("is-active");
      if (this.mpTeamAlphaCountEl) {
        this.mpTeamAlphaCountEl.textContent = "0";
      }
      if (this.mpTeamBravoCountEl) {
        this.mpTeamBravoCountEl.textContent = "0";
      }
      this.refreshOnlineStatus();
      return;
    }

    this.lobbyState.roomCode = String(room.code ?? "");
    this.lobbyState.hostId = String(room.hostId ?? "");
    this.lobbyState.players = Array.isArray(room.players) ? room.players : [];

    const myId = this.chat?.socket?.id ?? "";
    const me = this.lobbyState.players.find((player) => player.id === myId) ?? null;
    this.lobbyState.selectedTeam = me?.team ?? null;

    if (this.mpRoomTitleEl) {
      this.mpRoomTitleEl.textContent = `${this.lobbyState.roomCode} (${this.lobbyState.players.length}/${ONLINE_MAX_PLAYERS})`;
    }

    if (this.mpPlayerListEl) {
      this.mpPlayerListEl.innerHTML = "";
      for (const player of this.lobbyState.players) {
        const line = document.createElement("div");
        line.className = "mp-player-row";
        if (player.id === myId) {
          line.classList.add("is-self");
        }

        const name = document.createElement("span");
        name.className = "mp-player-name";
        name.textContent = player.name;
        line.appendChild(name);

        if (player.id === myId) {
          const selfTag = document.createElement("span");
          selfTag.className = "mp-tag self-tag";
          selfTag.textContent = "ME";
          line.appendChild(selfTag);
        }

        if (player.team) {
          const teamTag = document.createElement("span");
          teamTag.className = `mp-tag team-${String(player.team).toLowerCase()}`;
          teamTag.textContent = String(player.team).toUpperCase();
          line.appendChild(teamTag);
        }

        if (player.id === this.lobbyState.hostId) {
          const hostTag = document.createElement("span");
          hostTag.className = "mp-tag host-tag";
          hostTag.textContent = "HOST";
          line.appendChild(hostTag);
        }

        this.mpPlayerListEl.appendChild(line);
      }

      if (this.lobbyState.players.length === 0) {
        this.mpPlayerListEl.innerHTML = '<div class="mp-empty">Waiting for players...</div>';
      }
    }

    const alphaCount = this.lobbyState.players.filter((player) => player.team === "alpha").length;
    const bravoCount = this.lobbyState.players.filter((player) => player.team === "bravo").length;
    if (this.mpTeamAlphaCountEl) {
      this.mpTeamAlphaCountEl.textContent = `${alphaCount}`;
    }
    if (this.mpTeamBravoCountEl) {
      this.mpTeamBravoCountEl.textContent = `${bravoCount}`;
    }

    if (this.mpRoomSubtitleEl) {
      this.mpRoomSubtitleEl.textContent = `24H GLOBAL ROOM | ${this.lobbyState.players.length}/${ONLINE_MAX_PLAYERS}`;
    }

    this.mpTeamAlphaBtn?.classList.toggle("is-active", this.lobbyState.selectedTeam === "alpha");
    this.mpTeamBravoBtn?.classList.toggle("is-active", this.lobbyState.selectedTeam === "bravo");
    this.mpLobbyEl?.classList.remove("hidden");
    this.syncRemotePlayersFromLobby();
    if (this.activeMatchMode === "online" && this.isRunning) {
      this.emitLocalPlayerSync(REMOTE_SYNC_INTERVAL, true);
    }
    this.refreshOnlineStatus();
  }

  applyLobbyNickname() {
    const raw = this.mpNameInput?.value;
    if (!raw || !this.chat?.setPlayerName) {
      return;
    }
    this.chat.setPlayerName(raw);
  }

  createRoom() {
    this.applyLobbyNickname();
    this.joinDefaultRoom();
  }

  joinRoomByInputCode() {
    this.applyLobbyNickname();
    this.joinDefaultRoom();
  }

  joinRoom(_code) {
    this.applyLobbyNickname();
    this.joinDefaultRoom();
  }

  leaveRoom() {
    const socket = this.chat?.socket;
    if (!socket || !socket.connected) {
      this.setLobbyState(null);
      this.refreshOnlineStatus();
      return;
    }

    socket.emit("room:leave", (response = {}) => {
      if (!response.ok) {
        this.hud.setStatus(response.error ?? "Leave failed", true, 1);
        return;
      }

      this.setLobbyState(response.room ?? null);
      this.requestRoomList();
      this.hud.setStatus("Lobby state synced", false, 0.75);
    });
  }

  setTeam(team) {
    if (team !== "alpha" && team !== "bravo") {
      return;
    }

    const socket = this.chat?.socket;
    if (!socket || !socket.connected || !this.lobbyState.roomCode) {
      this.hud.setStatus("Join room before selecting team", true, 0.8);
      return;
    }

    socket.emit("room:set-team", { team }, (response = {}) => {
      if (!response.ok) {
        this.hud.setStatus(response.error ?? "Team select failed", true, 1);
        return;
      }

      this.lobbyState.selectedTeam = team;
      this.mpTeamAlphaBtn?.classList.toggle("is-active", team === "alpha");
      this.mpTeamBravoBtn?.classList.toggle("is-active", team === "bravo");
      this.hud.setStatus(`Team selected: ${team.toUpperCase()}`, false, 0.7);
    });
  }

  startOnlineMatch() {
    const socket = this.chat?.socket;
    if (!socket || !socket.connected) {
      this.hud.setStatus("Server offline", true, 1);
      return;
    }

    if (!this.lobbyState.roomCode) {
      this.joinDefaultRoom({ force: true });
      this.hud.setStatus("Auto-joining online room", false, 0.8);
      return;
    }

    socket.emit("room:start", (response = {}) => {
      if (!response.ok) {
        this.hud.setStatus(response.error ?? "Online start failed", true, 1);
      }
    });
  }

  async copyCurrentRoomCode() {
    const code = this.lobbyState.roomCode;
    if (!code) {
      this.hud.setStatus("No room code to copy", true, 0.9);
      return;
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(code);
      } else {
        const temp = document.createElement("textarea");
        temp.value = code;
        document.body.appendChild(temp);
        temp.select();
        document.execCommand("copy");
        document.body.removeChild(temp);
      }
      this.hud.setStatus(`Room code copied: ${code}`, false, 0.8);
    } catch {
      this.hud.setStatus("Copy failed", true, 0.9);
    }
  }

  updateLobbyControls() {
    const connected = !!this.chat?.isConnected?.();
    const connecting = !!this.chat?.isConnecting?.();
    const inRoom = !!this.lobbyState.roomCode;
    const canStart = connected && inRoom;

    if (this.mpCreateBtn) {
      this.mpCreateBtn.disabled = true;
      this.mpCreateBtn.classList.add("hidden");
    }
    if (this.mpJoinBtn) {
      this.mpJoinBtn.disabled = true;
      this.mpJoinBtn.classList.add("hidden");
    }
    if (this.mpCodeInput) {
      this.mpCodeInput.disabled = true;
      this.mpCodeInput.classList.add("hidden");
    }
    if (this.mpStartBtn) {
      this.mpStartBtn.disabled = !canStart;
      if (!connected && connecting) {
        this.mpStartBtn.textContent = "Server connecting...";
      } else if (!connected) {
        this.mpStartBtn.textContent = "Server offline";
      } else if (!inRoom) {
        this.mpStartBtn.textContent = "Auto-joining room...";
      } else {
        this.mpStartBtn.textContent = "Start online match";
      }
    }
    if (this.mpLeaveBtn) {
      this.mpLeaveBtn.disabled = true;
      this.mpLeaveBtn.classList.add("hidden");
    }
    if (this.mpCopyCodeBtn) {
      this.mpCopyCodeBtn.disabled = true;
      this.mpCopyCodeBtn.classList.add("hidden");
    }
    if (this.mpTeamAlphaBtn) {
      this.mpTeamAlphaBtn.disabled = !inRoom;
    }
    if (this.mpTeamBravoBtn) {
      this.mpTeamBravoBtn.disabled = !inRoom;
    }
    if (this.mpRefreshBtn) {
      this.mpRefreshBtn.disabled = !connected;
    }
  }

  refreshOnlineStatus() {
    if (!this.mpStatusEl) {
      this.updateLobbyControls();
      return;
    }

    if (!this.chat) {
      this.mpStatusEl.textContent = "Server: chat module missing";
      this.mpStatusEl.dataset.state = "offline";
      this.updateLobbyControls();
      return;
    }

    if (this.chat.isConnecting()) {
      this.mpStatusEl.textContent = "Server: connecting (waking up)...";
      this.mpStatusEl.dataset.state = "offline";
      this.updateLobbyControls();
      return;
    }

    if (!this.chat.isConnected()) {
      this.mpStatusEl.textContent = "Server: offline";
      this.mpStatusEl.dataset.state = "offline";
      this.updateLobbyControls();
      return;
    }

    if (this.lobbyState.roomCode) {
      this.mpStatusEl.textContent = `Server: online | ${this.lobbyState.roomCode} (${this.lobbyState.players.length}/${ONLINE_MAX_PLAYERS})`;
      this.mpStatusEl.dataset.state = "online";
      this.updateLobbyControls();
      return;
    }

    this.mpStatusEl.textContent = "Server: online | auto-joining room...";
    this.mpStatusEl.dataset.state = "online";
    this.joinDefaultRoom();
    this.updateLobbyControls();
  }
}
