import * as THREE from "three";
import { EnemyManager } from "./EnemyManager.js";
import { WeaponSystem } from "./WeaponSystem.js";
import { HUD } from "./HUD.js";

const PLAYER_HEIGHT = 1.75;
const DEFAULT_FOV = 75;
const AIM_FOV = 48;
const PLAYER_SPEED = 8.4;
const PLAYER_SPRINT = 12.6;
const PLAYER_GRAVITY = -22;
const JUMP_FORCE = 8.4;
const WORLD_LIMIT = 95;

export class Game {
  constructor(mount) {
    this.mount = mount;
    this.clock = new THREE.Clock();

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x09111a);
    this.scene.fog = new THREE.Fog(0x09111a, 38, 190);

    this.camera = new THREE.PerspectiveCamera(
      DEFAULT_FOV,
      window.innerWidth / window.innerHeight,
      0.1,
      500
    );

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.textureLoader = new THREE.TextureLoader();
    this.graphics = this.loadGraphics();

    this.hud = new HUD();
    this.weapon = new WeaponSystem();
    this.enemyManager = new EnemyManager(this.scene, {
      enemyMap: this.graphics.enemyMap
    });
    this.raycaster = new THREE.Raycaster();

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
    this.weaponView = this.createWeaponView();
    this.weaponRecoil = 0;
    this.weaponBobClock = 0;
    this.isAiming = false;
    this.rightMouseAiming = false;
    this.aimBlend = 0;
    this.hitSparks = [];

    this.isRunning = false;
    this.isGameOver = false;
    this.pointerLocked = false;

    this.state = {
      health: 100,
      score: 0
    };

    this.pointerLockSupported =
      "pointerLockElement" in document &&
      typeof this.renderer.domElement.requestPointerLock === "function";
    this.allowUnlockedLook = !this.pointerLockSupported;
    this.mouseLookEnabled = this.allowUnlockedLook;

