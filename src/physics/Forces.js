window.Atoms = window.Atoms || {};

window.Atoms.GravityForce = class GravityForce {
  apply(world) {
    const solver = world.solver;

    if (solver.gravity <= 0) {
      return;
    }

    for (const atom of world.lattice.atoms) {
      world.addForce(atom, 0, -solver.gravity * solver.mass, 0);
    }
  }
};

window.Atoms.DistanceSpringForce = class DistanceSpringForce {
  constructor(constraints, stiffness, damping = 0) {
    this.constraints = constraints;
    this.stiffness = stiffness;
    this.damping = damping;
  }

  apply(world) {
    const constraints = this.constraints(world);
    const stiffness = this.stiffness(world);
    const damping = this.damping(world);

    if (stiffness <= 0) {
      return;
    }

    for (const constraint of constraints) {
      this.applyConstraint(world, constraint, stiffness, damping);
    }
  }

  applyConstraint(world, constraint, stiffness, damping) {
    const a = constraint.a;
    const b = constraint.b;
    const deltaX = b.position.x - a.position.x;
    const deltaY = b.position.y - a.position.y;
    const deltaZ = b.position.z - a.position.z;
    const currentLength = Math.max(Math.sqrt(deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ), 0.0001);
    const extension = currentLength - constraint.restLength;
    const directionX = deltaX / currentLength;
    const directionY = deltaY / currentLength;
    const directionZ = deltaZ / currentLength;
    const aVelocity = world.velocity(a);
    const bVelocity = world.velocity(b);
    const relativeSpeed = (
      (bVelocity.x - aVelocity.x) * directionX
      + (bVelocity.y - aVelocity.y) * directionY
      + (bVelocity.z - aVelocity.z) * directionZ
    );
    const force = extension * stiffness + relativeSpeed * damping;
    const forceX = directionX * force;
    const forceY = directionY * force;
    const forceZ = directionZ * force;

    world.addForce(a, forceX, forceY, forceZ);
    world.addForce(b, -forceX, -forceY, -forceZ);
  }
};

window.Atoms.MouseSpringForce = class MouseSpringForce {
  apply(world) {
    const solver = world.solver;
    const stiffness = solver.mouseStiffness;
    const damping = solver.mouseDamping;

    if (stiffness <= 0 && damping <= 0) {
      return;
    }

    for (const pin of solver.pinned.values()) {
      const atom = pin.atom;
      if (!atom || atom.fixed) {
        continue;
      }

      const velocity = world.velocity(atom);
      world.addForce(
        atom,
        (pin.current.x - atom.position.x) * stiffness - velocity.x * damping,
        (pin.current.y - atom.position.y) * stiffness - velocity.y * damping,
        (pin.current.z - atom.position.z) * stiffness - velocity.z * damping,
      );
    }
  }
};

window.Atoms.WindForce = class WindForce {
  apply(world) {
    world.solver.applyWind(world.lattice, world.time);
  }
};
