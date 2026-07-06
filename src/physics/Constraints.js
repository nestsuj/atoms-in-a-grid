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

window.Atoms.StrainLimitConstraintSolver = class StrainLimitConstraintSolver {
  constructor(constraints) {
    this.constraints = constraints;
  }

  solve(world) {
    const solver = world.solver;
    if (!solver.strainLimitEnabled || solver.strainLimitStiffness <= 0) {
      return;
    }

    const minFactor = Math.min(solver.minStretchFactor, solver.maxStretchFactor);
    const maxFactor = Math.max(solver.minStretchFactor, solver.maxStretchFactor);

    for (const constraint of this.constraints(world)) {
      this.solveConstraint(world, constraint, minFactor, maxFactor, solver.strainLimitStiffness);
    }
  }

  solveConstraint(world, constraint, minFactor, maxFactor, stiffness) {
    const a = constraint.a;
    const b = constraint.b;
    const deltaX = b.position.x - a.position.x;
    const deltaY = b.position.y - a.position.y;
    const deltaZ = b.position.z - a.position.z;
    const currentLength = Math.max(Math.hypot(deltaX, deltaY, deltaZ), 0.000001);
    const minLength = constraint.restLength * minFactor;
    const maxLength = constraint.restLength * maxFactor;
    let targetLength = currentLength;

    if (currentLength > maxLength) {
      targetLength = maxLength;
    } else if (currentLength < minLength) {
      targetLength = minLength;
    } else {
      return;
    }

    const correction = (currentLength - targetLength) * stiffness;
    const directionX = deltaX / currentLength;
    const directionY = deltaY / currentLength;
    const directionZ = deltaZ / currentLength;
    const aLocked = world.isLocked(a);
    const bLocked = world.isLocked(b);

    if (aLocked && bLocked) {
      return;
    }

    if (!aLocked && !bLocked) {
      this.translate(a, directionX * correction * 0.5, directionY * correction * 0.5, directionZ * correction * 0.5);
      this.translate(b, -directionX * correction * 0.5, -directionY * correction * 0.5, -directionZ * correction * 0.5);
    } else if (!aLocked) {
      this.translate(a, directionX * correction, directionY * correction, directionZ * correction);
    } else if (!bLocked) {
      this.translate(b, -directionX * correction, -directionY * correction, -directionZ * correction);
    }
  }

  translate(atom, x, y, z) {
    atom.position.x += x;
    atom.position.y += y;
    atom.position.z += z;
    atom.previousPosition.x += x;
    atom.previousPosition.y += y;
    atom.previousPosition.z += z;
  }
};

window.Atoms.ClothPanelAreaConstraintSolver = class ClothPanelAreaConstraintSolver {
  solve(world) {
    const solver = world.solver;
    const lattice = world.lattice;

    if (
      !solver.strainLimitEnabled
      || solver.panelAreaStiffness <= 0
      || solver.panelAreaMinFactor <= 0
      || lattice.depth !== 1
      || !lattice.surfacePanels
    ) {
      return;
    }

    const minArea = lattice.restLength * lattice.restLength * solver.panelAreaMinFactor;
    for (const panel of lattice.surfacePanels) {
      if (panel.side === "front") {
        this.solvePanel(world, panel, minArea, solver.panelAreaStiffness);
      }
    }
  }

  solvePanel(world, panel, minArea, stiffness) {
    const area = this.panelArea(panel);
    if (area >= minArea || area < 0.000001) {
      return;
    }

    const atoms = [panel.a, panel.b, panel.c, panel.d];
    const center = {
      x: 0,
      y: 0,
      z: 0,
    };
    let movable = 0;

    for (const atom of atoms) {
      center.x += atom.position.x;
      center.y += atom.position.y;
      center.z += atom.position.z;
      if (!world.isLocked(atom)) {
        movable += 1;
      }
    }

    if (movable === 0) {
      return;
    }

    center.x *= 0.25;
    center.y *= 0.25;
    center.z *= 0.25;

    const expansion = (Math.sqrt(minArea / area) - 1) * stiffness;
    for (const atom of atoms) {
      if (world.isLocked(atom)) {
        continue;
      }

      this.translate(
        atom,
        (atom.position.x - center.x) * expansion,
        (atom.position.y - center.y) * expansion,
        (atom.position.z - center.z) * expansion,
      );
    }
  }

  panelArea(panel) {
    return this.triangleArea(panel.a, panel.b, panel.c) + this.triangleArea(panel.a, panel.c, panel.d);
  }

  triangleArea(a, b, c) {
    const ab = {
      x: b.position.x - a.position.x,
      y: b.position.y - a.position.y,
      z: b.position.z - a.position.z,
    };
    const ac = {
      x: c.position.x - a.position.x,
      y: c.position.y - a.position.y,
      z: c.position.z - a.position.z,
    };
    return window.Atoms.length(window.Atoms.cross(ab, ac)) * 0.5;
  }

  translate(atom, x, y, z) {
    atom.position.x += x;
    atom.position.y += y;
    atom.position.z += z;
    atom.previousPosition.x += x;
    atom.previousPosition.y += y;
    atom.previousPosition.z += z;
  }
};
