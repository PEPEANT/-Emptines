import * as THREE from "three";
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
const WORLD_LIMIT = 72;
const PLAYER_RADIUS = 0.34;
const POINTER_LOCK_FALLBACK_MS = 900;
const MOBILE_LOOK_SENSITIVITY_X = 0.0032;
const MOBILE_LOOK_SENSITIVITY_Y = 0.0028;
const ONLINE_ROOM_CODE = "GLOBAL";
const ONLINE_MAX_PLAYERS = 50;

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

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x09111a);
    this.scene.fog = new THREE.Fog(0x09111a, 48, 320);

    this.camera = new THREE.PerspectiveCamera(
      DEFAULT_FOV,
      window.innerWidth / window.innerHeight,
      0.1,
      500
    );

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

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
    this.mobileEnabled = isLikelyTouchDevice();
    if (this.mobileEnabled) {
      this.allowUnlockedLook = true;
      this.mouseLookEnabled = true;
    }

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

    const configureColorTexture = (url, repeatX = 1, repeatY = 1) => {
      const texture = this.textureLoader.load(url);
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(repeatX, repeatY);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = maxAnisotropy;
      return texture;
    };

    const configureSpriteTexture = (url) => {
      const texture = this.textureLoader.load(url);
      texture.colorSpace = THREE.SRGBColorSpace;
      return texture;
    };

    return {
      groundMap: configureColorTexture("/assets/graphics/world/textures/ground.svg", 26, 26),
      concreteMap: configureColorTexture("/assets/graphics/world/textures/concrete.svg", 1.4, 1.4),
      metalMap: configureColorTexture("/assets/graphics/world/textures/metal.svg", 1.2, 1.2),
      enemyMap: configureColorTexture("/assets/graphics/world/textures/metal.svg", 1, 1),
      skyMap: configureColorTexture("/assets/graphics/world/sky/sky.svg", 1, 1),
      muzzleFlashMap: configureSpriteTexture("/assets/graphics/world/sprites/muzzleflash.svg"),
      sparkMap: configureSpriteTexture("/assets/graphics/world/sprites/spark.svg")
    };
  }

  setupWorld() {
    this.setupSky();

    const hemiLight = new THREE.HemisphereLight(0x93bcd1, 0x1f2f1f, 0.9);
    this.scene.add(hemiLight);

    const sun = new THREE.DirectionalLight(0xf5f2d0, 1.18);
    sun.position.set(48, 62, 28);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -220;
    sun.shadow.camera.right = 220;
    sun.shadow.camera.top = 220;
    sun.shadow.camera.bottom = -220;
    sun.shadow.bias = -0.00026;
    sun.shadow.normalBias = 0.022;
    this.scene.add(sun);

    const fill = new THREE.DirectionalLight(0x8ec7ff, 0.26);
    fill.position.set(-38, 30, -24);
    this.scene.add(fill);

    this.voxelWorld.generateTerrain();
    this.setupObjectives();
  }

  setupSky() {
    const skyMaterial = new THREE.MeshBasicMaterial({
      map: this.graphics.skyMap,
      side: THREE.BackSide
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(620, 32, 18), skyMaterial);
    this.scene.add(sky);

    const starCount = 650;
    const positions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i += 1) {
      const radius = 170 + Math.random() * 150;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.46;
      const x = radius * Math.sin(phi) * Math.cos(theta);
      const y = radius * Math.cos(phi) + 38;
      const z = radius * Math.sin(phi) * Math.sin(theta);
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
    }

    const starsGeometry = new THREE.BufferGeometry();
    starsGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const starsMaterial = new THREE.PointsMaterial({
      color: 0xc8dfff,
      size: 0.9,
      transparent: true,
      opacity: 0.65,
      sizeAttenuation: true
    });
    const stars = new THREE.Points(starsGeometry, starsMaterial);
    this.scene.add(stars);
  }

  setupObjectives() {
    for (const marker of this.objectiveMarkers) {
      this.scene.remove(marker);
    }
    this.objectiveMarkers.length = 0;
    this.controlBeacon = null;
    this.controlRing = null;
    this.controlCore = null;

    if (this.alphaFlag) {
      this.scene.remove(this.alphaFlag);
    }
    if (this.bravoFlag) {
      this.scene.remove(this.bravoFlag);
    }

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
    this.state.objectiveText = this.getObjectiveText();
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
    if (!this.isRunning || this.isGameOver || !this.bravoFlag) {
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

    const handleMaterial = new THREE.MeshStandardMaterial({
      color: 0x6e5138,
      roughness: 0.82,
      metalness: 0.08
    });
    const metalMaterial = new THREE.MeshStandardMaterial({
      color: 0x8a99ab,
      roughness: 0.35,
      metalness: 0.72
    });

    const handle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.032, 0.86, 12),
      handleMaterial
    );
    handle.rotation.x = Math.PI * 0.5;
    handle.castShadow = true;

    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.27, 0.06), metalMaterial);
    blade.position.set(0, -0.16, -0.42);
    blade.castShadow = true;

    const collar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.1), metalMaterial);
    collar.position.set(0, -0.04, -0.31);
    collar.castShadow = true;

    group.add(handle, blade, collar);
    group.position.set(0.48, -0.44, -0.72);
    group.rotation.set(-0.28, -0.18, 0.34);
    group.visible = false;
    return group;
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
    if (!this.isRunning || this.isGameOver || this.chat?.isInputFocused) {
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
      this.buildSystem.setToolMode("place");
      this.syncMobileUtilityButtons();
    });
    bindUtilityTap(this.mobileModeDigBtn, () => {
      this.buildSystem.setToolMode("dig");
      this.syncMobileUtilityButtons();
    });
    bindUtilityTap(this.mobileModeGunBtn, () => {
      this.buildSystem.setToolMode("gun");
      this.syncMobileUtilityButtons();
    });
    this.mobileAimBtn.addEventListener("pointerdown", (event) => {
      if (!acceptPointer(event)) {
        return;
      }
      event.preventDefault();
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
      if (this.onGround && this.isRunning && !this.isGameOver) {
        this.verticalVelocity = JUMP_FORCE;
        this.onGround = false;
      }
    });
    bindUtilityTap(this.mobileReloadBtn, () => {
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

      if (this.buildSystem.handleKeyDown(event)) {
        event.preventDefault();
        return;
      }

      if (controlKeys.has(event.code)) {
        event.preventDefault();
      }
      this.keys.add(event.code);

      if (event.code === "KeyR") {
        if (!this.buildSystem.isGunMode()) {
          this.hud.setStatus("Press 3 to switch to gun mode", true, 0.9);
        } else if (this.weapon.startReload()) {
          this.hud.setStatus("???????..", true, 0.6);
        }
      }

      if (event.code === "Space" && this.onGround && this.isRunning && !this.isGameOver) {
        this.verticalVelocity = JUMP_FORCE;
        this.onGround = false;
      }

      if (event.code === "ArrowRight") {
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

      if (event.code === "ArrowRight") {
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
        if (this.buildSystem.handleWheel(event)) {
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

      if (this.buildSystem.isBuildMode()) {
        if (event.button === 0 || event.button === 2) {
          this.buildSystem.handlePointerAction(event.button, (x, y, z) =>
            !this.isPlayerIntersectingBlock(x, y, z)
          );
          return;
        }
      }

      const shouldTryPointerLock =
        this.pointerLockSupported &&
        !this.pointerLocked &&
        !this.mouseLookEnabled &&
        !this.chat?.isInputFocused;

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
      switchTab(btnOnline, btnSingle, panelOnline, panelSingle);
      this.menuMode = "online";
    }

    this.startButton?.addEventListener("click", () => {
      this.applyLobbyNickname();
      this.start({ mode: "single" });
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

    this.addChatMessage("Operation started. Survive and score points.", "info");
    this.addChatMessage("Objective: capture flags and hold the center point.", "info");
    this.addChatMessage("Controls: WASD, SPACE, 1/2/3, R, NumPad1-8", "info");
    if (this.activeMatchMode === "online") {
      this.hud.setStatus("Online match: AI disabled", false, 0.9);
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
    this.state.objectiveText = this.getObjectiveText();
    this.state.killStreak = 0;
    this.state.lastKillTime = 0;
    this._wasReloading = false;
    this.lastDryFireAt = -10;
    this.chatIntroShown = false;
    this.resetObjectives();
    this.clearChatMessages();
    this.hud.setKillStreak(0);
    this.camera.position.copy(this.playerPosition);
    this.camera.rotation.set(0, 0, 0);
    this.syncCursorVisibility();

    this.hud.update(0, { ...this.state, ...this.weapon.getState() });
    if (this.weaponFlashLight) {
      this.weaponFlashLight.intensity = 0;
    }
  }

  fire() {
    if (
      !this.isRunning ||
      this.isGameOver ||
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
    const aiEnabled = this.activeMatchMode !== "online";

    if (gunMode) {
      this.weapon.update(delta);
    }

    if (!this.isRunning || this.isGameOver || (!this.mouseLookEnabled && !isChatting)) {
      this.hud.update(delta, {
        ...this.state,
        ...this.weapon.getState(),
        enemyCount: aiEnabled ? this.enemyManager.enemies.length : 0
      });
      return;
    }

    if (gunMode && this.leftMouseDown) {
      this.fire();
    }

    this.applyMovement(delta);
    this.updateCamera(delta);
    this.updateObjectives(delta);

    const weapState = this.weapon.getState();
    if (gunMode && !this._wasReloading && weapState.reloading) {
      this.sound.play("reload", { gain: 0.9, rateJitter: 0.03 });
    }
    if (gunMode && this._wasReloading && !weapState.reloading) {
      this.addChatMessage("Reload complete", "info");
    }
    this._wasReloading = gunMode ? weapState.reloading : false;

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
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(() => this.loop());
  }

  onResize() {
    this.mobileEnabled = isLikelyTouchDevice();
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
    const build = mode !== "gun" && mode !== "weapon";
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
    });

    socket.on("room:list", (rooms) => {
      this.renderRoomList(rooms);
    });

    socket.on("room:update", (room) => {
      this.setLobbyState(room);
      this.requestRoomList();
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
      if (!connected) {
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
