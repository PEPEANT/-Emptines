(function () {
  const CAPACITY = 50;
  const ROWS = 5;
  const COLS = 10;
  const entryParams = new URLSearchParams(window.location.search);
  const entrySource = String(entryParams.get("from") || "").trim().toLowerCase();
  const fromEmptines = entrySource === "emptines";

  const dom = {
    canvasRoot: document.getElementById("canvas-root"),
    loading: document.getElementById("loading"),
    statCapacity: document.getElementById("stat-capacity"),
    statLayout: document.getElementById("stat-layout"),
    statSeats: document.getElementById("stat-seats"),
    returnLobbyBtn: document.getElementById("return-lobby-btn"),
    presetButtons: Array.from(document.querySelectorAll("[data-preset]"))
  };

  document.body.dataset.entrySource = entrySource || "direct";
  if (fromEmptines && dom.loading) {
    dom.loading.textContent = "EMPTINES -> HALL transition...";
  }
  if (fromEmptines && dom.returnLobbyBtn) {
    dom.returnLobbyBtn.classList.remove("hidden");
    dom.returnLobbyBtn.addEventListener("click", () => {
      window.location.assign("/?zone=lobby&from=performance");
    });
  }

  dom.statCapacity.textContent = `${CAPACITY}명`;
  dom.statLayout.textContent = `${ROWS}열 x ${COLS}석`;

  if (!window.THREE || !window.THREE.OrbitControls) {
    failBoot("Three.js 로딩에 실패했습니다. 네트워크를 확인하세요.");
    return;
  }

  if (!supportsWebGL()) {
    failBoot("브라우저에서 WebGL을 사용할 수 없습니다.");
    return;
  }

  const THREE = window.THREE;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x040810);
  scene.fog = new THREE.FogExp2(0x040810, 0.022);

  const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 300);
  camera.position.set(0, 16, 33);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: "high-performance"
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  dom.canvasRoot.appendChild(renderer.domElement);

  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.minDistance = 8;
  controls.maxDistance = 65;
  controls.enablePan = false;
  controls.maxPolarAngle = Math.PI / 2 - 0.03;

  const venue = createVenueShell(THREE, scene);
  const stage = createStage(THREE, scene);
  const seating = createSeating(THREE, scene, {
    rows: ROWS,
    cols: COLS,
    aisleGap: 1.18,
    seatGapX: 2.42,
    seatGapZ: 2.96,
    startZ: -0.7
  });
  const lighting = createLighting(THREE, scene);
  const particles = createParticles(THREE, scene);

  dom.statSeats.textContent = `${seating.seatCount}석`;

  loadOptionalAssets(THREE, renderer, {
    venue,
    stage,
    seating
  }).catch(() => {});

  const presets = {
    wide: {
      position: new THREE.Vector3(0, 16, 33),
      target: new THREE.Vector3(0, 4.2, -4)
    },
    stage: {
      position: new THREE.Vector3(0, 8.6, 5.4),
      target: new THREE.Vector3(0, 5.8, -13.8)
    },
    audience: {
      position: new THREE.Vector3(0, 9.8, 20),
      target: new THREE.Vector3(0, 2.4, 8)
    }
  };

  let cameraTween = null;
  applyPreset(fromEmptines ? "audience" : "wide", true);
  setupPresetButtons();

  window.addEventListener("resize", onResize);

  const clock = new THREE.Clock();
  let loadingHidden = false;
  animate();

  function animate() {
    requestAnimationFrame(animate);

    const elapsed = clock.getElapsedTime();
    updateCameraTween();
    animateStageScreen(elapsed);
    animateLighting(elapsed);
    animateAudience(elapsed);
    animateParticles();

    controls.update();
    renderer.render(scene, camera);

    if (!loadingHidden && elapsed > 0.55) {
      dom.loading.classList.add("hidden");
      loadingHidden = true;
    }
  }

  function animateStageScreen(time) {
    const hue = (0.62 + Math.sin(time * 0.58) * 0.12 + 1) % 1;
    const pulse = 0.5 + Math.sin(time * 2.7) * 0.2;
    stage.screenMat.emissive.setHSL(hue, 0.86, Math.max(0.26, pulse));
    stage.screenMat.color.setHSL(hue, 0.72, 0.48);
    stage.edgeMat.emissiveIntensity = 0.5 + Math.sin(time * 3.8) * 0.2;
  }

  function animateLighting(time) {
    lighting.moving.forEach((item, index) => {
      item.target.position.x = Math.sin(time * item.speedX + item.offset) * 11.5;
      item.target.position.z = 2 + Math.cos(time * item.speedZ + item.offset + index * 0.3) * 8.8;
      item.beam.lookAt(item.target.position);
    });
  }

  function animateAudience(time) {
    seating.audience.forEach((fan, index) => {
      fan.mesh.position.y = fan.baseY + Math.abs(Math.sin(time * fan.speed + fan.offset)) * 0.35;
      fan.mesh.material.emissiveIntensity = 0.58 + Math.sin(time * 2.2 + index * 0.12) * 0.2;
    });
  }

  function animateParticles() {
    const positions = particles.points.geometry.attributes.position.array;
    for (let i = 0; i < particles.count; i += 1) {
      const idx = i * 3;
      positions[idx + 1] -= particles.velocities[i];
      if (positions[idx + 1] < 1.1) {
        positions[idx] = (Math.random() - 0.5) * 22;
        positions[idx + 1] = Math.random() * 13 + 2;
        positions[idx + 2] = -18 + Math.random() * 14;
      }
    }
    particles.points.rotation.y += 0.0012;
    particles.points.geometry.attributes.position.needsUpdate = true;
  }

  function applyPreset(name, immediate) {
    const preset = presets[name];
    if (!preset) {
      return;
    }

    if (immediate) {
      camera.position.copy(preset.position);
      controls.target.copy(preset.target);
      controls.update();
      setActivePresetButton(name);
      return;
    }

    cameraTween = {
      start: performance.now(),
      duration: 850,
      fromPos: camera.position.clone(),
      toPos: preset.position.clone(),
      fromTarget: controls.target.clone(),
      toTarget: preset.target.clone()
    };
    setActivePresetButton(name);
  }

  function updateCameraTween() {
    if (!cameraTween) {
      return;
    }

    const now = performance.now();
    const progress = Math.min((now - cameraTween.start) / cameraTween.duration, 1);
    const eased = easeInOutCubic(progress);

    camera.position.lerpVectors(cameraTween.fromPos, cameraTween.toPos, eased);
    controls.target.lerpVectors(cameraTween.fromTarget, cameraTween.toTarget, eased);

    if (progress >= 1) {
      cameraTween = null;
    }
  }

  function setupPresetButtons() {
    dom.presetButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        applyPreset(btn.dataset.preset, false);
      });
    });
  }

  function setActivePresetButton(name) {
    dom.presetButtons.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.preset === name);
    });
  }

  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  function failBoot(message) {
    dom.loading.textContent = message;
  }

  function supportsWebGL() {
    try {
      const canvas = document.createElement("canvas");
      return Boolean(canvas.getContext("webgl") || canvas.getContext("experimental-webgl"));
    } catch (error) {
      return false;
    }
  }

  function easeInOutCubic(value) {
    if (value < 0.5) {
      return 4 * value * value * value;
    }
    return 1 - Math.pow(-2 * value + 2, 3) / 2;
  }

  function createVenueShell(THREERef, targetScene) {
    const hall = new THREERef.Group();
    targetScene.add(hall);

    const floorMat = new THREERef.MeshStandardMaterial({
      color: 0x202c42,
      roughness: 0.9,
      metalness: 0.06
    });
    const floor = new THREERef.Mesh(new THREERef.PlaneGeometry(50, 64), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    hall.add(floor);

    const outerRing = new THREERef.Mesh(
      new THREERef.RingGeometry(25.5, 32, 96),
      new THREERef.MeshStandardMaterial({ color: 0x0f1526, roughness: 0.95, metalness: 0.03 })
    );
    outerRing.rotation.x = -Math.PI / 2;
    outerRing.position.y = 0.01;
    hall.add(outerRing);

    const wallMat = new THREERef.MeshStandardMaterial({
      color: 0x101a2f,
      roughness: 0.86,
      metalness: 0.14
    });

    const backWall = new THREERef.Mesh(new THREERef.BoxGeometry(50, 19, 1), wallMat);
    backWall.position.set(0, 9.5, -25);
    backWall.receiveShadow = true;
    hall.add(backWall);

    const sideWallLeft = new THREERef.Mesh(new THREERef.BoxGeometry(1, 19, 64), wallMat);
    sideWallLeft.position.set(-25, 9.5, 7);
    sideWallLeft.receiveShadow = true;
    hall.add(sideWallLeft);

    const sideWallRight = sideWallLeft.clone();
    sideWallRight.position.x = 25;
    hall.add(sideWallRight);

    const ceiling = new THREERef.Mesh(
      new THREERef.PlaneGeometry(50, 64),
      new THREERef.MeshStandardMaterial({ color: 0x0a0f1d, roughness: 0.92, metalness: 0.08 })
    );
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = 19;
    hall.add(ceiling);

    const aisle = new THREERef.Mesh(
      new THREERef.PlaneGeometry(4.7, 23),
      new THREERef.MeshStandardMaterial({ color: 0x5b1f33, roughness: 0.88, metalness: 0.05 })
    );
    aisle.rotation.x = -Math.PI / 2;
    aisle.position.set(0, 0.02, 7.8);
    hall.add(aisle);

    const sideGlowMat = new THREERef.MeshStandardMaterial({
      color: 0x3bc0ff,
      emissive: 0x3bc0ff,
      emissiveIntensity: 0.38
    });

    for (let i = 0; i < 6; i += 1) {
      const z = -17 + i * 7;
      const glowL = new THREERef.Mesh(new THREERef.BoxGeometry(0.35, 2.8, 0.35), sideGlowMat);
      glowL.position.set(-24.4, 4.2, z);
      hall.add(glowL);

      const glowR = glowL.clone();
      glowR.position.x = 24.4;
      hall.add(glowR);
    }

    return { hall, floorMat };
  }

  function createStage(THREERef, targetScene) {
    const stageGroup = new THREERef.Group();
    targetScene.add(stageGroup);

    const stageMat = new THREERef.MeshStandardMaterial({
      color: 0x090c12,
      roughness: 0.35,
      metalness: 0.72
    });
    const stageBase = new THREERef.Mesh(new THREERef.BoxGeometry(20, 1.2, 10), stageMat);
    stageBase.position.set(0, 0.6, -14);
    stageBase.castShadow = true;
    stageBase.receiveShadow = true;
    stageGroup.add(stageBase);

    const runwayMat = new THREERef.MeshStandardMaterial({
      color: 0x0e121d,
      roughness: 0.4,
      metalness: 0.6
    });
    const runway = new THREERef.Mesh(new THREERef.BoxGeometry(4.8, 0.9, 6.4), runwayMat);
    runway.position.set(0, 0.45, -8);
    runway.castShadow = true;
    runway.receiveShadow = true;
    stageGroup.add(runway);

    const edgeMat = new THREERef.MeshStandardMaterial({
      color: 0xff5c7d,
      emissive: 0xff5c7d,
      emissiveIntensity: 0.62
    });
    const stageEdge = new THREERef.Mesh(new THREERef.BoxGeometry(20.1, 0.17, 0.2), edgeMat);
    stageEdge.position.set(0, 1.1, -9.1);
    stageGroup.add(stageEdge);

    const screenMat = new THREERef.MeshStandardMaterial({
      color: 0x5ec8ff,
      emissive: 0x5ec8ff,
      emissiveIntensity: 0.55,
      roughness: 0.42,
      metalness: 0.1
    });
    const screen = new THREERef.Mesh(new THREERef.PlaneGeometry(16.5, 8.1), screenMat);
    screen.position.set(0, 8.6, -19.3);
    stageGroup.add(screen);

    const screenFrame = new THREERef.Mesh(
      new THREERef.BoxGeometry(17.2, 8.8, 0.35),
      new THREERef.MeshStandardMaterial({ color: 0x2f364b, roughness: 0.58, metalness: 0.38 })
    );
    screenFrame.position.set(0, 8.6, -19.55);
    stageGroup.add(screenFrame);

    const trussMat = new THREERef.MeshStandardMaterial({
      color: 0x434d65,
      roughness: 0.58,
      metalness: 0.73
    });
    const frontTruss = new THREERef.Mesh(new THREERef.BoxGeometry(22, 0.45, 0.45), trussMat);
    frontTruss.position.set(0, 13, -10.8);
    stageGroup.add(frontTruss);

    const backTruss = frontTruss.clone();
    backTruss.position.z = -17.8;
    stageGroup.add(backTruss);

    const speakerMat = new THREERef.MeshStandardMaterial({ color: 0x101114, roughness: 0.9 });
    const speakerL = new THREERef.Mesh(new THREERef.BoxGeometry(2.6, 6, 2.8), speakerMat);
    speakerL.position.set(-12.2, 4.4, -14);
    speakerL.castShadow = true;
    stageGroup.add(speakerL);

    const speakerR = speakerL.clone();
    speakerR.position.x = 12.2;
    stageGroup.add(speakerR);

    return {
      stageGroup,
      stageMat,
      runwayMat,
      edgeMat,
      screenMat,
      speakerMat
    };
  }

  function createSeating(THREERef, targetScene, options) {
    const seatGroup = new THREERef.Group();
    const audienceGroup = new THREERef.Group();
    targetScene.add(seatGroup);
    targetScene.add(audienceGroup);

    const seatMaterials = {
      frameMat: new THREERef.MeshStandardMaterial({
        color: 0x1f273a,
        roughness: 0.74,
        metalness: 0.24
      }),
      cushionMat: new THREERef.MeshStandardMaterial({
        color: 0x2f57ca,
        roughness: 0.61,
        metalness: 0.12
      })
    };

    const audienceData = [];
    const seatTemplate = buildSeatTemplate(THREERef, seatMaterials);
    const facingTarget = new THREERef.Vector3(0, 1.1, -14.2);

    let seatCount = 0;
    for (let row = 0; row < options.rows; row += 1) {
      for (let col = 0; col < options.cols; col += 1) {
        const seat = seatTemplate.clone(true);
        const xBase = (col - (options.cols - 1) / 2) * options.seatGapX;
        const aisleShift = col >= options.cols / 2 ? options.aisleGap : -options.aisleGap;
        const x = xBase + aisleShift;
        const z = options.startZ + row * options.seatGapZ;

        seat.position.set(x, 0, z);
        seat.lookAt(facingTarget);
        seatGroup.add(seat);

        const glowColor = row % 2 === 0 ? 0xff4e82 : 0x4ec8ff;
        const fan = new THREERef.Mesh(
          new THREERef.SphereGeometry(0.2, 9, 9),
          new THREERef.MeshStandardMaterial({
            color: glowColor,
            emissive: glowColor,
            emissiveIntensity: 0.62
          })
        );
        fan.position.set(x, 2.12, z + 0.08);
        audienceGroup.add(fan);
        audienceData.push({
          mesh: fan,
          baseY: 2.04 + Math.random() * 0.2,
          speed: 1.9 + Math.random() * 1.4,
          offset: Math.random() * Math.PI * 2
        });

        seatCount += 1;
      }
    }

    return {
      seatCount,
      audience: audienceData,
      seatMaterials
    };
  }

  function buildSeatTemplate(THREERef, materials) {
    const seat = new THREERef.Group();

    const base = new THREERef.Mesh(new THREERef.BoxGeometry(1.52, 0.3, 1.36), materials.cushionMat);
    base.position.y = 0.93;
    seat.add(base);

    const back = new THREERef.Mesh(new THREERef.BoxGeometry(1.52, 0.98, 0.24), materials.cushionMat);
    back.position.set(0, 1.48, -0.56);
    seat.add(back);

    const armL = new THREERef.Mesh(new THREERef.BoxGeometry(0.16, 0.43, 1.18), materials.frameMat);
    armL.position.set(-0.75, 1.08, 0);
    seat.add(armL);
    const armR = armL.clone();
    armR.position.x = 0.75;
    seat.add(armR);

    const legGeo = new THREERef.BoxGeometry(0.12, 0.93, 0.12);
    const legOffsets = [
      [-0.64, 0.47, -0.5],
      [0.64, 0.47, -0.5],
      [-0.64, 0.47, 0.5],
      [0.64, 0.47, 0.5]
    ];

    legOffsets.forEach((offset) => {
      const leg = new THREERef.Mesh(legGeo, materials.frameMat);
      leg.position.set(offset[0], offset[1], offset[2]);
      seat.add(leg);
    });

    seat.traverse((obj) => {
      if (obj.isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });

    return seat;
  }

  function createLighting(THREERef, targetScene) {
    const ambient = new THREERef.AmbientLight(0xffffff, 0.23);
    targetScene.add(ambient);

    const houseFill = new THREERef.PointLight(0x8fc9ff, 0.6, 120);
    houseFill.position.set(0, 15, 12);
    targetScene.add(houseFill);

    const stageWash = new THREERef.SpotLight(0xffffff, 1.55, 120, Math.PI / 5, 0.5, 1.15);
    stageWash.position.set(0, 14, 1);
    stageWash.target.position.set(0, 2.6, -14);
    stageWash.castShadow = true;
    stageWash.shadow.mapSize.width = 1024;
    stageWash.shadow.mapSize.height = 1024;
    targetScene.add(stageWash);
    targetScene.add(stageWash.target);

    const moving = [];
    const colors = [0xff4b7b, 0x4ec8ff, 0x83ff74, 0xffc95a];

    for (let i = 0; i < colors.length; i += 1) {
      const light = new THREERef.SpotLight(colors[i], 2.4, 95, Math.PI / 9, 0.5, 1.25);
      light.position.set((i - 1.5) * 5.4, 12.8, -11.2);

      const target = new THREERef.Object3D();
      target.position.set((i - 1.5) * 3.2, 1.4, 5.4);
      light.target = target;
      targetScene.add(light);
      targetScene.add(target);

      const beamGeo = new THREERef.CylinderGeometry(0.1, 1.25, 28, 14, 1, true);
      beamGeo.translate(0, -14, 0);
      beamGeo.rotateX(Math.PI / 2);
      const beam = new THREERef.Mesh(
        beamGeo,
        new THREERef.MeshBasicMaterial({
          color: colors[i],
          transparent: true,
          opacity: 0.11,
          blending: THREERef.AdditiveBlending,
          depthWrite: false
        })
      );
      beam.position.copy(light.position);
      targetScene.add(beam);

      moving.push({
        light,
        target,
        beam,
        speedX: 0.25 + Math.random() * 0.16,
        speedZ: 0.2 + Math.random() * 0.14,
        offset: Math.random() * Math.PI * 2
      });
    }

    return { moving };
  }

  function createParticles(THREERef, targetScene) {
    const count = 420;
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count);

    for (let i = 0; i < count; i += 1) {
      const idx = i * 3;
      positions[idx] = (Math.random() - 0.5) * 22;
      positions[idx + 1] = Math.random() * 13 + 2;
      positions[idx + 2] = -18 + Math.random() * 14;
      velocities[i] = 0.012 + Math.random() * 0.018;
    }

    const geometry = new THREERef.BufferGeometry();
    geometry.setAttribute("position", new THREERef.BufferAttribute(positions, 3));
    const material = new THREERef.PointsMaterial({
      size: 0.16,
      color: 0xffdeba,
      transparent: true,
      opacity: 0.78,
      blending: THREERef.AdditiveBlending
    });

    const points = new THREERef.Points(geometry, material);
    targetScene.add(points);

    return { points, count, velocities };
  }

  async function loadOptionalAssets(THREERef, rendererRef, refs) {
    const manifest = await loadAssetManifest();
    if (!manifest || !Array.isArray(manifest.items)) {
      return;
    }

    const loader = new THREERef.TextureLoader();
    const anisotropy = Math.min(8, rendererRef.capabilities.getMaxAnisotropy() || 4);

    const getSource = (id) => {
      const item = manifest.items.find((entry) => entry.id === id);
      return item ? item.source : null;
    };

    const loadTexture = (material, key, path, options) => {
      loader.load(
        path,
        (texture) => {
          texture.anisotropy = anisotropy;
          if (options && options.srgb) {
            texture.encoding = THREERef.sRGBEncoding;
          }
          if (options && options.repeat) {
            texture.wrapS = THREERef.RepeatWrapping;
            texture.wrapT = THREERef.RepeatWrapping;
            texture.repeat.set(options.repeat[0], options.repeat[1]);
          }
          material[key] = texture;
          material.needsUpdate = true;
        },
        undefined,
        () => {}
      );
    };

    const maybeLoadTexture = (material, key, path, options) => {
      if (!path || typeof path !== "string") {
        return;
      }
      loadTexture(material, key, path, options);
    };

    const stageTextureSet = getSource("stage_floor_texture_set");
    if (stageTextureSet && typeof stageTextureSet === "object") {
      maybeLoadTexture(refs.stage.stageMat, "map", stageTextureSet.baseColor, {
        srgb: true,
        repeat: [4, 2]
      });
      maybeLoadTexture(refs.stage.stageMat, "normalMap", stageTextureSet.normal, {
        repeat: [4, 2]
      });
      maybeLoadTexture(refs.stage.stageMat, "roughnessMap", stageTextureSet.roughness, {
        repeat: [4, 2]
      });
    }

    const hallTextureSet = getSource("hall_floor_texture_set");
    if (hallTextureSet && typeof hallTextureSet === "object") {
      maybeLoadTexture(refs.venue.floorMat, "map", hallTextureSet.baseColor, {
        srgb: true,
        repeat: [6, 6]
      });
      maybeLoadTexture(refs.venue.floorMat, "normalMap", hallTextureSet.normal, {
        repeat: [6, 6]
      });
      maybeLoadTexture(refs.venue.floorMat, "roughnessMap", hallTextureSet.roughness, {
        repeat: [6, 6]
      });
    }

    const seatTexture = getSource("seat_fabric_texture");
    maybeLoadTexture(refs.seating.seatMaterials.cushionMat, "map", seatTexture, {
      srgb: true,
      repeat: [1, 1]
    });

    const speakerTexture = getSource("speaker_grille_texture");
    maybeLoadTexture(refs.stage.speakerMat, "map", speakerTexture, {
      srgb: true,
      repeat: [1, 1]
    });

    const stageVideoPath = getSource("screen_video_loop");
    const hasVideo = typeof stageVideoPath === "string" && stageVideoPath.trim().length > 0;
    let tryPlayVideo = null;
    if (hasVideo) {
      const stageVideo = document.createElement("video");
      stageVideo.src = stageVideoPath;
      stageVideo.muted = true;
      stageVideo.loop = true;
      stageVideo.playsInline = true;
      stageVideo.preload = "auto";

      tryPlayVideo = () => {
        stageVideo.play().catch(() => {});
      };

      stageVideo.addEventListener("canplay", () => {
        const videoTexture = new THREERef.VideoTexture(stageVideo);
        videoTexture.minFilter = THREERef.LinearFilter;
        videoTexture.magFilter = THREERef.LinearFilter;
        refs.stage.screenMat.map = videoTexture;
        refs.stage.screenMat.emissiveMap = videoTexture;
        refs.stage.screenMat.emissiveIntensity = 0.95;
        refs.stage.screenMat.needsUpdate = true;
        tryPlayVideo();
      });
      stageVideo.load();
    }

    const audioPath = getSource("ambient_audio_loop");
    const hasAudio = typeof audioPath === "string" && audioPath.trim().length > 0;
    const ambientAudio = hasAudio ? new Audio(audioPath) : null;
    if (ambientAudio) {
      ambientAudio.loop = true;
      ambientAudio.volume = 0.2;
    }

    if (tryPlayVideo || ambientAudio) {
      window.addEventListener(
        "pointerdown",
        () => {
          if (tryPlayVideo) {
            tryPlayVideo();
          }
          if (ambientAudio) {
            ambientAudio.play().catch(() => {});
          }
        },
        { once: true }
      );
    }
  }

  async function loadAssetManifest() {
    try {
      const response = await fetch("./asset-manifest.json", { cache: "no-store" });
      if (!response.ok) {
        return null;
      }
      return await response.json();
    } catch (error) {
      return null;
    }
  }
})();
