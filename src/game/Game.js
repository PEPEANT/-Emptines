import * as THREE from "three";
import { io } from "socket.io-client";
import { Sky } from "three/addons/objects/Sky.js";
import { HUD } from "./HUD.js";

const PLAYER_HEIGHT = 1.72;
const DEFAULT_FOV = 75;
const PLAYER_SPEED = 8.8;
const PLAYER_SPRINT = 13.2;
const PLAYER_GRAVITY = -24;
const JUMP_FORCE = 8.8;
const WORLD_LIMIT = 30000;
const REMOTE_SYNC_INTERVAL = 1 / 12;
const REMOTE_LERP_SPEED = 12;

function isLikelyTouchDevice() {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }

  const coarse = window.matchMedia?.("(pointer: coarse)")?.matches ?? false;
  const touchPoints = navigator.maxTouchPoints ?? 0;
  return coarse || touchPoints > 0;
}

function lerpAngle(from, to, alpha) {
  const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + delta * alpha;
}

function disposeMeshTree(root) {
  if (!root) {
    return;
  }

  root.traverse((node) => {
    if (node.geometry) {
      node.geometry.dispose?.();
    }

    const material = node.material;
    if (Array.isArray(material)) {
      for (const item of material) {
        item?.dispose?.();
      }
    } else {
      material?.dispose?.();
    }
  });
}

export class Game {
  constructor(mount) {
    this.mount = mount;
    this.clock = new THREE.Clock();
    this.mobileEnabled = isLikelyTouchDevice();
    this.hud = new HUD();

    const initialPixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    this.maxPixelRatio = initialPixelRatio;
    this.currentPixelRatio = initialPixelRatio;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xa2d9ff);
    this.scene.fog = new THREE.Fog(0xa2d9ff, 550, 4200);

    this.camera = new THREE.PerspectiveCamera(
      DEFAULT_FOV,
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
    this.renderer.toneMappingExposure = 1.03;
    this.renderer.shadowMap.enabled = !this.mobileEnabled;
    this.renderer.shadowMap.autoUpdate = !this.mobileEnabled;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.textureLoader = new THREE.TextureLoader();

    this.playerPosition = new THREE.Vector3(0, PLAYER_HEIGHT, 0);
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

    this.skyDome = null;
    this.skySun = new THREE.Vector3();
    this.sunLight = null;
    this.ground = null;
    this.handView = null;

    this.dynamicResolution = {
      enabled: true,
      minRatio: this.mobileEnabled ? 0.65 : 0.85,
      sampleTime: 0,
      frameCount: 0,
      cooldown: 0
    };

    this.fpsState = {
      sampleTime: 0,
      frameCount: 0,
      fps: 0
    };

    this.socket = null;
    this.networkConnected = false;
    this.localPlayerId = null;
    this.remotePlayers = new Map();
    this.remoteSyncClock = 0;

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

    this.setupWorld();
    this.setupHands();
    this.bindEvents();
    this.connectNetwork();

    this.camera.rotation.order = "YXZ";
    this.camera.position.copy(this.playerPosition);

    this.hud.update({
      status: this.getStatusText(),
      players: 1,
      x: this.playerPosition.x,
      z: this.playerPosition.z,
      fps: 0
    });

    this.loop();
  }

  setupWorld() {
    const hemi = new THREE.HemisphereLight(0xbce7ff, 0x75b160, 1.22);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xffffff, 1.26);
    sun.position.set(70, 130, 44);
    sun.castShadow = !this.mobileEnabled;
    sun.shadow.mapSize.set(this.mobileEnabled ? 1024 : 1536, this.mobileEnabled ? 1024 : 1536);
    sun.shadow.camera.left = -300;
    sun.shadow.camera.right = 300;
    sun.shadow.camera.top = 300;
    sun.shadow.camera.bottom = -300;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 500;
    sun.shadow.bias = -0.00018;
    sun.shadow.normalBias = 0.02;
    this.scene.add(sun);
    this.sunLight = sun;

    const fill = new THREE.DirectionalLight(0xb9e6ff, 0.42);
    fill.position.set(-72, 56, -32);
    this.scene.add(fill);

    this.setupSky(sun.position.clone().normalize());

