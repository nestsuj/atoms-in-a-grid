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
      stiffness: "stiffnessInput",
      bendStiffness: "bendStiffnessInput",
      releaseEnergy: "releaseEnergyInput",
      damping: "dampingInput",
      iterations: "iterationsInput",
      fastBending: "fastBendingInput",
      fastLargeGridAtoms: "fastLargeGridAtomsInput",
    };
    this.bind();
    this.write();
  }

  bind() {
    for (const [key, id] of Object.entries(this.ids)) {
      const input = document.getElementById(id);
      input.addEventListener("input", () => {
        this.read();
        if (["width", "height", "depth", "restLength"].includes(key)) {
          this.handlers.onRebuild();
        } else {
          this.handlers.onConfigure();
        }
      });
    }

    document.getElementById("resetButton").addEventListener("click", this.handlers.onReset);
    document.getElementById("pauseButton").addEventListener("click", (event) => {
      const paused = this.handlers.onTogglePause();
      event.currentTarget.textContent = paused ? "Resume" : "Pause";
    });
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
    this.config.depth = Math.round(window.Atoms.readNumber(document.getElementById(this.ids.depth).value, this.config.depth, 2, 18));
    this.config.restLength = window.Atoms.readNumber(document.getElementById(this.ids.restLength).value, this.config.restLength, 24, 120);
    this.config.atomRadius = window.Atoms.readNumber(document.getElementById(this.ids.atomRadius).value, this.config.atomRadius, 3, 18);
    this.config.stiffness = window.Atoms.readNumber(document.getElementById(this.ids.stiffness).value, this.config.stiffness, 0.02, 1);
    this.config.bendStiffness = window.Atoms.readNumber(document.getElementById(this.ids.bendStiffness).value, this.config.bendStiffness, 0, 1);
    this.config.releaseEnergy = window.Atoms.readNumber(document.getElementById(this.ids.releaseEnergy).value, this.config.releaseEnergy, 0, 1.5);
    this.config.damping = window.Atoms.readNumber(document.getElementById(this.ids.damping).value, this.config.damping, 0.9, 0.9995);
    this.config.iterations = Math.round(window.Atoms.readNumber(document.getElementById(this.ids.iterations).value, this.config.iterations, 1, 20));
    this.config.fastBending = document.getElementById(this.ids.fastBending).checked;
    this.config.fastLargeGridAtoms = document.getElementById(this.ids.fastLargeGridAtoms).checked;
  }
};
