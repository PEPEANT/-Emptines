import * as THREE from "three";
import { BLOCK_TYPE_BY_ID } from "./BlockPalette.js";

const KEY_SEPARATOR = "|";

export class VoxelWorld {
  constructor(scene, textureLoader) {
    this.scene = scene;
    this.textureLoader = textureLoader;

    this.group = new THREE.Group();
    this.group.name = "voxel-world";
    this.scene.add(this.group);

    this.blockGeometry = new THREE.BoxGeometry(1, 1, 1);
    this.tmpMatrix = new THREE.Matrix4();
    this.blockMap = new Map();
    this.buckets = new Map();
    this.surfaceCache = new Map();
    this.raycastTargets = [];
    this.maxInstancesPerType = 52000;
    this.arenaMeta = null;
    this._losDirection = new THREE.Vector3();
    this._losPoint = new THREE.Vector3();
  }

  clear() {
    this.blockMap.clear();
    this.surfaceCache.clear();
    this.arenaMeta = null;

    for (const bucket of this.buckets.values()) {
      this.group.remove(bucket.mesh);
      bucket.mesh.material.dispose();
    }

    this.buckets.clear();
    this.raycastTargets.length = 0;
  }

  key(x, y, z) {
    return `${x}${KEY_SEPARATOR}${y}${KEY_SEPARATOR}${z}`;
  }

  columnKey(x, z) {
    return `${x}${KEY_SEPARATOR}${z}`;
  }

  parseKey(key) {
    const [x, y, z] = key.split(KEY_SEPARATOR).map((value) => Number(value));
    return { x, y, z };
  }

  loadBlockTexture(url) {
    const texture = this.textureLoader.load(url);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestMipmapNearestFilter;
    texture.anisotropy = 8;
    return texture;
  }

  ensureBucket(typeId) {
    const existing = this.buckets.get(typeId);
    if (existing) {
      return existing;
    }

    const type = BLOCK_TYPE_BY_ID.get(typeId);
    if (!type) {
      return null;
    }

    const material = new THREE.MeshStandardMaterial({
      map: this.loadBlockTexture(type.texture),
      roughness: 0.86,
      metalness: 0.04,
      flatShading: true
    });

    const mesh = new THREE.InstancedMesh(
      this.blockGeometry,
      material,
      this.maxInstancesPerType
    );
    mesh.count = 0;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.userData.typeId = typeId;
    mesh.userData.isVoxelBucket = true;

    const bucket = {
      typeId,
      mesh,
      keys: [],
      indexByKey: new Map()
    };

    this.buckets.set(typeId, bucket);
    this.group.add(mesh);
    this.raycastTargets.push(mesh);
    return bucket;
  }

  setBlock(x, y, z, typeId) {
    const key = this.key(x, y, z);
    const previous = this.blockMap.get(key);
    if (previous?.typeId === typeId) {
      return false;
    }

    if (previous) {
      this.removeBlock(x, y, z);
    }

    const bucket = this.ensureBucket(typeId);
    if (!bucket || bucket.mesh.count >= this.maxInstancesPerType) {
      return false;
    }

    const index = bucket.mesh.count;
    bucket.mesh.count += 1;

    this.tmpMatrix.makeTranslation(x + 0.5, y + 0.5, z + 0.5);
    bucket.mesh.setMatrixAt(index, this.tmpMatrix);
    bucket.mesh.instanceMatrix.needsUpdate = true;

    bucket.keys[index] = key;
    bucket.indexByKey.set(key, index);
    this.blockMap.set(key, { x, y, z, typeId });

    const columnKey = this.columnKey(x, z);
    const nextSurface = y + 1;
    const cachedSurface = this.surfaceCache.get(columnKey);
    if (cachedSurface === undefined || nextSurface > cachedSurface) {
      this.surfaceCache.set(columnKey, nextSurface);
    }

    return true;
  }

