window.Atoms = window.Atoms || {};

window.Atoms.VerletSolver = class VerletSolver {
  constructor(config) {
    this.configure(config);
    this.pinned = new Map();
  }

  configure(config) {
    this.physicsMode = config.physicsMode;
    this.damping = config.damping;
    this.stiffness = config.stiffness;
    this.shearStiffness = config.shearStiffness;
    this.springDamping = config.springDamping;
    this.shearDamping = config.shearDamping;
    this.bendStiffness = config.bendStiffness;
    this.bendDamping = config.bendDamping;
    this.mass = window.Atoms.readNumber(config.atomMass, 1, 0.1, 10);
    this.inverseMass = 1 / this.mass;
    this.releaseEnergy = config.releaseEnergy;
    this.dragStrength = config.dragStrength;
    this.mouseStiffness = config.mouseStiffness;
    this.mouseDamping = config.mouseDamping;
    this.collisionEnabled = config.collisionEnabled;
    this.collisionRadiusScale = config.collisionRadiusScale;
    this.collisionStiffness = config.collisionStiffness;
    this.collisionPasses = config.collisionPasses;
    this.gravity = config.gravityEnabled ? config.gravityStrength : 0;
    this.windEnabled = config.windEnabled;
    this.windStrength = config.windStrength;
    this.windTurbulence = config.windTurbulence;
    this.windScale = config.windScale;
    this.windSpeed = config.windSpeed;
    this.windDrag = config.windDrag;
    this.windFlutter = config.windFlutter;
    this.windResponse = config.windResponse;
    this.windDirectionId = config.windDirection;
    this.windDirection = this.getWindDirection(config.windDirection);
    this.iterations = config.iterations;
    this.bendCadence = config.fastBending ? 2 : 1;
    this.effectiveBendStiffness = Math.min(1, this.bendStiffness * this.bendCadence);
    this.windStats = this.windStats || this.emptyWindStats();
    this.collisionStats = this.collisionStats || this.emptyCollisionStats();
  }

  emptyWindStats() {
    return {
      totalForce: 0,
      maxForce: 0,
      samples: 0,
      averageForce: 0,
      direction: "off",
    };
  }

  emptyCollisionStats() {
    return {
      testedPairs: 0,
      corrections: 0,
      maxCorrection: 0,
      activeAtoms: new Set(),
    };
  }

  pin(atom, position) {
    this.pinned.set(atom.id, {
      atom,
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

  step(lattice, time = 0) {
    if (this.physicsMode === "spring") {
      this.stepSpringForces(lattice, time);
      return;
    }

    this.stepConstraints(lattice, time);
  }

  stepSpringForces(lattice, time) {
    const substeps = this.springSubsteps();
    const dt = 1 / substeps;
    const dtSquared = dt * dt;
    const substepDamping = Math.pow(this.damping, dt);
    const springStiffness = this.stiffness;
    const bendSpringStiffness = this.bendStiffness * 0.35;
    this.collisionStats = this.emptyCollisionStats();

    for (let i = 0; i < substeps; i += 1) {
      this.clearForces(lattice);
      this.applyGravity(lattice);
      this.applyWind(lattice, time);
      this.applySpringForces(lattice.bonds, springStiffness, this.springDamping);
      this.applySpringForces(lattice.shearSprings, this.shearStiffness, this.shearDamping);
      this.applySpringForces(lattice.bendingConstraints, bendSpringStiffness, this.bendDamping);
      this.applyMouseSpringForces();
      this.integrateForces(lattice, substepDamping, dtSquared);
      this.solveCollisions(lattice);
      this.applyLocks(lattice);
    }
  }

  springSubsteps() {
    const baseSubsteps = Math.max(1, this.iterations);
    const lightMassMultiplier = Math.ceil(Math.sqrt(1 / this.mass));
    return Math.min(48, baseSubsteps * Math.max(1, lightMassMultiplier));
  }

  stepConstraints(lattice, time) {
    this.collisionStats = this.emptyCollisionStats();

    for (const atom of lattice.atoms) {
      const pinned = this.pinned.get(atom.id);
      if (atom.fixed) {
        window.Atoms.copy(atom.position, atom.fixedPosition);
        window.Atoms.copy(atom.previousPosition, atom.fixedPosition);
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
        if (this.windEnabled && this.windStrength > 0) {
          const wind = this.sampleParticleWindForce(atom, lattice, time);
          atom.position.x += wind.x;
          atom.position.y += wind.y;
          atom.position.z += wind.z;
        }
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
      this.solveCollisions(lattice);
      this.applyLocks(lattice);
    }
  }

  clearForces(lattice) {
    for (const atom of lattice.atoms) {
      atom.force.x = 0;
      atom.force.y = 0;
      atom.force.z = 0;
    }
  }

  applyGravity(lattice) {
    if (this.gravity <= 0) {
      return;
    }

    for (const atom of lattice.atoms) {
      if (atom.fixed || this.isHardPinned(atom)) {
        continue;
      }

      atom.force.y -= this.gravity * this.mass;
    }
  }

  applyWind(lattice, time) {
    this.windStats = this.emptyWindStats();
    this.windStats.direction = this.windDirectionLabel();

    if (!this.windEnabled || this.windStrength <= 0) {
      return;
    }

    this.applySurfaceWind(lattice, time);
    this.windStats.averageForce = this.windStats.samples > 0
      ? this.windStats.totalForce / this.windStats.samples
      : 0;
  }

  sampleParticleWindForce(atom, lattice, time) {
    const windVelocity = this.sampleWindVelocity(atom, lattice, time);
    const atomVelocityX = atom.position.x - atom.previousPosition.x;
    const atomVelocityY = atom.position.y - atom.previousPosition.y;
    const atomVelocityZ = atom.position.z - atom.previousPosition.z;

    return {
      x: (windVelocity.x - atomVelocityX) * this.windDrag * this.windResponse * 0.02,
      y: (windVelocity.y - atomVelocityY) * this.windDrag * this.windResponse * 0.02,
      z: (windVelocity.z - atomVelocityZ) * this.windDrag * this.windResponse * 0.02,
    };
  }

  applySurfaceWind(lattice, time) {
    const panels = lattice.surfacePanels || [];

    if (panels.length === 0) {
      return;
    }

    for (const panel of panels) {
      if (lattice.depth === 1 && panel.side === "back") {
        continue;
      }

      this.applyWindQuad(lattice, time, panel.a, panel.b, panel.c, panel.d);
    }
  }

  applyWindQuad(lattice, time, a, b, c, d) {
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
    const force = this.windPanelForce(lattice, time, [a, b, c, d], unitNormal, centroid, doubleArea);

    this.addWindForceToAtom(a, force, 0.25);
    this.addWindForceToAtom(b, force, 0.25);
    this.addWindForceToAtom(c, force, 0.25);
    this.addWindForceToAtom(d, force, 0.25);
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

  windPanelForce(lattice, time, atoms, normal, centroid, doubleArea) {
    const exposure = this.surfaceExposureAt(lattice, centroid);
    const windVelocity = this.sampleWindVelocityAt(centroid, exposure, time);
    const surfaceVelocity = {
      x: 0,
      y: 0,
      z: 0,
    };

    for (const atom of atoms) {
      surfaceVelocity.x += atom.position.x - atom.previousPosition.x;
      surfaceVelocity.y += atom.position.y - atom.previousPosition.y;
      surfaceVelocity.z += atom.position.z - atom.previousPosition.z;
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
    const pressure = normalSpeed * Math.abs(normalSpeed) * (0.65 + this.windDrag * 0.7) * this.windResponse * areaScale;
    const skin = this.windDrag * this.windResponse * 0.01 * areaScale;
    const flutter = this.sampleFlutter(centroid, time);
    const flutterLift = tangentSpeed * tangentSpeed * flutter * this.windResponse * (0.08 + (1 - projectedExposure) * 0.14) * areaScale;

    return {
      x: normal.x * (pressure + flutterLift) + tangent.x * skin,
      y: normal.y * (pressure + flutterLift) + tangent.y * skin,
      z: normal.z * (pressure + flutterLift) + tangent.z * skin,
    };
  }

  applyWindTriangle(lattice, time, a, b, c) {
    const shape = this.windTriangleShape(a, b, c);

    if (shape.doubleArea < 0.000001) {
      return;
    }

    const force = this.windPanelForce(
      lattice,
      time,
      [a, b, c],
      window.Atoms.normalize(shape.areaNormal),
      shape.centroid,
      shape.doubleArea,
    );

    this.addWindForceToAtom(a, force, 1 / 3);
    this.addWindForceToAtom(b, force, 1 / 3);
    this.addWindForceToAtom(c, force, 1 / 3);
  }

  addWindForceToAtom(atom, force, share) {
    if (atom.fixed || this.isHardPinned(atom)) {
      return;
    }

    const forceX = force.x * share * this.mass;
    const forceY = force.y * share * this.mass;
    const forceZ = force.z * share * this.mass;
    const forceLength = Math.hypot(forceX, forceY, forceZ);

    atom.force.x += forceX;
    atom.force.y += forceY;
    atom.force.z += forceZ;
    this.windStats.totalForce += forceLength;
    this.windStats.maxForce = Math.max(this.windStats.maxForce, forceLength);
    this.windStats.samples += 1;
  }

  sampleFlutter(position, time) {
    return window.Atoms.WindField.flutter(this, position, time);
  }

  sampleWindVelocity(atom, lattice, time) {
    return this.sampleWindVelocityAt(atom.position, this.surfaceExposure(atom, lattice), time);
  }

  sampleWindVelocityAt(position, exposure, time) {
    if (exposure <= 0) {
      return { x: 0, y: 0, z: 0 };
    }

    const field = this.sampleWindField(position, time);
    const flutter = this.sampleFlutter(position, time);
    const strength = this.windStrength * exposure * window.Atoms.clamp(1 + this.windTurbulence * field + flutter, 0, 2.5);

    return {
      x: this.windDirection.x * strength,
      y: this.windDirection.y * strength,
      z: this.windDirection.z * strength,
    };
  }

  sampleWindField(position, time) {
    return window.Atoms.WindField.sample(this, position, time);
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

  getWindDirection(value) {
    switch (value) {
      case "z-": return { x: 0, y: 0, z: -1 };
      case "x+": return { x: 1, y: 0, z: 0 };
      case "x-": return { x: -1, y: 0, z: 0 };
      case "y+": return { x: 0, y: 1, z: 0 };
      case "y-": return { x: 0, y: -1, z: 0 };
      case "z+":
      default: return { x: 0, y: 0, z: 1 };
    }
  }

  windDirectionLabel() {
    if (!this.windEnabled || this.windStrength <= 0) {
      return "off";
    }

    return this.windDirectionId;
  }

  applySpringForces(constraints, stiffness, damping = 0) {
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
      const extension = currentLength - constraint.restLength;
      const directionX = deltaX / currentLength;
      const directionY = deltaY / currentLength;
      const directionZ = deltaZ / currentLength;
      const relativeVelocityX = (b.position.x - b.previousPosition.x) - (a.position.x - a.previousPosition.x);
      const relativeVelocityY = (b.position.y - b.previousPosition.y) - (a.position.y - a.previousPosition.y);
      const relativeVelocityZ = (b.position.z - b.previousPosition.z) - (a.position.z - a.previousPosition.z);
      const relativeSpeed = relativeVelocityX * directionX + relativeVelocityY * directionY + relativeVelocityZ * directionZ;
      const force = extension * stiffness + relativeSpeed * damping;
      const forceX = directionX * force;
      const forceY = directionY * force;
      const forceZ = directionZ * force;
      const aLocked = a.fixed || this.isHardPinned(a);
      const bLocked = b.fixed || this.isHardPinned(b);

      if (!aLocked) {
        a.force.x += forceX;
        a.force.y += forceY;
        a.force.z += forceZ;
      }

      if (!bLocked) {
        b.force.x -= forceX;
        b.force.y -= forceY;
        b.force.z -= forceZ;
      }
    }
  }

  applyMouseSpringForces() {
    const stiffness = this.mouseStiffness;
    const damping = this.mouseDamping;

    for (const pin of this.pinned.values()) {
      const atom = pin.atom;
      if (!atom || atom.fixed) {
        continue;
      }

      atom.force.x += (pin.current.x - atom.position.x) * stiffness - (atom.position.x - atom.previousPosition.x) * damping;
      atom.force.y += (pin.current.y - atom.position.y) * stiffness - (atom.position.y - atom.previousPosition.y) * damping;
      atom.force.z += (pin.current.z - atom.position.z) * stiffness - (atom.position.z - atom.previousPosition.z) * damping;
    }
  }

  integrateForces(lattice, damping, dtSquared) {
    for (const atom of lattice.atoms) {
      const pinned = this.pinned.get(atom.id);

      if (atom.fixed) {
        window.Atoms.copy(atom.position, atom.fixedPosition);
        window.Atoms.copy(atom.previousPosition, atom.fixedPosition);
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
        atom.position.x += (atom.position.x - atom.previousPosition.x) * damping + atom.force.x * this.inverseMass * dtSquared;
        atom.position.y += (atom.position.y - atom.previousPosition.y) * damping + atom.force.y * this.inverseMass * dtSquared;
        atom.position.z += (atom.position.z - atom.previousPosition.z) * damping + atom.force.z * this.inverseMass * dtSquared;
        atom.previousPosition.x = x;
        atom.previousPosition.y = y;
        atom.previousPosition.z = z;

        if (pinned) {
          pinned.velocity.x *= 0.86;
          pinned.velocity.y *= 0.86;
          pinned.velocity.z *= 0.86;
        }
      }
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

  solveCollisions(lattice) {
    if (!this.collisionEnabled || this.collisionStiffness <= 0 || this.collisionRadiusScale <= 0) {
      return;
    }

    const passes = Math.max(1, Math.round(this.collisionPasses));
    for (let i = 0; i < passes; i += 1) {
      this.solveCollisionPass(lattice);
    }
  }

  solveCollisionPass(lattice) {
    const collisionRadius = Math.max(0.001, lattice.atomRadius || 0) * this.collisionRadiusScale;
    const minDistance = collisionRadius * 2;
    const minDistanceSquared = minDistance * minDistance;
    const cellSize = Math.max(0.001, minDistance);
    const buckets = this.buildCollisionBuckets(lattice, cellSize);
    const excludedPairs = this.collisionExcludedPairs(lattice);

    for (const atom of lattice.atoms) {
      const cellX = Math.floor(atom.position.x / cellSize);
      const cellY = Math.floor(atom.position.y / cellSize);
      const cellZ = Math.floor(atom.position.z / cellSize);

      for (let z = cellZ - 1; z <= cellZ + 1; z += 1) {
        for (let y = cellY - 1; y <= cellY + 1; y += 1) {
          for (let x = cellX - 1; x <= cellX + 1; x += 1) {
            const bucket = buckets.get(this.collisionCellKey(x, y, z));
            if (!bucket) {
              continue;
            }

            for (const other of bucket) {
              if (other.id <= atom.id || excludedPairs.has(this.collisionPairKey(atom, other))) {
                continue;
              }

              this.collisionStats.testedPairs += 1;
              this.solveAtomCollision(atom, other, minDistance, minDistanceSquared);
            }
          }
        }
      }
    }

    this.solveClothSelfCollisions(lattice, collisionRadius);
  }

  buildCollisionBuckets(lattice, cellSize) {
    const buckets = new Map();

    for (const atom of lattice.atoms) {
      const x = Math.floor(atom.position.x / cellSize);
      const y = Math.floor(atom.position.y / cellSize);
      const z = Math.floor(atom.position.z / cellSize);
      const key = this.collisionCellKey(x, y, z);
      let bucket = buckets.get(key);

      if (!bucket) {
        bucket = [];
        buckets.set(key, bucket);
      }

      bucket.push(atom);
    }

    return buckets;
  }

  solveAtomCollision(a, b, minDistance, minDistanceSquared) {
    const aLocked = a.fixed || this.isHardPinned(a);
    const bLocked = b.fixed || this.isHardPinned(b);

    if (aLocked && bLocked) {
      return;
    }

    let deltaX = b.position.x - a.position.x;
    let deltaY = b.position.y - a.position.y;
    let deltaZ = b.position.z - a.position.z;
    let distanceSquared = deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ;

    if (distanceSquared >= minDistanceSquared) {
      return;
    }

    if (distanceSquared < 0.000001) {
      deltaX = ((b.id * 928371 + a.id * 364479) % 1000) / 1000 - 0.5;
      deltaY = ((b.id * 193496 + a.id * 834927) % 1000) / 1000 - 0.5;
      deltaZ = ((b.id * 738561 + a.id * 129837) % 1000) / 1000 - 0.5;
      distanceSquared = deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ;
    }

    const distance = Math.max(Math.sqrt(distanceSquared), 0.000001);
    const overlap = (minDistance - distance) * this.collisionStiffness;

    if (overlap <= 0) {
      return;
    }

    const normalX = deltaX / distance;
    const normalY = deltaY / distance;
    const normalZ = deltaZ / distance;
    this.collisionStats.corrections += 1;
    this.collisionStats.maxCorrection = Math.max(this.collisionStats.maxCorrection, overlap);
    this.collisionStats.activeAtoms.add(a.id);
    this.collisionStats.activeAtoms.add(b.id);

    if (!aLocked && !bLocked) {
      const correction = overlap * 0.5;
      a.position.x -= normalX * correction;
      a.position.y -= normalY * correction;
      a.position.z -= normalZ * correction;
      b.position.x += normalX * correction;
      b.position.y += normalY * correction;
      b.position.z += normalZ * correction;
    } else if (!aLocked) {
      a.position.x -= normalX * overlap;
      a.position.y -= normalY * overlap;
      a.position.z -= normalZ * overlap;
    } else if (!bLocked) {
      b.position.x += normalX * overlap;
      b.position.y += normalY * overlap;
      b.position.z += normalZ * overlap;
    }
  }

  solveClothSelfCollisions(lattice, collisionRadius) {
    if (lattice.depth !== 1 || !lattice.surfacePanels || lattice.surfacePanels.length === 0) {
      return;
    }

    const panels = lattice.surfacePanels.filter((panel) => panel.side === "front");
    if (panels.length === 0) {
      return;
    }

    const thickness = Math.max(0.001, collisionRadius * 0.85);

    for (const panel of panels) {
      this.solveClothTriangleCollisions(lattice, panel.a, panel.b, panel.c, thickness);
      this.solveClothTriangleCollisions(lattice, panel.a, panel.c, panel.d, thickness);
    }
  }

  solveClothTriangleCollisions(lattice, a, b, c, thickness) {
    const normal = this.triangleUnitNormal(a.position, b.position, c.position);

    if (normal.length < 0.000001) {
      return;
    }

    for (const atom of lattice.atoms) {
      if (this.isLocalClothCollision(atom, a, b, c)) {
        continue;
      }

      this.solveVertexTriangleCollision(atom, a, b, c, normal, thickness);
    }
  }

  triangleUnitNormal(a, b, c) {
    const abX = b.x - a.x;
    const abY = b.y - a.y;
    const abZ = b.z - a.z;
    const acX = c.x - a.x;
    const acY = c.y - a.y;
    const acZ = c.z - a.z;
    const nx = abY * acZ - abZ * acY;
    const ny = abZ * acX - abX * acZ;
    const nz = abX * acY - abY * acX;
    const length = Math.hypot(nx, ny, nz);

    if (length < 0.000001) {
      return { x: 0, y: 0, z: 0, length: 0 };
    }

    return { x: nx / length, y: ny / length, z: nz / length, length };
  }

  isLocalClothCollision(atom, a, b, c) {
    if (atom.id === a.id || atom.id === b.id || atom.id === c.id) {
      return true;
    }

    const minX = Math.min(a.gridX, b.gridX, c.gridX) - 1;
    const maxX = Math.max(a.gridX, b.gridX, c.gridX) + 1;
    const minY = Math.min(a.gridY, b.gridY, c.gridY) - 1;
    const maxY = Math.max(a.gridY, b.gridY, c.gridY) + 1;

    return atom.gridZ === a.gridZ
      && atom.gridX >= minX
      && atom.gridX <= maxX
      && atom.gridY >= minY
      && atom.gridY <= maxY;
  }

  solveVertexTriangleCollision(atom, a, b, c, normal, thickness) {
    const point = atom.position;
    const signedDistance = (
      (point.x - a.position.x) * normal.x +
      (point.y - a.position.y) * normal.y +
      (point.z - a.position.z) * normal.z
    );
    const previousSignedDistance = (
      (atom.previousPosition.x - a.position.x) * normal.x +
      (atom.previousPosition.y - a.position.y) * normal.y +
      (atom.previousPosition.z - a.position.z) * normal.z
    );

    if (Math.abs(signedDistance) >= thickness && signedDistance * previousSignedDistance > 0) {
      return;
    }

    const projected = {
      x: point.x - normal.x * signedDistance,
      y: point.y - normal.y * signedDistance,
      z: point.z - normal.z * signedDistance,
    };
    const bary = this.triangleBarycentric(projected, a.position, b.position, c.position);

    if (!bary || bary.u < -0.035 || bary.v < -0.035 || bary.w < -0.035) {
      return;
    }

    const side = signedDistance >= 0 ? 1 : -1;
    const targetDistance = thickness * side;
    const correction = (targetDistance - signedDistance) * this.collisionStiffness;

    if (Math.abs(correction) <= 0.000001) {
      return;
    }

    this.applyVertexTriangleCorrection(atom, a, b, c, bary, normal, correction);
  }

  triangleBarycentric(point, a, b, c) {
    const v0x = b.x - a.x;
    const v0y = b.y - a.y;
    const v0z = b.z - a.z;
    const v1x = c.x - a.x;
    const v1y = c.y - a.y;
    const v1z = c.z - a.z;
    const v2x = point.x - a.x;
    const v2y = point.y - a.y;
    const v2z = point.z - a.z;
    const d00 = v0x * v0x + v0y * v0y + v0z * v0z;
    const d01 = v0x * v1x + v0y * v1y + v0z * v1z;
    const d11 = v1x * v1x + v1y * v1y + v1z * v1z;
    const d20 = v2x * v0x + v2y * v0y + v2z * v0z;
    const d21 = v2x * v1x + v2y * v1y + v2z * v1z;
    const denominator = d00 * d11 - d01 * d01;

    if (Math.abs(denominator) < 0.000001) {
      return null;
    }

    const v = (d11 * d20 - d01 * d21) / denominator;
    const w = (d00 * d21 - d01 * d20) / denominator;
    const u = 1 - v - w;
    return { u, v, w };
  }

  applyVertexTriangleCorrection(atom, a, b, c, bary, normal, correction) {
    const atomLocked = atom.fixed || this.isHardPinned(atom);
    const weights = [
      { atom: a, weight: bary.u },
      { atom: b, weight: bary.v },
      { atom: c, weight: bary.w },
    ];
    const movableTriangleWeight = weights.reduce((total, entry) => (
      entry.atom.fixed || this.isHardPinned(entry.atom) ? total : total + Math.max(0, entry.weight)
    ), 0);

    if (atomLocked && movableTriangleWeight <= 0) {
      return;
    }

    const atomShare = atomLocked ? 0 : (movableTriangleWeight > 0 ? 0.55 : 1);
    const triangleShare = 1 - atomShare;
    const correctionLength = Math.abs(correction);

    if (!atomLocked) {
      atom.position.x += normal.x * correction * atomShare;
      atom.position.y += normal.y * correction * atomShare;
      atom.position.z += normal.z * correction * atomShare;
      this.collisionStats.activeAtoms.add(atom.id);
    }

    if (movableTriangleWeight > 0 && triangleShare > 0) {
      for (const entry of weights) {
        if (entry.atom.fixed || this.isHardPinned(entry.atom)) {
          continue;
        }

        const share = triangleShare * Math.max(0, entry.weight) / movableTriangleWeight;
        entry.atom.position.x -= normal.x * correction * share;
        entry.atom.position.y -= normal.y * correction * share;
        entry.atom.position.z -= normal.z * correction * share;
        this.collisionStats.activeAtoms.add(entry.atom.id);
      }
    }

    this.collisionStats.corrections += 1;
    this.collisionStats.maxCorrection = Math.max(this.collisionStats.maxCorrection, correctionLength);
  }

  collisionExcludedPairs(lattice) {
    if (
      lattice.collisionExcludedPairs
      && lattice.collisionExcludedBondCount === lattice.bonds.length
      && lattice.collisionExcludedShearCount === lattice.shearSprings.length
    ) {
      return lattice.collisionExcludedPairs;
    }

    const excluded = new Set();
    const add = (constraint) => {
      excluded.add(this.collisionPairKey(constraint.a, constraint.b));
    };

    for (const bond of lattice.bonds) {
      add(bond);
    }

    for (const shear of lattice.shearSprings) {
      add(shear);
    }

    lattice.collisionExcludedPairs = excluded;
    lattice.collisionExcludedBondCount = lattice.bonds.length;
    lattice.collisionExcludedShearCount = lattice.shearSprings.length;
    return excluded;
  }

  collisionPairKey(a, b) {
    return a.id < b.id ? `${a.id}:${b.id}` : `${b.id}:${a.id}`;
  }

  collisionCellKey(x, y, z) {
    return `${x}:${y}:${z}`;
  }

  applyLocks(lattice) {
    for (const atom of lattice.atoms) {
      const pinned = this.pinned.get(atom.id);
      if (atom.fixed) {
        window.Atoms.copy(atom.position, atom.fixedPosition);
      } else if (pinned && this.isHardGrab()) {
        window.Atoms.copy(atom.position, pinned.current);
      }
    }
  }

  isHardGrab() {
    return this.physicsMode !== "spring" && this.dragStrength >= 0.995;
  }

  isHardPinned(atom) {
    return this.isHardGrab() && this.pinned.has(atom.id);
  }
};
