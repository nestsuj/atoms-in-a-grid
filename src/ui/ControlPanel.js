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
      material: "materialInput",
      physicsMode: "physicsModeInput",
      stiffness: "stiffnessInput",
      shearStiffness: "shearStiffnessInput",
      springDamping: "springDampingInput",
      bendStiffness: "bendStiffnessInput",
      atomMass: "atomMassInput",
      releaseEnergy: "releaseEnergyInput",
      dragStrength: "dragStrengthInput",
      mouseStiffness: "mouseStiffnessInput",
      mouseDamping: "mouseDampingInput",
      allowCornerPinEditing: "allowCornerPinEditingInput",
      gravityEnabled: "gravityEnabledInput",
      gravityStrength: "gravityStrengthInput",
      damping: "dampingInput",
      iterations: "iterationsInput",
      physicsRate: "physicsRateInput",
      fastBending: "fastBendingInput",
      fastLargeGridAtoms: "fastLargeGridAtomsInput",
      sortBonds: "sortBondsInput",
      sortAtoms: "sortAtomsInput",
      simpleBondColors: "simpleBondColorsInput",
      energyUpdateRate: "energyUpdateRateInput",
    };
    this.bind();
    this.applyMaterial(this.config.material);
    this.write();
  }

  bind() {
    for (const [key, id] of Object.entries(this.ids)) {
      const input = document.getElementById(id);
      const handleInput = () => {
        if (key === "material") {
          this.applyMaterial(input.value);
          this.write();
          this.handlers.onMaterialChange();
          return;
        }

        this.read();
        if (window.Atoms.materialKeys.includes(key)) {
          this.config.material = "custom";
          document.getElementById(this.ids.material).value = "custom";
        }

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

    document.getElementById("resetButton").addEventListener("click", this.handlers.onReset);
    document.getElementById("clearUserPinsButton").addEventListener("click", this.handlers.onClearUserPins);
    document.getElementById("pauseButton").addEventListener("click", (event) => {
      const paused = this.handlers.onTogglePause();
      event.currentTarget.textContent = paused ? "Resume" : "Pause";
    });
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

  write() {
    for (const [key, id] of Object.entries(this.ids)) {
      const input = document.getElementById(id);
      if (input.type === "checkbox") {
        input.checked = Boolean(this.config[key]);
      } else {
        input.value = this.config[key];
      }
    }
  }

  read() {
    this.config.width = Math.round(window.Atoms.readNumber(document.getElementById(this.ids.width).value, this.config.width, 2, 18));
    this.config.height = Math.round(window.Atoms.readNumber(document.getElementById(this.ids.height).value, this.config.height, 2, 18));
    this.config.depth = Math.round(window.Atoms.readNumber(document.getElementById(this.ids.depth).value, this.config.depth, 1, 18));
    this.config.restLength = window.Atoms.readNumber(document.getElementById(this.ids.restLength).value, this.config.restLength, 24, 120);
    this.config.atomRadius = window.Atoms.readNumber(document.getElementById(this.ids.atomRadius).value, this.config.atomRadius, 3, 18);
    this.config.material = document.getElementById(this.ids.material).value;
    this.config.physicsMode = document.getElementById(this.ids.physicsMode).value;
    this.config.stiffness = window.Atoms.readNumber(document.getElementById(this.ids.stiffness).value, this.config.stiffness, 0.02, 1);
    this.config.shearStiffness = window.Atoms.readNumber(document.getElementById(this.ids.shearStiffness).value, this.config.shearStiffness, 0, 1);
    this.config.springDamping = window.Atoms.readNumber(document.getElementById(this.ids.springDamping).value, this.config.springDamping, 0, 0.8);
    this.config.bendStiffness = window.Atoms.readNumber(document.getElementById(this.ids.bendStiffness).value, this.config.bendStiffness, 0, 1);
    this.config.atomMass = window.Atoms.readNumber(document.getElementById(this.ids.atomMass).value, this.config.atomMass, 0.1, 10);
    this.config.releaseEnergy = window.Atoms.readNumber(document.getElementById(this.ids.releaseEnergy).value, this.config.releaseEnergy, 0, 1.5);
    this.config.dragStrength = window.Atoms.readNumber(document.getElementById(this.ids.dragStrength).value, this.config.dragStrength, 0.02, 1);
    this.config.mouseStiffness = window.Atoms.readNumber(document.getElementById(this.ids.mouseStiffness).value, this.config.mouseStiffness, 0, 8);
    this.config.mouseDamping = window.Atoms.readNumber(document.getElementById(this.ids.mouseDamping).value, this.config.mouseDamping, 0, 4);
    this.config.allowCornerPinEditing = document.getElementById(this.ids.allowCornerPinEditing).checked;
    this.config.gravityEnabled = document.getElementById(this.ids.gravityEnabled).checked;
    this.config.gravityStrength = window.Atoms.readNumber(document.getElementById(this.ids.gravityStrength).value, this.config.gravityStrength, 0, 1.5);
    this.config.damping = window.Atoms.readNumber(document.getElementById(this.ids.damping).value, this.config.damping, 0.9, 0.9995);
    this.config.iterations = Math.round(window.Atoms.readNumber(document.getElementById(this.ids.iterations).value, this.config.iterations, 1, 20));
    this.config.physicsRate = Math.round(window.Atoms.readNumber(document.getElementById(this.ids.physicsRate).value, this.config.physicsRate, 30, 240));
    this.config.fastBending = document.getElementById(this.ids.fastBending).checked;
    this.config.fastLargeGridAtoms = document.getElementById(this.ids.fastLargeGridAtoms).checked;
    this.config.sortBonds = document.getElementById(this.ids.sortBonds).checked;
    this.config.sortAtoms = document.getElementById(this.ids.sortAtoms).checked;
    this.config.simpleBondColors = document.getElementById(this.ids.simpleBondColors).checked;
    this.config.energyUpdateRate = Math.round(window.Atoms.readNumber(document.getElementById(this.ids.energyUpdateRate).value, this.config.energyUpdateRate, 1, 10));
  }
};
