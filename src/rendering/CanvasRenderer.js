window.Atoms = window.Atoms || {};

window.Atoms.CanvasRenderer = class CanvasRenderer {
  constructor(canvas, config) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.config = config;
    this.pixelRatio = 1;
    this.cssWidth = 0;
    this.cssHeight = 0;
    this.projectedAtoms = [];
    this.bondEntries = [];
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

    const basis = camera.getBasis();
    const projectedAtoms = this.prepareAtomEntries(lattice, camera, basis);
    let minDepth = Infinity;
    let maxDepth = -Infinity;

    for (let i = 0; i < projectedAtoms.length; i += 1) {
      const depth = projectedAtoms[i].screen.depth;
      if (depth < minDepth) minDepth = depth;
      if (depth > maxDepth) maxDepth = depth;
    }

    const depthRange = Math.max(1, maxDepth - minDepth);
    const bondEntries = this.prepareBondEntries(lattice, projectedAtoms);
    if (this.config.sortBonds) {
      bondEntries.sort((a, b) => a.depth - b.depth);
    }

    ctx.lineCap = "round";
    for (const entry of bondEntries) {
      const depthShade = (entry.depth - minDepth) / depthRange;
      this.drawBond(ctx, entry, depthShade);
    }

    if (this.config.sortAtoms) {
      projectedAtoms.sort((a, b) => a.screen.depth - b.screen.depth);
    }
    const simpleAtoms = this.config.fastLargeGridAtoms && lattice.atoms.length > 1200;
    for (const entry of projectedAtoms) {
      const rawDepthShade = (entry.screen.depth - minDepth) / depthRange;
      const depthShade = 0.5 + (rawDepthShade - 0.5) * this.config.atomDepthShading;
      this.drawAtom(ctx, entry, depthShade, simpleAtoms);
    }

    this.drawWindIndicator(ctx, camera, basis, width, height);
  }

  prepareAtomEntries(lattice, camera, basis) {
    const atoms = lattice.atoms;
    this.projectedAtoms.length = atoms.length;

    for (let i = 0; i < atoms.length; i += 1) {
      let entry = this.projectedAtoms[i];
      if (!entry) {
        entry = { atom: null, screen: { x: 0, y: 0, depth: 0 } };
        this.projectedAtoms[i] = entry;
      }

      entry.atom = atoms[i];
      window.Atoms.projectWithBasis(atoms[i].position, camera, basis, entry.screen);
    }

    return this.projectedAtoms;
  }

  prepareBondEntries(lattice, projectedAtoms) {
    const bonds = lattice.bonds;
    this.bondEntries.length = bonds.length;

    for (let i = 0; i < bonds.length; i += 1) {
      const bond = bonds[i];
      const a = projectedAtoms[bond.a.id].screen;
      const b = projectedAtoms[bond.b.id].screen;
      const needsStrain = !this.config.simpleBondColors;
      const deltaX = needsStrain ? bond.b.position.x - bond.a.position.x : 0;
      const deltaY = needsStrain ? bond.b.position.y - bond.a.position.y : 0;
      const deltaZ = needsStrain ? bond.b.position.z - bond.a.position.z : 0;
      let entry = this.bondEntries[i];

      if (!entry) {
        entry = { bond: null, a: null, b: null, depth: 0, strain: 0 };
        this.bondEntries[i] = entry;
      }

      entry.bond = bond;
      entry.a = a;
      entry.b = b;
      entry.depth = (a.depth + b.depth) * 0.5;
      entry.strain = needsStrain
        ? (Math.sqrt(deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ) - bond.restLength) / bond.restLength
        : 0;
    }

    return this.bondEntries;
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
    const rawStrain = this.config.simpleBondColors ? 0 : Math.min(1, Math.abs(entry.strain) * 2.2);
    const strain = rawStrain * rawStrain * (3 - 2 * rawStrain);
    ctx.lineWidth = 1.8 + depthShade * 2.1 + strain * 2.7;
    ctx.strokeStyle = this.config.simpleBondColors
      ? window.Atoms.neutralBondColor(depthShade)
      : window.Atoms.bondColor(depthShade, entry.strain);
    ctx.stroke();
  }

  drawAtom(ctx, entry, depthShade, simple) {
    const radius = this.config.atomRadius * (0.78 + depthShade * 0.46) * this.config.zoomVisualScale;
    const atom = entry.atom;
    const x = entry.screen.x;
    const y = entry.screen.y;
    let fillStyle;

    if (simple) {
      fillStyle = atom.selected ? "#ffe182" : window.Atoms.atomColor(atom, depthShade);
    } else {
      fillStyle = ctx.createRadialGradient(
        x - radius * 0.35,
        y - radius * 0.45,
        radius * 0.15,
        x,
        y,
        radius,
      );
      fillStyle.addColorStop(0, atom.fixed ? "#ffffff" : "#efffff");
      fillStyle.addColorStop(0.25, window.Atoms.atomColor(atom, depthShade));
      fillStyle.addColorStop(1, atom.selected ? "#fff0a6" : window.Atoms.atomRimColor(depthShade));
    }

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = fillStyle;
    ctx.fill();

    if (atom.fixed || atom.selected) {
      ctx.lineWidth = atom.selected ? 2.5 : 1.5;
      ctx.strokeStyle = atom.selected ? "#ffe182" : "rgba(255, 255, 255, 0.7)";
      ctx.stroke();
    }
  }

  drawWindIndicator(ctx, camera, basis, width, height) {
    if (!this.config.windEnabled || this.config.windStrength <= 0) {
      return;
    }

    const direction = this.windDirectionVector(this.config.windDirection);
    const projectedX = direction.x * basis.right.x + direction.y * basis.right.y + direction.z * basis.right.z;
    const projectedY = -(direction.x * basis.up.x + direction.y * basis.up.y + direction.z * basis.up.z);
    const length = Math.hypot(projectedX, projectedY);

    if (length < 0.000001) {
      return;
    }

    const arrowLength = 42;
    const startX = Math.max(24, Math.min(width - 92, 34));
    const startY = Math.max(24, height - 38);
    const endX = startX + (projectedX / length) * arrowLength;
    const endY = startY + (projectedY / length) * arrowLength;
    const angle = Math.atan2(endY - startY, endX - startX);

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(143, 231, 255, 0.92)";
    ctx.fillStyle = "rgba(143, 231, 255, 0.92)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(endX, endY);
    ctx.lineTo(endX - Math.cos(angle - 0.55) * 10, endY - Math.sin(angle - 0.55) * 10);
    ctx.lineTo(endX - Math.cos(angle + 0.55) * 10, endY - Math.sin(angle + 0.55) * 10);
    ctx.closePath();
    ctx.fill();
    ctx.font = "11px system-ui, sans-serif";
    ctx.fillText("wind", startX, startY - 8);
    ctx.restore();
  }

  windDirectionVector(value) {
    switch (value) {
      case "z-": return { x: 0, y: 0, z: -1 };
      case "x+": return { x: 1, y: 0, z: 0 };
      case "x-": return { x: -1, y: 0, z: 0 };
      case "y+": return { x: 0, y: 1, z: 0 };
      case "y-": return { x: 0, y: -1, z: 0 };
      case "z+":
      default: return { x: 0, y: 0, z: 1 };
    }
  }
};
