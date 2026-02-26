import * as THREE from "three";

export class EnemyManager {
  constructor(scene, options = {}) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.enemies = [];
    this.spawnTimer = 0.5;
    this.maxEnemies = 20;
    this.spawnInterval = 1.25;
    this.elapsed = 0;

    this.enemyMap = options.enemyMap ?? null;
    this.bodyGeometry = new THREE.BoxGeometry(1.05, 1.45, 0.78);
    this.headGeometry = new THREE.BoxGeometry(0.72, 0.72, 0.68);
    this.coreGeometry = new THREE.CylinderGeometry(0.2, 0.2, 1.18, 8);
    this.eyeGeometry = new THREE.SphereGeometry(0.095, 10, 8);
    this.hitboxGeometry = new THREE.CapsuleGeometry(0.68, 1.08, 4, 8);

    this.hitboxMaterial = new THREE.MeshBasicMaterial({
      color: 0xff0000,
      transparent: true,
      opacity: 0,
      depthWrite: false
    });

    this.baseBodyMaterial = new THREE.MeshStandardMaterial({
      color: 0xff8974,
      map: this.enemyMap,
      roughness: 0.44,
      metalness: 0.3,
      emissive: 0x2f0d0d,
      emissiveIntensity: 0.55
    });

    this.baseCoreMaterial = new THREE.MeshStandardMaterial({
      color: 0xffddb8,
      roughness: 0.18,
      metalness: 0.68,
      emissive: 0xff4e3d,
      emissiveIntensity: 0.78
    });

    this.baseEyeMaterial = new THREE.MeshStandardMaterial({
      color: 0xfff7c4,
      roughness: 0.2,
      metalness: 0.12,
      emissive: 0xff8d60,
      emissiveIntensity: 1.3
    });
  }

  reset() {
    for (const enemy of this.enemies) {
      this.group.remove(enemy.model);
      this.group.remove(enemy.hitbox);
    }
    this.enemies.length = 0;
    this.spawnTimer = 0.5;
    this.elapsed = 0;
  }

  update(delta, playerPosition) {
    this.elapsed += delta;
    this.spawnTimer -= delta;
    if (this.spawnTimer <= 0 && this.enemies.length < this.maxEnemies) {
      this.spawn(playerPosition);
      const pace = Math.max(0.55, this.spawnInterval - this.elapsed * 0.004);
      this.spawnTimer = pace;
    }

    let damage = 0;
    for (let i = this.enemies.length - 1; i >= 0; i -= 1) {
      const enemy = this.enemies[i];
      enemy.attackCooldown -= delta;
      enemy.hitFlash = Math.max(0, enemy.hitFlash - delta);

      if (enemy.hitFlash > 0 || enemy.pulseTimer > 0) {
        const flashStrength =
          enemy.hitFlash > 0 ? 1 : Math.max(0, Math.sin(enemy.pulseTimer * 7) * 0.45);
        enemy.bodyMaterial.emissive.setRGB(0.62 + flashStrength * 0.12, 0.09, 0.06);
      } else {
        enemy.bodyMaterial.emissive.setHex(0x2f0d0d);
      }
      enemy.pulseTimer += delta;

      const move = new THREE.Vector3(
        playerPosition.x - enemy.hitbox.position.x,
        0,
        playerPosition.z - enemy.hitbox.position.z
      );
      const distance = move.length();

      if (distance > 0.001) {
        move.normalize();
        enemy.hitbox.position.addScaledVector(move, enemy.speed * delta);
        enemy.model.position.set(
          enemy.hitbox.position.x,
          0,
          enemy.hitbox.position.z
        );
        enemy.model.rotation.y = Math.atan2(move.x, move.z);
      }

      if (distance <= 1.85 && enemy.attackCooldown <= 0) {
        damage += 7;
        enemy.attackCooldown = 0.85;
      }
    }

    return damage;
  }

  spawn(playerPosition) {
    const angle = Math.random() * Math.PI * 2;
    const distance = 22 + Math.random() * 36;
    const x = playerPosition.x + Math.cos(angle) * distance;
    const z = playerPosition.z + Math.sin(angle) * distance;

    const bodyMaterial = this.baseBodyMaterial.clone();
    const coreMaterial = this.baseCoreMaterial.clone();
    const eyeMaterial = this.baseEyeMaterial.clone();

    const model = new THREE.Group();
    const body = new THREE.Mesh(this.bodyGeometry, bodyMaterial);
    body.position.y = 1.03;
    body.castShadow = true;
    body.receiveShadow = true;

    const head = new THREE.Mesh(this.headGeometry, bodyMaterial);
    head.position.y = 2.0;
    head.castShadow = true;
    head.receiveShadow = true;

    const core = new THREE.Mesh(this.coreGeometry, coreMaterial);
    core.position.y = 0.98;
    core.rotation.z = Math.PI * 0.5;
    core.castShadow = true;

    const eyeLeft = new THREE.Mesh(this.eyeGeometry, eyeMaterial);
    eyeLeft.position.set(-0.2, 2.0, -0.34);
    const eyeRight = new THREE.Mesh(this.eyeGeometry, eyeMaterial);
    eyeRight.position.set(0.2, 2.0, -0.34);

    model.add(body, head, core, eyeLeft, eyeRight);
    model.position.set(x, 0, z);

    const hitbox = new THREE.Mesh(this.hitboxGeometry, this.hitboxMaterial);
    hitbox.position.set(x, 1.25, z);

    const enemy = {
      model,
      hitbox,
      speed: 2 + Math.random() * 1.4,
      health: 40,
      attackCooldown: 0.3,
      hitFlash: 0,
      pulseTimer: Math.random() * Math.PI * 2,
      bodyMaterial
    };

    enemy.hitbox.userData.enemy = enemy;

    this.group.add(enemy.model);
    this.group.add(enemy.hitbox);
    this.enemies.push(enemy);
  }

  handleShot(raycaster) {
    if (this.enemies.length === 0) {
      return { didHit: false, didKill: false, points: 0, hitPoint: null };
    }

    const hitboxes = this.enemies.map((enemy) => enemy.hitbox);
    const hits = raycaster.intersectObjects(hitboxes, false);
    if (hits.length === 0) {
      return { didHit: false, didKill: false, points: 0, hitPoint: null };
    }

    const target = hits[0].object.userData.enemy;
    if (!target) {
      return { didHit: false, didKill: false, points: 0, hitPoint: null };
    }

    target.health -= 20;
    target.hitFlash = 0.08;
    const hitPoint = hits[0].point.clone();

    if (target.health > 0) {
      return { didHit: true, didKill: false, points: 20, hitPoint };
    }

    const index = this.enemies.indexOf(target);
    if (index >= 0) {
      this.enemies.splice(index, 1);
    }
    this.group.remove(target.model);
    this.group.remove(target.hitbox);
    return { didHit: true, didKill: true, points: 100, hitPoint };
  }
}
