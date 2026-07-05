window.Atoms = window.Atoms || {};

window.Atoms.DistanceConstraintSolver = class DistanceConstraintSolver {
  constructor(constraints, stiffness, cadence = () => 1) {
    this.constraints = constraints;
    this.stiffness = stiffness;
    this.cadence = cadence;
  }

  solve(world, iteration = 0) {
    const cadence = Math.max(1, Math.round(this.cadence(world)));
    if (iteration % cadence !== 0) {
      return;
    }

    const constraints = this.constraints(world);
    const stiffness = this.stiffness(world);
    if (stiffness <= 0) {
      return;
    }

    for (const constraint of constraints) {
      this.solveConstraint(world, constraint, stiffness);
    }
  }

  solveConstraint(world, constraint, stiffness) {
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
    const aLocked = world.isLocked(a);
    const bLocked = world.isLocked(b);

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
};

window.Atoms.LockConstraintSolver = class LockConstraintSolver {
  solve(world) {
    for (const atom of world.lattice.atoms) {
      const pinned = world.solver.pinned.get(atom.id);
      if (atom.fixed) {
        window.Atoms.copy(atom.position, atom.fixedPosition);
      } else if (pinned && world.solver.isHardGrab()) {
        window.Atoms.copy(atom.position, pinned.current);
      }
    }
  }
};
