window.Atoms = window.Atoms || {};

window.Atoms.BendingConstraint = class BendingConstraint {
  constructor(a, b, restLength) {
    this.a = a;
    this.b = b;
    this.restLength = restLength;
  }
};
