window.Atoms = window.Atoms || {};

window.Atoms.CanvasRenderer = class CanvasRenderer {
  constructor(canvas, config) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.config = config;
    this.pixelRatio = 1;
    this.cssWidth = 0;
    this.cssHeight = 0;
  }

  resize(camera) {
    const bounds = this.canvas.getBoundingClientRect();
    this.pixelRatio = window.devicePixelRatio || 1;
    this.cssWidth = bounds.width;
    this.cssHeight = bounds.height;
    this.canvas.width = Math.max(1, Math.floor(bounds.width * this.pixelRatio));
    this.canvas.height = Math.max(1, Math.floor(bounds.height * this.pixelRatio));
    this.ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    camera.resize(bounds.width, bounds.height);
  }

  ensureSize(camera) {
    const bounds = this.canvas.getBoundingClientRect();
    const pixelRatio = window.devicePixelRatio || 1;
    const widthChanged = Math.abs(bounds.width - this.cssWidth) > 0.5;
    const heightChanged = Math.abs(bounds.height - this.cssHeight) > 0.5;
    const ratioChanged = pixelRatio !== this.pixelRatio;

    if (widthChanged || heightChanged || ratioChanged) {
      this.resize(camera);
    }
  }

  render(lattice, camera) {
    this.ensureSize(camera);
    const width = this.canvas.width / this.pixelRatio;
    const height = this.canvas.height / this.pixelRatio;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, width, height);
    this.drawBackground(ctx, width, height);

    const projectedAtoms = lattice.atoms.map((atom) => ({
      atom,
      screen: window.Atoms.project(atom.position, camera),
    }));
    const atomById = new Map(projectedAtoms.map((entry) => [entry.atom.id, entry]));

    const minDepth = Math.min(...projectedAtoms.map((entry) => entry.screen.depth));
    const maxDepth = Math.max(...projectedAtoms.map((entry) => entry.screen.depth));
    const depthRange = Math.max(1, maxDepth - minDepth);

    const bondEntries = lattice.bonds.map((bond) => ({
      bond,
      a: atomById.get(bond.a.id).screen,
      b: atomById.get(bond.b.id).screen,
      depth: (atomById.get(bond.a.id).screen.depth + atomById.get(bond.b.id).screen.depth) * 0.5,
      strain: (window.Atoms.distance(bond.a.position, bond.b.position) - bond.restLength) / bond.restLength,
    })).sort((a, b) => a.depth - b.depth);

    for (const entry of bondEntries) {
      const depthShade = (entry.depth - minDepth) / depthRange;
      this.drawBond(ctx, entry, depthShade);
    }

    projectedAtoms.sort((a, b) => a.screen.depth - b.screen.depth);
    for (const entry of projectedAtoms) {
      const depthShade = (entry.screen.depth - minDepth) / depthRange;
      this.drawAtom(ctx, entry, depthShade);
    }
  }

  drawBackground(ctx, width, height) {
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "#171d26");
    gradient.addColorStop(1, "#10131a");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }

  drawBond(ctx, entry, depthShade) {
    ctx.beginPath();
    ctx.moveTo(entry.a.x, entry.a.y);
    ctx.lineTo(entry.b.x, entry.b.y);
    const strain = Math.min(1, Math.abs(entry.strain) * 5);
    ctx.lineWidth = 1.8 + depthShade * 2.1 + strain * 3.2;
    ctx.lineCap = "round";
    ctx.strokeStyle = window.Atoms.bondColor(depthShade, entry.strain);
    ctx.stroke();
  }

  drawAtom(ctx, entry, depthShade) {
    const radius = this.config.atomRadius * (0.78 + depthShade * 0.46) * this.config.zoomVisualScale;
    const atom = entry.atom;
    const x = entry.screen.x;
    const y = entry.screen.y;
    const gradient = ctx.createRadialGradient(
      x - radius * 0.35,
      y - radius * 0.45,
      radius * 0.15,
      x,
      y,
      radius,
    );
    gradient.addColorStop(0, atom.fixed ? "#ffffff" : "#efffff");
    gradient.addColorStop(0.25, window.Atoms.atomColor(atom, depthShade));
    gradient.addColorStop(1, atom.selected ? "#fff0a6" : "#223041");

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();

    if (atom.fixed || atom.selected) {
      ctx.lineWidth = atom.selected ? 2.5 : 1.5;
      ctx.strokeStyle = atom.selected ? "#ffe182" : "rgba(255, 255, 255, 0.7)";
      ctx.stroke();
    }
  }
};
