window.Atoms = window.Atoms || {};

window.Atoms.Atom = class Atom {
  constructor(id, position, fixed = false) {
    this.id = id;
    this.position = window.Atoms.clone(position);
    this.previousPosition = window.Atoms.clone(position);
    this.restPosition = window.Atoms.clone(position);
    this.fixed = fixed;
    this.selected = false;
    this.energy = 0;
  }

  reset() {
    this.position = window.Atoms.clone(this.restPosition);
    this.previousPosition = window.Atoms.clone(this.restPosition);
    this.selected = false;
    this.energy = 0;
  }
};
