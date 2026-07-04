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
    this.mass = config.atomMass;
    this.inverseMass = 1 / Math.max(0.1, this.mass);
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
    const substeps = Math.max(1, this.iterations);
    const dt = 1 / substeps;
    const dtSquared = dt * dt;
    const substepDamping = Math.pow(this.damping, dt);
    const springStiffness = this.stiffness;
    const bendSpringStiffness = this.bendStiffness * 0.35;

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

  stepConstraints(lattice, time) {
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
    const zMax = lattice.depth - 1;
    const yMax = lattice.height - 1;
    const xMax = lattice.width - 1;

    for (let z = 0; z < lattice.depth; z += Math.max(1, zMax)) {
      for (let y = 0; y < yMax; y += 1) {
        for (let x = 0; x < xMax; x += 1) {
          this.applyWindQuad(
            lattice,
            time,
            lattice.atomAt(x, y, z),
            lattice.atomAt(x + 1, y, z),
            lattice.atomAt(x + 1, y + 1, z),
            lattice.atomAt(x, y + 1, z),
          );
        }
      }

      if (zMax === 0) break;
    }

    if (lattice.depth <= 1) {
      return;
    }

    for (let y = 0; y < lattice.height; y += Math.max(1, yMax)) {
      for (let z = 0; z < zMax; z += 1) {
        for (let x = 0; x < xMax; x += 1) {
          this.applyWindQuad(
            lattice,
            time,
            lattice.atomAt(x, y, z),
            lattice.atomAt(x, y, z + 1),
            lattice.atomAt(x + 1, y, z + 1),
            lattice.atomAt(x + 1, y, z),
          );
        }
      }

      if (yMax === 0) break;
    }

    for (let x = 0; x < lattice.width; x += Math.max(1, xMax)) {
      for (let y = 0; y < yMax; y += 1) {
        for (let z = 0; z < zMax; z += 1) {
          this.applyWindQuad(
            lattice,
            time,
            lattice.atomAt(x, y, z),
            lattice.atomAt(x, y + 1, z),
            lattice.atomAt(x, y + 1, z + 1),
            lattice.atomAt(x, y, z + 1),
          );
        }
      }

      if (xMax === 0) break;
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
    const areaScale = doubleArea / (2 * lattice.restLength * lattice.restLength);
    const pressure = normalSpeed * Math.abs(normalSpeed) * (0.65 + this.windDrag * 0.7) * this.windResponse * areaScale;
    const skin = this.windDrag * this.windResponse * 0.01 * areaScale;

    return {
      x: normal.x * pressure + tangent.x * skin,
      y: normal.y * pressure + tangent.y * skin,
      z: normal.z * pressure + tangent.z * skin,
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

              this.solveAtomCollision(atom, other, minDistance, minDistanceSquared);
            }
          }
        }
      }
    }
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
    const normalX = deltaX / distance;
    const normalY = deltaY / distance;
    const normalZ = deltaZ / distance;

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
