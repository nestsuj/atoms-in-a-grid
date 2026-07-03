window.Atoms = window.Atoms || {};

window.Atoms.Camera = class Camera {
  constructor(config) {
    this.defaultRotationX = -0.62;
    this.defaultRotationY = 0.72;
    this.rotationX = this.defaultRotationX;
    this.rotationY = this.defaultRotationY;
    this.zoom = 1;
    this.minZoom = config.minZoom;
    this.maxZoom = config.maxZoom;
    this.center = { x: 0, y: 0 };
  }

  resize(width, height) {
    this.center.x = width / 2;
    this.center.y = height / 2;
  }

  orbit(deltaX, deltaY) {
    this.rotationY += deltaX * 0.008;
    this.rotationX = window.Atoms.clamp(this.rotationX + deltaY * 0.008, -Math.PI * 0.48, Math.PI * 0.48);
  }

  setZoom(zoom) {
    this.zoom = window.Atoms.clamp(zoom, this.minZoom, this.maxZoom);
  }

  zoomBy(delta) {
    const factor = Math.exp(-delta * 0.0012);
    this.setZoom(this.zoom * factor);
  }

  pan(deltaX, deltaY) {
    this.center.x += deltaX;
    this.center.y += deltaY;
  }

  setView(rotationX, rotationY) {
    this.rotationX = rotationX;
    this.rotationY = rotationY;
  }

  setDefaultView() {
    this.setView(this.defaultRotationX, this.defaultRotationY);
  }

  setFrontView() {
    this.setView(0, 0);
  }

  getBasis() {
    const cosY = Math.cos(this.rotationY);
    const sinY = Math.sin(this.rotationY);
    const cosX = Math.cos(this.rotationX);
    const sinX = Math.sin(this.rotationX);

    const right = window.Atoms.vec3(cosY, 0, -sinY);
    const up = window.Atoms.vec3(sinY * sinX, cosX, cosY * sinX);
    const forward = window.Atoms.vec3(sinY * cosX, -sinX, cosY * cosX);

    return { right, up, forward };
  }
};
