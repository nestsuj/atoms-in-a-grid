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
    const solver = world.solver;

    solver.windStats = solver.emptyWindStats();
    solver.windStats.direction = this.windDirectionLabel(world);

    if (!solver.windEnabled || solver.windStrength <= 0) {
      return;
    }

    this.applySurfaceWind(world);
    solver.windStats.averageForce = solver.windStats.samples > 0
      ? solver.windStats.totalForce / solver.windStats.samples
      : 0;
  }

  sampleParticleWindForce(world, atom) {
    const solver = world.solver;
    const windVelocity = this.sampleWindVelocity(world, atom);
    const atomVelocity = world.velocity(atom);

    return {
      x: (windVelocity.x - atomVelocity.x) * solver.windDrag * solver.windResponse * 0.02,
      y: (windVelocity.y - atomVelocity.y) * solver.windDrag * solver.windResponse * 0.02,
      z: (windVelocity.z - atomVelocity.z) * solver.windDrag * solver.windResponse * 0.02,
    };
  }

  applySurfaceWind(world) {
    const lattice = world.lattice;
    const panels = lattice.surfacePanels || [];

    if (panels.length === 0) {
      return;
    }

    for (const panel of panels) {
      if (lattice.depth === 1 && panel.side === "back") {
        continue;
      }

      this.applyWindQuad(world, panel.a, panel.b, panel.c, panel.d);
    }
  }

  applyWindQuad(world, a, b, c, d) {
    const first = this.windTriangleShape(a, b, c);
    const second = this.windTriangleShape(a, c, d);
    const doubleArea = first.doubleArea + second.doubleArea;

    if (doubleArea < 0.000001) {
      return;
    }

    let normal = {
      x: first.areaNormal.x + second.areaNormal.x,
      y: first.areaNormal.y + second.areaNormal.y,
      z: first.areaNormal.z + second.areaNormal.z,
    };
    const normalLength = window.Atoms.length(normal);

    if (normalLength < 0.000001) {
      normal = first.doubleArea >= second.doubleArea
        ? first.areaNormal
        : second.areaNormal;
    }

    const unitNormal = window.Atoms.normalize(normal);
    const centroid = {
      x: (first.centroid.x * first.doubleArea + second.centroid.x * second.doubleArea) / doubleArea,
      y: (first.centroid.y * first.doubleArea + second.centroid.y * second.doubleArea) / doubleArea,
      z: (first.centroid.z * first.doubleArea + second.centroid.z * second.doubleArea) / doubleArea,
    };
    const force = this.windPanelForce(world, [a, b, c, d], unitNormal, centroid, doubleArea);

    this.addWindForceToAtom(world, a, force, 0.25);
    this.addWindForceToAtom(world, b, force, 0.25);
    this.addWindForceToAtom(world, c, force, 0.25);
    this.addWindForceToAtom(world, d, force, 0.25);
  }

  windTriangleShape(a, b, c) {
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
    const areaNormal = window.Atoms.cross(ab, ac);

    return {
      areaNormal,
      doubleArea: window.Atoms.length(areaNormal),
      centroid: {
        x: (a.position.x + b.position.x + c.position.x) / 3,
        y: (a.position.y + b.position.y + c.position.y) / 3,
        z: (a.position.z + b.position.z + c.position.z) / 3,
      },
    };
  }

  windPanelForce(world, atoms, normal, centroid, doubleArea) {
    const solver = world.solver;
    const lattice = world.lattice;
    const exposure = this.surfaceExposureAt(lattice, centroid);
    const windVelocity = this.sampleWindVelocityAt(world, centroid, exposure);
    const surfaceVelocity = {
      x: 0,
      y: 0,
      z: 0,
    };

    for (const atom of atoms) {
      const velocity = world.velocity(atom);
      surfaceVelocity.x += velocity.x;
      surfaceVelocity.y += velocity.y;
      surfaceVelocity.z += velocity.z;
    }

    surfaceVelocity.x /= atoms.length;
    surfaceVelocity.y /= atoms.length;
    surfaceVelocity.z /= atoms.length;

    const relative = {
      x: windVelocity.x - surfaceVelocity.x,
      y: windVelocity.y - surfaceVelocity.y,
      z: windVelocity.z - surfaceVelocity.z,
    };
    const normalSpeed = relative.x * normal.x + relative.y * normal.y + relative.z * normal.z;
    const tangent = {
      x: relative.x - normal.x * normalSpeed,
      y: relative.y - normal.y * normalSpeed,
      z: relative.z - normal.z * normalSpeed,
    };
    const tangentSpeed = Math.hypot(tangent.x, tangent.y, tangent.z);
    const relativeSpeed = Math.max(0.0001, Math.hypot(relative.x, relative.y, relative.z));
    const projectedExposure = Math.abs(normalSpeed) / relativeSpeed;
    const areaScale = doubleArea / (2 * lattice.restLength * lattice.restLength);
    const pressure = normalSpeed * Math.abs(normalSpeed) * (0.65 + solver.windDrag * 0.7) * solver.windResponse * areaScale;
    const skin = solver.windDrag * solver.windResponse * 0.01 * areaScale;
    const flutter = this.sampleFlutter(world, centroid);
    const flutterLift = tangentSpeed * tangentSpeed * flutter * solver.windResponse * (0.08 + (1 - projectedExposure) * 0.14) * areaScale;

    return {
      x: normal.x * (pressure + flutterLift) + tangent.x * skin,
      y: normal.y * (pressure + flutterLift) + tangent.y * skin,
      z: normal.z * (pressure + flutterLift) + tangent.z * skin,
    };
  }

  applyWindTriangle(world, a, b, c) {
    const shape = this.windTriangleShape(a, b, c);

    if (shape.doubleArea < 0.000001) {
      return;
    }

    const force = this.windPanelForce(
      world,
      [a, b, c],
      window.Atoms.normalize(shape.areaNormal),
      shape.centroid,
      shape.doubleArea,
    );

    this.addWindForceToAtom(world, a, force, 1 / 3);
    this.addWindForceToAtom(world, b, force, 1 / 3);
    this.addWindForceToAtom(world, c, force, 1 / 3);
  }

  addWindForceToAtom(world, atom, force, share) {
    const solver = world.solver;

    if (world.isLocked(atom)) {
      return;
    }

    const forceX = force.x * share * solver.mass;
    const forceY = force.y * share * solver.mass;
    const forceZ = force.z * share * solver.mass;
    const forceLength = Math.hypot(forceX, forceY, forceZ);

    world.addForce(atom, forceX, forceY, forceZ);
    solver.windStats.totalForce += forceLength;
    solver.windStats.maxForce = Math.max(solver.windStats.maxForce, forceLength);
    solver.windStats.samples += 1;
  }

  sampleFlutter(world, position) {
    return window.Atoms.WindField.flutter(world.solver, position, world.time);
  }

  sampleWindVelocity(world, atom) {
    return this.sampleWindVelocityAt(world, atom.position, this.surfaceExposure(atom, world.lattice));
  }

  sampleWindVelocityAt(world, position, exposure) {
    const solver = world.solver;

    if (exposure <= 0) {
      return { x: 0, y: 0, z: 0 };
    }

    const field = this.sampleWindField(world, position);
    const flutter = this.sampleFlutter(world, position);
    const strength = solver.windStrength * exposure * window.Atoms.clamp(1 + solver.windTurbulence * field + flutter, 0, 2.5);

    return {
      x: solver.windDirection.x * strength,
      y: solver.windDirection.y * strength,
      z: solver.windDirection.z * strength,
    };
  }

  sampleWindField(world, position) {
    return window.Atoms.WindField.sample(world.solver, position, world.time);
  }

  surfaceExposure(atom, lattice) {
    const onX = atom.gridX === 0 || atom.gridX === lattice.width - 1;
    const onY = atom.gridY === 0 || atom.gridY === lattice.height - 1;
    const onZ = atom.gridZ === 0 || atom.gridZ === lattice.depth - 1;
    const xDenominator = Math.max(1, lattice.width - 1);
    const freeEdgeWeight = 0.35 + 0.65 * (atom.gridX / xDenominator);

    if (lattice.depth === 1) {
      return freeEdgeWeight;
    }

    return (onX || onY || onZ) ? 1 : 0.18;
  }

  surfaceExposureAt(lattice, position) {
    const xDenominator = Math.max(1, (lattice.width - 1) * lattice.restLength);
    const minX = -xDenominator * 0.5;
    const xRatio = window.Atoms.clamp((position.x - minX) / xDenominator, 0, 1);

    if (lattice.depth === 1) {
      return 0.35 + 0.65 * xRatio;
    }

    return 1;
  }

  windDirectionLabel(world) {
    const solver = world.solver;

    if (!solver.windEnabled || solver.windStrength <= 0) {
      return "off";
    }

    return solver.windDirectionId;
  }
};
