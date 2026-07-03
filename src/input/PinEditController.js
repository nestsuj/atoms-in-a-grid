window.Atoms = window.Atoms || {};

window.Atoms.PinEditController = class PinEditController {
  constructor(canvas, lattice, camera, config) {
    this.canvas = canvas;
    this.lattice = lattice;
    this.camera = camera;
    this.config = config;
    this.atom = null;
    this.depth = 0;
    this.startPoint = { x: 0, y: 0 };
    this.pointer = { x: 0, y: 0 };
    this.moved = false;
    this.editable = false;
    this.threshold = 5;
  }

  setLattice(lattice) {
    this.lattice = lattice;
    this.atom = null;
    this.canvas.classList.remove("is-dragging");
  }

  isActive() {
    return Boolean(this.atom);
  }

  begin(point) {
    const picked = this.pick(point);
    if (!picked) {
      return false;
    }

    this.atom = picked.atom;
    this.depth = picked.screen.depth;
    this.startPoint = point;
    this.pointer = point;
    this.moved = false;
    this.editable = this.canEdit(this.atom);
    this.canvas.classList.add("is-dragging");
    return true;
  }

  move(point) {
    this.pointer = point;
    if (!this.atom) return;

    if (Math.hypot(point.x - this.startPoint.x, point.y - this.startPoint.y) > this.threshold) {
      this.moved = true;
    }

    if (!this.moved || !this.editable) {
      return;
    }

    if (!this.atom.fixed) {
      this.atom.fixed = true;
    }

    this.moveFixedAtom(window.Atoms.screenToWorldOnDepth(point, this.depth, this.camera));
  }

  syncAfterCameraChange() {
    if (!this.atom || !this.moved || !this.editable) return;
    this.moveFixedAtom(window.Atoms.screenToWorldOnDepth(this.pointer, this.depth, this.camera));
  }

  end() {
    if (!this.atom) return;

    if (!this.moved && this.editable) {
      if (this.atom.fixed) {
        this.atom.fixed = false;
        window.Atoms.copy(this.atom.previousPosition, this.atom.position);
      } else {
        this.atom.fixed = true;
        this.moveFixedAtom(this.atom.position);
      }
    }

    this.atom = null;
    this.canvas.classList.remove("is-dragging");
  }

  cancel() {
    this.atom = null;
    this.canvas.classList.remove("is-dragging");
  }

  pick(point) {
    let best = null;
    let bestDistance = Infinity;
    const basis = this.camera.getBasis();
    const screen = { x: 0, y: 0, depth: 0 };

    for (const atom of this.lattice.atoms) {
      window.Atoms.projectWithBasis(atom.position, this.camera, basis, screen);
      const radius = this.config.atomRadius * (0.9 + Math.max(0, screen.depth) * 0.0006) + 8;
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

  canEdit(atom) {
    return !atom.cornerPin || this.config.allowCornerPinEditing;
  }

  moveFixedAtom(position) {
    window.Atoms.copy(this.atom.position, position);
    window.Atoms.copy(this.atom.previousPosition, position);
    window.Atoms.copy(this.atom.fixedPosition, position);
  }
};