  removeBlock(x, y, z) {
    const key = this.key(x, y, z);
    const block = this.blockMap.get(key);
    if (!block) {
      return false;
    }

    const bucket = this.buckets.get(block.typeId);
    if (!bucket) {
      this.blockMap.delete(key);
      return false;
    }

    const removeIndex = bucket.indexByKey.get(key);
    if (removeIndex === undefined) {
      this.blockMap.delete(key);
      return false;
    }

    const lastIndex = bucket.mesh.count - 1;
    if (lastIndex < 0) {
      this.blockMap.delete(key);
      return false;
    }

    if (removeIndex !== lastIndex) {
      const lastKey = bucket.keys[lastIndex];
      bucket.mesh.getMatrixAt(lastIndex, this.tmpMatrix);
      bucket.mesh.setMatrixAt(removeIndex, this.tmpMatrix);
      bucket.keys[removeIndex] = lastKey;
      bucket.indexByKey.set(lastKey, removeIndex);
    }

    bucket.keys.pop();
    bucket.indexByKey.delete(key);
    bucket.mesh.count = lastIndex;
    bucket.mesh.instanceMatrix.needsUpdate = true;
    this.blockMap.delete(key);

    const columnKey = this.columnKey(x, z);
    const cachedSurface = this.surfaceCache.get(columnKey);
    if (cachedSurface !== undefined && y + 1 >= cachedSurface) {
      this.surfaceCache.delete(columnKey);
    }

    return true;
  }

  hasBlock(x, y, z) {
    return this.blockMap.has(this.key(x, y, z));
  }

  hasBlockAtWorld(worldX, worldY, worldZ) {
    return this.hasBlock(
      Math.floor(worldX),
      Math.floor(worldY),
      Math.floor(worldZ)
    );
  }

  getSurfaceYAt(worldX, worldZ, minY = -32, maxY = 48) {
    const x = Math.floor(worldX);
    const z = Math.floor(worldZ);
    const columnKey = this.columnKey(x, z);
    const cachedSurface = this.surfaceCache.get(columnKey);
    if (cachedSurface !== undefined) {
      const cachedTopY = cachedSurface - 1;
      if (cachedTopY >= minY && cachedTopY <= maxY) {
        return cachedSurface;
      }
      this.surfaceCache.delete(columnKey);
    }

    for (let y = maxY; y >= minY; y -= 1) {
      if (this.hasBlock(x, y, z)) {
        const surface = y + 1;
        this.surfaceCache.set(columnKey, surface);
        return surface;
      }
    }

    return null;
  }

  hasLineOfSight(start, end, step = 0.25) {
    const direction = this._losDirection.subVectors(end, start);
    const distance = direction.length();
    if (distance <= 0.0001) {
      return true;
    }

    direction.multiplyScalar(1 / distance);
    const point = this._losPoint;
    const epsilon = 0.05;
    const maxTravel = Math.max(0, distance - epsilon);

    for (let traveled = step; traveled < maxTravel; traveled += step) {
      point.copy(start).addScaledVector(direction, traveled);
      if (this.hasBlockAtWorld(point.x, point.y, point.z)) {
        return false;
      }
    }

    return true;
  }

