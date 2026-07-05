window.Atoms = window.Atoms || {};

window.Atoms.WebGLSurfaceRenderer = class WebGLSurfaceRenderer {
  constructor(canvas, config) {
    this.canvas = canvas;
    this.config = config;
    this.gl = canvas.getContext("webgl", { antialias: true, alpha: false });
    this.available = Boolean(this.gl);
    this.pixelRatio = 1;
    this.cssWidth = 0;
    this.cssHeight = 0;
    this.positions = [];
    this.normals = [];
    this.uvs = [];
    this.colors = [];
    this.textureSides = [];
    this.edgePositions = [];
    this.edgeColors = [];
    this.bondPositions = [];
    this.bondColors = [];
    this.bondSides = [];
    this.atomPositions = [];
    this.atomColors = [];
    this.atomSizes = [];
    this.atomModes = [];
    this.frontTexture = null;
    this.frontTextureImage = null;
    this.backTexture = null;
    this.backTextureImage = null;
    this.attributeUploads = new Map();

    if (this.available) {
      try {
        this.initialize();
      } catch (error) {
        console.warn(error);
        this.available = false;
      }
    }
  }

  initialize() {
    const gl = this.gl;
    this.program = this.createProgram(this.vertexShaderSource(), this.fragmentShaderSource());
    this.lineProgram = this.createProgram(this.lineVertexShaderSource(), this.lineFragmentShaderSource());
    this.tubeProgram = this.createProgram(this.tubeVertexShaderSource(), this.tubeFragmentShaderSource());
    this.atomProgram = this.createProgram(this.atomVertexShaderSource(), this.atomFragmentShaderSource());
    this.locations = {
      position: gl.getAttribLocation(this.program, "a_position"),
      normal: gl.getAttribLocation(this.program, "a_normal"),
      uv: gl.getAttribLocation(this.program, "a_uv"),
      color: gl.getAttribLocation(this.program, "a_color"),
      textureSide: gl.getAttribLocation(this.program, "a_textureSide"),
      matrix: gl.getUniformLocation(this.program, "u_matrix"),
      sunDirection: gl.getUniformLocation(this.program, "u_sunDirection"),
      ambient: gl.getUniformLocation(this.program, "u_ambient"),
      intensity: gl.getUniformLocation(this.program, "u_intensity"),
      lightingModel: gl.getUniformLocation(this.program, "u_lightingModel"),
      opacity: gl.getUniformLocation(this.program, "u_opacity"),
      useFrontTexture: gl.getUniformLocation(this.program, "u_useFrontTexture"),
      useBackTexture: gl.getUniformLocation(this.program, "u_useBackTexture"),
      frontTexture: gl.getUniformLocation(this.program, "u_frontTexture"),
      backTexture: gl.getUniformLocation(this.program, "u_backTexture"),
    };
    this.lineLocations = {
      position: gl.getAttribLocation(this.lineProgram, "a_position"),
      color: gl.getAttribLocation(this.lineProgram, "a_color"),
      matrix: gl.getUniformLocation(this.lineProgram, "u_matrix"),
    };
    this.tubeLocations = {
      position: gl.getAttribLocation(this.tubeProgram, "a_position"),
      color: gl.getAttribLocation(this.tubeProgram, "a_color"),
      side: gl.getAttribLocation(this.tubeProgram, "a_side"),
      matrix: gl.getUniformLocation(this.tubeProgram, "u_matrix"),
      sunDirection: gl.getUniformLocation(this.tubeProgram, "u_sunDirection"),
      cameraRight: gl.getUniformLocation(this.tubeProgram, "u_cameraRight"),
      cameraForward: gl.getUniformLocation(this.tubeProgram, "u_cameraForward"),
      ambient: gl.getUniformLocation(this.tubeProgram, "u_ambient"),
      intensity: gl.getUniformLocation(this.tubeProgram, "u_intensity"),
    };
    this.atomLocations = {
      position: gl.getAttribLocation(this.atomProgram, "a_position"),
      color: gl.getAttribLocation(this.atomProgram, "a_color"),
      size: gl.getAttribLocation(this.atomProgram, "a_size"),
      mode: gl.getAttribLocation(this.atomProgram, "a_mode"),
      matrix: gl.getUniformLocation(this.atomProgram, "u_matrix"),
      sunDirection: gl.getUniformLocation(this.atomProgram, "u_sunDirection"),
      ambient: gl.getUniformLocation(this.atomProgram, "u_ambient"),
      intensity: gl.getUniformLocation(this.atomProgram, "u_intensity"),
    };
    this.positionBuffer = gl.createBuffer();
    this.normalBuffer = gl.createBuffer();
    this.uvBuffer = gl.createBuffer();
    this.colorBuffer = gl.createBuffer();
    this.textureSideBuffer = gl.createBuffer();
    this.edgeBuffer = gl.createBuffer();
    this.edgeColorBuffer = gl.createBuffer();
    this.bondBuffer = gl.createBuffer();
    this.bondColorBuffer = gl.createBuffer();
    this.bondSideBuffer = gl.createBuffer();
    this.atomBuffer = gl.createBuffer();
    this.atomColorBuffer = gl.createBuffer();
    this.atomSizeBuffer = gl.createBuffer();
    this.atomModeBuffer = gl.createBuffer();
    this.whiteTexture = this.createSolidTexture(255, 255, 255, 255);

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  resize(camera) {
    if (!this.available) {
      return;
    }

    const bounds = this.canvas.getBoundingClientRect();
    this.pixelRatio = window.devicePixelRatio || 1;
    this.cssWidth = bounds.width;
    this.cssHeight = bounds.height;
    this.canvas.width = Math.max(1, Math.floor(bounds.width * this.pixelRatio));
    this.canvas.height = Math.max(1, Math.floor(bounds.height * this.pixelRatio));
    camera.resize(bounds.width, bounds.height);
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  ensureSize(camera) {
    if (!this.available) {
      return;
    }

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
    if (!this.available) {
      return false;
    }

    this.ensureSize(camera);
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0.082, 0.098, 0.133, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    if (this.config.showSurfaces && this.config.surfaceOpacity > 0) {
      this.drawSurfaces(lattice, camera);
    }

    this.drawBonds(lattice, camera);
    this.drawAtoms(lattice, camera);
    return true;
  }

  drawSurfaces(lattice, camera) {
    const gl = this.gl;
    this.prepareTexture();
    const count = this.buildSurfaceGeometry(lattice);
    if (count === 0) {
      return;
    }

    gl.useProgram(this.program);
    this.bindAttribute(this.positionBuffer, this.positions, this.locations.position, 3);
    this.bindAttribute(this.normalBuffer, this.normals, this.locations.normal, 3);
    this.bindAttribute(this.uvBuffer, this.uvs, this.locations.uv, 2);
    this.bindAttribute(this.colorBuffer, this.colors, this.locations.color, 3);
    this.bindAttribute(this.textureSideBuffer, this.textureSides, this.locations.textureSide, 1);

    const sun = this.sunDirection();
    gl.uniformMatrix4fv(this.locations.matrix, false, this.cameraMatrix(camera));
    gl.uniform3f(this.locations.sunDirection, sun.x, sun.y, sun.z);
    gl.uniform1f(this.locations.ambient, this.config.surfaceLighting ? window.Atoms.clamp(this.config.sunAmbient, 0, 1) : 1);
    gl.uniform1f(this.locations.intensity, this.config.surfaceLighting ? window.Atoms.clamp(this.config.sunIntensity, 0, 2) : 0);
    gl.uniform1i(this.locations.lightingModel, this.config.surfaceLightingModel === "cloth" ? 1 : 0);
    gl.uniform1f(this.locations.opacity, window.Atoms.clamp(this.config.surfaceOpacity, 0, 1));
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.frontTexture || this.whiteTexture);
    gl.uniform1i(this.locations.frontTexture, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.backTexture || this.whiteTexture);
    gl.uniform1i(this.locations.backTexture, 1);
    gl.uniform1i(this.locations.useFrontTexture, this.hasFrontTexture() ? 1 : 0);
    gl.uniform1i(this.locations.useBackTexture, this.hasBackTexture() ? 1 : 0);
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(1, 1);
    gl.drawArrays(gl.TRIANGLES, 0, count);
    gl.disable(gl.POLYGON_OFFSET_FILL);

    if (this.config.showSurfaceEdges) {
      this.drawSurfaceEdges(this.lastPanels || [], camera);
    }
  }

  buildSurfaceGeometry(lattice) {
    this.positions.length = 0;
    this.normals.length = 0;
    this.uvs.length = 0;
    this.colors.length = 0;
    this.textureSides.length = 0;

    const panels = this.filteredPanels(lattice.surfacePanels || []);
    this.lastPanels = panels;
    const atomNormals = this.sideAwareAtomNormals(lattice, panels);

    for (const panel of panels) {
      this.pushTriangle(panel, panel.a, panel.b, panel.c, atomNormals);
      this.pushTriangle(panel, panel.a, panel.c, panel.d, atomNormals);
    }

    return this.positions.length / 3;
  }

  drawSurfaceEdges(panels, camera) {
    const count = this.buildSurfaceEdges(panels);
    if (count === 0) {
      return;
    }

    const gl = this.gl;
    gl.useProgram(this.lineProgram);
    this.bindAttribute(this.edgeBuffer, this.edgePositions, this.lineLocations.position, 3);
    this.bindAttribute(this.edgeColorBuffer, this.edgeColors, this.lineLocations.color, 4);
    gl.uniformMatrix4fv(this.lineLocations.matrix, false, this.cameraMatrix(camera));
    gl.depthMask(false);
    gl.drawArrays(gl.LINES, 0, count);
    gl.depthMask(true);
  }

  buildSurfaceEdges(panels) {
    this.edgePositions.length = 0;
    this.edgeColors.length = 0;

    for (const panel of panels) {
      this.pushEdge(panel.a, panel.b);
      this.pushEdge(panel.b, panel.c);
      this.pushEdge(panel.c, panel.d);
      this.pushEdge(panel.d, panel.a);
      this.pushEdge(panel.a, panel.c);
    }

    return this.edgePositions.length / 3;
  }

  pushEdge(a, b) {
    this.edgePositions.push(
      a.position.x, a.position.y, a.position.z,
      b.position.x, b.position.y, b.position.z,
    );
    this.edgeColors.push(0.82, 0.94, 0.98, 0.38, 0.82, 0.94, 0.98, 0.38);
  }

  drawBonds(lattice, camera) {
    if (!this.config.showBonds) {
      return;
    }

    const count = this.buildBondGeometry(lattice, camera);
    if (count === 0) {
      return;
    }

    const gl = this.gl;
    const sun = this.sunDirection();
    const basis = camera.getBasis();
    gl.useProgram(this.tubeProgram);
    this.bindAttribute(this.bondBuffer, this.bondPositions, this.tubeLocations.position, 3);
    this.bindAttribute(this.bondColorBuffer, this.bondColors, this.tubeLocations.color, 4);
    this.bindAttribute(this.bondSideBuffer, this.bondSides, this.tubeLocations.side, 1);
    gl.uniformMatrix4fv(this.tubeLocations.matrix, false, this.cameraMatrix(camera));
    gl.uniform3f(this.tubeLocations.sunDirection, sun.x, sun.y, sun.z);
    gl.uniform3f(this.tubeLocations.cameraRight, basis.right.x, basis.right.y, basis.right.z);
    gl.uniform3f(this.tubeLocations.cameraForward, basis.forward.x, basis.forward.y, basis.forward.z);
    gl.uniform1f(this.tubeLocations.ambient, this.config.surfaceLighting ? window.Atoms.clamp(this.config.sunAmbient, 0, 1) : 1);
    gl.uniform1f(this.tubeLocations.intensity, this.config.surfaceLighting ? window.Atoms.clamp(this.config.sunIntensity, 0, 2) : 0);
    gl.drawArrays(gl.TRIANGLES, 0, count);
  }

  buildBondGeometry(lattice, camera) {
    this.bondPositions.length = 0;
    this.bondColors.length = 0;
    this.bondSides.length = 0;
    const depthRange = this.depthRange(lattice.atoms, camera);
    const basis = camera.getBasis();
    const zoom = Math.max(0.0001, camera.zoom || 1);

    for (const bond of lattice.bonds) {
      const a = bond.a.position;
      const b = bond.b.position;
      const depth = (this.depthOf(a, camera) + this.depthOf(b, camera)) * 0.5;
      const depthShade = (depth - depthRange.min) / depthRange.range;
      const strain = this.config.simpleBondColors ? 0 : (window.Atoms.distance(a, b) - bond.restLength) / bond.restLength;
      const color = this.config.simpleBondColors
        ? this.neutralBondColor(depthShade)
        : this.bondColor(depthShade, strain);
      const lineWidth = (1.8 + depthShade * 2.1 + Math.min(1, Math.abs(strain) * 5) * 2.7)
        * this.config.zoomVisualScale;
      const halfWidth = lineWidth * 0.5;
      const screenX = (b.x - a.x) * basis.right.x + (b.y - a.y) * basis.right.y + (b.z - a.z) * basis.right.z;
      const screenY = -((b.x - a.x) * basis.up.x + (b.y - a.y) * basis.up.y + (b.z - a.z) * basis.up.z);
      const screenLength = Math.hypot(screenX, screenY);
      const perpendicularX = screenLength > 0.000001 ? -screenY / screenLength : 0;
      const perpendicularY = screenLength > 0.000001 ? screenX / screenLength : 1;
      const worldScale = halfWidth / zoom;
      const offset = {
        x: (basis.right.x * perpendicularX - basis.up.x * perpendicularY) * worldScale,
        y: (basis.right.y * perpendicularX - basis.up.y * perpendicularY) * worldScale,
        z: (basis.right.z * perpendicularX - basis.up.z * perpendicularY) * worldScale,
      };
      this.pushRibbonVertex(a, offset, 1, color);
      this.pushRibbonVertex(b, offset, 1, color);
      this.pushRibbonVertex(b, offset, -1, color);
      this.pushRibbonVertex(a, offset, 1, color);
      this.pushRibbonVertex(b, offset, -1, color);
      this.pushRibbonVertex(a, offset, -1, color);
    }

    return this.bondPositions.length / 3;
  }

  pushRibbonVertex(position, offset, direction, color) {
    this.bondPositions.push(
      position.x + offset.x * direction,
      position.y + offset.y * direction,
      position.z + offset.z * direction,
    );
    this.bondColors.push(color.r, color.g, color.b, color.a);
    this.bondSides.push(direction);
  }

  drawAtoms(lattice, camera) {
    if (!this.config.showAtoms) {
      return;
    }

    const count = this.buildAtomGeometry(lattice, camera);
    if (count === 0) {
      return;
    }

    const gl = this.gl;
    gl.useProgram(this.atomProgram);
    this.bindAttribute(this.atomBuffer, this.atomPositions, this.atomLocations.position, 3);
    this.bindAttribute(this.atomColorBuffer, this.atomColors, this.atomLocations.color, 4);
    this.bindAttribute(this.atomSizeBuffer, this.atomSizes, this.atomLocations.size, 1);
    this.bindAttribute(this.atomModeBuffer, this.atomModes, this.atomLocations.mode, 1);
    gl.uniformMatrix4fv(this.atomLocations.matrix, false, this.cameraMatrix(camera));
    const sun = this.sunDirection();
    const basis = camera.getBasis();
    const sunView = {
      x: sun.x * basis.right.x + sun.y * basis.right.y + sun.z * basis.right.z,
      y: -(sun.x * basis.up.x + sun.y * basis.up.y + sun.z * basis.up.z),
      z: -(sun.x * basis.forward.x + sun.y * basis.forward.y + sun.z * basis.forward.z),
    };
    gl.uniform3f(this.atomLocations.sunDirection, sunView.x, sunView.y, sunView.z);
    gl.uniform1f(this.atomLocations.ambient, this.config.surfaceLighting ? window.Atoms.clamp(this.config.sunAmbient, 0, 1) : 1);
    gl.uniform1f(this.atomLocations.intensity, this.config.surfaceLighting ? window.Atoms.clamp(this.config.sunIntensity, 0, 2) : 0);
    gl.drawArrays(gl.POINTS, 0, count);
  }

  buildAtomGeometry(lattice, camera) {
    this.atomPositions.length = 0;
    this.atomColors.length = 0;
    this.atomSizes.length = 0;
    this.atomModes.length = 0;
    const depthRange = this.depthRange(lattice.atoms, camera);
    const pixelRatio = this.pixelRatio || 1;
    const fastAtoms = this.config.fastLargeGridAtoms && lattice.atoms.length > 1200;

    for (const atom of lattice.atoms) {
      const depthShadeRaw = (this.depthOf(atom.position, camera) - depthRange.min) / depthRange.range;
      const depthShade = 0.5 + (depthShadeRaw - 0.5) * this.config.atomDepthShading;
      const color = atom.selected
        ? { r: 1, g: 0.88, b: 0.51, a: 1 }
        : this.atomColor(atom, depthShade);
      const radius = this.config.atomRadius * (0.78 + depthShade * 0.46) * this.config.zoomVisualScale;
      const outlineBoost = atom.fixed || atom.selected ? 1.28 : 1;

      this.atomPositions.push(atom.position.x, atom.position.y, atom.position.z);
      this.atomColors.push(color.r, color.g, color.b, color.a);
      this.atomSizes.push(Math.max(2, radius * 2 * pixelRatio * outlineBoost));
      this.atomModes.push(fastAtoms ? 1 : 0);
    }

    return this.atomPositions.length / 3;
  }

  filteredPanels(panels) {
    const side = this.config.surfaceSide || "both";
    return panels.filter((panel) => {
      if (side !== "both" && panel.side !== side) {
        return false;
      }

      return true;
    });
  }

  sideAwareAtomNormals(lattice, panels) {
    const normalsBySide = new Map();
    const fallbackNormals = this.emptyAtomNormals(lattice);

    for (const panel of panels) {
      let sideNormals = normalsBySide.get(panel.side);

      if (!sideNormals) {
        sideNormals = this.emptyAtomNormals(lattice);
        normalsBySide.set(panel.side, sideNormals);
      }

      this.accumulateTriangleNormal(sideNormals, fallbackNormals, panel.a, panel.b, panel.c);
      this.accumulateTriangleNormal(sideNormals, fallbackNormals, panel.a, panel.c, panel.d);
    }

    const normalizedFallback = this.normalizeAtomNormals(fallbackNormals);
    const normalizedBySide = new Map();

    for (const [side, normals] of normalsBySide.entries()) {
      normalizedBySide.set(side, this.normalizeAtomNormals(normals, normalizedFallback));
    }

    return normalizedBySide;
  }

  emptyAtomNormals(lattice) {
    return Array.from({ length: lattice.atoms.length }, () => ({ x: 0, y: 0, z: 0 }));
  }

  accumulateTriangleNormal(sideNormals, fallbackNormals, a, b, c) {
    const normal = this.triangleAreaNormal(a.position, b.position, c.position);
    this.addNormal(sideNormals[a.id], normal);
    this.addNormal(sideNormals[b.id], normal);
    this.addNormal(sideNormals[c.id], normal);
    this.addNormal(fallbackNormals[a.id], normal);
    this.addNormal(fallbackNormals[b.id], normal);
    this.addNormal(fallbackNormals[c.id], normal);
  }

  addNormal(target, normal) {
    target.x += normal.x;
    target.y += normal.y;
    target.z += normal.z;
  }

  normalizeAtomNormals(normals, fallbackNormals) {
    return normals.map((normal, index) => {
      const length = Math.hypot(normal.x, normal.y, normal.z);

      if (length < 0.000001) {
        return fallbackNormals ? fallbackNormals[index] : { x: 0, y: 0, z: 1 };
      }

      return { x: normal.x / length, y: normal.y / length, z: normal.z / length };
    });
  }

  pushTriangle(panel, a, b, c, atomNormals) {
    this.pushVertex(panel, a, this.normalForPanelAtom(panel, a, atomNormals));
    this.pushVertex(panel, b, this.normalForPanelAtom(panel, b, atomNormals));
    this.pushVertex(panel, c, this.normalForPanelAtom(panel, c, atomNormals));
  }

  normalForPanelAtom(panel, atom, atomNormals) {
    const sideNormals = atomNormals.get(panel.side);

    if (sideNormals && sideNormals[atom.id]) {
      return sideNormals[atom.id];
    }

    return this.panelNormal(panel);
  }

  pushVertex(panel, atom, normal) {
    const position = atom.position;
    const color = this.surfaceColor(panel);
    const uv = this.vertexUv(panel, atom);
    this.positions.push(position.x, position.y, position.z);
    this.normals.push(normal.x, normal.y, normal.z);
    this.uvs.push(uv.u, uv.v);
    this.colors.push(color.r, color.g, color.b);
    this.textureSides.push(panel.side === "back" ? 1 : 0);
  }

  vertexUv(panel, atom) {
    const minX = Math.min(panel.a.gridX, panel.b.gridX, panel.c.gridX, panel.d.gridX);
    const maxX = Math.max(panel.a.gridX, panel.b.gridX, panel.c.gridX, panel.d.gridX);
    const minY = Math.min(panel.a.gridY, panel.b.gridY, panel.c.gridY, panel.d.gridY);
    const maxY = Math.max(panel.a.gridY, panel.b.gridY, panel.c.gridY, panel.d.gridY);
    const minZ = Math.min(panel.a.gridZ, panel.b.gridZ, panel.c.gridZ, panel.d.gridZ);
    const maxZ = Math.max(panel.a.gridZ, panel.b.gridZ, panel.c.gridZ, panel.d.gridZ);
    const xRatio = maxX === minX ? 0 : (atom.gridX - minX) / (maxX - minX);
    const yRatio = maxY === minY ? 0 : (atom.gridY - minY) / (maxY - minY);
    const zRatio = maxZ === minZ ? 0 : (atom.gridZ - minZ) / (maxZ - minZ);

    let uv;

    if (panel.side === "top" || panel.side === "bottom") {
      uv = { u: panel.u0 + (panel.u1 - panel.u0) * xRatio, v: panel.v0 + (panel.v1 - panel.v0) * zRatio };
      return this.orientBackUv(panel, uv);
    }

    if (panel.side === "left" || panel.side === "right") {
      uv = { u: panel.u0 + (panel.u1 - panel.u0) * zRatio, v: panel.v0 + (panel.v1 - panel.v0) * yRatio };
      return this.orientBackUv(panel, uv);
    }

    uv = { u: panel.u0 + (panel.u1 - panel.u0) * xRatio, v: panel.v0 + (panel.v1 - panel.v0) * yRatio };
    return this.orientBackUv(panel, uv);
  }

  orientBackUv(panel, uv) {
    if (panel.side !== "back") {
      return uv;
    }

    return {
      u: this.config.mirrorBackTexture ? 1 - uv.u : uv.u,
      v: this.config.flipBackTexture ? 1 - uv.v : uv.v,
    };
  }

  surfaceColor(panel) {
    const style = this.config.surfaceStyle || "tint";

    if (style === "checker" || (style === "image" && !this.textureForSide(panel.side))) {
      return this.uvCheckerColor(panel);
    }

    if (style === "stripes") {
      return this.uvStripeColor(panel);
    }

    if (style === "image" && this.textureForSide(panel.side)) {
      return { r: 1, g: 1, b: 1 };
    }

    return panel.side === "back"
      ? { r: 0.42, g: 0.5, b: 0.76 }
      : { r: 0.22, g: 0.68, b: 0.78 };
  }

  uvCheckerColor(panel) {
    const checker = (Math.floor(((panel.u0 + panel.u1) * 0.5) * 8) + Math.floor(((panel.v0 + panel.v1) * 0.5) * 6)) % 2;
    return checker === 0
      ? { r: 0.28, g: 0.82, b: 0.88 }
      : { r: 0.95, g: 0.45, b: 0.36 };
  }

  uvStripeColor(panel) {
    const stripe = Math.floor(((panel.u0 + panel.u1) * 0.5) * 12) % 3;
    if (stripe === 0) return { r: 0.93, g: 0.29, b: 0.27 };
    if (stripe === 1) return { r: 0.93, g: 0.93, b: 0.88 };
    return { r: 0.26, g: 0.49, b: 0.87 };
  }

  panelNormal(panel) {
    const first = this.triangleAreaNormal(panel.a.position, panel.b.position, panel.c.position);
    const second = this.triangleAreaNormal(panel.a.position, panel.c.position, panel.d.position);
    const nx = first.x + second.x;
    const ny = first.y + second.y;
    const nz = first.z + second.z;
    const length = Math.hypot(nx, ny, nz);

    if (length < 0.000001) {
      return { x: 0, y: 0, z: 1 };
    }

    return { x: nx / length, y: ny / length, z: nz / length };
  }

  triangleAreaNormal(a, b, c) {
    const abX = b.x - a.x;
    const abY = b.y - a.y;
    const abZ = b.z - a.z;
    const acX = c.x - a.x;
    const acY = c.y - a.y;
    const acZ = c.z - a.z;
    return {
      x: abY * acZ - abZ * acY,
      y: abZ * acX - abX * acZ,
      z: abX * acY - abY * acX,
    };
  }

  depthRange(atoms, camera) {
    let min = Infinity;
    let max = -Infinity;

    for (const atom of atoms) {
      const depth = this.depthOf(atom.position, camera);
      if (depth < min) min = depth;
      if (depth > max) max = depth;
    }

    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      return { min: 0, max: 1, range: 1 };
    }

    return { min, max, range: Math.max(1, max - min) };
  }

  depthOf(position, camera) {
    const forward = camera.getBasis().forward;
    return position.x * forward.x + position.y * forward.y + position.z * forward.z;
  }

  atomColor(atom, depthShade) {
    const energy = window.Atoms.clamp(atom.energy * 0.62, 0, 1);
    const shade = 0.62 + depthShade * 0.38;
    const cool = {
      r: (44 + depthShade * 66) / 255,
      g: (128 + depthShade * 84) / 255,
      b: (154 + depthShade * 79) / 255,
    };
    const hot = {
      r: shade,
      g: (102 * shade) / 255,
      b: (70 * shade) / 255,
    };

    return {
      r: cool.r + (hot.r - cool.r) * energy,
      g: cool.g + (hot.g - cool.g) * energy,
      b: cool.b + (hot.b - cool.b) * energy,
      a: 1,
    };
  }

  bondColor(depthShade, strain) {
    const rawAmount = window.Atoms.clamp(Math.abs(strain) * 2.2, 0, 1);
    const amount = rawAmount * rawAmount * (3 - 2 * rawAmount);
    const neutral = {
      r: (126 + depthShade * 42) / 255,
      g: (139 + depthShade * 42) / 255,
      b: (156 + depthShade * 42) / 255,
    };
    const target = strain >= 0
      ? { r: 1, g: 103 / 255, b: 71 / 255 }
      : { r: 69 / 255, g: 199 / 255, b: 232 / 255 };
    return {
      r: neutral.r + (target.r - neutral.r) * amount,
      g: neutral.g + (target.g - neutral.g) * amount,
      b: neutral.b + (target.b - neutral.b) * amount,
      a: 0.28 + depthShade * 0.24 + amount * 0.34,
    };
  }

  neutralBondColor(depthShade) {
    const value = (126 + depthShade * 42) / 255;
    return {
      r: value,
      g: value + 13 / 255,
      b: value + 30 / 255,
      a: 0.28 + depthShade * 0.24,
    };
  }

  cameraMatrix(camera) {
    const width = Math.max(1, (this.canvas.width || this.cssWidth * this.pixelRatio || 1) / this.pixelRatio);
    const height = Math.max(1, (this.canvas.height || this.cssHeight * this.pixelRatio || 1) / this.pixelRatio);
    const basis = camera.getBasis();
    const xScale = 2 * camera.zoom / width;
    const yScale = 2 * camera.zoom / height;
    const zScale = 1 / 4000;

    return new Float32Array([
      basis.right.x * xScale, basis.up.x * yScale, -basis.forward.x * zScale, 0,
      basis.right.y * xScale, basis.up.y * yScale, -basis.forward.y * zScale, 0,
      basis.right.z * xScale, basis.up.z * yScale, -basis.forward.z * zScale, 0,
      camera.center.x * 2 / width - 1, 1 - camera.center.y * 2 / height, 0, 1,
    ]);
  }

  sunDirection() {
    const azimuth = (this.config.sunAzimuth || 0) * Math.PI / 180;
    const elevation = (this.config.sunElevation || 0) * Math.PI / 180;
    const horizontal = Math.cos(elevation);
    return {
      x: Math.cos(azimuth) * horizontal,
      y: -Math.sin(elevation),
      z: Math.sin(azimuth) * horizontal,
    };
  }

  textureForSide(side) {
    if (this.config.surfaceStyle !== "image") {
      return null;
    }

    if (side === "back") {
      return this.config.surfaceBackTextureImage;
    }

    return this.config.surfaceFrontTextureImage || this.config.surfaceTextureImage;
  }

  hasFrontTexture() {
    return Boolean(this.textureForSide("front"));
  }

  hasBackTexture() {
    return Boolean(this.textureForSide("back"));
  }

  prepareTexture() {
    const frontImage = this.textureForSide("front");
    const backImage = this.textureForSide("back");

    if (frontImage !== this.frontTextureImage) {
      this.frontTextureImage = frontImage;
      this.frontTexture = frontImage ? this.createImageTexture(frontImage) : null;
    }

    if (backImage !== this.backTextureImage) {
      this.backTextureImage = backImage;
      this.backTexture = backImage ? this.createImageTexture(backImage) : null;
    }
  }

  createImageTexture(image) {
    const gl = this.gl;
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    return texture;
  }

  createSolidTexture(r, g, b, a) {
    const gl = this.gl;
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([r, g, b, a]));
    return texture;
  }

  bindAttribute(buffer, values, location, size) {
    if (location < 0) {
      return;
    }

    const gl = this.gl;
    const valueCount = values.length;
    let upload = this.attributeUploads.get(buffer);

    if (!upload || upload.capacity < valueCount) {
      const capacity = this.nextBufferCapacity(valueCount);
      upload = {
        capacity,
        values: new Float32Array(capacity),
      };
      this.attributeUploads.set(buffer, upload);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, capacity * Float32Array.BYTES_PER_ELEMENT, gl.DYNAMIC_DRAW);
    }

    upload.values.set(values, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, upload.values.subarray(0, valueCount));
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
  }

  nextBufferCapacity(valueCount) {
    let capacity = 256;

    while (capacity < valueCount) {
      capacity *= 2;
    }

    return capacity;
  }

  createProgram(vertexSource, fragmentSource) {
    const gl = this.gl;
    const vertexShader = this.createShader(gl.VERTEX_SHADER, vertexSource);
    const fragmentShader = this.createShader(gl.FRAGMENT_SHADER, fragmentSource);
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) || "WebGL program link failed");
    }

    return program;
  }

  createShader(type, source) {
    const gl = this.gl;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader) || "WebGL shader compile failed");
    }

    return shader;
  }

  vertexShaderSource() {
    return `
      attribute vec3 a_position;
      attribute vec3 a_normal;
      attribute vec2 a_uv;
      attribute vec3 a_color;
      attribute float a_textureSide;
      uniform mat4 u_matrix;
      varying vec3 v_normal;
      varying vec2 v_uv;
      varying vec3 v_color;
      varying float v_textureSide;
      void main() {
        gl_Position = u_matrix * vec4(a_position, 1.0);
        v_normal = normalize(a_normal);
        v_uv = a_uv;
        v_color = a_color;
        v_textureSide = a_textureSide;
      }
    `;
  }

  fragmentShaderSource() {
    return `
      precision mediump float;
      uniform sampler2D u_frontTexture;
      uniform sampler2D u_backTexture;
      uniform vec3 u_sunDirection;
      uniform float u_ambient;
      uniform float u_intensity;
      uniform int u_lightingModel;
      uniform float u_opacity;
      uniform bool u_useFrontTexture;
      uniform bool u_useBackTexture;
      varying vec3 v_normal;
      varying vec2 v_uv;
      varying vec3 v_color;
      varying float v_textureSide;
      void main() {
        vec3 normal = normalize(v_normal);
        vec3 sun = normalize(u_sunDirection);
        float front = max(dot(normal, sun), 0.0);
        float back = max(dot(-normal, sun), 0.0);
        float light = clamp(u_ambient + (front + back * 0.18) * u_intensity, 0.12, 1.65);
        if (u_lightingModel == 1) {
          float wrap = clamp((dot(normal, sun) + 0.55) / 1.55, 0.0, 1.0);
          float clothBack = back * 0.34;
          float viewLift = pow(max(abs(normal.z), 0.0), 0.8) * 0.12;
          float clothLight = u_ambient * 1.08 + (wrap * 0.78 + clothBack + viewLift) * u_intensity;
          light = clamp(clothLight, 0.24, 1.38);
        }
        bool isBack = v_textureSide > 0.5;
        vec4 textureColor = vec4(1.0);
        if (!isBack && u_useFrontTexture) {
          textureColor = texture2D(u_frontTexture, v_uv);
        } else if (isBack && u_useBackTexture) {
          textureColor = texture2D(u_backTexture, v_uv);
        }
        vec3 color = textureColor.rgb * v_color * light;
        gl_FragColor = vec4(color, textureColor.a * u_opacity);
      }
    `;
  }

  lineVertexShaderSource() {
    return `
      attribute vec3 a_position;
      attribute vec4 a_color;
      uniform mat4 u_matrix;
      varying vec4 v_color;
      void main() {
        gl_Position = u_matrix * vec4(a_position, 1.0);
        v_color = a_color;
      }
    `;
  }

  lineFragmentShaderSource() {
    return `
      precision mediump float;
      varying vec4 v_color;
      void main() {
        gl_FragColor = v_color;
      }
    `;
  }

  tubeVertexShaderSource() {
    return `
      attribute vec3 a_position;
      attribute vec4 a_color;
      attribute float a_side;
      uniform mat4 u_matrix;
      varying vec4 v_color;
      varying float v_side;
      void main() {
        gl_Position = u_matrix * vec4(a_position, 1.0);
        v_color = a_color;
        v_side = a_side;
      }
    `;
  }

  tubeFragmentShaderSource() {
    return `
      precision mediump float;
      uniform vec3 u_sunDirection;
      uniform vec3 u_cameraRight;
      uniform vec3 u_cameraForward;
      uniform float u_ambient;
      uniform float u_intensity;
      varying vec4 v_color;
      varying float v_side;
      void main() {
        float side = clamp(v_side, -1.0, 1.0);
        float crown = sqrt(max(0.0, 1.0 - side * side));
        vec3 normal = normalize(u_cameraRight * side - u_cameraForward * crown);
        vec3 sun = normalize(u_sunDirection);
        float front = max(dot(normal, sun), 0.0);
        float rim = smoothstep(0.42, 1.0, abs(side)) * 0.18;
        float highlight = pow(max(dot(normalize(normal + sun), -normalize(u_cameraForward)), 0.0), 18.0) * 0.28;
        float light = clamp(u_ambient + front * u_intensity + rim + highlight * u_intensity, 0.16, 1.75);
        gl_FragColor = vec4(v_color.rgb * light, v_color.a);
      }
    `;
  }

  atomVertexShaderSource() {
    return `
      attribute vec3 a_position;
      attribute vec4 a_color;
      attribute float a_size;
      attribute float a_mode;
      uniform mat4 u_matrix;
      varying vec4 v_color;
      varying float v_mode;
      void main() {
        gl_Position = u_matrix * vec4(a_position, 1.0);
        gl_PointSize = a_size;
        v_color = a_color;
        v_mode = a_mode;
      }
    `;
  }

  atomFragmentShaderSource() {
    return `
      precision mediump float;
      uniform vec3 u_sunDirection;
      uniform float u_ambient;
      uniform float u_intensity;
      varying vec4 v_color;
      varying float v_mode;
      void main() {
        vec2 centered = gl_PointCoord * 2.0 - 1.0;
        float distanceFromCenter = dot(centered, centered);
        if (distanceFromCenter > 1.0) {
          discard;
        }

        if (v_mode > 0.5) {
          float edgeAlpha = 1.0 - smoothstep(0.86, 1.0, distanceFromCenter);
          gl_FragColor = vec4(v_color.rgb, v_color.a * edgeAlpha);
          return;
        }

        vec3 normal = normalize(vec3(centered.x, -centered.y, sqrt(max(0.0, 1.0 - distanceFromCenter))));
        vec3 light = normalize(u_sunDirection);
        vec3 view = vec3(0.0, 0.0, 1.0);
        float diffuse = max(dot(normal, light), 0.0);
        float specular = pow(max(dot(reflect(-light, normal), view), 0.0), 24.0);
        float rim = smoothstep(0.62, 0.98, distanceFromCenter);
        float edgeAlpha = 1.0 - smoothstep(0.92, 1.0, distanceFromCenter);
        float lightAmount = clamp(u_ambient + diffuse * u_intensity, 0.18, 1.65);
        vec3 shaded = v_color.rgb * lightAmount;
        shaded = mix(shaded, vec3(0.02, 0.04, 0.06), rim * 0.34);
        shaded += vec3(1.0, 0.96, 0.86) * specular * 0.42 * u_intensity;
        gl_FragColor = vec4(shaded, v_color.a * edgeAlpha);
      }
    `;
  }
};
