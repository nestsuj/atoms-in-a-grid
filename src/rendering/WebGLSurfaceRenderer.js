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
    this.frontTexture = null;
    this.frontTextureImage = null;
    this.backTexture = null;
    this.backTextureImage = null;

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
      opacity: gl.getUniformLocation(this.program, "u_opacity"),
      useFrontTexture: gl.getUniformLocation(this.program, "u_useFrontTexture"),
      useBackTexture: gl.getUniformLocation(this.program, "u_useBackTexture"),
      frontTexture: gl.getUniformLocation(this.program, "u_frontTexture"),
      backTexture: gl.getUniformLocation(this.program, "u_backTexture"),
    };
    this.lineLocations = {
      position: gl.getAttribLocation(this.lineProgram, "a_position"),
      matrix: gl.getUniformLocation(this.lineProgram, "u_matrix"),
      color: gl.getUniformLocation(this.lineProgram, "u_color"),
    };
    this.positionBuffer = gl.createBuffer();
    this.normalBuffer = gl.createBuffer();
    this.uvBuffer = gl.createBuffer();
    this.colorBuffer = gl.createBuffer();
    this.textureSideBuffer = gl.createBuffer();
    this.edgeBuffer = gl.createBuffer();
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

    if (!this.config.showSurfaces || this.config.surfaceOpacity <= 0) {
      return true;
    }

    this.prepareTexture();
    const count = this.buildSurfaceGeometry(lattice);
    if (count === 0) {
      return true;
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

    return true;
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
    gl.uniformMatrix4fv(this.lineLocations.matrix, false, this.cameraMatrix(camera));
    gl.uniform4f(this.lineLocations.color, 0.82, 0.94, 0.98, 0.38);
    gl.depthMask(false);
    gl.drawArrays(gl.LINES, 0, count);
    gl.depthMask(true);
  }

  buildSurfaceEdges(panels) {
    this.edgePositions.length = 0;

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
      const normal = this.panelNormal(panel);
      let sideNormals = normalsBySide.get(panel.side);

      if (!sideNormals) {
        sideNormals = this.emptyAtomNormals(lattice);
        normalsBySide.set(panel.side, sideNormals);
      }

      for (const atom of [panel.a, panel.b, panel.c, panel.d]) {
        sideNormals[atom.id].x += normal.x;
        sideNormals[atom.id].y += normal.y;
        sideNormals[atom.id].z += normal.z;
        fallbackNormals[atom.id].x += normal.x;
        fallbackNormals[atom.id].y += normal.y;
        fallbackNormals[atom.id].z += normal.z;
      }
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
    const a = panel.a.position;
    const b = panel.b.position;
    const d = panel.d.position;
    const abX = b.x - a.x;
    const abY = b.y - a.y;
    const abZ = b.z - a.z;
    const adX = d.x - a.x;
    const adY = d.y - a.y;
    const adZ = d.z - a.z;
    const nx = abY * adZ - abZ * adY;
    const ny = abZ * adX - abX * adZ;
    const nz = abX * adY - abY * adX;
    const length = Math.hypot(nx, ny, nz);

    if (length < 0.000001) {
      return { x: 0, y: 0, z: 1 };
    }

    return { x: nx / length, y: ny / length, z: nz / length };
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
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(values), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
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
      uniform float u_opacity;
      uniform bool u_useFrontTexture;
      uniform bool u_useBackTexture;
      varying vec3 v_normal;
      varying vec2 v_uv;
      varying vec3 v_color;
      varying float v_textureSide;
      void main() {
        vec3 normal = normalize(v_normal);
        float front = max(dot(normal, normalize(u_sunDirection)), 0.0);
        float back = max(dot(-normal, normalize(u_sunDirection)), 0.0) * 0.18;
        float light = clamp(u_ambient + (front + back) * u_intensity, 0.12, 1.65);
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
      uniform mat4 u_matrix;
      void main() {
        gl_Position = u_matrix * vec4(a_position, 1.0);
      }
    `;
  }

  lineFragmentShaderSource() {
    return `
      precision mediump float;
      uniform vec4 u_color;
      void main() {
        gl_FragColor = u_color;
      }
    `;
  }
};
