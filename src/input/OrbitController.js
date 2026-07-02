window.Atoms = window.Atoms || {};

window.Atoms.OrbitController = class OrbitController {
  constructor(camera) {
    this.camera = camera;
    this.active = false;
    this.last = { x: 0, y: 0 };
  }

  begin(point) {
    this.active = true;
    this.last = point;
  }

  move(point) {
    if (!this.active) return;
    this.camera.orbit(point.x - this.last.x, point.y - this.last.y);
    this.last = point;
  }

  end() {
    this.active = false;
  }

  zoom(deltaY) {
    this.camera.zoomBy(deltaY);
  }
};