  raycast(raycaster, maxDistance = 8) {
    const previousFar = raycaster.far;
    raycaster.far = maxDistance;
    const hits = raycaster.intersectObjects(this.raycastTargets, false);
    raycaster.far = previousFar;

    if (hits.length === 0) {
      return null;
    }

    const hit = hits[0];
    const mesh = hit.object;
    const typeId = mesh.userData.typeId;
    const bucket = this.buckets.get(typeId);
    if (!bucket || hit.instanceId === undefined) {
      return null;
    }

    const key = bucket.keys[hit.instanceId];
    if (!key) {
      return null;
    }

    const coords = this.parseKey(key);
    const normal = hit.face
      ? hit.face.normal.clone().transformDirection(mesh.matrixWorld)
      : new THREE.Vector3(0, 1, 0);

    if (normal.lengthSq() < 1e-6) {
      const lx = hit.point.x - (coords.x + 0.5);
      const ly = hit.point.y - (coords.y + 0.5);
      const lz = hit.point.z - (coords.z + 0.5);
      const ax = Math.abs(lx);
      const ay = Math.abs(ly);
      const az = Math.abs(lz);
      if (ax >= ay && ax >= az) {
        normal.set(Math.sign(lx) || 1, 0, 0);
      } else if (ay >= ax && ay >= az) {
        normal.set(0, Math.sign(ly) || 1, 0);
      } else {
        normal.set(0, 0, Math.sign(lz) || 1);
      }
    } else {
      const ax = Math.abs(normal.x);
      const ay = Math.abs(normal.y);
      const az = Math.abs(normal.z);
      if (ax >= ay && ax >= az) {
        normal.set(Math.sign(normal.x) || 1, 0, 0);
      } else if (ay >= ax && ay >= az) {
        normal.set(0, Math.sign(normal.y) || 1, 0);
      } else {
        normal.set(0, 0, Math.sign(normal.z) || 1);
      }
    }

    return {
      ...coords,
      typeId,
      distance: hit.distance,
      point: hit.point.clone(),
      normal
    };
  }

  placeAdjacent(hit, typeId, canPlace = null) {
    const x = hit.x + Math.round(hit.normal.x);
    const y = hit.y + Math.round(hit.normal.y);
    const z = hit.z + Math.round(hit.normal.z);

    if (canPlace && !canPlace(x, y, z)) {
      return false;
    }

    if (this.hasBlock(x, y, z)) {
      return false;
    }

    return this.setBlock(x, y, z, typeId);
  }

  removeFromHit(hit, minY = -12) {
    if (hit.y <= minY) {
      return false;
    }
    return this.removeBlock(hit.x, hit.y, hit.z);
  }

  getArenaMeta() {
    if (!this.arenaMeta) {
      return null;
    }
    return {
      alphaBase: { ...this.arenaMeta.alphaBase },
      bravoBase: { ...this.arenaMeta.bravoBase },
      alphaFlag: { ...this.arenaMeta.alphaFlag },
      bravoFlag: { ...this.arenaMeta.bravoFlag },
      mid: { ...this.arenaMeta.mid },
      halfExtent: this.arenaMeta.halfExtent
    };
  }

  fillRect(minX, maxX, minY, maxY, minZ, maxZ, typeId) {
    for (let x = minX; x <= maxX; x += 1) {
      for (let y = minY; y <= maxY; y += 1) {
        for (let z = minZ; z <= maxZ; z += 1) {
          this.setBlock(x, y, z, typeId);
        }
      }
    }
  }

  carveRect(minX, maxX, y, minZ, maxZ) {
    for (let x = minX; x <= maxX; x += 1) {
      for (let z = minZ; z <= maxZ; z += 1) {
        this.removeBlock(x, y, z);
      }
    }
  }

