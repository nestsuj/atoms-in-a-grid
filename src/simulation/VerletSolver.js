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
    this.releaseEnergy = config.releaseEnergy;
    this.dragStrength = config.dragStrength;
    this.gravity = config.gravityEnabled ? config.gravityStrength : 0;
    this.iterations = config.iterations;
    this.bendCadence = config.fastBending ? 2 : 1;
    this.effectiveBendStiffness = Math.min(1, this.bendStiffness * this.bendCadence);
  }

  pin(atom, position) {
    this.pinned.set(atom.id, {
      current: window.Atoms.clone(position),
      previous: window.Atoms.clone(position),
      velocity: window.Atoms.vec3(),
    });
    atom.selected = true;
    if (this.isHardGrab()) {
      window.Atoms.copy(atom.position, position);
      window.Atoms.copy(atom.previousPosition, position);
    }
  }

  movePin(atom, position) {
    const pin = this.pinned.get(atom.id);
    if (!pin) {
      this.pin(atom, position);
      return;
    }

    window.Atoms.copy(pin.previous, pin.current);
    window.Atoms.copy(pin.current, position);
    pin.velocity.x = pin.current.x - pin.previous.x;
    pin.velocity.y = pin.current.y - pin.previous.y;
    pin.velocity.z = pin.current.z - pin.previous.z;
    if (this.isHardGrab()) {
      window.Atoms.copy(atom.position, position);
    }
  }

  release(atom) {
    const pin = this.pinned.get(atom.id);
    this.pinned.delete(atom.id);
    atom.selected = false;

    if (!pin) {
      window.Atoms.copy(atom.previousPosition, atom.position);
      return;
    }

    if (this.isHardGrab()) {
      atom.previousPosition.x = atom.position.x - pin.velocity.x * this.releaseEnergy;
      atom.previousPosition.y = atom.position.y - pin.velocity.y * this.releaseEnergy;
      atom.previousPosition.z = atom.position.z - pin.velocity.z * this.releaseEnergy;
    }
  }

  step(lattice) {
    for (const atom of lattice.atoms) {
      const pinned = this.pinned.get(atom.id);
      if (atom.fixed) {
        window.Atoms.copy(atom.position, atom.restPosition);
        window.Atoms.copy(atom.previousPosition, atom.restPosition);
      } else if (pinned && this.isHardGrab()) {
        window.Atoms.copy(atom.position, pinned.current);
        atom.previousPosition.x = pinned.current.x - pinned.velocity.x;
        atom.previousPosition.y = pinned.current.y - pinned.velocity.y;
        atom.previousPosition.z = pinned.current.z - pinned.velocity.z;
        pinned.velocity.x *= 0.86;
        pinned.velocity.y *= 0.86;
        pinned.velocity.z *= 0.86;
      } else {
        const x = atom.position.x;
        const y = atom.position.y;
        const z = atom.position.z;
        atom.position.x += (atom.position.x - atom.previousPosition.x) * this.damping;
        atom.position.y += (atom.position.y - atom.previousPosition.y) * this.damping - this.gravity;
        atom.position.z += (atom.position.z - atom.previousPosition.z) * this.damping;
        atom.previousPosition.x = x;
        atom.previousPosition.y = y;
        atom.previousPosition.z = z;

        if (pinned) {
          atom.position.x += (pinned.current.x - atom.position.x) * this.dragStrength;
          atom.position.y += (pinned.current.y - atom.position.y) * this.dragStrength;
          atom.position.z += (pinned.current.z - atom.position.z) * this.dragStrength;
          pinned.velocity.x *= 0.86;
          pinned.velocity.y *= 0.86;
          pinned.velocity.z *= 0.86;
        }
      }
    }

    for (let i = 0; i < this.iterations; i += 1) {
      this.solveDistanceConstraints(lattice.bonds, this.stiffness);
      if (i % this.bendCadence === 0) {
        this.solveDistanceConstraints(lattice.bendingConstraints, this.effectiveBendStiffness);
      }
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
      const currentLength = Math.max(Math.sqrt(deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ), 0.0001);
      const difference = (currentLength - constraint.restLength) / currentLength;
      const correctionX = deltaX * difference * stiffness;
      const correctionY = deltaY * difference * stiffness;
      const correctionZ = deltaZ * difference * stiffness;
      const aLocked = a.fixed || this.isHardPinned(a);
      const bLocked = b.fixed || this.isHardPinned(b);

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
      } else if (pinned && this.isHardGrab()) {
        window.Atoms.copy(atom.position, pinned.current);
      }
    }
  }

  isHardGrab() {
    return this.dragStrength >= 0.995;
  }

  isHardPinned(atom) {
    return this.isHardGrab() && this.pinned.has(atom.id);
  }
};
