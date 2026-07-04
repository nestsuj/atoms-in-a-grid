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
    this.surfaceEntries = [];
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

  render(lattice, camera, solver) {
    this.ensureSize(camera);
    const width = this.canvas.width / this.pixelRatio;
    const height = this.canvas.height / this.pixelRatio;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, width, height);
    this.drawBackground(ctx, width, height);

    const basis = camera.getBasis();
    this.drawWindField(ctx, lattice, camera, basis);
    const projectedAtoms = this.prepareAtomEntries(lattice, camera, basis);
    let minDepth = Infinity;
    let maxDepth = -Infinity;

    for (let i = 0; i < projectedAtoms.length; i += 1) {
      const depth = projectedAtoms[i].screen.depth;
      if (depth < minDepth) minDepth = depth;
      if (depth > maxDepth) maxDepth = depth;
    }

    const depthRange = Math.max(1, maxDepth - minDepth);
    const surfaceEntries = this.prepareSurfaceEntries(lattice, projectedAtoms);
    if (this.config.sortBonds) {
      surfaceEntries.sort((a, b) => a.depth - b.depth);
    }

    this.drawSurfaces(ctx, surfaceEntries, minDepth, depthRange);

    const bondEntries = this.prepareBondEntries(lattice, projectedAtoms);
    if (this.config.sortBonds) {
      bondEntries.sort((a, b) => a.depth - b.depth);
    }

    ctx.lineCap = "round";
    if (this.config.showBonds) {
      for (const entry of bondEntries) {
        const depthShade = (entry.depth - minDepth) / depthRange;
        this.drawBond(ctx, entry, depthShade);
      }
    }

    this.drawCollisionDebug(ctx, lattice, projectedAtoms, camera, solver);

    if (this.config.sortAtoms) {
      projectedAtoms.sort((a, b) => a.screen.depth - b.screen.depth);
    }
    if (this.config.showAtoms) {
      const simpleAtoms = this.config.fastLargeGridAtoms && lattice.atoms.length > 1200;
      for (const entry of projectedAtoms) {
        const rawDepthShade = (entry.screen.depth - minDepth) / depthRange;
        const depthShade = 0.5 + (rawDepthShade - 0.5) * this.config.atomDepthShading;
        this.drawAtom(ctx, entry, depthShade, simpleAtoms);
      }
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

  prepareSurfaceEntries(lattice, projectedAtoms) {
    const panels = lattice.surfacePanels || [];
    const surfaceSide = this.config.surfaceSide || "both";
    const frontImageOnly = this.config.surfaceStyle === "image"
      && this.config.surfaceTextureImage
      && surfaceSide === "both";
    let entryIndex = 0;

    for (let i = 0; i < panels.length; i += 1) {
      const panel = panels[i];

      if (surfaceSide !== "both" && panel.side !== surfaceSide) {
        continue;
      }

      if (frontImageOnly && panel.side === "back") {
        continue;
      }

      let entry = this.surfaceEntries[entryIndex];

      if (!entry) {
        entry = { panel: null, a: null, b: null, c: null, d: null, depth: 0 };
        this.surfaceEntries[entryIndex] = entry;
      }

      entry.panel = panel;
      entry.a = projectedAtoms[panel.a.id].screen;
      entry.b = projectedAtoms[panel.b.id].screen;
      entry.c = projectedAtoms[panel.c.id].screen;
      entry.d = projectedAtoms[panel.d.id].screen;
      entry.depth = (entry.a.depth + entry.b.depth + entry.c.depth + entry.d.depth) * 0.25;
      entryIndex += 1;
    }

    this.surfaceEntries.length = entryIndex;
    return this.surfaceEntries;
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

  drawSurfaces(ctx, surfaceEntries, minDepth, depthRange) {
    if (!this.config.showSurfaces || this.config.surfaceOpacity <= 0) {
      return;
    }

    ctx.save();
    ctx.lineJoin = "round";

    for (const entry of surfaceEntries) {
      const depthShade = (entry.depth - minDepth) / depthRange;
      this.drawSurfacePanel(ctx, entry, depthShade);
    }

    ctx.restore();
  }

  drawSurfacePanel(ctx, entry, depthShade) {
    const opacity = window.Atoms.clamp(this.config.surfaceOpacity, 0, 1);
    const light = 0.65 + depthShade * 0.35;
    const image = this.config.surfaceTextureImage;

    if (this.config.surfaceStyle === "image" && entry.panel.side === "front" && image) {
      this.drawTexturedSurfacePanel(ctx, entry, image, opacity, light);
      return;
    }

    const fillAlpha = opacity * (0.34 + depthShade * 0.16);
    const strokeAlpha = opacity * 0.45;
    const color = this.surfaceColor(entry.panel, light);

    ctx.beginPath();
    ctx.moveTo(entry.a.x, entry.a.y);
    ctx.lineTo(entry.b.x, entry.b.y);
    ctx.lineTo(entry.c.x, entry.c.y);
    ctx.lineTo(entry.d.x, entry.d.y);
    ctx.closePath();
    ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${fillAlpha.toFixed(3)})`;
    ctx.fill();
    ctx.lineWidth = 0.7;
    ctx.strokeStyle = `rgba(${color.strokeR}, ${color.strokeG}, ${color.strokeB}, ${strokeAlpha.toFixed(3)})`;
    ctx.stroke();
  }

  drawTexturedSurfacePanel(ctx, entry, image, opacity, light) {
    const panel = entry.panel;
    const sx0 = panel.u0 * image.naturalWidth;
    const sy0 = panel.v0 * image.naturalHeight;
    const sx1 = panel.u1 * image.naturalWidth;
    const sy1 = panel.v1 * image.naturalHeight;

    ctx.save();
    ctx.globalAlpha *= opacity;
    this.drawImageTriangle(
      ctx,
      image,
      { x: sx0, y: sy0 },
      { x: sx1, y: sy0 },
      { x: sx1, y: sy1 },
      entry.a,
      entry.b,
      entry.c,
    );
    this.drawImageTriangle(
      ctx,
      image,
      { x: sx0, y: sy0 },
      { x: sx1, y: sy1 },
      { x: sx0, y: sy1 },
      entry.a,
      entry.c,
      entry.d,
    );
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(entry.a.x, entry.a.y);
    ctx.lineTo(entry.b.x, entry.b.y);
    ctx.lineTo(entry.c.x, entry.c.y);
    ctx.lineTo(entry.d.x, entry.d.y);
    ctx.closePath();
    ctx.lineWidth = 0.55;
    ctx.strokeStyle = `rgba(230, 246, 250, ${(opacity * 0.22).toFixed(3)})`;
    ctx.stroke();
    ctx.restore();
  }

  drawImageTriangle(ctx, image, s0, s1, s2, d0, d1, d2) {
    const denominator = s0.x * (s1.y - s2.y)
      + s1.x * (s2.y - s0.y)
      + s2.x * (s0.y - s1.y);

    if (Math.abs(denominator) < 0.000001) {
      return;
    }

    const a = (d0.x * (s1.y - s2.y) + d1.x * (s2.y - s0.y) + d2.x * (s0.y - s1.y)) / denominator;
    const b = (d0.y * (s1.y - s2.y) + d1.y * (s2.y - s0.y) + d2.y * (s0.y - s1.y)) / denominator;
    const c = (d0.x * (s2.x - s1.x) + d1.x * (s0.x - s2.x) + d2.x * (s1.x - s0.x)) / denominator;
    const d = (d0.y * (s2.x - s1.x) + d1.y * (s0.x - s2.x) + d2.y * (s1.x - s0.x)) / denominator;
    const e = (d0.x * (s1.x * s2.y - s2.x * s1.y)
      + d1.x * (s2.x * s0.y - s0.x * s2.y)
      + d2.x * (s0.x * s1.y - s1.x * s0.y)) / denominator;
    const f = (d0.y * (s1.x * s2.y - s2.x * s1.y)
      + d1.y * (s2.x * s0.y - s0.x * s2.y)
      + d2.y * (s0.x * s1.y - s1.x * s0.y)) / denominator;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(d0.x, d0.y);
    ctx.lineTo(d1.x, d1.y);
    ctx.lineTo(d2.x, d2.y);
    ctx.closePath();
    ctx.clip();
    ctx.transform(a, b, c, d, e, f);
    ctx.drawImage(image, 0, 0);
    ctx.restore();
  }

  surfaceColor(panel, light) {
    const style = this.config.surfaceStyle || "tint";

    if (style === "image") {
      if (panel.side === "front") {
        return this.uvCheckerColor(panel, light);
      }

      return this.surfaceTintColor(panel.side, light);
    }

    if (style === "checker") {
      return this.uvCheckerColor(panel, light);
    }

    if (style === "stripes") {
      return this.uvStripeColor(panel, light);
    }

    return this.surfaceTintColor(panel.side, light);
  }

  uvCheckerColor(panel, light) {
    const u = (panel.u0 + panel.u1) * 0.5;
    const v = (panel.v0 + panel.v1) * 0.5;
    const checker = (Math.floor(u * 8) + Math.floor(v * 6)) % 2;
    const backScale = panel.side === "back" ? 0.78 : 1;
    const axisBoost = (u < 0.08 || v < 0.08) ? 34 : 0;
    const base = checker === 0
      ? { r: 70, g: 206, b: 222 }
      : { r: 245, g: 116, b: 91 };

    return {
      r: this.colorChannel((base.r + axisBoost) * light * backScale),
      g: this.colorChannel((base.g + axisBoost * 0.6) * light * backScale),
      b: this.colorChannel((base.b + axisBoost * 0.2) * light * backScale),
      strokeR: 230,
      strokeG: 246,
      strokeB: 250,
    };
  }

  uvStripeColor(panel, light) {
    const u = (panel.u0 + panel.u1) * 0.5;
    const stripe = Math.floor(u * 12) % 3;
    const backScale = panel.side === "back" ? 0.78 : 1;
    const base = stripe === 0
      ? { r: 238, g: 74, b: 70 }
      : stripe === 1
        ? { r: 238, g: 238, b: 226 }
        : { r: 66, g: 126, b: 222 };

    return {
      r: this.colorChannel(base.r * light * backScale),
      g: this.colorChannel(base.g * light * backScale),
      b: this.colorChannel(base.b * light * backScale),
      strokeR: 230,
      strokeG: 246,
      strokeB: 250,
    };
  }

  surfaceTintColor(side, light) {
    const tint = this.surfaceTint(side);
    return {
      r: this.colorChannel(tint.r + light * tint.lightR),
      g: this.colorChannel(tint.g + light * tint.lightG),
      b: this.colorChannel(tint.b + light * tint.lightB),
      strokeR: 170,
      strokeG: 238,
      strokeB: 247,
    };
  }

  colorChannel(value) {
    return Math.round(window.Atoms.clamp(value, 0, 255));
  }

  surfaceTint(side) {
    if (side === "back") {
      return { r: 80, g: 104, b: 164, lightR: 58, lightG: 58, lightB: 70 };
    }

    if (side === "front") {
      return { r: 42, g: 145, b: 166, lightR: 52, lightG: 70, lightB: 60 };
    }

    return { r: 68, g: 124, b: 146, lightR: 48, lightG: 62, lightB: 64 };
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

  drawCollisionDebug(ctx, lattice, projectedAtoms, camera, solver) {
    if (!this.config.showCollisionDebug || !this.config.collisionEnabled) {
      return;
    }

    const stats = solver ? solver.collisionStats : null;
    const activeAtoms = stats ? stats.activeAtoms : null;
    const collisionRadius = (lattice.atomRadius || this.config.atomRadius) * this.config.collisionRadiusScale * camera.zoom;
    const maxHalos = lattice.atoms.length > 1400 ? 1400 : lattice.atoms.length;
    const stride = Math.max(1, Math.ceil(lattice.atoms.length / maxHalos));

    ctx.save();
    ctx.lineWidth = 1;

    for (let i = 0; i < lattice.atoms.length; i += stride) {
      const atom = lattice.atoms[i];
      const entry = projectedAtoms[atom.id];
      const isActive = activeAtoms && activeAtoms.has(atom.id);

      if (!entry) {
        continue;
      }

      ctx.beginPath();
      ctx.arc(entry.screen.x, entry.screen.y, collisionRadius, 0, Math.PI * 2);
      ctx.strokeStyle = isActive
        ? "rgba(255, 145, 91, 0.66)"
        : "rgba(119, 231, 255, 0.11)";
      ctx.stroke();

      if (isActive) {
        ctx.beginPath();
        ctx.arc(entry.screen.x, entry.screen.y, collisionRadius * 0.42, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255, 145, 91, 0.18)";
        ctx.fill();
      }
    }

    if (activeAtoms) {
      for (const atomId of activeAtoms) {
        const entry = projectedAtoms[atomId];

        if (!entry) {
          continue;
        }

        ctx.beginPath();
        ctx.arc(entry.screen.x, entry.screen.y, collisionRadius, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(255, 145, 91, 0.78)";
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(entry.screen.x, entry.screen.y, collisionRadius * 0.42, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255, 145, 91, 0.2)";
        ctx.fill();
      }
    }

    ctx.restore();
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

  drawWindField(ctx, lattice, camera, basis) {
    if (!this.config.showWindField || !this.config.windEnabled || this.config.windStrength <= 0) {
      return;
    }

    const direction = this.windDirectionVector(this.config.windDirection);
    const columns = Math.min(9, Math.max(3, lattice.width));
    const rows = Math.min(6, Math.max(3, lattice.height));
    const minX = -((lattice.width - 1) * lattice.restLength) * 0.5;
    const minY = -((lattice.height - 1) * lattice.restLength) * 0.5;
    const z = lattice.depth === 1 ? 0 : ((lattice.depth - 1) * lattice.restLength) * 0.5;
    const time = this.config.windVisualizationTime || 0;

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const xRatio = columns === 1 ? 0.5 : column / (columns - 1);
        const yRatio = rows === 1 ? 0.5 : row / (rows - 1);
        const position = {
          x: minX + xRatio * (lattice.width - 1) * lattice.restLength,
          y: minY + yRatio * (lattice.height - 1) * lattice.restLength,
          z,
        };
        const exposure = lattice.depth === 1 ? 0.35 + 0.65 * xRatio : 1;
        const field = window.Atoms.WindField.sample(this.config, position, time);
        const flutter = window.Atoms.WindField.flutter(this.config, position, time);
        const strength = this.config.windStrength * exposure * window.Atoms.clamp(1 + this.config.windTurbulence * field + flutter, 0, 2.5);

        if (strength <= 0.001) {
          continue;
        }

        const start = window.Atoms.projectWithBasis(position, camera, basis);
        const end = window.Atoms.projectWithBasis({
          x: position.x + direction.x * this.config.restLength,
          y: position.y + direction.y * this.config.restLength,
          z: position.z + direction.z * this.config.restLength,
        }, camera, basis);
        const screenX = end.x - start.x;
        const screenY = end.y - start.y;
        const screenLength = Math.hypot(screenX, screenY);

        if (screenLength < 0.000001) {
          continue;
        }

        const amount = window.Atoms.clamp(strength / Math.max(0.2, this.config.windStrength * 1.8), 0, 1);
        const arrowLength = 12 + amount * 22;
        const endX = start.x + (screenX / screenLength) * arrowLength;
        const endY = start.y + (screenY / screenLength) * arrowLength;
        const angle = Math.atan2(endY - start.y, endX - start.x);
        const alpha = 0.12 + amount * 0.32;

        ctx.strokeStyle = `rgba(143, 231, 255, ${alpha.toFixed(3)})`;
        ctx.fillStyle = `rgba(143, 231, 255, ${alpha.toFixed(3)})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(endX, endY);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(endX, endY);
        ctx.lineTo(endX - Math.cos(angle - 0.55) * 5, endY - Math.sin(angle - 0.55) * 5);
        ctx.lineTo(endX - Math.cos(angle + 0.55) * 5, endY - Math.sin(angle + 0.55) * 5);
        ctx.closePath();
        ctx.fill();
      }
    }

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
