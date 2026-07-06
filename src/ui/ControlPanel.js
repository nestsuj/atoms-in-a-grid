window.Atoms = window.Atoms || {};

window.Atoms.ControlPanel = class ControlPanel {
  constructor(config, handlers) {
    this.config = config;
    this.handlers = handlers;
    this.ids = {
      width: "widthInput",
      height: "heightInput",
      depth: "depthInput",
      restLength: "restLengthInput",
      atomRadius: "atomRadiusInput",
      scenePreset: "scenePresetInput",
      material: "materialInput",
      physicsMode: "physicsModeInput",
      stiffness: "stiffnessInput",
      shearStiffness: "shearStiffnessInput",
      springDamping: "springDampingInput",
      shearDamping: "shearDampingInput",
      bendStiffness: "bendStiffnessInput",
      bendDamping: "bendDampingInput",
      atomMass: "atomMassInput",
      releaseEnergy: "releaseEnergyInput",
      dragStrength: "dragStrengthInput",
      mouseStiffness: "mouseStiffnessInput",
      mouseDamping: "mouseDampingInput",
      collisionEnabled: "collisionEnabledInput",
      collisionRadiusScale: "collisionRadiusScaleInput",
      collisionStiffness: "collisionStiffnessInput",
      collisionDamping: "collisionDampingInput",
      collisionPasses: "collisionPassesInput",
      allowCornerPinEditing: "allowCornerPinEditingInput",
      gravityEnabled: "gravityEnabledInput",
      gravityStrength: "gravityStrengthInput",
      windProfile: "windProfileInput",
      windEnabled: "windEnabledInput",
      windDirection: "windDirectionInput",
      windStrength: "windStrengthInput",
      windTurbulence: "windTurbulenceInput",
      windScale: "windScaleInput",
      windSpeed: "windSpeedInput",
      windDrag: "windDragInput",
      windFlutter: "windFlutterInput",
      windResponse: "windResponseInput",
      damping: "dampingInput",
      iterations: "iterationsInput",
      physicsRate: "physicsRateInput",
      fastBending: "fastBendingInput",
      fastLargeGridAtoms: "fastLargeGridAtomsInput",
      showAtoms: "showAtomsInput",
      showBonds: "showBondsInput",
      sortBonds: "sortBondsInput",
      sortAtoms: "sortAtomsInput",
      simpleBondColors: "simpleBondColorsInput",
      showDiagnostics: "showDiagnosticsInput",
      showSurfaces: "showSurfacesInput",
      surfaceRenderer: "surfaceRendererInput",
      showSurfaceEdges: "showSurfaceEdgesInput",
      surfaceSide: "surfaceSideInput",
      surfaceStyle: "surfaceStyleInput",
      mirrorBackTexture: "mirrorBackTextureInput",
      flipBackTexture: "flipBackTextureInput",
      surfaceOpacity: "surfaceOpacityInput",
      surfaceLighting: "surfaceLightingInput",
      surfaceLightingModel: "surfaceLightingModelInput",
      surfaceFabricEnabled: "surfaceFabricEnabledInput",
      fabricWeaveStrength: "fabricWeaveStrengthInput",
      surfaceFoldShadingEnabled: "surfaceFoldShadingEnabledInput",
      foldShadingStrength: "foldShadingStrengthInput",
      sunAzimuth: "sunAzimuthInput",
      sunElevation: "sunElevationInput",
      sunIntensity: "sunIntensityInput",
      sunAmbient: "sunAmbientInput",
      showWindField: "showWindFieldInput",
      showCollisionDebug: "showCollisionDebugInput",
      atomDepthShading: "atomDepthShadingInput",
      energyUpdateRate: "energyUpdateRateInput",
    };
    this.valueFormatters = this.createValueFormatters();
    this.bind();
    this.ensureValueReadouts();
    this.applyMaterial(this.config.material);
    this.applyWindProfile(this.config.windProfile);
    this.write();
  }

  bind() {
    for (const [key, id] of Object.entries(this.ids)) {
      const input = document.getElementById(id);
      const handleInput = () => {
        if (key === "scenePreset") {
          this.applyScenePreset(input.value);
          this.write();
          this.handlers.onRebuild();
          return;
        }

        if (key === "material") {
          this.applyMaterial(input.value);
          this.config.scenePreset = "custom";
          this.write();
          this.handlers.onMaterialChange();
          return;
        }

        if (key === "windProfile") {
          this.applyWindProfile(input.value);
          this.config.scenePreset = "custom";
          this.write();
          this.handlers.onConfigure();
          return;
        }

        this.read();
        if (window.Atoms.scenePresetKeys.includes(key)) {
          this.config.scenePreset = "custom";
          document.getElementById(this.ids.scenePreset).value = "custom";
        }

        if (window.Atoms.materialKeys.includes(key)) {
          this.config.material = "custom";
          document.getElementById(this.ids.material).value = "custom";
        }

        if (window.Atoms.windProfileKeys.includes(key)) {
          this.config.windProfile = "custom";
          document.getElementById(this.ids.windProfile).value = "custom";
        }

        if (["collisionEnabled", "collisionRadiusScale", "collisionStiffness", "collisionDamping", "collisionPasses"].includes(key)) {
          this.setOptionalSelectValue("collisionPresetInput", "custom");
        }

        if (this.isRenderKey(key)) {
          this.setOptionalSelectValue("renderPresetInput", "custom");
        }

        this.updateValueReadouts();
        this.updateContextVisibility();
        this.updateHints();

        if (["width", "height", "depth", "restLength"].includes(key)) {
          this.handlers.onRebuild();
        } else {
          this.handlers.onConfigure();
        }
      };

      input.addEventListener("input", handleInput);
      if (input.tagName === "SELECT") {
        input.addEventListener("change", handleInput);
      }
    }

    this.bindButton("resetMaterialButton", () => this.resetMaterialSliders());
    this.bindButton("resetCollisionButton", () => this.resetCollisionSettings());
    this.bindButton("resetWindButton", () => this.resetWindProfile());
    this.bindButton("resetRenderingButton", () => this.resetRenderingForScene());
    this.bindPresetSelect("collisionPresetInput", (value) => this.applyCollisionPreset(value));
    this.bindPresetSelect("renderPresetInput", (value) => this.applyRenderPreset(value));
    document.getElementById("resetButton").addEventListener("click", this.handlers.onReset);
    document.getElementById("surfaceTextureInput").addEventListener("change", (event) => {
      this.loadSurfaceTexture("front", event.currentTarget.files && event.currentTarget.files[0]);
    });
    document.getElementById("surfaceBackTextureInput").addEventListener("change", (event) => {
      this.loadSurfaceTexture("back", event.currentTarget.files && event.currentTarget.files[0]);
    });
    document.getElementById("clearSurfaceImagesButton").addEventListener("click", () => {
      this.clearSurfaceTextures();
    });
    document.getElementById("clearUserPinsButton").addEventListener("click", this.handlers.onClearUserPins);
    document.getElementById("frontViewButton").addEventListener("click", this.handlers.onFrontView);
    document.getElementById("defaultViewButton").addEventListener("click", this.handlers.onDefaultView);
    document.getElementById("pauseButton").addEventListener("click", (event) => {
      const paused = this.handlers.onTogglePause();
      event.currentTarget.textContent = paused ? "Resume" : "Pause";
    });
  }

  bindButton(id, handler) {
    const button = document.getElementById(id);
    if (button) {
      button.addEventListener("click", handler);
    }
  }

  bindPresetSelect(id, handler) {
    const select = document.getElementById(id);
    if (!select) {
      return;
    }

    select.addEventListener("change", () => {
      if (select.value === "custom") {
        return;
      }
      handler(select.value);
    });
  }

  setOptionalSelectValue(id, value) {
    const select = document.getElementById(id);
    if (select) {
      select.value = value;
    }
  }

  createValueFormatters() {
    const percent = (value) => `${Math.round(Number(value) * 100)}%`;
    const decimal = (digits) => (value) => Number(value).toFixed(digits);

    return {
      restLength: (value) => `${Math.round(Number(value))} px`,
      atomRadius: (value) => `${Math.round(Number(value))} px`,
      stiffness: percent,
      shearStiffness: percent,
      springDamping: percent,
      shearDamping: percent,
      bendStiffness: percent,
      bendDamping: percent,
      atomMass: (value) => `${decimal(1)(value)} mass`,
      releaseEnergy: percent,
      dragStrength: percent,
      mouseStiffness: (value) => `${decimal(1)(value)} force`,
      mouseDamping: (value) => `${decimal(2)(value)} damping`,
      collisionRadiusScale: (value) => `${decimal(2)(value)} x atom radius`,
      collisionStiffness: percent,
      collisionDamping: percent,
      collisionPasses: (value) => `${Math.round(Number(value))} pass${Math.round(Number(value)) === 1 ? "" : "es"}`,
      gravityStrength: (value) => `${decimal(2)(value)} g`,
      windStrength: (value) => `${decimal(2)(value)} force`,
      windTurbulence: (value) => `${decimal(2)(value)} gust`,
      windScale: (value) => `${Math.round(Number(value))} px`,
      windSpeed: (value) => `${decimal(2)(value)} speed`,
      windDrag: (value) => `${decimal(2)(value)} drag`,
      windFlutter: (value) => `${decimal(2)(value)} flutter`,
      windResponse: percent,
      damping: (value) => `${(Number(value) * 100).toFixed(2)}% retained`,
      iterations: (value) => `${Math.round(Number(value))} step${Math.round(Number(value)) === 1 ? "" : "s"}`,
      physicsRate: (value) => `${Math.round(Number(value))} Hz`,
      surfaceOpacity: percent,
      fabricWeaveStrength: percent,
      foldShadingStrength: percent,
      sunAzimuth: (value) => `${Math.round(Number(value))} deg`,
      sunElevation: (value) => `${Math.round(Number(value))} deg`,
      sunIntensity: percent,
      sunAmbient: percent,
      atomDepthShading: percent,
      energyUpdateRate: (value) => `${Math.round(Number(value))} frame${Math.round(Number(value)) === 1 ? "" : "s"}`,
    };
  }

  ensureValueReadouts() {
    for (const [key, id] of Object.entries(this.ids)) {
      const input = document.getElementById(id);
      if (!input || !["range", "number"].includes(input.type)) {
        continue;
      }

      const existing = input.parentElement.querySelector(`[data-value-for="${key}"]`);
      if (existing) {
        continue;
      }

      const output = document.createElement("output");
      output.className = "control-value";
      output.dataset.valueFor = key;
      output.setAttribute("for", id);
      input.insertAdjacentElement("afterend", output);
    }
  }

  updateValueReadouts() {
    for (const [key, id] of Object.entries(this.ids)) {
      const input = document.getElementById(id);
      const output = document.querySelector(`[data-value-for="${key}"]`);
      if (!input || !output) {
        continue;
      }

      const formatter = this.valueFormatters[key] || ((value) => value);
      output.value = formatter(input.value);
      output.textContent = output.value;
    }
  }

  updateHints() {
    const hint = document.getElementById("uiHint");
    if (!hint) {
      return;
    }

    const messages = [];
    if (this.config.showSurfaces && this.config.surfaceRenderer === "canvas" && this.config.depth === 1) {
      messages.push("WebGL is recommended for folded cloth because it depth-tests the surface.");
    }
    if (this.config.showSurfaces && this.config.surfaceStyle === "image" && this.config.depth > 1) {
      messages.push("Image mapping is most predictable on depth 1 cloth surfaces.");
    }
    if (this.config.collisionEnabled && this.config.depth === 1 && this.config.collisionPasses < 2) {
      messages.push("Cloth self-collision usually behaves better with 2 or more collision passes.");
    }
    if (this.config.windEnabled && !this.config.showWindField && this.config.depth === 1) {
      messages.push("Turn on Show wind field when tuning flag gusts.");
    }

    hint.textContent = messages[0] || "";
    hint.hidden = messages.length === 0;
  }

  updateContextVisibility() {
    const hasSurfaces = Boolean(this.config.showSurfaces);
    const usesImage = this.config.surfaceStyle === "image";
    const hasWind = Boolean(this.config.windEnabled);

    this.setControlVisible("surfaceSide", hasSurfaces);
    this.setControlVisible("surfaceStyle", hasSurfaces);
    this.setControlVisible("mirrorBackTexture", hasSurfaces && usesImage);
    this.setControlVisible("flipBackTexture", hasSurfaces && usesImage);
    this.setControlVisible("surfaceOpacity", hasSurfaces);
    this.setControlVisible("surfaceLighting", hasSurfaces);
    this.setControlVisible("surfaceLightingModel", hasSurfaces);
    this.setControlVisible("surfaceFabricEnabled", hasSurfaces);
    this.setControlVisible("fabricWeaveStrength", hasSurfaces && this.config.surfaceFabricEnabled);
    this.setControlVisible("surfaceFoldShadingEnabled", hasSurfaces);
    this.setControlVisible("foldShadingStrength", hasSurfaces && this.config.surfaceFoldShadingEnabled);
    this.setControlVisible("sunAzimuth", hasSurfaces && this.config.surfaceLighting);
    this.setControlVisible("sunElevation", hasSurfaces && this.config.surfaceLighting);
    this.setControlVisible("sunIntensity", hasSurfaces && this.config.surfaceLighting);
    this.setControlVisible("sunAmbient", hasSurfaces && this.config.surfaceLighting);
    this.setControlVisible("windDirection", hasWind);
    this.setControlVisible("windStrength", hasWind);
    this.setControlVisible("windTurbulence", hasWind);
    this.setControlVisible("windScale", hasWind);
    this.setControlVisible("windSpeed", hasWind);
    this.setControlVisible("windDrag", hasWind);
    this.setControlVisible("windFlutter", hasWind);
    this.setControlVisible("windResponse", hasWind);
  }

  setControlVisible(key, visible) {
    const input = document.getElementById(this.ids[key]);
    const control = input && input.closest("label");
    if (control) {
      control.classList.toggle("is-hidden", !visible);
    }
  }

  resetMaterialSliders() {
    const materialId = this.config.material === "custom"
      ? (this.config.depth === 1 ? "cloth" : "molecular")
      : this.config.material;
    this.applyMaterial(materialId);
    this.config.scenePreset = "custom";
    this.write();
    this.handlers.onMaterialChange();
  }

  resetWindProfile() {
    const profileId = this.config.windProfile === "custom"
      ? (this.config.depth === 1 ? "flag" : "calm")
      : this.config.windProfile;
    this.applyWindProfile(profileId);
    this.config.scenePreset = "custom";
    this.write();
    this.handlers.onConfigure();
  }

  resetCollisionSettings() {
    const clothLike = this.config.depth === 1;
    this.config.collisionEnabled = clothLike;
    this.config.collisionRadiusScale = clothLike ? 1.35 : 1.6;
    this.config.collisionStiffness = clothLike ? 0.45 : 0.65;
    this.config.collisionDamping = clothLike ? 0.45 : 0.35;
    this.config.collisionPasses = clothLike ? 2 : 1;
    this.config.scenePreset = "custom";
    this.setOptionalSelectValue("collisionPresetInput", clothLike ? "cloth" : "off");
    this.write();
    this.handlers.onConfigure();
  }

  applyCollisionPreset(presetId) {
    const presets = {
      off: {
        collisionEnabled: false,
        collisionRadiusScale: 1.35,
        collisionStiffness: 0.45,
        collisionDamping: 0.35,
        collisionPasses: 1,
      },
      cloth: {
        collisionEnabled: true,
        collisionRadiusScale: 1.35,
        collisionStiffness: 0.45,
        collisionDamping: 0.45,
        collisionPasses: 2,
      },
      robust: {
        collisionEnabled: true,
        collisionRadiusScale: 1.5,
        collisionStiffness: 0.6,
        collisionDamping: 0.65,
        collisionPasses: 4,
      },
    };
    const preset = presets[presetId];
    if (!preset) {
      return;
    }

    Object.assign(this.config, preset);
    this.config.scenePreset = "custom";
    this.write();
    this.handlers.onConfigure();
  }

  resetRenderingForScene() {
    const clothLike = this.config.depth === 1 || this.config.scenePreset === "flag";
    this.config.showDiagnostics = false;
    this.config.showWindField = clothLike;
    this.config.showCollisionDebug = false;
    this.config.showSurfaces = clothLike;
    this.config.surfaceRenderer = "webgl";
    this.config.showSurfaceEdges = false;
    this.config.surfaceSide = "both";
    this.config.surfaceStyle = clothLike && this.config.surfaceFrontTextureImage ? "image" : "tint";
    this.config.surfaceOpacity = 1;
    this.config.surfaceLighting = true;
    this.config.surfaceLightingModel = clothLike ? "cloth" : "standard";
    this.config.surfaceFabricEnabled = clothLike;
    this.config.fabricWeaveStrength = clothLike ? 0.08 : 0;
    this.config.surfaceFoldShadingEnabled = clothLike;
    this.config.foldShadingStrength = clothLike ? 0.08 : 0;
    this.config.showAtoms = !clothLike;
    this.config.showBonds = !clothLike;
    this.config.fastLargeGridAtoms = true;
    this.config.sortBonds = false;
    this.config.sortAtoms = false;
    this.config.simpleBondColors = false;
    this.config.scenePreset = "custom";
    this.setOptionalSelectValue("renderPresetInput", clothLike ? "cloth" : "atoms");
    this.write();
    this.handlers.onConfigure();
  }

  applyRenderPreset(presetId) {
    const clothLike = presetId === "cloth";
    const debug = presetId === "debug";
    if (!["atoms", "cloth", "debug"].includes(presetId)) {
      return;
    }

    this.config.showDiagnostics = debug;
    this.config.showWindField = debug && this.config.windEnabled;
    this.config.showCollisionDebug = debug && this.config.collisionEnabled;
    this.config.showSurfaces = clothLike || debug;
    this.config.surfaceRenderer = "webgl";
    this.config.showSurfaceEdges = debug;
    this.config.surfaceSide = "both";
    this.config.surfaceOpacity = 1;
    this.config.surfaceLighting = true;
    this.config.surfaceLightingModel = clothLike ? "cloth" : "standard";
    this.config.surfaceFabricEnabled = clothLike;
    this.config.fabricWeaveStrength = clothLike ? 0.08 : 0;
    this.config.surfaceFoldShadingEnabled = clothLike;
    this.config.foldShadingStrength = clothLike ? 0.08 : 0;
    this.config.showAtoms = presetId === "atoms" || debug;
    this.config.showBonds = presetId === "atoms" || debug;
    this.config.fastLargeGridAtoms = true;
    this.config.sortBonds = false;
    this.config.sortAtoms = false;
    this.config.simpleBondColors = false;
    this.config.scenePreset = "custom";
    this.write();
    this.handlers.onConfigure();
  }

  isRenderKey(key) {
    return [
      "showDiagnostics",
      "showWindField",
      "showCollisionDebug",
      "showSurfaces",
      "surfaceRenderer",
      "showSurfaceEdges",
      "surfaceSide",
      "surfaceStyle",
      "mirrorBackTexture",
      "flipBackTexture",
      "surfaceOpacity",
      "surfaceLighting",
      "surfaceLightingModel",
      "surfaceFabricEnabled",
      "fabricWeaveStrength",
      "surfaceFoldShadingEnabled",
      "foldShadingStrength",
      "sunAzimuth",
      "sunElevation",
      "sunIntensity",
      "sunAmbient",
      "atomDepthShading",
      "energyUpdateRate",
      "showAtoms",
      "showBonds",
      "fastLargeGridAtoms",
      "sortBonds",
      "sortAtoms",
      "simpleBondColors",
    ].includes(key);
  }

  loadSurfaceTexture(side, file) {
    const imageKey = side === "back" ? "surfaceBackTextureImage" : "surfaceFrontTextureImage";
    const nameKey = side === "back" ? "surfaceBackTextureName" : "surfaceFrontTextureName";

    if (!file || !file.type.startsWith("image/")) {
      this.config[imageKey] = null;
      this.config[nameKey] = "";
      this.syncLegacySurfaceTexture();
      this.write();
      this.handlers.onConfigure();
      return;
    }

    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const image = new Image();
      image.addEventListener("load", () => {
        this.config[imageKey] = image;
        this.config[nameKey] = file.name;
        this.syncLegacySurfaceTexture();
        this.config.showSurfaces = true;
        this.config.surfaceStyle = "image";
        this.write();
        this.handlers.onConfigure();
      });
      image.src = reader.result;
    });
    reader.readAsDataURL(file);
  }

  syncLegacySurfaceTexture() {
    this.config.surfaceTextureImage = this.config.surfaceFrontTextureImage;
    this.config.surfaceTextureName = this.config.surfaceFrontTextureName;
  }

  clearSurfaceTextures() {
    this.config.surfaceTextureImage = null;
    this.config.surfaceTextureName = "";
    this.config.surfaceFrontTextureImage = null;
    this.config.surfaceFrontTextureName = "";
    this.config.surfaceBackTextureImage = null;
    this.config.surfaceBackTextureName = "";
    document.getElementById("surfaceTextureInput").value = "";
    document.getElementById("surfaceBackTextureInput").value = "";
    if (this.config.surfaceStyle === "image") {
      this.config.surfaceStyle = "tint";
    }
    this.write();
    this.handlers.onConfigure();
  }

  updateSurfaceTextureLabels() {
    document.getElementById("surfaceTextureName").textContent = this.config.surfaceFrontTextureName
      ? `Loaded: ${this.config.surfaceFrontTextureName}`
      : "No front image loaded";
    document.getElementById("surfaceBackTextureName").textContent = this.config.surfaceBackTextureName
      ? `Loaded: ${this.config.surfaceBackTextureName}`
      : "No back image loaded";
  }

  applyMaterial(materialId) {
    const material = window.Atoms.materialProperties[materialId];
    this.config.material = material ? materialId : "custom";

    if (!material) {
      return;
    }

    for (const key of window.Atoms.materialKeys) {
      this.config[key] = material[key];
    }
  }

  applyWindProfile(profileId) {
    const profile = window.Atoms.windProfiles[profileId];
    this.config.windProfile = profile ? profileId : "custom";

    if (!profile) {
      return;
    }

    for (const key of window.Atoms.windProfileKeys) {
      this.config[key] = profile[key];
    }
  }

  applyScenePreset(presetId) {
    const preset = window.Atoms.scenePresets[presetId];
    this.config.scenePreset = preset ? presetId : "custom";

    if (!preset) {
      return;
    }

    for (const key of window.Atoms.scenePresetKeys) {
      this.config[key] = preset[key];
    }

    this.applyMaterial(this.config.material);
    this.applyWindProfile(this.config.windProfile);
    this.config.scenePreset = presetId;
  }

  write() {
    for (const [key, id] of Object.entries(this.ids)) {
      const input = document.getElementById(id);
      if (input.type === "checkbox") {
        input.checked = Boolean(this.config[key]);
      } else if (key === "physicsMode") {
        input.value = window.Atoms.SolverMode.normalize(this.config[key]);
      } else {
        input.value = this.config[key];
      }
    }
    this.updateSurfaceTextureLabels();
    this.updatePresetSelects();
    this.updateValueReadouts();
    this.updateContextVisibility();
    this.updateHints();
  }

  updatePresetSelects() {
    this.setOptionalSelectValue("collisionPresetInput", this.matchCollisionPreset());
    this.setOptionalSelectValue("renderPresetInput", this.matchRenderPreset());
  }

  matchCollisionPreset() {
    if (!this.config.collisionEnabled) {
      return "off";
    }
    if (
      this.config.collisionRadiusScale === 1.35
      && this.config.collisionStiffness === 0.45
      && this.config.collisionDamping === 0.45
      && this.config.collisionPasses === 2
    ) {
      return "cloth";
    }
    if (
      this.config.collisionRadiusScale === 1.5
      && this.config.collisionStiffness === 0.6
      && this.config.collisionDamping === 0.65
      && this.config.collisionPasses === 4
    ) {
      return "robust";
    }
    return "custom";
  }

  matchRenderPreset() {
    if (this.config.showDiagnostics || this.config.showSurfaceEdges || this.config.showCollisionDebug) {
      return "debug";
    }
    if (this.config.showSurfaces && !this.config.showAtoms && !this.config.showBonds) {
      return "cloth";
    }
    if (!this.config.showSurfaces && this.config.showAtoms && this.config.showBonds) {
      return "atoms";
    }
    return "custom";
  }

  read() {
    this.config.width = Math.round(window.Atoms.readNumber(document.getElementById(this.ids.width).value, this.config.width, 2, 18));
    this.config.height = Math.round(window.Atoms.readNumber(document.getElementById(this.ids.height).value, this.config.height, 2, 18));
    this.config.depth = Math.round(window.Atoms.readNumber(document.getElementById(this.ids.depth).value, this.config.depth, 1, 18));
    this.config.restLength = window.Atoms.readNumber(document.getElementById(this.ids.restLength).value, this.config.restLength, 24, 120);
    this.config.atomRadius = window.Atoms.readNumber(document.getElementById(this.ids.atomRadius).value, this.config.atomRadius, 3, 18);
    this.config.scenePreset = document.getElementById(this.ids.scenePreset).value;
    this.config.material = document.getElementById(this.ids.material).value;
    this.config.physicsMode = window.Atoms.SolverMode.normalize(document.getElementById(this.ids.physicsMode).value);
    this.config.stiffness = window.Atoms.readNumber(document.getElementById(this.ids.stiffness).value, this.config.stiffness, 0.02, 1);
    this.config.shearStiffness = window.Atoms.readNumber(document.getElementById(this.ids.shearStiffness).value, this.config.shearStiffness, 0, 1);
    this.config.springDamping = window.Atoms.readNumber(document.getElementById(this.ids.springDamping).value, this.config.springDamping, 0, 0.8);
    this.config.shearDamping = window.Atoms.readNumber(document.getElementById(this.ids.shearDamping).value, this.config.shearDamping, 0, 0.8);
    this.config.bendStiffness = window.Atoms.readNumber(document.getElementById(this.ids.bendStiffness).value, this.config.bendStiffness, 0, 1);
    this.config.bendDamping = window.Atoms.readNumber(document.getElementById(this.ids.bendDamping).value, this.config.bendDamping, 0, 0.8);
    this.config.atomMass = window.Atoms.readNumber(document.getElementById(this.ids.atomMass).value, this.config.atomMass, 0.1, 10);
    this.config.releaseEnergy = window.Atoms.readNumber(document.getElementById(this.ids.releaseEnergy).value, this.config.releaseEnergy, 0, 1.5);
    this.config.dragStrength = window.Atoms.readNumber(document.getElementById(this.ids.dragStrength).value, this.config.dragStrength, 0.02, 1);
    this.config.mouseStiffness = window.Atoms.readNumber(document.getElementById(this.ids.mouseStiffness).value, this.config.mouseStiffness, 0, 8);
    this.config.mouseDamping = window.Atoms.readNumber(document.getElementById(this.ids.mouseDamping).value, this.config.mouseDamping, 0, 4);
    this.config.collisionEnabled = document.getElementById(this.ids.collisionEnabled).checked;
    this.config.collisionRadiusScale = window.Atoms.readNumber(document.getElementById(this.ids.collisionRadiusScale).value, this.config.collisionRadiusScale, 0.5, 4);
    this.config.collisionStiffness = window.Atoms.readNumber(document.getElementById(this.ids.collisionStiffness).value, this.config.collisionStiffness, 0, 1);
    this.config.collisionDamping = window.Atoms.readNumber(document.getElementById(this.ids.collisionDamping).value, this.config.collisionDamping, 0, 1);
    this.config.collisionPasses = Math.round(window.Atoms.readNumber(document.getElementById(this.ids.collisionPasses).value, this.config.collisionPasses, 1, 6));
    this.config.allowCornerPinEditing = document.getElementById(this.ids.allowCornerPinEditing).checked;
    this.config.gravityEnabled = document.getElementById(this.ids.gravityEnabled).checked;
    this.config.gravityStrength = window.Atoms.readNumber(document.getElementById(this.ids.gravityStrength).value, this.config.gravityStrength, 0, 1.5);
    this.config.windProfile = document.getElementById(this.ids.windProfile).value;
    this.config.windEnabled = document.getElementById(this.ids.windEnabled).checked;
    this.config.windDirection = document.getElementById(this.ids.windDirection).value;
    this.config.windStrength = window.Atoms.readNumber(document.getElementById(this.ids.windStrength).value, this.config.windStrength, 0, 3);
    this.config.windTurbulence = window.Atoms.readNumber(document.getElementById(this.ids.windTurbulence).value, this.config.windTurbulence, 0, 2);
    this.config.windScale = window.Atoms.readNumber(document.getElementById(this.ids.windScale).value, this.config.windScale, 40, 600);
    this.config.windSpeed = window.Atoms.readNumber(document.getElementById(this.ids.windSpeed).value, this.config.windSpeed, 0, 8);
    this.config.windDrag = window.Atoms.readNumber(document.getElementById(this.ids.windDrag).value, this.config.windDrag, 0, 2);
    this.config.windFlutter = window.Atoms.readNumber(document.getElementById(this.ids.windFlutter).value, this.config.windFlutter, 0, 2);
    this.config.windResponse = window.Atoms.readNumber(document.getElementById(this.ids.windResponse).value, this.config.windResponse, 0, 2);
    this.config.damping = window.Atoms.readNumber(document.getElementById(this.ids.damping).value, this.config.damping, 0.9, 0.9995);
    this.config.iterations = Math.round(window.Atoms.readNumber(document.getElementById(this.ids.iterations).value, this.config.iterations, 1, 20));
    this.config.physicsRate = Math.round(window.Atoms.readNumber(document.getElementById(this.ids.physicsRate).value, this.config.physicsRate, 30, 240));
    this.config.fastBending = document.getElementById(this.ids.fastBending).checked;
    this.config.fastLargeGridAtoms = document.getElementById(this.ids.fastLargeGridAtoms).checked;
    this.config.showAtoms = document.getElementById(this.ids.showAtoms).checked;
    this.config.showBonds = document.getElementById(this.ids.showBonds).checked;
    this.config.sortBonds = document.getElementById(this.ids.sortBonds).checked;
    this.config.sortAtoms = document.getElementById(this.ids.sortAtoms).checked;
    this.config.simpleBondColors = document.getElementById(this.ids.simpleBondColors).checked;
    this.config.showDiagnostics = document.getElementById(this.ids.showDiagnostics).checked;
    this.config.showSurfaces = document.getElementById(this.ids.showSurfaces).checked;
    this.config.surfaceRenderer = document.getElementById(this.ids.surfaceRenderer).value;
    this.config.showSurfaceEdges = document.getElementById(this.ids.showSurfaceEdges).checked;
    this.config.surfaceSide = document.getElementById(this.ids.surfaceSide).value;
    this.config.surfaceStyle = document.getElementById(this.ids.surfaceStyle).value;
    this.config.mirrorBackTexture = document.getElementById(this.ids.mirrorBackTexture).checked;
    this.config.flipBackTexture = document.getElementById(this.ids.flipBackTexture).checked;
    this.config.surfaceOpacity = window.Atoms.readNumber(document.getElementById(this.ids.surfaceOpacity).value, this.config.surfaceOpacity, 0, 1);
    this.config.surfaceLighting = document.getElementById(this.ids.surfaceLighting).checked;
    this.config.surfaceLightingModel = document.getElementById(this.ids.surfaceLightingModel).value;
    this.config.surfaceFabricEnabled = document.getElementById(this.ids.surfaceFabricEnabled).checked;
    this.config.fabricWeaveStrength = window.Atoms.readNumber(document.getElementById(this.ids.fabricWeaveStrength).value, this.config.fabricWeaveStrength, 0, 0.25);
    this.config.surfaceFoldShadingEnabled = document.getElementById(this.ids.surfaceFoldShadingEnabled).checked;
    this.config.foldShadingStrength = window.Atoms.readNumber(document.getElementById(this.ids.foldShadingStrength).value, this.config.foldShadingStrength, 0, 0.5);
    this.config.sunAzimuth = window.Atoms.readNumber(document.getElementById(this.ids.sunAzimuth).value, this.config.sunAzimuth, -180, 180);
    this.config.sunElevation = window.Atoms.readNumber(document.getElementById(this.ids.sunElevation).value, this.config.sunElevation, -80, 80);
    this.config.sunIntensity = window.Atoms.readNumber(document.getElementById(this.ids.sunIntensity).value, this.config.sunIntensity, 0, 2);
    this.config.sunAmbient = window.Atoms.readNumber(document.getElementById(this.ids.sunAmbient).value, this.config.sunAmbient, 0, 1);
    this.config.showWindField = document.getElementById(this.ids.showWindField).checked;
    this.config.showCollisionDebug = document.getElementById(this.ids.showCollisionDebug).checked;
    this.config.atomDepthShading = window.Atoms.readNumber(document.getElementById(this.ids.atomDepthShading).value, this.config.atomDepthShading, 0, 1);
    this.config.energyUpdateRate = Math.round(window.Atoms.readNumber(document.getElementById(this.ids.energyUpdateRate).value, this.config.energyUpdateRate, 1, 10));
  }
};
