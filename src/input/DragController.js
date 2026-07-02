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
    const basis = this.camera.getBasis();
    const screen = { x: 0, y: 0, depth: 0 };

    for (const atom of this.lattice.atoms) {
      if (atom.fixed) continue;
      window.Atoms.projectWithBasis(atom.position, this.camera, basis, screen);
      const radius = this.config.atomRadius * (0.9 + Math.max(0, screen.depth) * 0.0006) + 7;
      const distance = Math.hypot(point.x - screen.x, point.y - screen.y);
      if (distance <= radius && distance < bestDistance) {
        best = {
          atom,
          screen: { x: screen.x, y: screen.y, depth: screen.depth },
        };
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
