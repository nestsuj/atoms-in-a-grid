window.Atoms = window.Atoms || {};

window.Atoms.Atom = class Atom {
  constructor(id, position, fixed = false, cornerPin = false) {
    this.id = id;
    this.position = window.Atoms.clone(position);
    this.previousPosition = window.Atoms.clone(position);
    this.restPosition = window.Atoms.clone(position);
    this.fixedPosition = window.Atoms.clone(position);
    this.fixed = fixed;
    this.cornerPin = cornerPin;
    this.selected = false;
    this.energy = 0;
  }

  reset() {
    const target = this.fixed ? this.fixedPosition : this.restPosition;
    this.position = window.Atoms.clone(target);
    this.previousPosition = window.Atoms.clone(target);
    this.selected = false;
    this.energy = 0;
  }
};
