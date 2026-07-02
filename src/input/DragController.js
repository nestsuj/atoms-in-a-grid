window.Atoms = window.Atoms || {};

window.Atoms.DragController = class DragController {
  constructor(canvas, lattice, solver, camera, config) {
    this.canvas = canvas;
    this.lattice = lattice;
    this.solver = solver;
    this.camera = camera;
    this.config = config;
    this.atom = null;
    this.depth = 0;
    this.pointer = { x: 0, y: 0 };
  }

  setLattice(lattice) {
    this.lattice = lattice;
    this.atom = null;
    this.canvas.classList.remove("is-dragging");
  }

  isActive() {
    return Boolean(this.atom);
  }

  pick(point) {
    let best = null;
    let bestDistance = Infinity;

    for (const atom of this.lattice.atoms) {
      if (atom.fixed) continue;
      const screen = window.Atoms.project(atom.position, this.camera);
      const radius = this.config.atomRadius * (0.9 + Math.max(0, screen.depth) * 0.0006) + 7;
      const distance = Math.hypot(point.x - screen.x, point.y - screen.y);
      if (distance <= radius && distance < bestDistance) {
        best = { atom, screen };
        bestDistance = distance;
      }
    }

    return best;
  }

  begin(point) {
    const picked = this.pick(point);
    if (!picked) {
      return false;
    }

    this.atom = picked.atom;
    this.depth = picked.screen.depth;
    this.pointer = point;
    this.solver.pin(this.atom, window.Atoms.screenToWorldOnDepth(point, this.depth, this.camera));
    this.canvas.classList.add("is-dragging");
    return true;
  }

  move(point) {
    this.pointer = point;
    if (!this.atom) return;
    this.solver.movePin(this.atom, window.Atoms.screenToWorldOnDepth(point, this.depth, this.camera));
  }

  syncAfterCameraChange() {
    if (!this.atom) return;
    this.solver.movePin(this.atom, window.Atoms.screenToWorldOnDepth(this.pointer, this.depth, this.camera));
  }

  end() {
    if (!this.atom) return;
    this.solver.release(this.atom);
    this.atom = null;
    this.canvas.classList.remove("is-dragging");
  }
};
