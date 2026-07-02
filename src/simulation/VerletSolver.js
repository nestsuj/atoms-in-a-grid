window.Atoms = window.Atoms || {};

window.Atoms.VerletSolver = class VerletSolver {
  constructor(config) {
    this.configure(config);
    this.pinned = new Map();
  }

  configure(config) {
    this.damping = config.damping;
    this.stiffness = config.stiffness;
    this.bendStiffness = config.bendStiffness;
    this.iterations = config.iterations;
  }

  pin(atom, position) {
    this.pinned.set(atom.id, position);
    atom.selected = true;
    window.Atoms.copy(atom.position, position);
    window.Atoms.copy(atom.previousPosition, position);
  }

  movePin(atom, position) {
    this.pinned.set(atom.id, position);
    window.Atoms.copy(atom.position, position);
  }

  release(atom) {
    this.pinned.delete(atom.id);
    atom.selected = false;
    window.Atoms.copy(atom.previousPosition, atom.position);
  }

  step(lattice) {
    for (const atom of lattice.atoms) {
      const pinned = this.pinned.get(atom.id);
      if (atom.fixed) {
        window.Atoms.copy(atom.position, atom.restPosition);
        window.Atoms.copy(atom.previousPosition, atom.restPosition);
      } else if (pinned) {
        window.Atoms.copy(atom.position, pinned);
        window.Atoms.copy(atom.previousPosition, pinned);
      } else {
        const x = atom.position.x;
        const y = atom.position.y;
        const z = atom.position.z;
        atom.position.x += (atom.position.x - atom.previousPosition.x) * this.damping;
        atom.position.y += (atom.position.y - atom.previousPosition.y) * this.damping;
        atom.position.z += (atom.position.z - atom.previousPosition.z) * this.damping;
        atom.previousPosition.x = x;
        atom.previousPosition.y = y;
        atom.previousPosition.z = z;
      }
    }

    for (let i = 0; i < this.iterations; i += 1) {
      this.solveDistanceConstraints(lattice.bonds, this.stiffness);
      this.solveDistanceConstraints(lattice.bendingConstraints, this.bendStiffness);
      this.applyLocks(lattice);
    }
  }

  solveDistanceConstraints(constraints, stiffness) {
    if (stiffness <= 0) {
      return;
    }

    for (const constraint of constraints) {
      const a = constraint.a;
      const b = constraint.b;
      const deltaX = b.position.x - a.position.x;
      const deltaY = b.position.y - a.position.y;
      const deltaZ = b.position.z - a.position.z;
      const currentLength = Math.max(window.Atoms.distance(a.position, b.position), 0.0001);
      const difference = (currentLength - constraint.restLength) / currentLength;
      const correctionX = deltaX * difference * stiffness;
      const correctionY = deltaY * difference * stiffness;
      const correctionZ = deltaZ * difference * stiffness;
      const aLocked = a.fixed || this.pinned.has(a.id);
      const bLocked = b.fixed || this.pinned.has(b.id);

      if (!aLocked && !bLocked) {
        a.position.x += correctionX * 0.5;
        a.position.y += correctionY * 0.5;
        a.position.z += correctionZ * 0.5;
        b.position.x -= correctionX * 0.5;
        b.position.y -= correctionY * 0.5;
        b.position.z -= correctionZ * 0.5;
      } else if (!aLocked) {
        a.position.x += correctionX;
        a.position.y += correctionY;
        a.position.z += correctionZ;
      } else if (!bLocked) {
        b.position.x -= correctionX;
        b.position.y -= correctionY;
        b.position.z -= correctionZ;
      }
    }
  }

  applyLocks(lattice) {
    for (const atom of lattice.atoms) {
      const pinned = this.pinned.get(atom.id);
      if (atom.fixed) {
        window.Atoms.copy(atom.position, atom.restPosition);
      } else if (pinned) {
        window.Atoms.copy(atom.position, pinned);
      }
    }
  }
};