    const maxAnisotropy = this.renderer.capabilities.getMaxAnisotropy();
    const anisotropy = this.mobileEnabled ? Math.min(4, maxAnisotropy) : maxAnisotropy;
    const groundMap = this.textureLoader.load("/assets/graphics/world/textures/ground.svg");
    groundMap.wrapS = THREE.RepeatWrapping;
    groundMap.wrapT = THREE.RepeatWrapping;
    groundMap.repeat.set(600, 600);
    groundMap.colorSpace = THREE.SRGBColorSpace;
    groundMap.anisotropy = anisotropy;

    this.ground = new THREE.Mesh(
      new THREE.PlaneGeometry(200000, 200000, 1, 1),
      new THREE.MeshStandardMaterial({
        color: 0x8ecf7f,
        map: groundMap,
        roughness: 0.97,
        metalness: 0,
        emissive: 0x1d5f31,
        emissiveIntensity: 0.09
      })
    );
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);

    const originMarker = new THREE.Mesh(
      new THREE.CylinderGeometry(0.4, 0.4, 1.6, 14),
      new THREE.MeshStandardMaterial({
        color: 0x5e6f83,
        roughness: 0.32,
        metalness: 0.1,
        emissive: 0x2a3a52,
        emissiveIntensity: 0.2
      })
    );
    originMarker.position.set(0, 0.8, -5);
    originMarker.castShadow = true;
    this.scene.add(originMarker);
  }

  setupSky(sunDirection) {
    if (this.skyDome) {
      this.scene.remove(this.skyDome);
      disposeMeshTree(this.skyDome);
      this.skyDome = null;
    }

    const sky = new Sky();
    sky.scale.setScalar(450000);
    const uniforms = sky.material.uniforms;
    uniforms.turbidity.value = 2.9;
    uniforms.rayleigh.value = 2.4;
    uniforms.mieCoefficient.value = 0.005;
    uniforms.mieDirectionalG.value = 0.79;

    this.skySun.copy(sunDirection).multiplyScalar(450000);
    uniforms.sunPosition.value.copy(this.skySun);

    this.skyDome = sky;
    this.scene.add(this.skyDome);
  }

  setupHands() {
    const group = new THREE.Group();

    const skin = new THREE.MeshStandardMaterial({
      color: 0xbcc6d6,
      roughness: 0.4,
      metalness: 0.05,
      emissive: 0x2f425e,
      emissiveIntensity: 0.16
    });

    const sleeve = new THREE.MeshStandardMaterial({
      color: 0x4e6889,
      roughness: 0.55,
      metalness: 0.08,
      emissive: 0x1e2c3f,
      emissiveIntensity: 0.2
    });

    const rightPalm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.11, 0.2), skin);
    rightPalm.position.set(0.24, -0.34, -0.46);
    rightPalm.castShadow = true;

    const rightSleeve = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.15, 0.24), sleeve);
    rightSleeve.position.set(0.26, -0.27, -0.58);
    rightSleeve.castShadow = true;

    const leftPalm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.11, 0.2), skin);
    leftPalm.position.set(-0.24, -0.34, -0.46);
    leftPalm.castShadow = true;

    const leftSleeve = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.15, 0.24), sleeve);
    leftSleeve.position.set(-0.26, -0.27, -0.58);
    leftSleeve.castShadow = true;

    group.add(rightPalm, rightSleeve, leftPalm, leftSleeve);
    group.position.set(0, 0, 0);
    group.rotation.x = -0.03;

    this.handView = group;
    this.camera.add(this.handView);
  }

  bindEvents() {
    window.addEventListener("resize", () => this.onResize());

    window.addEventListener("keydown", (event) => {
      if (event.code === "Space") {
        event.preventDefault();
      }

      this.keys.add(event.code);
      if (event.code === "Space" && this.onGround) {
        this.verticalVelocity = JUMP_FORCE;
        this.onGround = false;
      }
    });

    window.addEventListener("keyup", (event) => {
      this.keys.delete(event.code);
    });

    window.addEventListener("blur", () => {
      this.keys.clear();
    });

    this.renderer.domElement.addEventListener("click", () => {
      this.tryPointerLock();
    });

    document.addEventListener("pointerlockchange", () => {
      this.pointerLocked = document.pointerLockElement === this.renderer.domElement;
      this.hud.setStatus(this.getStatusText());
    });

    window.addEventListener(
      "mousemove",
      (event) => {
        if (!this.pointerLocked && !this.mobileEnabled) {
          return;
        }
        const sensitivityX = this.mobileEnabled ? 0.0018 : 0.0023;
        const sensitivityY = this.mobileEnabled ? 0.0016 : 0.002;
        this.yaw -= event.movementX * sensitivityX;
        this.pitch -= event.movementY * sensitivityY;
        this.pitch = THREE.MathUtils.clamp(this.pitch, -1.52, 1.52);
      },
      { passive: true }
    );
  }

  tryPointerLock() {
    if (!this.pointerLockSupported || this.pointerLocked) {
      return;
    }
    const maybePromise = this.renderer.domElement.requestPointerLock();
    if (maybePromise && typeof maybePromise.catch === "function") {
      maybePromise.catch(() => {
        this.hud.setStatus(this.networkConnected ? "ONLINE" : "OFFLINE");
      });
    }
  }

  connectNetwork() {
    const endpoint = this.resolveSocketEndpoint();
    if (!endpoint) {
      this.networkConnected = false;
      this.hud.setStatus("OFFLINE");
      return;
    }

    const socket = io(endpoint, {
      transports: ["websocket", "polling"],
      timeout: 3200,
      reconnection: true,
      reconnectionDelay: 900,
      reconnectionDelayMax: 5000
    });

    this.socket = socket;

    socket.on("connect", () => {
      this.networkConnected = true;
      this.localPlayerId = socket.id;
      this.hud.setStatus(this.getStatusText());
    });

    socket.on("disconnect", () => {
      this.networkConnected = false;
      this.localPlayerId = null;
      this.clearRemotePlayers();
      this.hud.setStatus(this.getStatusText());
      this.hud.setPlayers(1);
    });

    socket.on("connect_error", () => {
      this.networkConnected = false;
      this.hud.setStatus(this.getStatusText());
    });

    socket.on("room:update", (room) => {
      this.handleRoomUpdate(room);
    });

    socket.on("player:sync", (payload) => {
      this.handleRemoteSync(payload);
    });
  }

  resolveSocketEndpoint() {
    if (typeof window === "undefined") {
      return null;
    }

    const { protocol, hostname } = window.location;

    if (protocol === "file:") {
      return "http://localhost:3001";
    }

    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return `${protocol}//${hostname}:3001`;
    }

    if (hostname.endsWith("github.io")) {
      return null;
    }

    return `${protocol}//${hostname}`;
  }

  handleRoomUpdate(room) {
    const players = Array.isArray(room?.players) ? room.players : [];
    const seen = new Set();

    for (const player of players) {
      const id = String(player?.id ?? "");
      if (!id || id === this.localPlayerId) {
        continue;
      }
      seen.add(id);
      this.upsertRemotePlayer(id, player.state ?? null);
    }

    for (const id of this.remotePlayers.keys()) {
      if (!seen.has(id)) {
        this.removeRemotePlayer(id);
      }
    }

    const localPlayer = this.networkConnected ? 1 : 0;
    this.hud.setPlayers(this.remotePlayers.size + localPlayer);
  }

  handleRemoteSync(payload) {
    const id = String(payload?.id ?? "");
    if (!id || id === this.localPlayerId) {
      return;
    }

    this.upsertRemotePlayer(id, payload.state ?? null);
    const localPlayer = this.networkConnected ? 1 : 0;
    this.hud.setPlayers(this.remotePlayers.size + localPlayer);
  }

  upsertRemotePlayer(id, state) {
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
      body.castShadow = true;
      body.receiveShadow = true;

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
      head.castShadow = true;
      head.receiveShadow = true;

      root.add(body, head);
      root.position.set(0, 0, 0);
      this.scene.add(root);

      remote = {
        mesh: root,
        targetPosition: new THREE.Vector3(0, 0, 0),
        targetYaw: 0,
        lastSeen: performance.now()
      };

      this.remotePlayers.set(id, remote);
    }

    if (state) {
      remote.targetPosition.set(
        Number(state.x) || 0,
        Math.max(0, (Number(state.y) || PLAYER_HEIGHT) - PLAYER_HEIGHT),
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
    this.updateMovement(delta);
    this.updateRemotePlayers(delta);
    this.emitLocalSync(delta);
    this.updateDynamicResolution(delta);
    this.updateHud(delta);
  }

  updateMovement(delta) {
    const keyForward =
      (this.keys.has("KeyW") || this.keys.has("ArrowUp") ? 1 : 0) -
      (this.keys.has("KeyS") || this.keys.has("ArrowDown") ? 1 : 0);
    const keyStrafe =
      (this.keys.has("KeyD") || this.keys.has("ArrowRight") ? 1 : 0) -
      (this.keys.has("KeyA") || this.keys.has("ArrowLeft") ? 1 : 0);

    const sprinting = this.keys.has("ShiftLeft") || this.keys.has("ShiftRight");
    const speed = sprinting ? PLAYER_SPRINT : PLAYER_SPEED;

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
      this.playerPosition.x = THREE.MathUtils.clamp(
        this.playerPosition.x + this.moveVec.x * moveStep,
        -WORLD_LIMIT,
        WORLD_LIMIT
      );
      this.playerPosition.z = THREE.MathUtils.clamp(
        this.playerPosition.z + this.moveVec.z * moveStep,
        -WORLD_LIMIT,
        WORLD_LIMIT
      );
    }

    this.verticalVelocity += PLAYER_GRAVITY * delta;
    this.playerPosition.y += this.verticalVelocity * delta;

    if (this.playerPosition.y <= PLAYER_HEIGHT) {
      this.playerPosition.y = PLAYER_HEIGHT;
      this.verticalVelocity = 0;
      this.onGround = true;
    } else {
      this.onGround = false;
    }

    this.camera.position.copy(this.playerPosition);
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;

    if (this.handView) {
      const sway = Math.sin(performance.now() * 0.0042) * 0.012;
      this.handView.position.y = sway;
    }
  }

  updateRemotePlayers(delta) {
    const alpha = THREE.MathUtils.clamp(1 - Math.exp(-REMOTE_LERP_SPEED * delta), 0, 1);
    const now = performance.now();

    for (const [id, remote] of this.remotePlayers) {
      remote.mesh.position.lerp(remote.targetPosition, alpha);
      remote.mesh.rotation.y = lerpAngle(remote.mesh.rotation.y, remote.targetYaw, alpha);

      if (now - remote.lastSeen > 15000) {
        this.removeRemotePlayer(id);
      }
    }
  }

  emitLocalSync(delta) {
    if (!this.socket || !this.networkConnected) {
      return;
    }

    this.remoteSyncClock += delta;
    if (this.remoteSyncClock < REMOTE_SYNC_INTERVAL) {
      return;
    }
    this.remoteSyncClock = 0;

    this.socket.emit("player:sync", {
      x: this.playerPosition.x,
      y: this.playerPosition.y,
      z: this.playerPosition.z,
      yaw: this.yaw,
      pitch: this.pitch
    });
  }

  updateHud(delta) {
    const fpsState = this.fpsState;
    fpsState.sampleTime += delta;
    fpsState.frameCount += 1;

    if (fpsState.sampleTime >= 0.5) {
      fpsState.fps = fpsState.frameCount / fpsState.sampleTime;
      fpsState.sampleTime = 0;
      fpsState.frameCount = 0;
    }

    const localPlayer = this.networkConnected ? 1 : 0;
    this.hud.update({
      status: this.getStatusText(),
      players: this.remotePlayers.size + localPlayer,
      x: this.playerPosition.x,
      z: this.playerPosition.z,
      fps: fpsState.fps
    });
  }

  getStatusText() {
    if (!this.networkConnected) {
      return "OFFLINE";
    }
    if (this.pointerLockSupported && !this.pointerLocked && !this.mobileEnabled) {
      return "ONLINE / CLICK";
    }
    return "ONLINE";
  }

  loop() {
    const delta = Math.min(this.clock.getDelta(), 0.05);
    this.tick(delta);
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(() => this.loop());
  }

  updateDynamicResolution(delta) {
    const config = this.dynamicResolution;
    if (!config || !config.enabled || !Number.isFinite(delta) || delta <= 0) {
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

  onResize() {
    const wasMobile = this.mobileEnabled;
    this.mobileEnabled = isLikelyTouchDevice();

    if (this.mobileEnabled !== wasMobile) {
      this.applyQualityProfile();
    }

    this.dynamicResolution.minRatio = this.mobileEnabled ? 0.65 : 0.85;

    this.maxPixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const minPixelRatio = Math.max(0.5, Math.min(this.dynamicResolution.minRatio, this.maxPixelRatio));
    const clampedRatio = THREE.MathUtils.clamp(this.currentPixelRatio, minPixelRatio, this.maxPixelRatio);
    if (Math.abs(clampedRatio - this.currentPixelRatio) > 0.01) {
      this.currentPixelRatio = Number(clampedRatio.toFixed(2));
      this.renderer.setPixelRatio(this.currentPixelRatio);
    }

    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}