    this.startButton = document.getElementById("start-button");
    this.restartButton = document.getElementById("restart-button");
  }

  init() {
    this.mount.appendChild(this.renderer.domElement);
    this.scene.add(this.camera);
    this.camera.add(this.weaponView);
    this.setupWorld();
    this.bindEvents();
    this.resetState();
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
    sun.shadow.camera.left = -120;
    sun.shadow.camera.right = 120;
    sun.shadow.camera.top = 120;
    sun.shadow.camera.bottom = -120;
    this.scene.add(sun);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(240, 240),
      new THREE.MeshStandardMaterial({
        map: this.graphics.groundMap,
        color: 0xafbfd8,
        roughness: 0.88,
        metalness: 0.06
      })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    const wallConcreteMaterial = new THREE.MeshStandardMaterial({
      map: this.graphics.concreteMap,
      color: 0xc7d4e6,
      roughness: 0.72,
      metalness: 0.1
    });
    const wallMetalMaterial = new THREE.MeshStandardMaterial({
      map: this.graphics.metalMap,
      color: 0xc2daf5,
      roughness: 0.56,
      metalness: 0.28
    });

    for (let i = 0; i < 36; i += 1) {
      const width = 2 + Math.random() * 4;
      const height = 2 + Math.random() * 8;
      const depth = 2 + Math.random() * 4;
      const material = Math.random() < 0.65 ? wallConcreteMaterial : wallMetalMaterial;
      const block = new THREE.Mesh(
        new THREE.BoxGeometry(width, height, depth),
        material
      );

      block.position.set(
        THREE.MathUtils.randFloatSpread(160),
        height / 2,
        THREE.MathUtils.randFloatSpread(160)
      );
      block.rotation.y = Math.random() * Math.PI;
      block.castShadow = true;
      block.receiveShadow = true;
      this.scene.add(block);
    }

    const beaconMaterial = new THREE.MeshStandardMaterial({
      color: 0x7cefd4,
      emissive: 0x39f6a4,
      emissiveIntensity: 0.65,
      roughness: 0.24,
      metalness: 0.5
    });
    const beaconGeometry = new THREE.CylinderGeometry(0.35, 0.35, 7.5, 8);
    for (let i = 0; i < 14; i += 1) {
      const beacon = new THREE.Mesh(beaconGeometry, beaconMaterial);
      beacon.position.set(
        THREE.MathUtils.randFloatSpread(170),
        3.75,
        THREE.MathUtils.randFloatSpread(170)
      );
      beacon.castShadow = true;
      this.scene.add(beacon);
    }
  }

  setupSky() {
    const skyMaterial = new THREE.MeshBasicMaterial({
      map: this.graphics.skyMap,
      side: THREE.BackSide
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(340, 32, 18), skyMaterial);
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

    group.add(body, barrel, grip, rail, muzzleFlash);
    group.position.set(0.38, -0.38, -0.76);
    group.rotation.set(-0.22, -0.06, 0.02);

    this.weaponFlash = muzzleFlash;
    return group;
  }

  bindEvents() {
    window.addEventListener("resize", () => this.onResize());
    window.addEventListener("blur", () => {
      this.keys.clear();
      this.isAiming = false;
      this.rightMouseAiming = false;
    });
    const controlKeys = new Set([
      "KeyW",
      "KeyA",
      "KeyS",
      "KeyD",
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "Space",
      "ShiftLeft",
      "ShiftRight",
      "KeyR"
    ]);

    document.addEventListener("keydown", (event) => {
      if (controlKeys.has(event.code)) {
        event.preventDefault();
      }
      this.keys.add(event.code);

      if (event.code === "KeyR" && this.weapon.startReload()) {
        this.hud.setStatus("재장전 시작", true, 0.6);
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

      this.allowUnlockedLook = true;
      this.mouseLookEnabled = true;
      this.hud.showPauseOverlay(false);
      this.hud.setStatus("포인터락 실패: 프리 룩 모드", true, 1.1);
      this.syncCursorVisibility();
    });

    document.addEventListener("mousemove", (event) => {
      if (!this.isRunning || this.isGameOver || !this.mouseLookEnabled) {
        return;
      }

      const currentAim = this.isAiming || this.rightMouseAiming;
      const lookScale = currentAim ? 0.58 : 1;
      this.yaw -= event.movementX * 0.0022 * lookScale;
      this.pitch -= event.movementY * 0.002 * lookScale;
      this.pitch = THREE.MathUtils.clamp(this.pitch, -1.45, 1.45);
    });

    this.renderer.domElement.addEventListener("contextmenu", (event) => {
      event.preventDefault();
    });

    this.renderer.domElement.addEventListener("mousedown", (event) => {
      if (!this.isRunning || this.isGameOver) {
        return;
      }

      if (event.button === 2) {
        this.rightMouseAiming = true;
        return;
      }

      if (event.button !== 0) {
        return;
      }

      if (
        this.pointerLockSupported &&
        !this.pointerLocked &&
        !this.mouseLookEnabled
      ) {
        this.tryPointerLock();
        return;
      }

      this.fire();
    });

    document.addEventListener("mouseup", (event) => {
      if (event.button === 2) {
        this.rightMouseAiming = false;
      }
    });

    this.startButton?.addEventListener("click", () => {
      this.start();
    });

    this.restartButton?.addEventListener("click", () => {
      this.start();
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

  start() {
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
      this.hud.setStatus("포인터락 미지원: 클릭으로 발사", true, 1.2);
    }
  }

  resetState() {
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
    this.aimBlend = 0;
    this.camera.fov = DEFAULT_FOV;
    this.camera.updateProjectionMatrix();

    for (const spark of this.hitSparks) {
      this.scene.remove(spark.sprite);
      spark.sprite.material.dispose();
    }
    this.hitSparks.length = 0;

    this.state.health = 100;
    this.state.score = 0;
    this.camera.position.copy(this.playerPosition);
    this.camera.rotation.set(0, 0, 0);
    this.syncCursorVisibility();

    this.hud.update(0, { ...this.state, ...this.weapon.getState() });
  }

  fire() {
    const shot = this.weapon.tryShoot();
    if (!shot.success) {
      if (shot.reason === "empty") {
        this.hud.setStatus("탄약 없음", true, 0.55);
      }
      return;
    }

    this.weaponRecoil = 1;
    this.hud.pulseCrosshair();
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    const result = this.enemyManager.handleShot(this.raycaster);

    if (!result.didHit) {
      return;
    }

    this.hud.pulseHitmarker();
    if (result.hitPoint) {
      this.spawnHitSpark(result.hitPoint);
    }
    this.state.score += result.points;
    if (result.didKill) {
      this.hud.setStatus("+100 제거", false, 0.45);
    }
  }

  applyMovement(delta) {
    const forward =
      (this.keys.has("KeyW") || this.keys.has("ArrowUp") ? 1 : 0) -
      (this.keys.has("KeyS") || this.keys.has("ArrowDown") ? 1 : 0);
    const strafe =
      (this.keys.has("KeyD") ? 1 : 0) -
      (this.keys.has("KeyA") || this.keys.has("ArrowLeft") ? 1 : 0);
    const sprinting = this.keys.has("ShiftLeft") || this.keys.has("ShiftRight");
    const speed = sprinting ? PLAYER_SPRINT : PLAYER_SPEED;

    if (forward !== 0 || strafe !== 0) {
      const sinYaw = Math.sin(this.yaw);
      const cosYaw = Math.cos(this.yaw);

      // Match camera local axes: forward (-Z) and right (+X) in world space.
      this.moveForwardVec.set(-sinYaw, 0, -cosYaw);
      this.moveRightVec.set(cosYaw, 0, -sinYaw);
      this.moveVec
        .set(0, 0, 0)
        .addScaledVector(this.moveForwardVec, forward)
        .addScaledVector(this.moveRightVec, strafe)
        .normalize();

      this.playerPosition.addScaledVector(this.moveVec, speed * delta);
    }

    this.playerPosition.x = THREE.MathUtils.clamp(
      this.playerPosition.x,
      -WORLD_LIMIT,
      WORLD_LIMIT
    );
    this.playerPosition.z = THREE.MathUtils.clamp(
      this.playerPosition.z,
      -WORLD_LIMIT,
      WORLD_LIMIT
    );

    this.verticalVelocity += PLAYER_GRAVITY * delta;
    this.playerPosition.y += this.verticalVelocity * delta;

    if (this.playerPosition.y <= PLAYER_HEIGHT) {
      this.playerPosition.y = PLAYER_HEIGHT;
      this.verticalVelocity = 0;
      this.onGround = true;
    }
  }

  updateCamera(delta) {
    const isMoving =
      this.keys.has("KeyW") ||
      this.keys.has("KeyA") ||
      this.keys.has("KeyS") ||
      this.keys.has("KeyD") ||
      this.keys.has("ArrowUp") ||
      this.keys.has("ArrowDown") ||
      this.keys.has("ArrowLeft");
    const sprinting = this.keys.has("ShiftLeft") || this.keys.has("ShiftRight");
    const aiming =
      (this.isAiming || this.rightMouseAiming) && this.isRunning && !this.isGameOver;
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

    if (this.weaponFlash) {
      this.weaponFlash.material.opacity = Math.max(0, (this.weaponRecoil - 0.62) * 2.6);
    }

    this.camera.fov = THREE.MathUtils.lerp(DEFAULT_FOV, AIM_FOV, this.aimBlend);
    this.camera.updateProjectionMatrix();
    this.camera.position.copy(this.playerPosition);
    this.camera.rotation.order = "YXZ";
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
  }

  tick(delta) {
    this.updateSparks(delta);

    if (!this.isRunning || this.isGameOver || !this.mouseLookEnabled) {
      this.hud.update(delta, { ...this.state, ...this.weapon.getState() });
      return;
    }

    this.weapon.update(delta);
    this.applyMovement(delta);
    this.updateCamera(delta);

    const damage = this.enemyManager.update(delta, this.playerPosition);
    if (damage > 0) {
      this.state.health = Math.max(0, this.state.health - damage);
      this.hud.flashDamage();
      this.hud.setStatus(`피해 -${damage}`, true, 0.35);
    }

    if (this.state.health <= 0) {
      this.isGameOver = true;
      this.isRunning = false;
      this.hud.showGameOver(this.state.score);
      this.syncCursorVisibility();
      if (document.pointerLockElement === this.renderer.domElement) {
        document.exitPointerLock();
      }
    }

    this.hud.update(delta, { ...this.state, ...this.weapon.getState() });
  }

  loop() {
    const delta = Math.min(this.clock.getDelta(), 0.05);
    this.tick(delta);
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(() => this.loop());
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  tryPointerLock() {
    if (!this.pointerLockSupported || this.pointerLocked) {
      return;
    }

    const maybePromise = this.renderer.domElement.requestPointerLock();
    if (maybePromise && typeof maybePromise.catch === "function") {
      maybePromise.catch(() => {
        if (!this.isRunning || this.isGameOver) {
          return;
        }
        this.hud.showPauseOverlay(true);
        this.hud.setStatus("화면 클릭으로 조준 잠금", true, 1);
        this.syncCursorVisibility();
      });
    }
  }

  syncCursorVisibility() {
    const hideCursor = this.isRunning && !this.isGameOver && this.mouseLookEnabled;
    const cursor = hideCursor ? "none" : "";
    document.body.style.cursor = cursor;
    this.renderer.domElement.style.cursor = cursor;
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
}
