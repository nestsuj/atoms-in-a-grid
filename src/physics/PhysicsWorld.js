window.Atoms = window.Atoms || {};

window.Atoms.PhysicsWorld = class PhysicsWorld {
  constructor() {
    this.lattice = null;
    this.solver = null;
    this.time = 0;
    this.dt = 1;
    this.dtSquared = 1;
  }

  bind(lattice, solver, time, dt) {
    this.lattice = lattice;
    this.solver = solver;
    this.time = time;
    this.dt = dt;
    this.dtSquared = dt * dt;
    return this;
  }

  clearForces() {
    for (const atom of this.lattice.atoms) {
      atom.force.x = 0;
      atom.force.y = 0;
      atom.force.z = 0;
    }
  }

  isLocked(atom) {
    return atom.fixed || this.solver.isHardPinned(atom);
  }

  addForce(atom, x, y, z) {
    if (this.isLocked(atom)) {
      return;
    }

    atom.force.x += x;
    atom.force.y += y;
    atom.force.z += z;
  }

  velocity(atom) {
    return {
      x: atom.position.x - atom.previousPosition.x,
      y: atom.position.y - atom.previousPosition.y,
      z: atom.position.z - atom.previousPosition.z,
    };
  }
};
