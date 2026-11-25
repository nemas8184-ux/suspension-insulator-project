/**
 * Mapping Voltage Gradient Across a String of Suspension Insulators
 * -----------------------------------------------------------------
 * Core Components:
 *  1. Lumped-Capacitance Nodal Analysis Solver (Thomas Tridiagonal Algorithm)
 *  2. Three.js 3D Interactive Suspension Insulator Scene
 *  3. Chart.js Distribution, Node Potential & Parametric Efficiency Plots
 *  4. Dashboard UI State, Controls, Comparison Mode & Verification Integration
 */

(function (globalScope) {
  'use strict';

  /**
   * Solves the lumped-capacitance AC steady-state network for an n-disc
   * suspension insulator string using KCL nodal analysis.
   *
   * Circuit equations at intermediate junctions i = 1 .. n-1:
   *   -V_{i-1} + (2 + K) * V_i - V_{i+1} = 0
   * with boundary conditions V_0 = 0 (tower ground) and V_n = totalVoltageKv.
   *
   * @param {number} discCount - Number of suspension insulator discs (n >= 1)
   * @param {number} totalVoltageKv - Applied RMS string voltage V in kV
   * @param {number} shuntRatio - Shunt-to-self capacitance ratio K = C1 / C (>= 0)
   * @returns {object} Computed node potentials, disc voltages, percentages, and string efficiency
   */
  function solveInsulatorString(discCount, totalVoltageKv, shuntRatio) {
    var n = Math.max(1, Math.min(30, Math.round(Number(discCount) || 1)));
    var V = Math.max(0, Number(totalVoltageKv) || 0);
    var K = Math.max(0, Number(shuntRatio) || 0);

    // Node potentials V_0 .. V_n (length n + 1)
    var nodePotentials = new Array(n + 1).fill(0);
    nodePotentials[0] = 0;
    nodePotentials[n] = V;

    // Solve tridiagonal system for m = n - 1 unknown intermediate nodes
    if (n > 1) {
      var m = n - 1;
      var diag = 2 + K;
      var cPrime = new Array(m).fill(0);
      var dPrime = new Array(m).fill(0);

      // Right-hand side vector b: only last entry (adjacent to V_n = V) is V
      cPrime[0] = -1 / diag;
      dPrime[0] = (m === 1 ? V : 0) / diag;

      for (var k = 1; k < m; k++) {
        var rhs = k === m - 1 ? V : 0;
        var denom = diag + cPrime[k - 1]; // diag - (-1) * cPrime[k - 1]
        cPrime[k] = k < m - 1 ? -1 / denom : 0;
        dPrime[k] = (rhs + dPrime[k - 1]) / denom;
      }

      // Back substitution
      var solved = new Array(m).fill(0);
      solved[m - 1] = dPrime[m - 1];
      for (var j = m - 2; j >= 0; j--) {
        solved[j] = dPrime[j] - cPrime[j] * solved[j + 1];
      }

      for (var idx = 0; idx < m; idx++) {
        nodePotentials[idx + 1] = solved[idx];
      }
    }

    // Calculate individual disc voltages from adjacent node potentials: v_i = V_i - V_{i-1}
    var uniformVoltage = V / n;
    var uniformPct = 100 / n;
    var discs = [];
    var voltageSum = 0;

    for (var i = 1; i <= n; i++) {
      var vUpper = nodePotentials[i - 1];
      var vLower = nodePotentials[i];
      var vDisc = vLower - vUpper;
      voltageSum += vDisc;

      var pct = V > 0 ? (vDisc / V) * 100 : uniformPct;
      var stressFactor = uniformVoltage > 0 ? vDisc / uniformVoltage : 1;
      var deviationPct = (stressFactor - 1) * 100;

      discs.push({
        index: i,
        upperNode: vUpper,
        lowerNode: vLower,
        voltage: vDisc,
        percentage: pct,
        uniformVoltage: uniformVoltage,
        uniformPct: uniformPct,
        stressFactor: stressFactor,
        deviationPct: deviationPct
      });
    }

    var voltages = discs.map(function (d) { return d.voltage; });
    var maxDiscVoltage = Math.max.apply(null, voltages);
    var minDiscVoltage = Math.min.apply(null, voltages);
    var stringEfficiency = V > 0 && maxDiscVoltage > 0 ? (V / (n * maxDiscVoltage)) * 100 : 100;
    var nonUniformityRatio = minDiscVoltage > 0 ? maxDiscVoltage / minDiscVoltage : 1;
    var conservationError = Math.abs(voltageSum - V);

    return {
      discCount: n,
      totalVoltage: V,
      shuntRatio: K,
      uniformVoltage: uniformVoltage,
      uniformPct: uniformPct,
      nodePotentials: nodePotentials,
      discs: discs,
      voltageSum: voltageSum,
      conservationError: conservationError,
      maxDiscVoltage: maxDiscVoltage,
      minDiscVoltage: minDiscVoltage,
      stringEfficiency: stringEfficiency,
      nonUniformityRatio: nonUniformityRatio
    };
  }

  // Export for Node.js tests without touching DOM
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { solveInsulatorString: solveInsulatorString };
  }
  globalScope.InsulatorModel = { solveInsulatorString: solveInsulatorString };

  // Stop here if running outside a browser environment
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  // =========================================================================
  // APPLICATION STATE & DEFAULTS
  // =========================================================================
  var DEFAULTS = {
    discCount: 5,
    totalVoltage: 76.2,
    shuntRatio: 0.12,
    material: 'ceramic',
    heatmap: true
  };

  var state = {
    discCount: DEFAULTS.discCount,
    totalVoltage: DEFAULTS.totalVoltage,
    shuntRatio: DEFAULTS.shuntRatio,
    material: DEFAULTS.material,
    heatmap: DEFAULTS.heatmap,
    compareMode: false,
    pinnedResult: null,
    chartTab: 'distribution',
    unit: 'kv',
    selectedDiscIndex: null,
    lastResult: null
  };

  // =========================================================================
  // DOM ELEMENT REFERENCES
  // =========================================================================
  var dom = {
    discRange: document.getElementById('disc-count-range'),
    discInput: document.getElementById('disc-count-input'),
    voltageRange: document.getElementById('voltage-range'),
    voltageInput: document.getElementById('voltage-input'),
    ratioRange: document.getElementById('ratio-range'),
    ratioInput: document.getElementById('ratio-input'),
    materialSelect: document.getElementById('material-select'),
    heatmapToggle: document.getElementById('heatmap-toggle'),

    calculateBtn: document.getElementById('calculate-btn'),
    resetBtn: document.getElementById('reset-btn'),
    compareBtn: document.getElementById('compare-btn'),
    pinBaselineBtn: document.getElementById('pin-baseline-btn'),
    clearBaselineBtn: document.getElementById('clear-baseline-btn'),
    compareControls: document.getElementById('compare-controls'),
    pinnedLabel: document.getElementById('pinned-label'),
    compareSummary: document.getElementById('compare-summary'),

    resetCameraBtn: document.getElementById('reset-camera-btn'),
    threeContainer: document.getElementById('three-container'),
    webglFallback: document.getElementById('webgl-fallback'),
    conductorBadge: document.getElementById('conductor-badge'),
    inspectorTitle: document.getElementById('inspector-title'),
    inspectorBody: document.getElementById('inspector-body'),

    kpiEfficiency: document.getElementById('kpi-efficiency'),
    kpiEfficiencyNote: document.getElementById('kpi-efficiency-note'),
    kpiVmax: document.getElementById('kpi-vmax'),
    kpiVmaxPct: document.getElementById('kpi-vmax-pct'),
    kpiVmin: document.getElementById('kpi-vmin'),
    kpiVminPct: document.getElementById('kpi-vmin-pct'),
    kpiSum: document.getElementById('kpi-sum'),
    kpiRatioStress: document.getElementById('kpi-ratio-stress'),
    calcStatusPill: document.getElementById('calc-status-pill'),
    analyticsPanel: document.querySelector('.analytics-panel'),

    chartCanvas: document.getElementById('voltage-chart'),
    chartCaption: document.getElementById('chart-caption'),
    unitToggleGroup: document.getElementById('unit-toggle-group'),

    tableBody: document.getElementById('results-table-body'),
    tableFoot: document.getElementById('results-table-foot'),
    exportCsvBtn: document.getElementById('export-csv-btn'),
    discussionBox: document.getElementById('dynamic-discussion-box'),

    runTestsBtn: document.getElementById('run-tests-btn'),
    testSummaryBanner: document.getElementById('test-summary-banner'),
    testResultsList: document.getElementById('test-results-list')
  };

  // =========================================================================
  // COLOR UTILITIES FOR VOLTAGE GRADIENT HEATMAP
  // =========================================================================
  var HEATMAP_STOPS = [
    { t: 0.0, r: 37, g: 99, b: 235 },   // #2563eb (Cool Blue)
    { t: 0.3, r: 13, g: 148, b: 136 },  // #0d9488 (Teal)
    { t: 0.58, r: 234, g: 179, b: 8 },  // #eab308 (Amber)
    { t: 0.82, r: 249, g: 115, b: 22 }, // #f97316 (Orange)
    { t: 1.0, r: 220, g: 38, b: 38 }    // #dc2626 (Crimson Red)
  ];

  function interpolateHeatmapColor(t) {
    var clamped = Math.max(0, Math.min(1, t));
    for (var i = 0; i < HEATMAP_STOPS.length - 1; i++) {
      var a = HEATMAP_STOPS[i];
      var b = HEATMAP_STOPS[i + 1];
      if (clamped >= a.t && clamped <= b.t) {
        var f = (clamped - a.t) / (b.t - a.t);
        var r = Math.round(a.r + (b.r - a.r) * f);
        var g = Math.round(a.g + (b.g - a.g) * f);
        var bl = Math.round(a.b + (b.b - a.b) * f);
        return {
          hex: (r << 16) | (g << 8) | bl,
          css: 'rgb(' + r + ', ' + g + ', ' + bl + ')'
        };
      }
    }
    var last = HEATMAP_STOPS[HEATMAP_STOPS.length - 1];
    return {
      hex: (last.r << 16) | (last.g << 8) | last.b,
      css: 'rgb(' + last.r + ', ' + last.g + ', ' + last.b + ')'
    };
  }

  function getDiscColorInfo(disc, result) {
    var spread = result.maxDiscVoltage - result.minDiscVoltage;
    // Uniform distribution (K = 0 or n = 1) displays a calm uniform teal-blue
    if (spread < 1e-6 || result.shuntRatio === 0 || result.discCount === 1) {
      return { hex: 0x0d9488, css: 'rgb(13, 148, 136)', norm: 0.3 };
    }
    var norm = (disc.voltage - result.minDiscVoltage) / spread;
    var color = interpolateHeatmapColor(norm);
    return { hex: color.hex, css: color.css, norm: norm };
  }

  // =========================================================================
  // THREE.JS 3D INSULATOR STRING VISUALIZATION
  // =========================================================================
  var threeCtx = {
    initialized: false,
    scene: null,
    camera: null,
    renderer: null,
    controls: null,
    stringGroup: null,
    discHitMeshes: [],
    discShedMaterials: [],
    discHighlightRings: [],
    raycaster: null,
    pointer: null,
    hoveredIndex: null
  };

  function initThreeScene() {
    if (typeof THREE === 'undefined' || !dom.threeContainer) {
      if (dom.webglFallback) dom.webglFallback.classList.remove('hidden');
      return;
    }

    try {
      var width = dom.threeContainer.clientWidth || 480;
      var height = dom.threeContainer.clientHeight || 500;

      var scene = new THREE.Scene();
      scene.background = new THREE.Color(0xeef2f7);

      var camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 200);
      camera.position.set(7.5, 1.5, 11.5);

      var renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;

      dom.threeContainer.innerHTML = '';
      dom.threeContainer.appendChild(renderer.domElement);

      var controls = new THREE.OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.minDistance = 3.5;
      controls.maxDistance = 42;

      // Studio lighting for crisp metallic & ceramic/glass shading
      var ambient = new THREE.AmbientLight(0xffffff, 0.65);
      scene.add(ambient);

      var keyLight = new THREE.DirectionalLight(0xffffff, 0.9);
      keyLight.position.set(8, 14, 10);
      keyLight.castShadow = true;
      scene.add(keyLight);

      var fillLight = new THREE.DirectionalLight(0xbae6fd, 0.45);
      fillLight.position.set(-10, -4, -8);
      scene.add(fillLight);

      var rimLight = new THREE.DirectionalLight(0xfef3c7, 0.3);
      rimLight.position.set(0, -10, 6);
      scene.add(rimLight);

      var stringGroup = new THREE.Group();
      scene.add(stringGroup);

      threeCtx.initialized = true;
      threeCtx.scene = scene;
      threeCtx.camera = camera;
      threeCtx.renderer = renderer;
      threeCtx.controls = controls;
      threeCtx.stringGroup = stringGroup;
      threeCtx.raycaster = new THREE.Raycaster();
      threeCtx.pointer = new THREE.Vector2();

      // Pointer events for disc hover & click inspection
      renderer.domElement.addEventListener('pointermove', onCanvasPointerMove);
      renderer.domElement.addEventListener('click', onCanvasClick);
      renderer.domElement.addEventListener('pointerleave', function () {
        threeCtx.hoveredIndex = null;
        updateDiscHighlightState();
      });

      // Responsive canvas sizing
      if (typeof ResizeObserver !== 'undefined') {
        var ro = new ResizeObserver(function () {
          resizeThreeRenderer();
        });
        ro.observe(dom.threeContainer);
      } else {
        window.addEventListener('resize', resizeThreeRenderer);
      }

      // Animation loop
      (function animate() {
        requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
      })();
    } catch (err) {
      console.error('Three.js initialization failed:', err);
      if (dom.webglFallback) dom.webglFallback.classList.remove('hidden');
    }
  }

  function resizeThreeRenderer() {
    if (!threeCtx.initialized || !dom.threeContainer) return;
    var w = dom.threeContainer.clientWidth;
    var h = dom.threeContainer.clientHeight;
    if (w <= 0 || h <= 0) return;
    threeCtx.camera.aspect = w / h;
    threeCtx.camera.updateProjectionMatrix();
    threeCtx.renderer.setSize(w, h);
  }

  function createDiscShedGeometry() {
    // Realistic suspension insulator disc profile (revolved via LatheGeometry)
    // Top cap seats around y = +0.20, outer shed flares to r = 1.08, petticoats beneath
    var pts = [
      new THREE.Vector2(0.28, 0.22),
      new THREE.Vector2(0.45, 0.20),
      new THREE.Vector2(0.75, 0.14),
      new THREE.Vector2(1.00, 0.05),
      new THREE.Vector2(1.10, -0.04),
      new THREE.Vector2(1.07, -0.14),
      new THREE.Vector2(0.95, -0.17),
      new THREE.Vector2(0.88, -0.08),
      new THREE.Vector2(0.78, -0.08),
      new THREE.Vector2(0.72, -0.21),
      new THREE.Vector2(0.62, -0.22),
      new THREE.Vector2(0.55, -0.10),
      new THREE.Vector2(0.42, -0.11),
      new THREE.Vector2(0.36, -0.22),
      new THREE.Vector2(0.22, -0.22),
      new THREE.Vector2(0.18, -0.05)
    ];
    return new THREE.LatheGeometry(pts, 36);
  }

  function disposeGroupChildren(group) {
    while (group.children.length > 0) {
      var child = group.children[0];
      group.remove(child);
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach(function (m) { m.dispose(); });
        } else {
          child.material.dispose();
        }
      }
      if (child.children && child.children.length > 0) {
        disposeGroupChildren(child);
      }
    }
  }

  function buildInsulatorString3D(result, resetCam) {
    if (!threeCtx.initialized) return;

    disposeGroupChildren(threeCtx.stringGroup);
    threeCtx.discHitMeshes = [];
    threeCtx.discShedMaterials = [];
    threeCtx.discHighlightRings = [];

    var n = result.discCount;
    var pitch = 1.05; // Vertical spacing per disc unit
    var totalHeight = n * pitch;
    var topY = totalHeight / 2;

    // Shared metal materials
    var steelMat = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      metalness: 0.72,
      roughness: 0.35
    });
    var galvanizedCapMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      metalness: 0.8,
      roughness: 0.28
    });
    var conductorMat = new THREE.MeshStandardMaterial({
      color: 0xcbd5e1,
      metalness: 0.85,
      roughness: 0.22
    });

    // -----------------------------------------------------------------------
    // 1. TOWER CROSS-ARM & SHACKLE (GROUNDED TOP SUPPORT)
    // -----------------------------------------------------------------------
    var towerGroup = new THREE.Group();
    var armY = topY + 0.95;

    // Horizontal steel cross-arm beam
    var crossArmGeo = new THREE.BoxGeometry(5.6, 0.34, 0.42);
    var crossArm = new THREE.Mesh(crossArmGeo, steelMat);
    crossArm.position.set(-1.3, armY, 0);
    towerGroup.add(crossArm);

    // Diagonal truss brace
    var braceGeo = new THREE.BoxGeometry(2.8, 0.14, 0.16);
    var brace = new THREE.Mesh(braceGeo, steelMat);
    brace.position.set(-2.2, armY + 0.65, 0);
    brace.rotation.z = -0.46;
    towerGroup.add(brace);

    // Vertical tower leg stub on left
    var towerLegGeo = new THREE.BoxGeometry(0.45, 3.2, 0.45);
    var towerLeg = new THREE.Mesh(towerLegGeo, steelMat);
    towerLeg.position.set(-3.9, armY + 0.5, 0);
    towerGroup.add(towerLeg);

    // Grounded U-shackle bracket above Disc 1
    var shackleGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.65, 16);
    var shackle = new THREE.Mesh(shackleGeo, galvanizedCapMat);
    shackle.position.set(0, topY + 0.48, 0);
    towerGroup.add(shackle);

    var clevisPlateGeo = new THREE.BoxGeometry(0.55, 0.24, 0.36);
    var clevisPlate = new THREE.Mesh(clevisPlateGeo, galvanizedCapMat);
    clevisPlate.position.set(0, armY - 0.18, 0);
    towerGroup.add(clevisPlate);

    threeCtx.stringGroup.add(towerGroup);

    // -----------------------------------------------------------------------
    // 2. INSULATOR DISCS (1 .. n) + CAP-AND-PIN HARDWARE
    // -----------------------------------------------------------------------
    var sharedShedGeo = createDiscShedGeometry();
    var capGeo = new THREE.CylinderGeometry(0.30, 0.38, 0.32, 24);
    var pinGeo = new THREE.CylinderGeometry(0.10, 0.10, 0.56, 16);
    var ballLinkGeo = new THREE.SphereGeometry(0.14, 16, 12);
    var ringGeo = new THREE.TorusGeometry(1.16, 0.035, 12, 40);

    for (var i = 0; i < n; i++) {
      var disc = result.discs[i];
      var yPos = topY - (i + 0.5) * pitch;
      var discUnit = new THREE.Group();
      discUnit.position.set(0, yPos, 0);

      // Determine disc color (heatmap vs natural material)
      var colorInfo = getDiscColorInfo(disc, result);
      var shedMat;

      if (state.heatmap) {
        shedMat = new THREE.MeshPhysicalMaterial({
          color: colorInfo.hex,
          roughness: state.material === 'glass' ? 0.12 : 0.24,
          metalness: 0.05,
          clearcoat: 0.85,
          clearcoatRoughness: 0.12,
          transparent: state.material === 'glass',
          opacity: state.material === 'glass' ? 0.84 : 1.0,
          emissive: colorInfo.hex,
          emissiveIntensity: 0.12 + colorInfo.norm * 0.22
        });
      } else if (state.material === 'glass') {
        shedMat = new THREE.MeshPhysicalMaterial({
          color: 0x2dd4bf,
          roughness: 0.08,
          metalness: 0.02,
          clearcoat: 1.0,
          transparent: true,
          opacity: 0.72
        });
      } else {
        shedMat = new THREE.MeshPhysicalMaterial({
          color: 0x7c3f1d, // Glazed brown porcelain
          roughness: 0.2,
          metalness: 0.05,
          clearcoat: 0.9,
          clearcoatRoughness: 0.1
        });
      }

      var shedMesh = new THREE.Mesh(sharedShedGeo, shedMat);
      shedMesh.userData = { discIndex: i };
      discUnit.add(shedMesh);

      // Top galvanized metal cap
      var capMesh = new THREE.Mesh(capGeo, galvanizedCapMat);
      capMesh.position.y = 0.28;
      discUnit.add(capMesh);

      // Bottom steel pin connecting to next unit
      var pinMesh = new THREE.Mesh(pinGeo, galvanizedCapMat);
      pinMesh.position.y = -0.32;
      discUnit.add(pinMesh);

      var ballMesh = new THREE.Mesh(ballLinkGeo, galvanizedCapMat);
      ballMesh.position.y = -0.50;
      discUnit.add(ballMesh);

      // Selection/hover highlight ring
      var ringMat = new THREE.MeshBasicMaterial({
        color: 0x0f172a,
        transparent: true,
        opacity: 0
      });
      var ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.rotation.x = Math.PI / 2;
      ringMesh.position.y = -0.02;
      discUnit.add(ringMesh);

      threeCtx.stringGroup.add(discUnit);
      threeCtx.discHitMeshes.push(shedMesh);
      threeCtx.discShedMaterials.push(shedMat);
      threeCtx.discHighlightRings.push(ringMesh);
    }

    // -----------------------------------------------------------------------
    // 3. CONDUCTOR CLAMP & ENERGIZED HV CONDUCTOR (BOTTOM)
    // -----------------------------------------------------------------------
    var bottomY = topY - totalHeight;
    var clampGroup = new THREE.Group();

    var clampBodyGeo = new THREE.BoxGeometry(0.46, 0.56, 0.72);
    var clampBody = new THREE.Mesh(clampBodyGeo, galvanizedCapMat);
    clampBody.position.set(0, bottomY - 0.34, 0);
    clampGroup.add(clampBody);

    // Energized HV conductor running along Z axis
    var conductorGeo = new THREE.CylinderGeometry(0.16, 0.16, 12.0, 20);
    var conductor = new THREE.Mesh(conductorGeo, conductorMat);
    conductor.rotation.x = Math.PI / 2;
    conductor.position.set(0, bottomY - 0.58, 0);
    clampGroup.add(conductor);

    // Subtle red HV collar indicating live line potential
    var hvCollarGeo = new THREE.TorusGeometry(0.22, 0.045, 10, 24);
    var hvCollarMat = new THREE.MeshBasicMaterial({ color: 0xdc2626 });
    var hvCollar = new THREE.Mesh(hvCollarGeo, hvCollarMat);
    hvCollar.position.set(0, bottomY - 0.58, 0.45);
    clampGroup.add(hvCollar);

    var hvCollar2 = hvCollar.clone();
    hvCollar2.position.z = -0.45;
    clampGroup.add(hvCollar2);

    threeCtx.stringGroup.add(clampGroup);

    if (resetCam) {
      fitCameraToString(n, pitch);
    }
    updateDiscHighlightState();
  }

  function fitCameraToString(n, pitch) {
    if (!threeCtx.initialized) return;
    var totalHeight = n * (pitch || 1.05) + 2.2;
    var dist = Math.max(7.2, totalHeight * 1.48);
    threeCtx.controls.target.set(-0.3, 0, 0);
    threeCtx.camera.position.set(dist * 0.62, 1.2, dist * 0.86);
    threeCtx.controls.update();
  }

  function updateDiscHighlightState() {
    if (!threeCtx.initialized) return;
    var activeIdx = threeCtx.hoveredIndex !== null ? threeCtx.hoveredIndex : state.selectedDiscIndex;
    threeCtx.discHighlightRings.forEach(function (ring, idx) {
      ring.material.opacity = idx === activeIdx ? 0.85 : 0;
    });
  }

  function getHitDiscIndex(event) {
    if (!threeCtx.initialized || !threeCtx.renderer) return null;
    var rect = threeCtx.renderer.domElement.getBoundingClientRect();
    threeCtx.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    threeCtx.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    threeCtx.raycaster.setFromCamera(threeCtx.pointer, threeCtx.camera);
    var hits = threeCtx.raycaster.intersectObjects(threeCtx.discHitMeshes, false);
    if (hits.length > 0 && hits[0].object.userData && typeof hits[0].object.userData.discIndex === 'number') {
      return hits[0].object.userData.discIndex;
    }
    return null;
  }

  function onCanvasPointerMove(event) {
    var hitIdx = getHitDiscIndex(event);
    if (hitIdx !== threeCtx.hoveredIndex) {
      threeCtx.hoveredIndex = hitIdx;
      updateDiscHighlightState();
      if (hitIdx !== null) {
        renderInspectorForDisc(hitIdx);
      } else if (state.selectedDiscIndex !== null) {
        renderInspectorForDisc(state.selectedDiscIndex);
      } else {
        renderInspectorDefault();
      }
    }
  }

  function onCanvasClick(event) {
    var hitIdx = getHitDiscIndex(event);
    state.selectedDiscIndex = hitIdx;
    updateDiscHighlightState();
    if (hitIdx !== null) {
      renderInspectorForDisc(hitIdx);
    } else {
      renderInspectorDefault();
    }
  }

  function renderInspectorDefault() {
    if (!state.lastResult) return;
    var lastDisc = state.lastResult.discs[state.lastResult.discCount - 1];
    dom.inspectorTitle.textContent = 'Hover or click any disc';
    dom.inspectorBody.innerHTML =
      'Peak stress occurs at <strong>Disc ' + lastDisc.index + '</strong> (line end): <strong>' +
      lastDisc.voltage.toFixed(2) + ' kV</strong> (' + lastDisc.percentage.toFixed(1) + '%).';
  }

  function renderInspectorForDisc(idx) {
    if (!state.lastResult || !state.lastResult.discs[idx]) return;
    var d = state.lastResult.discs[idx];
    var role = d.index === 1 ? 'Tower End' : (d.index === state.lastResult.discCount ? 'Conductor End' : 'Intermediate');
    dom.inspectorTitle.textContent = 'Disc #' + d.index + ' (' + role + ')';
    dom.inspectorBody.innerHTML =
      'Voltage Drop: <strong>' + d.voltage.toFixed(3) + ' kV</strong> (' + d.percentage.toFixed(2) + '%)<br>' +
      'Nodes: <em>V</em><sub>' + (d.index - 1) + '</sub>=' + d.upperNode.toFixed(2) + ' &rarr; ' +
      '<em>V</em><sub>' + d.index + '</sub>=' + d.lowerNode.toFixed(2) + ' kV<br>' +
      'Stress Factor: <strong>' + d.stressFactor.toFixed(2) + '&times;</strong> uniform';
  }

  // =========================================================================
  // CHART.JS VISUALIZATIONS
  // =========================================================================
  var voltageChart = null;

  function updateChart(result) {
    if (typeof Chart === 'undefined' || !dom.chartCanvas) return;

    var ctx = dom.chartCanvas.getContext('2d');
    if (voltageChart) {
      voltageChart.destroy();
    }

    var isPct = state.unit === 'pct';

    // Show/hide unit toggle only on disc distribution tab
    if (dom.unitToggleGroup) {
      dom.unitToggleGroup.style.visibility = state.chartTab === 'distribution' ? 'visible' : 'hidden';
    }

    if (state.chartTab === 'distribution') {
      var labels = result.discs.map(function (d) { return 'Disc ' + d.index; });
      var actualData = result.discs.map(function (d) {
        return Number((isPct ? d.percentage : d.voltage).toFixed(3));
      });
      var uniformData = result.discs.map(function (d) {
        return Number((isPct ? d.uniformPct : d.uniformVoltage).toFixed(3));
      });
      var barColors = result.discs.map(function (d) {
        return getDiscColorInfo(d, result).css;
      });

      var datasets = [
        {
          type: 'bar',
          label: 'Actual Distribution (K=' + result.shuntRatio.toFixed(2) + ')',
          data: actualData,
          backgroundColor: barColors,
          borderRadius: 5,
          order: 2
        },
        {
          type: 'line',
          label: 'Ideal Uniform (K=0)',
          data: uniformData,
          borderColor: '#0f172a',
          borderWidth: 2,
          borderDash: [6, 5],
          pointRadius: 3,
          pointBackgroundColor: '#0f172a',
          fill: false,
          order: 1
        }
      ];

      if (state.compareMode && state.pinnedResult && state.pinnedResult.discCount === result.discCount) {
        datasets.push({
          type: 'bar',
          label: 'Pinned Case (K=' + state.pinnedResult.shuntRatio.toFixed(2) + ', V=' + state.pinnedResult.totalVoltage + ' kV)',
          data: state.pinnedResult.discs.map(function (d) {
            return Number((isPct ? d.percentage : d.voltage).toFixed(3));
          }),
          backgroundColor: 'rgba(100, 116, 139, 0.45)',
          borderColor: '#475569',
          borderWidth: 1,
          borderRadius: 5,
          order: 3
        });
      }

      voltageChart = new Chart(ctx, {
        type: 'bar',
        data: { labels: labels, datasets: datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'top', labels: { boxWidth: 14, font: { size: 11 } } },
            tooltip: {
              callbacks: {
                label: function (context) {
                  return context.dataset.label + ': ' + context.parsed.y.toFixed(2) + (isPct ? '%' : ' kV');
                }
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              title: { display: true, text: isPct ? 'Percentage of Total Voltage (%)' : 'Disc Voltage (kV RMS)' }
            },
            x: {
              title: { display: true, text: 'Insulator Disc Position (1 = Tower End, ' + result.discCount + ' = Line End)' }
            }
          }
        }
      });

      dom.chartCaption.innerHTML =
        'Bar chart compares actual non-uniform disc voltage against the ideal uniform distribution (<em>V/n</em> = ' +
        result.uniformVoltage.toFixed(2) + ' kV or ' + result.uniformPct.toFixed(1) + '%).';
    } else if (state.chartTab === 'potential') {
      var nodeLabels = result.nodePotentials.map(function (_, idx) {
        if (idx === 0) return 'N0 (Gnd)';
        if (idx === result.discCount) return 'N' + idx + ' (HV)';
        return 'N' + idx;
      });
      var linearUniform = result.nodePotentials.map(function (_, idx) {
        return Number(((idx / result.discCount) * result.totalVoltage).toFixed(3));
      });

      voltageChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: nodeLabels,
          datasets: [
            {
              label: 'Actual Node Potential (kV)',
              data: result.nodePotentials.map(function (v) { return Number(v.toFixed(3)); }),
              borderColor: '#dc2626',
              backgroundColor: 'rgba(220, 38, 38, 0.12)',
              borderWidth: 2.5,
              tension: 0.2,
              fill: true
            },
            {
              label: 'Linear Uniform Profile (K=0)',
              data: linearUniform,
              borderColor: '#1d4ed8',
              borderWidth: 2,
              borderDash: [6, 5],
              fill: false
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: 'top', labels: { boxWidth: 14, font: { size: 11 } } } },
          scales: {
            y: {
              beginAtZero: true,
              title: { display: true, text: 'Junction Potential to Ground (kV RMS)' }
            },
            x: {
              title: { display: true, text: 'Junction Node Index (Tower Ground to HV Conductor)' }
            }
          }
        }
      });

      dom.chartCaption.textContent =
        'Cumulative potential curve bows downward at upper nodes and rises steeply near the conductor end as K increases.';
    } else {
      // Parametric sweep: String Efficiency vs K (0.00 to 0.50)
      var kValues = [];
      var effValues = [];
      var currentIdx = 0;
      var minDiff = Infinity;

      for (var step = 0; step <= 25; step++) {
        var kVal = Number((step * 0.02).toFixed(2));
        var sweepRes = solveInsulatorString(result.discCount, result.totalVoltage, kVal);
        kValues.push(kVal.toFixed(2));
        effValues.push(Number(sweepRes.stringEfficiency.toFixed(2)));
        if (Math.abs(kVal - result.shuntRatio) < minDiff) {
          minDiff = Math.abs(kVal - result.shuntRatio);
          currentIdx = step;
        }
      }

      var pointRadii = kValues.map(function (_, i) { return i === currentIdx ? 6 : 2.5; });
      var pointColors = kValues.map(function (_, i) { return i === currentIdx ? '#dc2626' : '#0f766e'; });

      voltageChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: kValues,
          datasets: [
            {
              label: 'String Efficiency η (%) for n = ' + result.discCount,
              data: effValues,
              borderColor: '#0f766e',
              backgroundColor: 'rgba(15, 118, 110, 0.12)',
              borderWidth: 2.5,
              pointRadius: pointRadii,
              pointBackgroundColor: pointColors,
              fill: true,
              tension: 0.25
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: 'top', labels: { boxWidth: 14, font: { size: 11 } } } },
          scales: {
            y: {
              min: 0,
              max: 105,
              title: { display: true, text: 'String Efficiency η (%)' }
            },
            x: {
              title: { display: true, text: 'Shunt-to-Self Capacitance Ratio (K = C₁ / C)' }
            }
          }
        }
      });

      dom.chartCaption.innerHTML =
        'Parametric sensitivity for <em>n</em> = ' + result.discCount + ' discs showing efficiency degradation as stray capacitance ratio <em>K</em> increases.';
    }
  }

  // =========================================================================
  // KPIs, COMPARISON BANNER, RESULTS TABLE & REPORT CALLOUT
  // =========================================================================
  function getStressBadge(disc, result) {
    if (result.shuntRatio === 0 || result.discCount === 1) {
      return '<span class="stress-pill stress-moderate">Uniform</span>';
    }
    if (disc.stressFactor >= 1.25) {
      return '<span class="stress-pill stress-high">High Stress</span>';
    }
    if (disc.stressFactor >= 1.02) {
      return '<span class="stress-pill stress-elevated">Elevated</span>';
    }
    if (disc.stressFactor >= 0.85) {
      return '<span class="stress-pill stress-moderate">Moderate</span>';
    }
    return '<span class="stress-pill stress-low">Low Stress</span>';
  }

  function updateKPIsAndTable(result) {
    var firstDisc = result.discs[0];
    var lastDisc = result.discs[result.discCount - 1];

    dom.kpiEfficiency.textContent = result.stringEfficiency.toFixed(2) + '%';
    dom.kpiEfficiencyNote.textContent =
      result.shuntRatio === 0 || result.discCount === 1
        ? 'Ideal Uniform Distribution'
        : 'Loss vs Uniform: -' + (100 - result.stringEfficiency).toFixed(2) + '%';

    dom.kpiVmax.textContent = lastDisc.voltage.toFixed(2) + ' kV';
    dom.kpiVmaxPct.textContent =
      'Disc ' + lastDisc.index + ': ' + lastDisc.percentage.toFixed(2) + '% (' + lastDisc.stressFactor.toFixed(2) + 'x avg)';

    dom.kpiVmin.textContent = firstDisc.voltage.toFixed(2) + ' kV';
    dom.kpiVminPct.textContent =
      'Disc 1: ' + firstDisc.percentage.toFixed(2) + '% (' + firstDisc.stressFactor.toFixed(2) + 'x avg)';

    dom.kpiSum.textContent = result.voltageSum.toFixed(2) + ' / ' + result.totalVoltage.toFixed(2) + ' kV';
    dom.kpiRatioStress.textContent =
      'v_n/v_1 = ' + result.nonUniformityRatio.toFixed(2) + ' | Err: ' + result.conservationError.toExponential(1);

    dom.calcStatusPill.textContent =
      result.conservationError < 1e-6 ? 'Balanced (Σvᵢ = V)' : 'Check Balance';

    if (dom.conductorBadge) {
      dom.conductorBadge.innerHTML =
        '<span class="dot dot-hv"></span> HV Line Conductor (Node ' + result.discCount + ': ' + result.totalVoltage.toFixed(2) + ' kV)';
    }

    // Comparison Summary Banner
    if (state.compareMode) {
      dom.compareSummary.classList.remove('hidden');
      var overloadPct = ((lastDisc.voltage - result.uniformVoltage) / result.uniformVoltage) * 100;
      var html =
        '<strong>Uniform vs Actual:</strong> Peak disc stress rises from <strong>' +
        result.uniformVoltage.toFixed(2) + ' kV</strong> (uniform) to <strong>' +
        lastDisc.voltage.toFixed(2) + ' kV</strong> (<strong>+' + overloadPct.toFixed(1) + '%</strong> overload); efficiency drops from 100% to <strong>' +
        result.stringEfficiency.toFixed(2) + '%</strong>.';

      if (state.pinnedResult) {
        var effDiff = result.stringEfficiency - state.pinnedResult.stringEfficiency;
        var sign = effDiff >= 0 ? '+' : '';
        html +=
          '<br><strong>vs Pinned Baseline (n=' + state.pinnedResult.discCount +
          ', V=' + state.pinnedResult.totalVoltage + ' kV, K=' + state.pinnedResult.shuntRatio.toFixed(2) +
          '):</strong> Efficiency &Delta; = <strong>' + sign + effDiff.toFixed(2) + '%</strong>' +
          (state.pinnedResult.discCount !== result.discCount
            ? ' <em>(Chart bar overlay requires equal disc counts)</em>'
            : '');
      }
      dom.compareSummary.innerHTML = html;
    } else {
      dom.compareSummary.classList.add('hidden');
    }

    // Numerical Table Rows
    var rowsHtml = result.discs.map(function (d) {
      var loc = d.index === 1
        ? 'Top (Tower End)'
        : (d.index === result.discCount ? 'Bottom (Conductor End)' : 'Intermediate');
      var devSign = d.deviationPct >= 0 ? '+' : '';
      return (
        '<tr>' +
          '<td><strong>#' + d.index + '</strong></td>' +
          '<td>' + loc + '</td>' +
          '<td>' + d.upperNode.toFixed(3) + '</td>' +
          '<td>' + d.lowerNode.toFixed(3) + '</td>' +
          '<td><strong>' + d.voltage.toFixed(3) + '</strong></td>' +
          '<td>' + d.percentage.toFixed(2) + '%</td>' +
          '<td>' + d.uniformVoltage.toFixed(3) + '</td>' +
          '<td>' + devSign + d.deviationPct.toFixed(1) + '%</td>' +
          '<td>' + getStressBadge(d, result) + '</td>' +
        '</tr>'
      );
    }).join('');

    dom.tableBody.innerHTML = rowsHtml;

    var totalPct = result.discs.reduce(function (acc, d) { return acc + d.percentage; }, 0);
    dom.tableFoot.innerHTML =
      '<tr>' +
        '<td>Total</td>' +
        '<td>' + result.discCount + ' Discs in Series</td>' +
        '<td>0.000 (V₀)</td>' +
        '<td>' + result.totalVoltage.toFixed(3) + ' (Vₙ)</td>' +
        '<td>' + result.voltageSum.toFixed(3) + ' kV</td>' +
        '<td>' + totalPct.toFixed(2) + '%</td>' +
        '<td>' + result.totalVoltage.toFixed(3) + ' kV</td>' +
        '<td>&eta; = ' + result.stringEfficiency.toFixed(2) + '%</td>' +
        '<td>Conserved</td>' +
      '</tr>';

    // Update dynamic engineering discussion box
    if (dom.discussionBox) {
      dom.discussionBox.innerHTML =
        '<strong>Active Simulation Observation:</strong> For <strong>' + result.discCount +
        ' discs</strong> at <strong>' + result.totalVoltage.toFixed(1) + ' kV</strong> with <em>K</em> = <strong>' +
        result.shuntRatio.toFixed(2) + '</strong>, the conductor-end disc supports <strong>' +
        lastDisc.voltage.toFixed(2) + ' kV (' + lastDisc.percentage.toFixed(1) + '%)</strong> compared to <strong>' +
        firstDisc.voltage.toFixed(2) + ' kV (' + firstDisc.percentage.toFixed(1) + '%)</strong> at the tower end, giving a string efficiency of <strong>' +
        result.stringEfficiency.toFixed(2) + '%</strong>.';
    }
  }

  // =========================================================================
  // MAIN UPDATE PIPELINE
  // =========================================================================
  function runSimulation(options) {
    var opts = options || {};
    var result = solveInsulatorString(state.discCount, state.totalVoltage, state.shuntRatio);
    state.lastResult = result;

    if (state.selectedDiscIndex !== null && state.selectedDiscIndex >= result.discCount) {
      state.selectedDiscIndex = null;
    }

    updateKPIsAndTable(result);
    updateChart(result);
    buildInsulatorString3D(result, Boolean(opts.resetCamera));

    if (state.selectedDiscIndex !== null) {
      renderInspectorForDisc(state.selectedDiscIndex);
    } else {
      renderInspectorDefault();
    }

    if (opts.flash && dom.analyticsPanel) {
      dom.analyticsPanel.classList.remove('flash-update');
      void dom.analyticsPanel.offsetWidth; // trigger reflow
      dom.analyticsPanel.classList.add('flash-update');
    }
  }

  // =========================================================================
  // EVENT BINDINGS & INTERACTION HANDLERS
  // =========================================================================
  function syncInputPair(rangeEl, numEl, min, max, isInt, onChange) {
    function applyValue(raw) {
      var val = Number(raw);
      if (Number.isNaN(val)) return;
      val = Math.max(min, Math.min(max, val));
      if (isInt) val = Math.round(val);
      rangeEl.value = val;
      numEl.value = val;
      onChange(val);
    }

    rangeEl.addEventListener('input', function () {
      applyValue(rangeEl.value);
    });
    numEl.addEventListener('change', function () {
      applyValue(numEl.value);
    });
  }

  function highlightActivePresets() {
    document.querySelectorAll('.preset-btn').forEach(function (btn) {
      var vMatch = Math.abs(Number(btn.dataset.voltage) - state.totalVoltage) < 0.15;
      var dMatch = Number(btn.dataset.discs) === state.discCount;
      btn.classList.toggle('active', vMatch && dMatch);
    });
    document.querySelectorAll('.ratio-preset-btn').forEach(function (btn) {
      var rMatch = Math.abs(Number(btn.dataset.ratio) - state.shuntRatio) < 0.005;
      btn.classList.toggle('active', rMatch);
    });
  }

  function exportCsv() {
    if (!state.lastResult) return;
    var r = state.lastResult;
    var lines = [
      'Mapping Voltage Gradient Across Suspension Insulators - Simulation Export',
      'Disc Count (n),' + r.discCount + ',Applied Voltage (kV),' + r.totalVoltage + ',Capacitance Ratio (K),' + r.shuntRatio + ',String Efficiency (%),' + r.stringEfficiency.toFixed(4),
      '',
      'Disc #,Upper Node V_{i-1} (kV),Lower Node V_i (kV),Disc Voltage v_i (kV),Percentage (%),Uniform Ref (kV),Deviation (%)'
    ];
    r.discs.forEach(function (d) {
      lines.push([
        d.index,
        d.upperNode.toFixed(4),
        d.lowerNode.toFixed(4),
        d.voltage.toFixed(4),
        d.percentage.toFixed(4),
        d.uniformVoltage.toFixed(4),
        d.deviationPct.toFixed(2)
      ].join(','));
    });

    var blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = 'insulator_voltage_gradient_n' + r.discCount + '_K' + r.shuntRatio.toFixed(2) + '.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function executeAndRenderTests() {
    if (typeof globalScope.runInsulatorTests !== 'function') return;
    var report = globalScope.runInsulatorTests(solveInsulatorString);
    dom.testSummaryBanner.className = 'test-summary-banner ' + (report.failed === 0 ? 'pass' : 'fail');
    dom.testSummaryBanner.textContent =
      report.passed + ' / ' + report.total + ' Verification Checks Passed' +
      (report.failed === 0 ? ' — All mathematical conservation and analytical invariants hold.' : ' — Some checks failed.');

    dom.testResultsList.innerHTML = report.results.map(function (item) {
      return (
        '<div class="test-item ' + (item.passed ? 'pass' : 'fail') + '">' +
          '<div class="test-item-title">' + (item.passed ? 'PASS: ' : 'FAIL: ') + item.name + '</div>' +
          '<div class="test-item-detail">' + item.detail + '</div>' +
        '</div>'
      );
    }).join('');
  }

  function bindEvents() {
    syncInputPair(dom.discRange, dom.discInput, 1, 15, true, function (val) {
      var prev = state.discCount;
      state.discCount = val;
      highlightActivePresets();
      runSimulation({ resetCamera: val !== prev });
    });

    syncInputPair(dom.voltageRange, dom.voltageInput, 11, 440, false, function (val) {
      state.totalVoltage = val;
      highlightActivePresets();
      runSimulation();
    });

    syncInputPair(dom.ratioRange, dom.ratioInput, 0, 0.5, false, function (val) {
      state.shuntRatio = val;
      highlightActivePresets();
      runSimulation();
    });

    // Voltage system presets
    document.querySelectorAll('.preset-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.totalVoltage = Number(btn.dataset.voltage);
        state.discCount = Number(btn.dataset.discs);
        dom.voltageRange.value = state.totalVoltage;
        dom.voltageInput.value = state.totalVoltage;
        dom.discRange.value = state.discCount;
        dom.discInput.value = state.discCount;
        highlightActivePresets();
        runSimulation({ resetCamera: true, flash: true });
      });
    });

    // Capacitance ratio presets
    document.querySelectorAll('.ratio-preset-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.shuntRatio = Number(btn.dataset.ratio);
        dom.ratioRange.value = state.shuntRatio;
        dom.ratioInput.value = state.shuntRatio;
        highlightActivePresets();
        runSimulation({ flash: true });
      });
    });

    dom.materialSelect.addEventListener('change', function () {
      state.material = dom.materialSelect.value;
      buildInsulatorString3D(state.lastResult, false);
    });

    dom.heatmapToggle.addEventListener('change', function () {
      state.heatmap = dom.heatmapToggle.checked;
      buildInsulatorString3D(state.lastResult, false);
    });

    // Action Buttons: Calculate, Reset, Compare
    dom.calculateBtn.addEventListener('click', function () {
      state.discCount = Math.max(1, Math.min(15, Math.round(Number(dom.discInput.value) || DEFAULTS.discCount)));
      state.totalVoltage = Math.max(11, Math.min(440, Number(dom.voltageInput.value) || DEFAULTS.totalVoltage));
      state.shuntRatio = Math.max(0, Math.min(0.5, Number(dom.ratioInput.value) || 0));
      dom.discRange.value = state.discCount;
      dom.discInput.value = state.discCount;
      dom.voltageRange.value = state.totalVoltage;
      dom.voltageInput.value = state.totalVoltage;
      dom.ratioRange.value = state.shuntRatio;
      dom.ratioInput.value = state.shuntRatio;
      highlightActivePresets();
      runSimulation({ flash: true });
    });

    dom.resetBtn.addEventListener('click', function () {
      state.discCount = DEFAULTS.discCount;
      state.totalVoltage = DEFAULTS.totalVoltage;
      state.shuntRatio = DEFAULTS.shuntRatio;
      state.material = DEFAULTS.material;
      state.heatmap = DEFAULTS.heatmap;
      state.compareMode = false;
      state.pinnedResult = null;
      state.selectedDiscIndex = null;

      dom.discRange.value = state.discCount;
      dom.discInput.value = state.discCount;
      dom.voltageRange.value = state.totalVoltage;
      dom.voltageInput.value = state.totalVoltage;
      dom.ratioRange.value = state.shuntRatio;
      dom.ratioInput.value = state.shuntRatio;
      dom.materialSelect.value = state.material;
      dom.heatmapToggle.checked = state.heatmap;

      dom.compareBtn.classList.remove('active');
      dom.compareBtn.setAttribute('aria-pressed', 'false');
      dom.compareControls.classList.add('hidden');
      dom.clearBaselineBtn.classList.add('hidden');
      dom.pinnedLabel.textContent = '';

      highlightActivePresets();
      runSimulation({ resetCamera: true, flash: true });
    });

    dom.compareBtn.addEventListener('click', function () {
      state.compareMode = !state.compareMode;
      dom.compareBtn.classList.toggle('active', state.compareMode);
      dom.compareBtn.setAttribute('aria-pressed', String(state.compareMode));
      dom.compareControls.classList.toggle('hidden', !state.compareMode);
      runSimulation({ flash: true });
    });

    dom.pinBaselineBtn.addEventListener('click', function () {
      if (!state.lastResult) return;
      state.pinnedResult = JSON.parse(JSON.stringify(state.lastResult));
      dom.clearBaselineBtn.classList.remove('hidden');
      dom.pinnedLabel.textContent =
        'Pinned: n=' + state.pinnedResult.discCount + ', V=' + state.pinnedResult.totalVoltage +
        ' kV, K=' + state.pinnedResult.shuntRatio.toFixed(2) + ' (η=' + state.pinnedResult.stringEfficiency.toFixed(1) + '%)';
      runSimulation();
    });

    dom.clearBaselineBtn.addEventListener('click', function () {
      state.pinnedResult = null;
      dom.clearBaselineBtn.classList.add('hidden');
      dom.pinnedLabel.textContent = '';
      runSimulation();
    });

    dom.resetCameraBtn.addEventListener('click', function () {
      fitCameraToString(state.discCount, 1.05);
    });

    // Chart Tab Switching
    document.querySelectorAll('.tab-btn').forEach(function (tab) {
      tab.addEventListener('click', function () {
        document.querySelectorAll('.tab-btn').forEach(function (t) {
          t.classList.remove('active');
          t.setAttribute('aria-selected', 'false');
        });
        tab.classList.add('active');
        tab.setAttribute('aria-selected', 'true');
        state.chartTab = tab.dataset.chartTab;
        if (state.lastResult) updateChart(state.lastResult);
      });
    });

    // Unit Toggle (kV vs %)
    document.querySelectorAll('.unit-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.unit-btn').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        state.unit = btn.dataset.unit;
        if (state.lastResult) updateChart(state.lastResult);
      });
    });

    dom.exportCsvBtn.addEventListener('click', exportCsv);
    dom.runTestsBtn.addEventListener('click', executeAndRenderTests);
  }

  // =========================================================================
  // BOOTSTRAP
  // =========================================================================
  document.addEventListener('DOMContentLoaded', function () {
    initThreeScene();
    bindEvents();
    highlightActivePresets();
    runSimulation({ resetCamera: true });
    executeAndRenderTests();
  });
})(typeof window !== 'undefined' ? window : global);