  buildPerimeterWall(halfExtent, minY, maxY, typeId) {
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = -halfExtent; x <= halfExtent; x += 1) {
        this.setBlock(x, y, -halfExtent, typeId);
        this.setBlock(x, y, halfExtent, typeId);
      }
      for (let z = -halfExtent; z <= halfExtent; z += 1) {
        this.setBlock(-halfExtent, y, z, typeId);
        this.setBlock(halfExtent, y, z, typeId);
      }
    }
  }

  buildBase(centerX, centerZ, gateDir, wallType, floorType, accentType) {
    const half = 9;
    const minX = centerX - half;
    const maxX = centerX + half;
    const minZ = centerZ - half;
    const maxZ = centerZ + half;

    this.fillRect(minX, maxX, -2, -1, minZ, maxZ, floorType);
    this.fillRect(centerX - 3, centerX + 3, -1, -1, centerZ - 3, centerZ + 3, accentType);

    for (let y = 0; y <= 3; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        for (let z = minZ; z <= maxZ; z += 1) {
          const border = x === minX || x === maxX || z === minZ || z === maxZ;
          if (!border) {
            continue;
          }

          const gateEast = gateDir === "east" && x === maxX && Math.abs(z - centerZ) <= 2 && y <= 2;
          const gateWest = gateDir === "west" && x === minX && Math.abs(z - centerZ) <= 2 && y <= 2;
          if (gateEast || gateWest) {
            continue;
          }

          this.setBlock(x, y, z, wallType);
        }
      }
    }

    const towerCoords = [
      [minX, minZ],
      [minX, maxZ],
      [maxX, minZ],
      [maxX, maxZ]
    ];
    for (const [tx, tz] of towerCoords) {
      this.fillRect(tx - 1, tx + 1, 0, 5, tz - 1, tz + 1, accentType);
    }

    this.fillRect(centerX - 1, centerX + 1, 0, 2, centerZ - 6, centerZ - 4, wallType);
    this.fillRect(centerX - 1, centerX + 1, 0, 2, centerZ + 4, centerZ + 6, wallType);
  }

  generateTerrain() {
    this.clear();
    const halfExtent = 56;
    for (let x = -halfExtent; x <= halfExtent; x += 1) {
      for (let z = -halfExtent; z <= halfExtent; z += 1) {
        const edgeDist = halfExtent - Math.max(Math.abs(x), Math.abs(z));
        const topType = edgeDist < 6 ? 3 : Math.abs(x + z) % 11 < 3 ? 2 : 1;
        this.setBlock(x, -4, z, 3);
        this.setBlock(x, -3, z, 2);
        this.setBlock(x, -2, z, 2);
        this.setBlock(x, -1, z, topType);
      }
    }

    this.buildPerimeterWall(halfExtent, 0, 4, 8);
    this.fillRect(-halfExtent + 1, halfExtent - 1, -1, -1, -7, 7, 4);
    this.fillRect(-14, 14, -1, -1, -14, 14, 3);

    this.carveRect(-34, -10, -1, -22, -12);
    this.fillRect(-34, -10, -2, -2, -22, -12, 3);
    this.carveRect(10, 34, -1, 12, 22);
    this.fillRect(10, 34, -2, -2, 12, 22, 3);

    this.buildBase(-42, 0, "east", 7, 5, 8);
    this.buildBase(42, 0, "west", 6, 8, 5);

    this.decorateArena();
    this.arenaMeta = {
      alphaBase: { x: -42, y: 0, z: 0 },
      bravoBase: { x: 42, y: 0, z: 0 },
      alphaFlag: { x: -42, y: 0, z: 0 },
      bravoFlag: { x: 42, y: 0, z: 0 },
      mid: { x: 0, y: 0, z: 0 },
      halfExtent
    };
  }

  decorateArena() {
    const coverXs = [-26, -14, -2, 10, 22];
    const coverZs = [-30, -18, -6, 6, 18, 30];
    for (let zi = 0; zi < coverZs.length; zi += 1) {
      for (let xi = 0; xi < coverXs.length; xi += 1) {
        if ((zi + xi) % 2 === 0) {
          this.fillRect(coverXs[xi], coverXs[xi] + 2, 0, 2, coverZs[zi], coverZs[zi] + 1, 6);
        }
      }
    }

    this.fillRect(-6, 6, 0, 3, -2, 2, 8);
    this.fillRect(-2, 2, 0, 3, -6, 6, 5);
    this.carveRect(-1, 1, 1, -1, 1);

    for (let i = -4; i <= 4; i += 1) {
      const z = i * 8;
      this.fillRect(-49, -46, 0, 2, z - 1, z + 1, 7);
      this.fillRect(46, 49, 0, 2, z - 1, z + 1, 6);
    }
  }
}
