(function () {
  "use strict";

  var THREE = window.THREE;

  var QUALITY_COUNTS = {
    low: { desktop: 120000, mobile: 60000 },
    medium: { desktop: 320000, mobile: 140000 },
    high: { desktop: 750000, mobile: 260000 },
    ultra: { desktop: 1800000, mobile: 420000 },
    extreme: { desktop: 5000000, mobile: 650000 }
  };

  var ORBITAL_COLORS = {
    0: { a: 0x58b4ff, b: 0x42e8ff, name: "s" },
    1: { a: 0x46c8ff, b: 0x7cf0d8, name: "p" },
    2: { a: 0x5e9dff, b: 0xc278ff, name: "d" },
    3: { a: 0x8a7dff, b: 0x3dd8ff, name: "f" },
    4: { a: 0xa07cff, b: 0x56d0ff, name: "g" },
    5: { a: 0x6cf0ff, b: 0xb894ff, name: "h" }
  };

  var SPECTROSCOPIC = [
    "s", "p", "d", "f", "g", "h", "i", "k", "l", "m", "n", "o", "q", "r", "t", "u", "v", "w", "x", "y", "z"
  ];

  var STATUS_STEPS = [
    "Initializing radial basis...",
    "Evaluating Laguerre polynomial field...",
    "Normalizing spherical harmonics...",
    "Sampling wavefunction...",
    "Constructing orbital field...",
    "Optimizing render buffers...",
    "Launching visualization..."
  ];

  var PROTON_RADIUS_IN_BOHR = 1.589e-5;
  var CLOUD_VIEW_RADIUS = 3.05;

  var canvas = document.getElementById("bg");
  var loading = document.getElementById("loading");
  var loadingTitle = document.getElementById("loaderTitle");
  var loadingBar = document.getElementById("loadingBar");
  var loadingPercent = document.getElementById("loadingPercent");
  var loadingStatus = document.getElementById("loadingStatus");
  var nInput = document.getElementById("nInput");
  var lInput = document.getElementById("lInput");
  var mInput = document.getElementById("mInput");
  var countInput = document.getElementById("countInput");
  var orientationSelect = document.getElementById("orientationSelect");
  var qualitySelect = document.getElementById("qualitySelect");
  var generateButton = document.getElementById("generateButton");
  var captureButton = document.getElementById("captureButton");
  var validityLabel = document.getElementById("validityLabel");
  var fpsStat = document.getElementById("fpsStat");
  var particleStat = document.getElementById("particleStat");
  var orbitalStat = document.getElementById("orbitalStat");
  var gpuStat = document.getElementById("gpuStat");
  var controlPanel = document.getElementById("controlPanel");
  var panelToggle = document.getElementById("panelToggle");
  var panelBackdrop = document.getElementById("panelBackdrop");
  var drawerMq = window.matchMedia("(max-width: 767px)");
  var drawerDismissTimer = null;
  var orbitalSheet = document.getElementById("orbitalSheet");
  var orbitalSheetOpen = document.getElementById("orbitalSheetOpen");
  var orbitalSheetClose = document.getElementById("orbitalSheetClose");
  var orbitalSheetScrim = document.getElementById("orbitalSheetScrim");

  if (!THREE || !THREE.OrbitControls) {
    loading.classList.add("is-active");
    loadingTitle.textContent = "Three.js failed to load";
    loadingPercent.textContent = "0%";
    loadingStatus.textContent = "Check the CDN connection and reload PsiLab.";
    return;
  }

  var isMobile = detectMobile();
  var maxParticleCount = isMobile ? 650000 : 5000000;
  var formatter = new Intl.NumberFormat("en-US");

  var scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x02030a, 0.035);

  var camera = new THREE.PerspectiveCamera(44, window.innerWidth / window.innerHeight, 1e-8, 120);
  camera.position.set(4.5, 2.7, 5.3);

  var renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    alpha: true,
    antialias: true,
    logarithmicDepthBuffer: true,
    powerPreference: "high-performance",
    preserveDrawingBuffer: true
  });
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.setClearColor(0x000000, 0);

  var basePixelRatio = Math.min(window.devicePixelRatio || 1, isMobile ? 1.2 : 1.65);
  var currentPixelRatio = basePixelRatio;
  renderer.setPixelRatio(currentPixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight, false);

  var controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.065;
  controls.enablePan = false;
  controls.minDistance = 0.00002;
  controls.maxDistance = 24;
  controls.rotateSpeed = 0.72;
  controls.zoomSpeed = 0.74;
  controls.touches.ONE = THREE.TOUCH.ROTATE;
  controls.touches.TWO = THREE.TOUCH.DOLLY_ROTATE;

  var root = new THREE.Group();
  scene.add(root);

  var currentCloud = null;
  var currentMaterial = null;
  var currentWorker = null;
  var nucleusCore = null;
  var nucleusGlow = null;
  var generationId = 0;
  var drawRatio = 1;
  var currentState = { n: 3, l: 2, m: 0, count: Number(countInput.value) };
  var displayedParticles = 0;
  var displayedFps = 0;
  var displayedGpu = 0;
  var lastFrameTime = performance.now();
  var frameCounter = 0;
  var fpsWindowStart = performance.now();
  var smoothedFps = 60;
  var targetRotation = 0;

  var gpuTimer = createGpuTimer(renderer);

  createReferenceField();
  createNucleus();
  syncQuantumInputs();
  applyQualityCount();
  setOrbitalReadout(readControls());
  setLoadingProgress(4, STATUS_STEPS[0]);

  generateButton.addEventListener("click", function () {
    generateOrbital("manual");
    closeDrawerIfMobile();
  });

  captureButton.addEventListener("click", exportScreenshot);

  qualitySelect.addEventListener("change", function () {
    applyQualityCount();
    syncQuantumInputs();
  });

  orientationSelect.addEventListener("change", function () {
    mInput.value = orientationSelect.value;
    syncQuantumInputs();
    setOrbitalReadout(readControls());
    updatePresetState();
  });

  [nInput, lInput, mInput, countInput].forEach(function (input) {
    input.addEventListener("input", function () {
      syncQuantumInputs();
      setOrbitalReadout(readControls());
      updatePresetState();
    });
  });

  document.addEventListener("click", function (event) {
    var button = event.target.closest(".preset-button");
    if (!button || button.dataset.n === undefined) {
      return;
    }
    nInput.value = button.dataset.n;
    lInput.value = button.dataset.l;
    mInput.value = button.dataset.m;
    syncQuantumInputs();
    updatePresetState();
    generateOrbital("preset");
    closeOrbitalSheet();
    closeDrawerIfMobile();
  });

  initMobileDrawer();
  initOrbitalSheet();
  syncMobileChrome();
  syncControlsEnabled();

  window.addEventListener("resize", onResize);
  window.addEventListener("beforeunload", function () {
    if (currentWorker) {
      currentWorker.terminate();
    }
  });

  requestAnimationFrame(animate);
  window.setTimeout(function () {
    generateOrbital("initial");
  }, 120);

  function readControls() {
    var n = integerFromInput(nInput, 1);
    var l = integerFromInput(lInput, 0);
    var m = integerFromInput(mInput, 0);
    var count = integerFromInput(countInput, QUALITY_COUNTS.high.desktop);

    n = Math.max(1, n);
    l = clamp(l, 0, n - 1);
    m = clamp(m, -l, l);
    count = clamp(count, 10000, maxParticleCount);

    return { n: n, l: l, m: m, count: count };
  }

  function syncQuantumInputs() {
    var raw = {
      n: integerFromInput(nInput, 1),
      l: integerFromInput(lInput, 0),
      m: integerFromInput(mInput, 0),
      count: integerFromInput(countInput, QUALITY_COUNTS.high.desktop)
    };

    var state = readControls();
    var adjusted = raw.n !== state.n || raw.l !== state.l || raw.m !== state.m || raw.count !== state.count;

    nInput.value = state.n;
    lInput.value = state.l;
    mInput.value = state.m;
    countInput.value = state.count;
    lInput.max = Math.max(0, state.n - 1);
    mInput.min = -state.l;
    mInput.max = state.l;
    syncOrientationOptions(state);
    validityLabel.textContent = adjusted ? "adjusted to valid eigenstate" : "valid eigenstate";
    validityLabel.classList.toggle("is-invalid", adjusted);
  }

  function applyQualityCount() {
    var key = qualitySelect.value;
    var tier = QUALITY_COUNTS[key] || QUALITY_COUNTS.high;
    countInput.value = isMobile ? tier.mobile : tier.desktop;
  }

  function generateOrbital(reason) {
    syncQuantumInputs();
    var state = readControls();
    currentState = state;
    setOrbitalReadout(state);
    updatePresetState();
    drawRatio = 1;

    generationId += 1;
    var jobId = generationId;

    if (currentWorker) {
      currentWorker.terminate();
      currentWorker = null;
    }

    setLoadingVisible(true);
    setLoadingProgress(1, reason === "initial" ? STATUS_STEPS[0] : "Preparing " + orbitalName(state) + "...");

    currentWorker = createSamplerWorker();
    currentWorker.onmessage = function (event) {
      var message = event.data;
      if (!message || message.jobId !== jobId) {
        return;
      }

      if (message.type === "progress") {
        setLoadingProgress(message.progress, message.status);
        return;
      }

      if (message.type === "complete") {
        installOrbital(message, state);
        setLoadingProgress(100, STATUS_STEPS[6]);
        window.setTimeout(function () {
          setLoadingVisible(false);
        }, 480);
        currentWorker.terminate();
        currentWorker = null;
        return;
      }

      if (message.type === "error") {
        loadingTitle.textContent = "Generation failed";
        loadingStatus.textContent = message.message || "Unknown sampling error.";
        loadingPercent.textContent = "0%";
        loadingBar.style.width = "0%";
        console.error("PsiLab worker error:", message.message, message.stack || "");
        currentWorker.terminate();
        currentWorker = null;
      }
    };

    currentWorker.onerror = function (error) {
      if (jobId !== generationId) {
        return;
      }
      loadingTitle.textContent = "Generation failed";
      loadingStatus.textContent = error.message || "Worker thread error.";
      loadingPercent.textContent = "0%";
      loadingBar.style.width = "0%";
      console.error(error);
      currentWorker.terminate();
      currentWorker = null;
    };

    currentWorker.postMessage({
      type: "generate",
      jobId: jobId,
      n: state.n,
      l: state.l,
      m: state.m,
      count: state.count
    });
  }

  function installOrbital(message, state) {
    disposeCloud();

    var positions = new Float32Array(message.positions);
    var geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setDrawRange(0, positions.length / 3);
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 4.8);

    currentMaterial = createCloudMaterial(state.l, positions.length / 3);
    currentCloud = new THREE.Points(geometry, currentMaterial);
    currentCloud.frustumCulled = false;
    currentCloud.userData = {
      count: positions.length / 3,
      attempts: message.attempts,
      rawRadius: message.rawRadius,
      visualRadius: message.visualRadius,
      elapsed: message.elapsed
    };
    updateNucleusScale(message.visualRadius);

    root.add(currentCloud);
    displayedParticles = 0;
    currentState = state;
    setOrbitalReadout(state);
    updateStats(true);

    targetRotation = 0;
    root.rotation.set(0, 0, 0);
    controls.target.set(0, 0, 0);
    controls.update();
  }

  function disposeCloud() {
    if (!currentCloud) {
      return;
    }
    root.remove(currentCloud);
    currentCloud.geometry.dispose();
    if (currentCloud.material) {
      currentCloud.material.dispose();
    }
    currentCloud = null;
    currentMaterial = null;
  }

  function createCloudMaterial(l, count) {
    var palette = ORBITAL_COLORS[l] || {
      a: 0x66a8ff,
      b: 0xb894ff,
      name: "high-l"
    };

    var opacity = count > 2500000 ? 0.105 : count > 1000000 ? 0.14 : count > 350000 ? 0.19 : 0.28;
    var pointSize = count > 2500000 ? 0.72 : count > 1000000 ? 0.90 : count > 350000 ? 1.08 : 1.28;
    if (isMobile) {
      pointSize *= 0.9;
      opacity *= 1.08;
    }

    return new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: currentPixelRatio },
        uPointSize: { value: pointSize },
        uOpacity: { value: opacity },
        uColorA: { value: new THREE.Color(palette.a) },
        uColorB: { value: new THREE.Color(palette.b) }
      },
      vertexShader: [
        "uniform float uTime;",
        "uniform float uPixelRatio;",
        "uniform float uPointSize;",
        "varying float vRadius;",
        "varying float vDepth;",
        "void main() {",
        "  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);",
        "  float cameraDepth = max(-mvPosition.z, 0.18);",
        "  vRadius = length(position);",
        "  vDepth = clamp(cameraDepth / 12.0, 0.0, 1.0);",
        "  gl_Position = projectionMatrix * mvPosition;",
        "  float breathing = 1.0 + 0.10 * sin(uTime * 0.70 + vRadius * 7.0);",
        "  gl_PointSize = clamp(uPointSize * uPixelRatio * breathing * (9.5 / cameraDepth), 1.0, 7.2);",
        "}"
      ].join("\n"),
      fragmentShader: [
        "precision highp float;",
        "uniform float uTime;",
        "uniform float uOpacity;",
        "uniform vec3 uColorA;",
        "uniform vec3 uColorB;",
        "varying float vRadius;",
        "varying float vDepth;",
        "void main() {",
        "  vec2 uv = gl_PointCoord - vec2(0.5);",
        "  float r2 = dot(uv, uv);",
        "  if (r2 > 0.25) discard;",
        "  float disk = smoothstep(0.25, 0.02, r2);",
        "  float core = smoothstep(0.16, 0.0, r2);",
        "  float band = 0.5 + 0.5 * sin(vRadius * 4.2 - uTime * 0.32);",
        "  vec3 color = mix(uColorA, uColorB, smoothstep(0.1, 0.95, band));",
        "  color += core * 0.12;",
        "  float alpha = disk * uOpacity * mix(1.0, 0.62, vDepth);",
        "  gl_FragColor = vec4(color, alpha);",
        "}"
      ].join("\n")
    });
  }

  function createNucleus() {
    var group = new THREE.Group();

    nucleusCore = new THREE.Mesh(
      new THREE.SphereBufferGeometry(1, 32, 16),
      new THREE.MeshBasicMaterial({ color: 0xff3a1a })
    );

    var glowTexture = createNucleusGlowTexture();
    nucleusGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture,
        color: 0xff5522,
        transparent: true,
        opacity: 0.72,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );

    updateNucleusScale(1);
    group.add(nucleusGlow);
    group.add(nucleusCore);
    group.renderOrder = 5;
    scene.add(group);
  }

  function updateNucleusScale(visualRadius) {
    if (!nucleusCore || !nucleusGlow) {
      return;
    }

    var bohrToScene = CLOUD_VIEW_RADIUS / Math.max(visualRadius, 1e-9);
    var protonRadius = PROTON_RADIUS_IN_BOHR * bohrToScene;
    nucleusCore.scale.setScalar(protonRadius);

    // Faint locator glow only; radius is still tied to the true proton scale.
    var locatorRadius = protonRadius * 18;
    nucleusGlow.scale.set(locatorRadius, locatorRadius, 1);
    nucleusGlow.material.opacity = 0.72;
  }

  function createNucleusGlowTexture() {
    var size = 128;
    var c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    var ctx = c.getContext("2d");
    var gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.2, "rgba(255,200,140,0.9)");
    gradient.addColorStop(0.45, "rgba(255,100,40,0.45)");
    gradient.addColorStop(1, "rgba(255,60,20,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    var texture = new THREE.CanvasTexture(c);
    texture.needsUpdate = true;
    return texture;
  }

  function createReferenceField() {
    var count = isMobile ? 220 : 520;
    var positions = new Float32Array(count * 3);

    for (var i = 0; i < count; i += 1) {
      var radius = 16 + Math.random() * 22;
      var theta = Math.acos(2 * Math.random() - 1);
      var phi = Math.random() * Math.PI * 2;
      var s = Math.sin(theta);
      positions[i * 3] = radius * s * Math.cos(phi);
      positions[i * 3 + 1] = radius * s * Math.sin(phi);
      positions[i * 3 + 2] = radius * Math.cos(theta);
    }

    var geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    var material = new THREE.PointsMaterial({
      size: 0.022,
      color: 0x9fd8ff,
      transparent: true,
      opacity: 0.30,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    var field = new THREE.Points(geometry, material);
    field.frustumCulled = false;
    scene.add(field);
  }

  function animate(now) {
    requestAnimationFrame(animate);

    var delta = Math.min(0.05, (now - lastFrameTime) / 1000 || 0.016);
    lastFrameTime = now;
    frameCounter += 1;

    targetRotation += delta * 0.025;
    root.rotation.y += (targetRotation - root.rotation.y) * 0.015;

    if (currentMaterial) {
      currentMaterial.uniforms.uTime.value = now * 0.001;
      currentMaterial.uniforms.uPixelRatio.value = currentPixelRatio;
    }

    controls.update();

    gpuTimer.begin();
    renderer.render(scene, camera);
    gpuTimer.end();
    var gpuValue = gpuTimer.poll();
    if (gpuValue > 0) {
      displayedGpu += (gpuValue - displayedGpu) * 0.16;
    }

    if (now - fpsWindowStart >= 500) {
      var elapsed = (now - fpsWindowStart) / 1000;
      var fps = frameCounter / elapsed;
      smoothedFps += (fps - smoothedFps) * 0.35;
      displayedFps += (smoothedFps - displayedFps) * 0.45;
      frameCounter = 0;
      fpsWindowStart = now;
      adaptPerformance(smoothedFps);
      updateStats(false);
    }
  }

  function adaptPerformance(fps) {
    if (!currentCloud) {
      return;
    }

    var count = currentCloud.userData.count || 0;
    var changed = false;

    if (fps < 28 && drawRatio > 0.34) {
      drawRatio = Math.max(0.34, drawRatio * 0.88);
      changed = true;
    } else if (fps > 48 && drawRatio < 1) {
      drawRatio = Math.min(1, drawRatio + 0.06);
      changed = true;
    }

    if (changed) {
      currentCloud.geometry.setDrawRange(0, Math.max(1000, Math.floor(count * drawRatio)));
    }

    if (fps < 24 && currentPixelRatio > 0.9) {
      currentPixelRatio = Math.max(0.9, currentPixelRatio - 0.08);
      renderer.setPixelRatio(currentPixelRatio);
      renderer.setSize(window.innerWidth, window.innerHeight, false);
    } else if (fps > 54 && currentPixelRatio < basePixelRatio) {
      currentPixelRatio = Math.min(basePixelRatio, currentPixelRatio + 0.04);
      renderer.setPixelRatio(currentPixelRatio);
      renderer.setSize(window.innerWidth, window.innerHeight, false);
    }
  }

  function updateStats(force) {
    var count = currentCloud ? currentCloud.userData.count : currentState.count;
    if (force) {
      displayedParticles = 0;
    }
    displayedParticles += (count - displayedParticles) * (force ? 0.22 : 0.18);

    if (Math.abs(displayedParticles - count) < 16) {
      displayedParticles = count;
    }

    fpsStat.textContent = displayedFps > 0 ? Math.round(displayedFps).toString() : "--";
    particleStat.textContent = formatter.format(Math.round(displayedParticles));
    orbitalStat.textContent = orbitalName(currentState);
    gpuStat.textContent = displayedGpu > 0 ? displayedGpu.toFixed(2) + " ms" : "-- ms";
  }

  function exportScreenshot() {
    var oldPixelRatio = currentPixelRatio;
    var exportScale = Math.min(2.4, 4096 / Math.max(window.innerWidth, window.innerHeight));
    var exportRatio = Math.max(oldPixelRatio, exportScale);

    renderer.setPixelRatio(exportRatio);
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    if (currentMaterial) {
      currentMaterial.uniforms.uPixelRatio.value = exportRatio;
    }
    renderer.render(scene, camera);

    renderer.domElement.toBlob(function (blob) {
      if (!blob) {
        return;
      }
      var link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "PsiLab_" + orbitalName(currentState).replace(/[^a-zA-Z0-9]+/g, "_") + ".png";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(function () {
        URL.revokeObjectURL(link.href);
      }, 500);
    }, "image/png", 1);

    renderer.setPixelRatio(oldPixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    if (currentMaterial) {
      currentMaterial.uniforms.uPixelRatio.value = oldPixelRatio;
    }
  }

  function setOrbitalReadout(state) {
    currentState = state;
    orbitalStat.textContent = orbitalName(state);
    setOrbitalTheme(state.l);
  }

  function updatePresetState() {
    var state = readControls();
    document.querySelectorAll(".preset-button").forEach(function (button) {
      var active = Number(button.dataset.n) === state.n &&
        Number(button.dataset.l) === state.l &&
        Number(button.dataset.m) === state.m;
      button.classList.toggle("is-active", active);
    });
  }

  function syncOrientationOptions(state) {
    var previous = orientationSelect.value;
    var options = orientationOptionsFor(state.l);
    var html = options.map(function (option) {
      return "<option value=\"" + option.m + "\">" + option.label + "</option>";
    }).join("");

    if (orientationSelect.dataset.l !== String(state.l) || orientationSelect.innerHTML !== html) {
      orientationSelect.innerHTML = html;
      orientationSelect.dataset.l = String(state.l);
    }

    var hasCurrentM = options.some(function (option) {
      return option.m === state.m;
    });
    orientationSelect.value = hasCurrentM ? String(state.m) : previous;
  }

  function orientationOptionsFor(l) {
    if (l === 0) {
      return [{ m: 0, label: "spherical (m=0)" }];
    }

    if (l === 1) {
      return [
        { m: 0, label: "p_z (m=0)" },
        { m: 1, label: "p_x (real cos, m=+1)" },
        { m: -1, label: "p_y (real sin, m=-1)" }
      ];
    }

    if (l === 2) {
      return [
        { m: 0, label: "d_z2 (m=0)" },
        { m: 1, label: "d_xz (real cos, m=+1)" },
        { m: -1, label: "d_yz (real sin, m=-1)" },
        { m: 2, label: "d_x2-y2 (real cos, m=+2)" },
        { m: -2, label: "d_xy (real sin, m=-2)" }
      ];
    }

    var letter = SPECTROSCOPIC[l] || "l" + l;
    var options = [{ m: 0, label: letter + "_z axial (m=0)" }];
    for (var m = 1; m <= l; m += 1) {
      options.push({ m: m, label: letter + " cos(" + m + "phi) orientation (m=+" + m + ")" });
      options.push({ m: -m, label: letter + " sin(" + m + "phi) orientation (m=-" + m + ")" });
    }
    return options;
  }

  function setLoadingVisible(visible) {
    if (visible) {
      if (drawerDismissTimer) {
        window.clearTimeout(drawerDismissTimer);
        drawerDismissTimer = null;
      }
      loading.classList.remove("is-exiting");
      loading.classList.add("is-active");
      syncControlsEnabled();
      return;
    }

    if (!loading.classList.contains("is-active")) {
      return;
    }

    loading.classList.add("is-exiting");
    drawerDismissTimer = window.setTimeout(function () {
      loading.classList.remove("is-active", "is-exiting");
      drawerDismissTimer = null;
      syncControlsEnabled();
    }, 520);
    syncControlsEnabled();
  }

  function setLoadingProgress(value, status) {
    var progress = clamp(Math.round(value), 0, 100);
    loadingTitle.textContent = progress < 100 ? "Generating quantum orbital" : "Orbital ready";
    loadingBar.style.width = progress + "%";
    loadingPercent.textContent = progress + "%";
    loadingStatus.textContent = status || STATUS_STEPS[Math.min(STATUS_STEPS.length - 1, Math.floor(progress / 16))];
    var progressBar = loading.querySelector(".loader-progress");
    if (progressBar) {
      progressBar.setAttribute("aria-valuenow", String(progress));
    }
  }

  function isDrawerMode() {
    return drawerMq.matches;
  }

  function syncControlsEnabled() {
    var drawerOpen = isDrawerMode() && controlPanel && controlPanel.classList.contains("is-open");
    var sheetOpen = orbitalSheet && orbitalSheet.classList.contains("is-open");
    var loadOpen = loading.classList.contains("is-active");
    controls.enabled = !drawerOpen && !sheetOpen && !loadOpen;
  }

  function openMobileDrawer() {
    if (!isDrawerMode() || !controlPanel) {
      return;
    }
    controlPanel.classList.add("is-open");
    if (panelBackdrop) {
      panelBackdrop.hidden = false;
      panelBackdrop.classList.add("is-visible");
      panelBackdrop.setAttribute("aria-hidden", "false");
    }
    if (panelToggle) {
      panelToggle.setAttribute("aria-expanded", "true");
    }
    document.body.classList.add("is-drawer-open");
    syncControlsEnabled();
  }

  function closeMobileDrawer() {
    if (!controlPanel) {
      return;
    }
    closeOrbitalSheet();
    controlPanel.classList.remove("is-open");
    if (panelBackdrop) {
      panelBackdrop.classList.remove("is-visible");
      panelBackdrop.setAttribute("aria-hidden", "true");
      window.setTimeout(function () {
        if (!controlPanel.classList.contains("is-open")) {
          panelBackdrop.hidden = true;
        }
      }, 380);
    }
    if (panelToggle) {
      panelToggle.setAttribute("aria-expanded", "false");
    }
    document.body.classList.remove("is-drawer-open");
    syncControlsEnabled();
  }

  function closeDrawerIfMobile() {
    if (isDrawerMode()) {
      closeMobileDrawer();
    }
  }

  function openOrbitalSheet() {
    if (!orbitalSheet) {
      return;
    }
    orbitalSheet.classList.add("is-open");
    orbitalSheet.setAttribute("aria-hidden", "false");
    document.body.classList.add("is-orbital-sheet-open");
    if (orbitalSheetOpen) {
      orbitalSheetOpen.setAttribute("aria-expanded", "true");
    }
    syncControlsEnabled();
  }

  function closeOrbitalSheet() {
    if (!orbitalSheet) {
      return;
    }
    orbitalSheet.classList.remove("is-open");
    orbitalSheet.setAttribute("aria-hidden", "true");
    document.body.classList.remove("is-orbital-sheet-open");
    if (orbitalSheetOpen) {
      orbitalSheetOpen.setAttribute("aria-expanded", "false");
    }
    syncControlsEnabled();
  }

  function syncMobileChrome() {
    if (!panelToggle || !controlPanel) {
      return;
    }
    if (isDrawerMode()) {
      panelToggle.hidden = false;
      if (orbitalSheetOpen) {
        orbitalSheetOpen.hidden = false;
      }
    } else {
      panelToggle.hidden = true;
      if (orbitalSheetOpen) {
        orbitalSheetOpen.hidden = true;
      }
      closeMobileDrawer();
      closeOrbitalSheet();
    }
  }

  function initMobileDrawer() {
    if (!panelToggle || !controlPanel) {
      return;
    }

    syncMobileChrome();

    panelToggle.addEventListener("click", function () {
      if (controlPanel.classList.contains("is-open")) {
        closeMobileDrawer();
      } else {
        openMobileDrawer();
      }
    });

    if (panelBackdrop) {
      panelBackdrop.addEventListener("click", closeMobileDrawer);
    }

    document.addEventListener("keydown", function (event) {
      if (event.key !== "Escape") {
        return;
      }
      if (orbitalSheet && orbitalSheet.classList.contains("is-open")) {
        closeOrbitalSheet();
        return;
      }
      if (controlPanel.classList.contains("is-open")) {
        closeMobileDrawer();
      }
    });

    if (typeof drawerMq.addEventListener === "function") {
      drawerMq.addEventListener("change", syncMobileChrome);
    } else if (typeof drawerMq.addListener === "function") {
      drawerMq.addListener(syncMobileChrome);
    }
  }

  function initOrbitalSheet() {
    if (!orbitalSheet || !orbitalSheetOpen) {
      return;
    }

    orbitalSheetOpen.addEventListener("click", function () {
      if (orbitalSheet.classList.contains("is-open")) {
        closeOrbitalSheet();
      } else {
        openOrbitalSheet();
      }
    });

    if (orbitalSheetClose) {
      orbitalSheetClose.addEventListener("click", closeOrbitalSheet);
    }

    if (orbitalSheetScrim) {
      orbitalSheetScrim.addEventListener("click", closeOrbitalSheet);
    }
  }

  function onResize() {
    isMobile = detectMobile();
    syncMobileChrome();
    maxParticleCount = isMobile ? 650000 : 5000000;
    basePixelRatio = Math.min(window.devicePixelRatio || 1, isMobile ? 1.2 : 1.65);
    currentPixelRatio = Math.min(currentPixelRatio, basePixelRatio);
    syncQuantumInputs();
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(currentPixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    syncControlsEnabled();
  }

  function createGpuTimer(activeRenderer) {
    var gl = activeRenderer.getContext();
    var isWebGL2 = activeRenderer.capabilities && activeRenderer.capabilities.isWebGL2;
    var ext = isWebGL2 ? gl.getExtension("EXT_disjoint_timer_query_webgl2") : gl.getExtension("EXT_disjoint_timer_query");

    if (!ext) {
      return {
        value: 0,
        start: 0,
        begin: function () {
          this.start = performance.now();
        },
        end: function () {
          this.value = performance.now() - this.start;
        },
        poll: function () {
          return this.value;
        }
      };
    }

    var pending = [];
    var active = null;
    var lastValue = 0;

    return {
      begin: function () {
        if (active || pending.length > 5) {
          return;
        }
        active = isWebGL2 ? gl.createQuery() : ext.createQueryEXT();
        if (isWebGL2) {
          gl.beginQuery(ext.TIME_ELAPSED_EXT, active);
        } else {
          ext.beginQueryEXT(ext.TIME_ELAPSED_EXT, active);
        }
      },
      end: function () {
        if (!active) {
          return;
        }
        if (isWebGL2) {
          gl.endQuery(ext.TIME_ELAPSED_EXT);
        } else {
          ext.endQueryEXT(ext.TIME_ELAPSED_EXT);
        }
        pending.push(active);
        active = null;
      },
      poll: function () {
        if (!pending.length) {
          return lastValue;
        }

        var query = pending[0];
        var available = isWebGL2 ?
          gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE) :
          ext.getQueryObjectEXT(query, ext.QUERY_RESULT_AVAILABLE_EXT);
        var disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);

        if (available && !disjoint) {
          var elapsed = isWebGL2 ?
            gl.getQueryParameter(query, gl.QUERY_RESULT) :
            ext.getQueryObjectEXT(query, ext.QUERY_RESULT_EXT);
          lastValue = elapsed / 1000000;
          if (isWebGL2) {
            gl.deleteQuery(query);
          } else {
            ext.deleteQueryEXT(query);
          }
          pending.shift();
        }
        return lastValue;
      }
    };
  }

  function createSamplerWorker() {
    var source = [
      "\"use strict\";",
      "// Worker-side math uses atomic units with Z=1 and a0=1.",
      "// The sampled density is |R_nl(r)|^2 |Y_lm(theta,phi)|^2 r^2 d r dOmega.",
      "var TWO_PI = Math.PI * 2;",
      "var SQRT2 = Math.SQRT2;",
      "var logFactorialCache = [0];",
      "self.onmessage = function (event) {",
      "  var data = event.data || {};",
      "  if (data.type === 'generate') {",
      "    generate(data);",
      "  }",
      "};",
      "function generate(data) {",
      "  var start = performance.now();",
      "  var jobId = data.jobId;",
      "  var n = Math.max(1, data.n | 0);",
      "  var l = clamp(data.l | 0, 0, n - 1);",
      "  var m = clamp(data.m | 0, -l, l);",
      "  var count = Math.max(10000, data.count | 0);",
      "  try {",
      "    progress(jobId, 3, 'Initializing radial basis...');",
      "    var radial = buildRadialSampler(n, l, jobId);",
      "    progress(jobId, 22, 'Normalizing spherical harmonics...');",
      "    var angularMax = estimateAngularMax(l, m);",
      "    progress(jobId, 28, 'Sampling wavefunction...');",
      "    var positions = new Float32Array(count * 3);",
      "    var visualRadius = Math.max(radial.percentile(0.992), 1e-6);",
      "    var scale = 3.05 / visualRadius;",
      "    var accepted = 0;",
      "    var attempts = 0;",
      "    var lastProgress = 28;",
      "    var maxAttempts = Math.max(count * 400, 1000000);",
      "    while (accepted < count) {",
      "      var direction = sampleAngular(l, m, angularMax);",
      "      var radius = radial.sample();",
      "      var scaled = radius * scale;",
      "      var base = accepted * 3;",
      "      positions[base] = scaled * direction[0];",
      "      positions[base + 1] = scaled * direction[1];",
      "      positions[base + 2] = scaled * direction[2];",
      "      accepted += 1;",
      "      attempts += direction[3];",
      "      if ((accepted & 8191) === 0) {",
      "        var p = 28 + Math.floor(66 * accepted / count);",
      "        if (p > lastProgress) {",
      "          lastProgress = p;",
      "          progress(jobId, p, statusForProgress(p));",
      "        }",
      "      }",
      "      if (attempts > maxAttempts && accepted < count * 0.12) {",
      "        throw new Error('Angular rejection rate is too low for this state.');",
      "      }",
      "    }",
      "    progress(jobId, 96, 'Optimizing render buffers...');",
      "    self.postMessage({",
      "      type: 'complete',",
      "      jobId: jobId,",
      "      positions: positions.buffer,",
      "      accepted: accepted,",
      "      attempts: attempts,",
      "      rawRadius: radial.rMax,",
      "      visualRadius: visualRadius,",
      "      elapsed: performance.now() - start",
      "    }, [positions.buffer]);",
      "  } catch (error) {",
      "    self.postMessage({ type: 'error', jobId: jobId, message: error.message || String(error), stack: error.stack || '' });",
      "  }",
      "}",
      "function buildRadialSampler(n, l, jobId) {",
      "  var gridSize = Math.min(65536, Math.max(8192, Math.ceil(n * 768)));",
      "  var rMax = radialCutoff(n, l);",
      "  var radii = new Float64Array(gridSize);",
      "  var cdf = new Float64Array(gridSize);",
      "  var total = 0;",
      "  var previousR = 0;",
      "  var previousValue = radialDensity(n, l, 0);",
      "  radii[0] = 0;",
      "  cdf[0] = 0;",
      "  for (var i = 1; i < gridSize; i += 1) {",
      "    var r = rMax * i / (gridSize - 1);",
      "    var value = radialDensity(n, l, r);",
      "    if (!isFinite(value) || value < 0) {",
      "      value = 0;",
      "    }",
      "    total += 0.5 * (previousValue + value) * (r - previousR);",
      "    radii[i] = r;",
      "    cdf[i] = total;",
      "    previousR = r;",
      "    previousValue = value;",
      "    if ((i & 2047) === 0) {",
      "      progress(jobId, 3 + Math.floor(16 * i / gridSize), 'Evaluating Laguerre polynomial field...');",
      "    }",
      "  }",
      "  if (!isFinite(total) || total <= 0) {",
      "    throw new Error('Radial normalization failed for n=' + n + ', l=' + l + '.');",
      "  }",
      "  for (var j = 1; j < gridSize; j += 1) {",
      "    cdf[j] /= total;",
      "  }",
      "  cdf[gridSize - 1] = 1;",
      "  return {",
      "    rMax: rMax,",
      "    sample: function () {",
      "      return inverseCdf(radii, cdf, Math.random());",
      "    },",
      "    percentile: function (q) {",
      "      return inverseCdf(radii, cdf, q);",
      "    }",
      "  };",
      "}",
      "function inverseCdf(radii, cdf, u) {",
      "  var lo = 1;",
      "  var hi = cdf.length - 1;",
      "  while (lo < hi) {",
      "    var mid = (lo + hi) >> 1;",
      "    if (cdf[mid] < u) {",
      "      lo = mid + 1;",
      "    } else {",
      "      hi = mid;",
      "    }",
      "  }",
      "  var c0 = cdf[lo - 1];",
      "  var c1 = cdf[lo];",
      "  var span = c1 - c0;",
      "  var t = span > 1e-15 ? (u - c0) / span : 0;",
      "  return radii[lo - 1] + t * (radii[lo] - radii[lo - 1]);",
      "}",
      "function radialCutoff(n, l) {",
      "  var base = n * n;",
      "  return Math.max(32, base * (10 + 1.8 * Math.log(n + 1)) + 12 * n + 2 * l * n);",
      "}",
      "function radialDensity(n, l, r) {",
      "  var R = radialWavefunction(n, l, r);",
      "  return r * r * R * R;",
      "}",
      "function radialWavefunction(n, l, r) {",
      "  var rho = 2 * r / n;",
      "  var k = n - l - 1;",
      "  var alpha = 2 * l + 1;",
      "  var logNorm = 1.5 * Math.log(2 / n) + 0.5 * (logFactorial(k) - Math.log(2 * n) - logFactorial(n + l));",
      "  var laguerre = associatedLaguerre(k, alpha, rho);",
      "  var power = l === 0 ? 1 : Math.pow(rho, l);",
      "  var value = Math.exp(logNorm - rho / 2) * power * laguerre;",
      "  return isFinite(value) ? value : 0;",
      "}",
      "function associatedLaguerre(k, alpha, x) {",
      "  if (k === 0) {",
      "    return 1;",
      "  }",
      "  if (k === 1) {",
      "    return -x + alpha + 1;",
      "  }",
      "  var lm2 = 1;",
      "  var lm1 = -x + alpha + 1;",
      "  var lValue = lm1;",
      "  for (var i = 2; i <= k; i += 1) {",
      "    lValue = ((2 * i - 1 + alpha - x) * lm1 - (i - 1 + alpha) * lm2) / i;",
      "    lm2 = lm1;",
      "    lm1 = lValue;",
      "  }",
      "  return lValue;",
      "}",
      "function estimateAngularMax(l, m) {",
      "  var absM = Math.abs(m);",
      "  var norm = harmonicNorm(l, absM) * (absM === 0 ? 1 : SQRT2);",
      "  var steps = Math.max(900, 260 * (l + 1));",
      "  var maxValue = 0;",
      "  for (var i = 0; i <= steps; i += 1) {",
      "    var x = -1 + 2 * i / steps;",
      "    var p = associatedLegendre(l, absM, x);",
      "    var y = norm * p;",
      "    var value = y * y;",
      "    if (value > maxValue) {",
      "      maxValue = value;",
      "    }",
      "  }",
      "  return maxValue * 1.08 + 1e-14;",
      "}",
      "function sampleAngular(l, m, maxValue) {",
      "  var tries = 0;",
      "  while (true) {",
      "    tries += 1;",
      "    var x = 2 * Math.random() - 1;",
      "    var phi = TWO_PI * Math.random();",
      "    var y = realSphericalHarmonic(l, m, x, phi);",
      "    if (Math.random() * maxValue <= y * y) {",
      "      var s = Math.sqrt(Math.max(0, 1 - x * x));",
      "      return [s * Math.cos(phi), s * Math.sin(phi), x, tries];",
      "    }",
      "  }",
      "}",
      "function realSphericalHarmonic(l, m, x, phi) {",
      "  var absM = Math.abs(m);",
      "  var p = associatedLegendre(l, absM, x);",
      "  var norm = harmonicNorm(l, absM);",
      "  if (m === 0) {",
      "    return norm * p;",
      "  }",
      "  var angular = absM * phi;",
      "  return SQRT2 * norm * p * (m > 0 ? Math.cos(angular) : Math.sin(angular));",
      "}",
      "function harmonicNorm(l, m) {",
      "  return Math.sqrt((2 * l + 1) / (4 * Math.PI) * Math.exp(logFactorial(l - m) - logFactorial(l + m)));",
      "}",
      "function associatedLegendre(l, m, x) {",
      "  var pmm = 1;",
      "  if (m > 0) {",
      "    var somx2 = Math.sqrt(Math.max(0, (1 - x) * (1 + x)));",
      "    var fact = 1;",
      "    for (var i = 1; i <= m; i += 1) {",
      "      pmm *= -fact * somx2;",
      "      fact += 2;",
      "    }",
      "  }",
      "  if (l === m) {",
      "    return pmm;",
      "  }",
      "  var pmmp1 = x * (2 * m + 1) * pmm;",
      "  if (l === m + 1) {",
      "    return pmmp1;",
      "  }",
      "  var pll = 0;",
      "  for (var ll = m + 2; ll <= l; ll += 1) {",
      "    pll = ((2 * ll - 1) * x * pmmp1 - (ll + m - 1) * pmm) / (ll - m);",
      "    pmm = pmmp1;",
      "    pmmp1 = pll;",
      "  }",
      "  return pll;",
      "}",
      "function logFactorial(n) {",
      "  if (n < 0) {",
      "    return NaN;",
      "  }",
      "  if (logFactorialCache[n] !== undefined) {",
      "    return logFactorialCache[n];",
      "  }",
      "  var start = logFactorialCache.length;",
      "  var value = logFactorialCache[start - 1];",
      "  for (var i = start; i <= n; i += 1) {",
      "    value += Math.log(i);",
      "    logFactorialCache[i] = value;",
      "  }",
      "  return logFactorialCache[n];",
      "}",
      "function statusForProgress(progressValue) {",
      "  if (progressValue < 42) { return 'Sampling wavefunction...'; }",
      "  if (progressValue < 68) { return 'Constructing orbital field...'; }",
      "  if (progressValue < 92) { return 'Packing typed arrays...'; }",
      "  return 'Optimizing render buffers...';",
      "}",
      "function progress(jobId, amount, status) {",
      "  self.postMessage({ type: 'progress', jobId: jobId, progress: amount, status: status });",
      "}",
      "function clamp(value, min, max) {",
      "  return Math.min(max, Math.max(min, value));",
      "}"
    ].join("\n");

    var blob = new Blob([source], { type: "application/javascript" });
    var workerUrl = URL.createObjectURL(blob);
    var worker = new Worker(workerUrl);
    URL.revokeObjectURL(workerUrl);
    return worker;
  }

  function orbitalName(state) {
    var letter = SPECTROSCOPIC[state.l] || "l" + state.l;
    return state.n + letter + ", " + orientationLabel(state.l, state.m);
  }

  function orientationLabel(l, m) {
    var options = orientationOptionsFor(l);
    for (var i = 0; i < options.length; i += 1) {
      if (options[i].m === m) {
        return options[i].label.replace(/\s+\([^()]*m=[^)]+\)$/, "");
      }
    }
    return "m=" + m;
  }

  function setOrbitalTheme(l) {
    var palette = ORBITAL_COLORS[l] || { a: 0x66a8ff, b: 0xb894ff };
    document.documentElement.style.setProperty("--orbital-a", "#" + palette.a.toString(16).padStart(6, "0"));
    document.documentElement.style.setProperty("--orbital-b", "#" + palette.b.toString(16).padStart(6, "0"));
  }

  function detectMobile() {
    return (navigator.maxTouchPoints && navigator.maxTouchPoints > 1) || Math.min(window.innerWidth, window.innerHeight) < 760;
  }

  function integerFromInput(input, fallback) {
    var value = Number(input.value);
    if (!Number.isFinite(value)) {
      return fallback;
    }
    return Math.round(value);
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }
})();
