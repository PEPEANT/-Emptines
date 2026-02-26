import * as THREE from "three";

const WORLD_LIMIT = 72;
const PLAYER_TARGET_OFFSET_Y = -0.42;
const MUZZLE_FLASH_TTL = 0.075;
const TRACER_TTL = 0.07;
const MAX_TRACER_POOL = 180;

export class EnemyManager {
  constructor(scene, options = {}) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.enemies = [];
    this.hitboxTargets = [];
    this.tracers = [];
    this.tracerPool = [];
    this.spawnTimer = 0.5;
    this.maxEnemies = 24;
    this.spawnInterval = 1.25;
    this.elapsed = 0;

    this.enemyMap = options.enemyMap ?? null;
    this.muzzleFlashMap = options.muzzleFlashMap ?? null;
    this.canHitTarget = options.canHitTarget ?? null;
    this.isBlockedAt = options.isBlockedAt ?? null;

    this.legGeometry = new THREE.BoxGeometry(0.34, 1.12, 0.34);
    this.shoeGeometry = new THREE.BoxGeometry(0.38, 0.22, 0.44);
    this.torsoGeometry = new THREE.BoxGeometry(0.96, 1.18, 0.54);
    this.backpackGeometry = new THREE.BoxGeometry(0.7, 0.84, 0.32);
    this.headGeometry = new THREE.BoxGeometry(0.58, 0.58, 0.58);
    this.helmetGeometry = new THREE.BoxGeometry(0.66, 0.3, 0.66);
    this.helmetBrimGeometry = new THREE.BoxGeometry(0.72, 0.08, 0.74);
    this.eyeGeometry = new THREE.BoxGeometry(0.08, 0.08, 0.08);
    this.armGeometry = new THREE.BoxGeometry(0.24, 0.78, 0.24);
    this.handGeometry = new THREE.BoxGeometry(0.2, 0.2, 0.2);

    this.gunBodyGeometry = new THREE.BoxGeometry(0.1, 0.24, 0.95);
    this.gunBarrelGeometry = new THREE.BoxGeometry(0.05, 0.05, 0.58);
    this.gunMagGeometry = new THREE.BoxGeometry(0.1, 0.32, 0.18);
    this.gunStockGeometry = new THREE.BoxGeometry(0.1, 0.18, 0.36);
    this.gunScopeGeometry = new THREE.BoxGeometry(0.08, 0.1, 0.26);

    this.hitboxGeometry = new THREE.CapsuleGeometry(0.66, 1.06, 4, 8);
    this.hitboxMaterial = new THREE.MeshBasicMaterial({
      color: 0xff0000,
      transparent: true,
      opacity: 0,
      depthWrite: false
    });

    this.baseUniformMaterial = new THREE.MeshStandardMaterial({
      color: 0x4b5320,
      map: this.enemyMap,
      roughness: 0.62,
      metalness: 0.2,
      emissive: 0x121608,
      emissiveIntensity: 0.42
    });

    this.baseUniformDarkMaterial = new THREE.MeshStandardMaterial({
      color: 0x2b3013,
      roughness: 0.66,
      metalness: 0.14
    });

    this.baseSkinMaterial = new THREE.MeshStandardMaterial({
      color: 0xffc099,
      roughness: 0.6,
      metalness: 0.02
    });

    this.baseBlackMaterial = new THREE.MeshStandardMaterial({
      color: 0x222222,
      roughness: 0.42,
      metalness: 0.38
    });

    this.baseMetalMaterial = new THREE.MeshStandardMaterial({
      color: 0x555555,
      roughness: 0.28,
      metalness: 0.72
    });

    this._move = new THREE.Vector3();
    this._goal = new THREE.Vector3();
    this._toPlayer = new THREE.Vector3();
    this._toGoal = new THREE.Vector3();
    this._spawnOrigin = new THREE.Vector3();
    this._spawnCandidate = new THREE.Vector3();
    this._traceTarget = new THREE.Vector3();
    this._losTarget = new THREE.Vector3();
    this._muzzlePos = new THREE.Vector3();
  }

  reset() {
    for (const enemy of this.enemies) {
      this.disposeEnemy(enemy);
    }
    this.enemies.length = 0;
    this.hitboxTargets.length = 0;
    this.clearTracers();
    this.spawnTimer = 0.5;
    this.elapsed = 0;
  }

  clearTracers() {
    for (const tracer of this.tracers) {
      this.group.remove(tracer.line);
      if (this.tracerPool.length < MAX_TRACER_POOL) {
        this.tracerPool.push(tracer);
      } else {
        tracer.line.geometry.dispose();
        tracer.line.material.dispose();
      }
    }
    this.tracers.length = 0;
  }

  disposeEnemy(enemy) {
    this.group.remove(enemy.model);
    this.group.remove(enemy.hitbox);

    for (const material of enemy.materials) {
      material.dispose();
    }

    enemy.muzzleFlash.material.dispose();
  }

  createEnemyGun(materials) {
    const gunGroup = new THREE.Group();

    const gunBody = new THREE.Mesh(this.gunBodyGeometry, materials.black);
    gunBody.castShadow = true;
    gunBody.receiveShadow = true;

    const gunBarrel = new THREE.Mesh(this.gunBarrelGeometry, materials.metal);
    gunBarrel.castShadow = true;
    gunBarrel.position.set(0, 0.04, 0.68);

    const gunMag = new THREE.Mesh(this.gunMagGeometry, materials.black);
    gunMag.castShadow = true;
    gunMag.position.set(0, -0.22, 0.12);
    gunMag.rotation.x = -0.16;

    const gunStock = new THREE.Mesh(this.gunStockGeometry, materials.black);
    gunStock.castShadow = true;
    gunStock.position.set(0, -0.06, -0.58);

    const gunScope = new THREE.Mesh(this.gunScopeGeometry, materials.black);
    gunScope.castShadow = true;
    gunScope.position.set(0, 0.15, -0.08);

    gunGroup.add(gunBody, gunBarrel, gunMag, gunStock, gunScope);

    const muzzleFlash = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.muzzleFlashMap,
        color: 0xffefc7,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    muzzleFlash.scale.setScalar(0.34);
    muzzleFlash.position.set(0, 0.06, 1.02);
    muzzleFlash.renderOrder = 2;
    gunGroup.add(muzzleFlash);

    const muzzleAnchor = new THREE.Object3D();
    muzzleAnchor.position.set(0, 0.04, 1.08);
    gunGroup.add(muzzleAnchor);

    return { gunGroup, muzzleFlash, muzzleAnchor };
  }

  createSoldierModel(materials) {
    const model = new THREE.Group();

    const legL = new THREE.Mesh(this.legGeometry, materials.uniform);
    legL.castShadow = true;
    legL.receiveShadow = true;
    legL.position.set(-0.22, 0.56, 0);

    const legR = new THREE.Mesh(this.legGeometry, materials.uniform);
    legR.castShadow = true;
    legR.receiveShadow = true;
    legR.position.set(0.22, 0.56, 0);

    const shoeL = new THREE.Mesh(this.shoeGeometry, materials.black);
    shoeL.castShadow = true;
    shoeL.position.set(-0.22, 0.12, 0.06);

    const shoeR = new THREE.Mesh(this.shoeGeometry, materials.black);
    shoeR.castShadow = true;
    shoeR.position.set(0.22, 0.12, 0.06);

    const torso = new THREE.Mesh(this.torsoGeometry, materials.uniform);
    torso.castShadow = true;
    torso.receiveShadow = true;
    torso.position.set(0, 1.54, 0);

    const backpack = new THREE.Mesh(this.backpackGeometry, materials.uniformDark);
    backpack.castShadow = true;
    backpack.position.set(0, 1.54, -0.42);

    const headGroup = new THREE.Group();
    headGroup.position.set(0, 2.48, 0);

    const head = new THREE.Mesh(this.headGeometry, materials.skin);
    head.castShadow = true;

    const helmet = new THREE.Mesh(this.helmetGeometry, materials.uniformDark);
    helmet.castShadow = true;
    helmet.position.set(0, 0.3, 0);

    const helmetBrim = new THREE.Mesh(this.helmetBrimGeometry, materials.uniformDark);
    helmetBrim.castShadow = true;
    helmetBrim.position.set(0, 0.18, 0.04);

    const eyeL = new THREE.Mesh(this.eyeGeometry, materials.black);
    eyeL.position.set(-0.13, 0.08, 0.3);
    const eyeR = new THREE.Mesh(this.eyeGeometry, materials.black);
    eyeR.position.set(0.13, 0.08, 0.3);

    headGroup.add(head, helmet, helmetBrim, eyeL, eyeR);

    const armR = new THREE.Mesh(this.armGeometry, materials.uniform);
    armR.castShadow = true;
    armR.position.set(-0.58, 1.95, 0.24);
    armR.rotation.x = -Math.PI / 2.6;

    const armL = new THREE.Mesh(this.armGeometry, materials.uniform);
    armL.castShadow = true;
    armL.position.set(0.58, 1.88, 0.34);
    armL.rotation.x = -Math.PI / 2.0;
    armL.rotation.z = Math.PI / 6;

    const handR = new THREE.Mesh(this.handGeometry, materials.skin);
    handR.castShadow = true;
    handR.position.set(-0.58, 1.62, 0.72);

    const handL = new THREE.Mesh(this.handGeometry, materials.skin);
    handL.castShadow = true;
    handL.position.set(0.26, 1.88, 0.8);

    const { gunGroup, muzzleFlash, muzzleAnchor } = this.createEnemyGun(materials);
    gunGroup.position.set(-0.26, 1.8, 0.82);

    model.add(
      legL,
      legR,
      shoeL,
      shoeR,
      torso,
      backpack,
      headGroup,
      armL,
      armR,
      handL,
      handR,
      gunGroup
    );

    return {
      model,
      flashMaterial: materials.uniform,
      headGroup,
      gunGroup,
      muzzleFlash,
      muzzleAnchor
    };
  }

  isPositionBlocked(x, z, radius = 0.52) {
    if (!this.isBlockedAt) {
      return false;
    }

    const samples = [
      [0, 0],
      [radius, 0],
      [-radius, 0],
      [0, radius],
      [0, -radius]
    ];

    for (const [dx, dz] of samples) {
      const sx = x + dx;
      const sz = z + dz;
      if (
        this.isBlockedAt(sx, 0.08, sz) ||
        this.isBlockedAt(sx, 1.05, sz) ||
        this.isBlockedAt(sx, 1.92, sz)
      ) {
        return true;
      }
    }

    return false;
  }

  moveEnemyWithCollision(enemy, moveX, moveZ, delta) {
    const step = enemy.speed * delta;
    const stepX = moveX * step;
    const stepZ = moveZ * step;

    if (Math.abs(stepX) > 0.0001) {
      const nextX = THREE.MathUtils.clamp(
        enemy.hitbox.position.x + stepX,
        -WORLD_LIMIT,
        WORLD_LIMIT
      );
      if (!this.isPositionBlocked(nextX, enemy.hitbox.position.z)) {
        enemy.hitbox.position.x = nextX;
      } else {
        enemy.strafeDirection *= -1;
      }
    }

    if (Math.abs(stepZ) > 0.0001) {
      const nextZ = THREE.MathUtils.clamp(
        enemy.hitbox.position.z + stepZ,
        -WORLD_LIMIT,
        WORLD_LIMIT
      );
      if (!this.isPositionBlocked(enemy.hitbox.position.x, nextZ)) {
        enemy.hitbox.position.z = nextZ;
      } else {
        enemy.strafeDirection *= -1;
      }
    }
  }

  resolveGoal(enemy, playerPosition, objectiveContext, engagePlayer) {
    this._goal.copy(playerPosition);

    const base = objectiveContext?.bravoBase;
    if (!base) {
      return this._goal;
    }

    const playerHasEnemyFlag = !!objectiveContext?.playerHasEnemyFlag;
    if (enemy.role === "defender") {
      if (playerHasEnemyFlag || engagePlayer) {
        return this._goal;
      }

      enemy.patrolAngle += enemy.patrolSpeed;
      this._goal.set(
        base.x + Math.cos(enemy.patrolAngle) * enemy.guardRadius,
        0,
        base.z + Math.sin(enemy.patrolAngle) * enemy.guardRadius
      );
      return this._goal;
    }

    if (
      objectiveContext?.controlOwner === "alpha" &&
      objectiveContext?.controlPoint &&
      !playerHasEnemyFlag &&
      enemy.controlDuty > 0.56
    ) {
      this._goal.set(
        objectiveContext.controlPoint.x,
        0,
        objectiveContext.controlPoint.z
      );
      return this._goal;
    }

    return this._goal;
  }

  chooseSpawnPosition(playerPosition, objectiveContext) {
    const spawn = this._spawnCandidate;
    const hasEnemyBase = !!objectiveContext?.bravoBase;
    const base = hasEnemyBase ? objectiveContext.bravoBase : playerPosition;
    const playerFlagStolen = !!objectiveContext?.playerHasEnemyFlag;

    for (let attempt = 0; attempt < 18; attempt += 1) {
      const angle = Math.random() * Math.PI * 2;
      const minRadius = hasEnemyBase ? 9 : 24;
      const maxRadius = hasEnemyBase
        ? playerFlagStolen
          ? 21
          : 30
        : 58;
      const radius = minRadius + Math.random() * (maxRadius - minRadius);
      const x = THREE.MathUtils.clamp(base.x + Math.cos(angle) * radius, -WORLD_LIMIT, WORLD_LIMIT);
      const z = THREE.MathUtils.clamp(base.z + Math.sin(angle) * radius, -WORLD_LIMIT, WORLD_LIMIT);

      const distToPlayer = Math.hypot(playerPosition.x - x, playerPosition.z - z);
      if (distToPlayer < 12.5) {
        continue;
      }
      if (this.isPositionBlocked(x, z)) {
        continue;
      }

      spawn.set(x, 0, z);
      return spawn;
    }

    const fallbackX = THREE.MathUtils.clamp(playerPosition.x + 24, -WORLD_LIMIT, WORLD_LIMIT);
    const fallbackZ = THREE.MathUtils.clamp(playerPosition.z + 24, -WORLD_LIMIT, WORLD_LIMIT);
    spawn.set(fallbackX, 0, fallbackZ);
    return spawn;
  }

  countEnemiesNear(position, radius) {
    const radiusSq = radius * radius;
    let count = 0;
    for (const enemy of this.enemies) {
      const dx = enemy.hitbox.position.x - position.x;
      const dz = enemy.hitbox.position.z - position.z;
      if (dx * dx + dz * dz <= radiusSq) {
        count += 1;
      }
    }
    return count;
  }

  update(delta, playerPosition, objectiveContext = null) {
    this.elapsed += delta;
    this.spawnTimer -= delta;
    if (this.spawnTimer <= 0 && this.enemies.length < this.maxEnemies) {
      this.spawn(playerPosition, objectiveContext);
      const pace = Math.max(0.55, this.spawnInterval - this.elapsed * 0.004);
      this.spawnTimer = pace;
    }

    this.updateTracers(delta);

    let totalDamage = 0;
    let firedShots = 0;

    for (let i = this.enemies.length - 1; i >= 0; i -= 1) {
      const enemy = this.enemies[i];
      enemy.fireCooldown -= delta;
      enemy.meleeCooldown -= delta;
      enemy.hitFlash = Math.max(0, enemy.hitFlash - delta);
      enemy.muzzleFlashLife = Math.max(0, enemy.muzzleFlashLife - delta);
      enemy.strafeTimer -= delta;
      enemy.gunKick = Math.max(0, enemy.gunKick - delta * 11);
      enemy.pulseTimer += delta;

      const breathe = Math.sin(enemy.pulseTimer * 2.2) * 0.02;
      enemy.headGroup.position.y = enemy.headBaseY + breathe * 2;
      enemy.gunGroup.position.y = enemy.gunBaseY + breathe;
      enemy.gunGroup.position.z = enemy.gunBaseZ - enemy.gunKick;

      if (enemy.hitFlash > 0) {
        enemy.flashMaterial.emissive.setRGB(0.5, 0.12, 0.08);
      } else {
        const pulse = Math.max(0, Math.sin(enemy.pulseTimer * 7) * 0.22);
        enemy.flashMaterial.emissive.setRGB(0.07 + pulse, 0.09 + pulse * 0.4, 0.04);
      }

      this._toPlayer.set(
        playerPosition.x - enemy.hitbox.position.x,
        0,
        playerPosition.z - enemy.hitbox.position.z
      );
      const playerDistance = this._toPlayer.length();
      const playerHasEnemyFlag = !!objectiveContext?.playerHasEnemyFlag;
      const engagePlayer =
        playerHasEnemyFlag ||
        enemy.role !== "defender" ||
        playerDistance <= enemy.alertRange;
      const goal = this.resolveGoal(enemy, playerPosition, objectiveContext, engagePlayer);

      this._toGoal.set(
        goal.x - enemy.hitbox.position.x,
        0,
        goal.z - enemy.hitbox.position.z
      );
      const goalDistance = this._toGoal.length();

      if (goalDistance > 0.001) {
        this._toGoal.multiplyScalar(1 / goalDistance);

        if (enemy.strafeTimer <= 0) {
          enemy.strafeTimer = 0.65 + Math.random() * 1.05;
          enemy.strafeDirection *= -1;
        }

        let forwardFactor = 0;
        if (!engagePlayer && enemy.role === "defender") {
          if (goalDistance > 0.7) {
            forwardFactor = 0.72;
          } else if (goalDistance < 0.3) {
            forwardFactor = -0.26;
          }
        } else if (playerDistance > enemy.preferredDistance) {
          forwardFactor = 1;
        } else if (playerDistance < enemy.keepDistance) {
          forwardFactor = -0.4;
        }

        let strafeFactor = 0;
        if (
          engagePlayer &&
          playerDistance <= enemy.shootRange * 0.92 &&
          playerDistance >= enemy.keepDistance * 0.72
        ) {
          strafeFactor = enemy.strafeDirection * enemy.strafeStrength;
        }

        const moveX = this._toGoal.x * forwardFactor - this._toGoal.z * strafeFactor;
        const moveZ = this._toGoal.z * forwardFactor + this._toGoal.x * strafeFactor;
        const moveLen = Math.hypot(moveX, moveZ);
        if (moveLen > 0.001) {
          this.moveEnemyWithCollision(enemy, moveX / moveLen, moveZ / moveLen, delta);
        }

        const look = engagePlayer ? this._toPlayer : this._toGoal;
        enemy.model.rotation.y = Math.atan2(look.x, look.z);
      }
      enemy.model.position.set(enemy.hitbox.position.x, 0, enemy.hitbox.position.z);

      if (enemy.muzzleFlashLife > 0) {
        const flashRatio = enemy.muzzleFlashLife / MUZZLE_FLASH_TTL;
        enemy.muzzleFlash.material.opacity = 0.9 * flashRatio;
        enemy.muzzleFlash.scale.setScalar(0.33 + (1 - flashRatio) * 0.15);
      } else {
        enemy.muzzleFlash.material.opacity = 0;
      }

      const canFireAtPlayer =
        playerDistance <= enemy.shootRange &&
        (engagePlayer || playerDistance <= enemy.shootRange * 0.62);
      if (canFireAtPlayer && enemy.fireCooldown <= 0) {
        enemy.fireCooldown = enemy.fireInterval * THREE.MathUtils.randFloat(0.82, 1.24);
        enemy.muzzleFlashLife = MUZZLE_FLASH_TTL;
        enemy.gunKick = 0.12;
        firedShots += 1;

        enemy.muzzleAnchor.getWorldPosition(this._muzzlePos);
        this._losTarget.set(
          playerPosition.x,
          playerPosition.y + PLAYER_TARGET_OFFSET_Y,
          playerPosition.z
        );
        const clearShot = this.canHitTarget
          ? this.canHitTarget(this._muzzlePos, this._losTarget)
          : true;

        this._traceTarget.copy(this._losTarget);

        const spread = Math.min(0.86, playerDistance * 0.018);
        this._traceTarget.x += THREE.MathUtils.randFloatSpread(spread);
        this._traceTarget.z += THREE.MathUtils.randFloatSpread(spread);

        const hitChance = THREE.MathUtils.clamp(
          0.74 - (playerDistance / enemy.shootRange) * 0.5,
          0.2,
          0.75
        );
        const didHit = clearShot && Math.random() < hitChance;

        if (didHit) {
          totalDamage += THREE.MathUtils.randInt(enemy.minShotDamage, enemy.maxShotDamage);
        }

        this.spawnTracer(this._muzzlePos, this._traceTarget, didHit);
      }

      if (playerDistance <= enemy.meleeRange && enemy.meleeCooldown <= 0) {
        totalDamage += enemy.meleeDamage;
        enemy.meleeCooldown = 0.95;
      }
    }

    return { damage: totalDamage, firedShots };
  }

  spawnTracer(start, end, didHit) {
    const tracer = this.tracerPool.pop() ?? this.createTracer();
    const positions = tracer.line.geometry.attributes.position.array;
    positions[0] = start.x;
    positions[1] = start.y;
    positions[2] = start.z;
    positions[3] = end.x;
    positions[4] = end.y;
    positions[5] = end.z;
    tracer.line.geometry.attributes.position.needsUpdate = true;

    tracer.line.material.color.setHex(didHit ? 0xffa08a : 0x86d7ff);
    tracer.line.material.opacity = 0.92;
    tracer.ttl = TRACER_TTL;
    tracer.life = TRACER_TTL;

    this.group.add(tracer.line);
    this.tracers.push(tracer);
  }

  createTracer() {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(6);
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    const material = new THREE.LineBasicMaterial({
      color: 0x86d7ff,
      transparent: true,
      opacity: 0.92
    });

    const line = new THREE.Line(geometry, material);
    line.frustumCulled = false;

    return {
      line,
      ttl: TRACER_TTL,
      life: TRACER_TTL
    };
  }

  updateTracers(delta) {
    for (let i = this.tracers.length - 1; i >= 0; i -= 1) {
      const tracer = this.tracers[i];
      tracer.life -= delta;
      if (tracer.life <= 0) {
        this.group.remove(tracer.line);
        if (this.tracerPool.length < MAX_TRACER_POOL) {
          this.tracerPool.push(tracer);
        } else {
          tracer.line.geometry.dispose();
          tracer.line.material.dispose();
        }
        this.tracers.splice(i, 1);
        continue;
      }

      tracer.line.material.opacity = tracer.life / tracer.ttl;
    }
  }

  spawn(playerPosition, objectiveContext = null) {
    const spawnPos = this.chooseSpawnPosition(playerPosition, objectiveContext);
    const x = spawnPos.x;
    const z = spawnPos.z;
    const role = Math.random() < 0.44 ? "defender" : "raider";

    const materials = {
      uniform: this.baseUniformMaterial.clone(),
      uniformDark: this.baseUniformDarkMaterial.clone(),
      skin: this.baseSkinMaterial.clone(),
      black: this.baseBlackMaterial.clone(),
      metal: this.baseMetalMaterial.clone()
    };

    const soldier = this.createSoldierModel(materials);
    soldier.model.position.set(x, 0, z);

    const hitbox = new THREE.Mesh(this.hitboxGeometry, this.hitboxMaterial);
    hitbox.position.set(x, 1.25, z);

    const enemy = {
      model: soldier.model,
      hitbox,
      speed: 2 + Math.random() * 1.4,
      health: 40,
      fireCooldown: 0.3 + Math.random() * 0.36,
      fireInterval: 0.52 + Math.random() * 0.34,
      minShotDamage: 2,
      maxShotDamage: 6,
      meleeDamage: 7,
      meleeRange: 1.7,
      meleeCooldown: 0.4,
      shootRange: 34 + Math.random() * 7,
      preferredDistance: 11 + Math.random() * 5,
      keepDistance: 6 + Math.random() * 2.4,
      strafeDirection: Math.random() < 0.5 ? -1 : 1,
      strafeStrength: 0.36 + Math.random() * 0.26,
      strafeTimer: 0.5 + Math.random() * 1.2,
      hitFlash: 0,
      muzzleFlashLife: 0,
      pulseTimer: Math.random() * Math.PI * 2,
      gunKick: 0,
      flashMaterial: soldier.flashMaterial,
      headGroup: soldier.headGroup,
      headBaseY: soldier.headGroup.position.y,
      gunGroup: soldier.gunGroup,
      gunBaseY: soldier.gunGroup.position.y,
      gunBaseZ: soldier.gunGroup.position.z,
      muzzleFlash: soldier.muzzleFlash,
      muzzleAnchor: soldier.muzzleAnchor,
      role,
      guardRadius: 8 + Math.random() * 5.5,
      alertRange: 24 + Math.random() * 8,
      patrolAngle: Math.random() * Math.PI * 2,
      patrolSpeed: THREE.MathUtils.randFloat(0.015, 0.032),
      controlDuty: Math.random(),
      materials: Object.values(materials)
    };

    enemy.hitbox.userData.enemy = enemy;

    this.group.add(enemy.model);
    this.group.add(enemy.hitbox);
    this.enemies.push(enemy);
    this.hitboxTargets.push(hitbox);
  }

  handleShot(raycaster, maxDistance = Infinity) {
    if (this.enemies.length === 0) {
      return { didHit: false, didKill: false, points: 0, hitPoint: null };
    }

    const hits = raycaster.intersectObjects(this.hitboxTargets, false);
    const shotOrigin = raycaster.ray.origin;
    const targetHit = hits.find((hit) => {
      if (hit.distance > maxDistance + 1e-5) {
        return false;
      }
      if (!this.canHitTarget) {
        return true;
      }
      return this.canHitTarget(shotOrigin, hit.point);
    });
    if (!targetHit) {
      return { didHit: false, didKill: false, points: 0, hitPoint: null };
    }

    const target = targetHit.object.userData.enemy;
    if (!target) {
      return { didHit: false, didKill: false, points: 0, hitPoint: null };
    }

    target.health -= 20;
    target.hitFlash = 0.08;
    const hitPoint = targetHit.point.clone();

    if (target.health > 0) {
      return { didHit: true, didKill: false, points: 20, hitPoint };
    }

    const index = this.enemies.indexOf(target);
    if (index >= 0) {
      this.hitboxTargets.splice(index, 1);
      this.enemies.splice(index, 1);
    }

    this.disposeEnemy(target);
    return { didHit: true, didKill: true, points: 100, hitPoint };
  }
}
