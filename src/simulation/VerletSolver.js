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
    this.gravity = config.gravityEnabled ? config.gravityStrength : 0;
    this.windEnabled = config.windEnabled;
    this.windStrength = config.windStrength;
    this.windTurbulence = config.windTurbulence;
    this.windScale = config.windScale;
    this.windSpeed = config.windSpeed;
    this.windDrag = config.windDrag;
    this.windFlutter = config.windFlutter;
    this.windDirection = this.getWindDirection(config.windDirection);
    this.iterations = config.iterations;
    this.bendCadence = config.fastBending ? 2 : 1;
    this.effectiveBendStiffness = Math.min(1, this.bendStiffness * this.bendCadence);
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
      this.applyLocks(lattice);
      this.preserveWindNeutralHeight(lattice);
    }
  }

  stepConstraints(lattice, time) {
    const windVerticalBias = this.windVerticalBias(lattice, time);

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
          const wind = this.sampleWindForce(atom, lattice, time);
          atom.position.x += wind.x;
          atom.position.y += wind.y - windVerticalBias;
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
      this.applyLocks(lattice);
    }

    this.preserveWindNeutralHeight(lattice);
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
    if (!this.windEnabled || this.windStrength <= 0) {
      return;
    }

    const verticalBias = this.windVerticalBias(lattice, time);

    for (const atom of lattice.atoms) {
      if (atom.fixed || this.isHardPinned(atom)) {
        continue;
      }

      const wind = this.sampleWindForce(atom, lattice, time);
      atom.force.x += wind.x * this.mass;
      atom.force.y += (wind.y - verticalBias) * this.mass;
      atom.force.z += wind.z * this.mass;
    }
  }

  windVerticalBias(lattice, time) {
    if (!this.windEnabled || this.windStrength <= 0 || lattice.depth !== 1) {
      return 0;
    }

    let total = 0;
    let count = 0;

    for (const atom of lattice.atoms) {
      if (atom.fixed || this.isHardPinned(atom)) {
        continue;
      }

      total += this.sampleWindForce(atom, lattice, time).y;
      count += 1;
    }

    return count > 0 ? total / count : 0;
  }

  preserveWindNeutralHeight(lattice) {
    if (!this.windEnabled || lattice.depth !== 1 || this.windDirection.y !== 0 || this.gravity > 0.000001) {
      return;
    }

    let total = 0;
    let count = 0;

    for (const atom of lattice.atoms) {
      if (atom.fixed || this.isHardPinned(atom)) {
        continue;
      }

      total += atom.position.y - atom.restPosition.y;
      count += 1;
    }

    if (count === 0) {
      return;
    }

    const offset = total / count;
    if (Math.abs(offset) < 0.000001) {
      return;
    }

    for (const atom of lattice.atoms) {
      if (atom.fixed || this.isHardPinned(atom)) {
        continue;
      }

      atom.position.y -= offset;
      atom.previousPosition.y -= offset;
    }
  }

  sampleWindForce(atom, lattice, time) {
    const windVelocity = this.sampleWindVelocity(atom, lattice, time);
    const normal = this.localSurfaceNormal(atom, lattice);
    const atomVelocityX = atom.position.x - atom.previousPosition.x;
    const atomVelocityY = atom.position.y - atom.previousPosition.y;
    const atomVelocityZ = atom.position.z - atom.previousPosition.z;
    const relativeX = windVelocity.x - atomVelocityX;
    const relativeY = windVelocity.y - atomVelocityY;
    const relativeZ = windVelocity.z - atomVelocityZ;
    const normalSpeed = relativeX * normal.x + relativeY * normal.y + relativeZ * normal.z;
    const tangentX = relativeX - normal.x * normalSpeed;
    const tangentY = relativeY - normal.y * normalSpeed;
    const tangentZ = relativeZ - normal.z * normalSpeed;
    const facing = Math.abs(normal.x * this.windDirection.x + normal.y * this.windDirection.y + normal.z * this.windDirection.z);
    const pressureScale = 0.2 + 0.8 * facing;
    const flutter = this.sampleFlutter(atom, lattice, time);
    const normalDrag = this.windDrag;
    const skinDrag = this.windDrag * 0.01;
    const pressure = normalSpeed * pressureScale + flutter + normalSpeed * normalDrag;

    const force = {
      x: normal.x * pressure + tangentX * skinDrag,
      y: normal.y * pressure + tangentY * skinDrag,
      z: normal.z * pressure + tangentZ * skinDrag,
    };

    if (lattice.depth === 1 && this.windDirection.y === 0) {
      force.y = 0;
    }

    return force;
  }

  sampleFlutter(atom, lattice, time) {
    if (this.windFlutter <= 0 || this.windTurbulence <= 0) {
      return 0;
    }

    const exposure = this.surfaceExposure(atom, lattice);
    const xRatio = lattice.width > 1 ? atom.gridX / (lattice.width - 1) : 1;
    const phase = time * this.windSpeed * 5.2;
    const traveling = Math.sin(xRatio * Math.PI * 3.4 - phase);
    const crossWave = Math.sin(xRatio * Math.PI * 1.2 + phase * 0.73 + atom.gridX * 0.31);
    const signedWave = traveling * 0.72 + crossWave * 0.28;
    const freeEdgeGain = 0.25 + 0.75 * xRatio;

    return signedWave * this.windStrength * this.windTurbulence * this.windFlutter * exposure * freeEdgeGain;
  }

  sampleWindVelocity(atom, lattice, time) {
    const exposure = this.surfaceExposure(atom, lattice);
    if (exposure <= 0) {
      return { x: 0, y: 0, z: 0 };
    }

    const field = this.sampleWindField(atom.position, time);
    const strength = this.windStrength * exposure * window.Atoms.clamp(1 + this.windTurbulence * field, 0, 2.5);

    return {
      x: this.windDirection.x * strength,
      y: this.windDirection.y * strength,
      z: this.windDirection.z * strength,
    };
  }

  localSurfaceNormal(atom, lattice) {
    if (lattice.depth !== 1 || lattice.width < 2 || lattice.height < 2) {
      return this.windDirection;
    }

    const left = lattice.atomAt(Math.max(0, atom.gridX - 1), atom.gridY, atom.gridZ);
    const right = lattice.atomAt(Math.min(lattice.width - 1, atom.gridX + 1), atom.gridY, atom.gridZ);
    const up = lattice.atomAt(atom.gridX, Math.max(0, atom.gridY - 1), atom.gridZ);
    const down = lattice.atomAt(atom.gridX, Math.min(lattice.height - 1, atom.gridY + 1), atom.gridZ);
    const tangentX = {
      x: right.position.x - left.position.x,
      y: right.position.y - left.position.y,
      z: right.position.z - left.position.z,
    };
    const tangentY = {
      x: down.position.x - up.position.x,
      y: down.position.y - up.position.y,
      z: down.position.z - up.position.z,
    };
    const normal = window.Atoms.normalize(window.Atoms.cross(tangentX, tangentY));

    if (window.Atoms.length(normal) < 0.000001) {
      return this.windDirection;
    }

    return normal;
  }

  sampleWindField(position, time) {
    const scale = Math.max(40, this.windScale);
    const t = time * this.windSpeed;
    const x = position.x / scale;
    const y = position.y / scale;
    const z = position.z / scale;

    const a = Math.sin(x * 1.7 + y * 0.7 + t * 1.9);
    const b = Math.sin(y * 1.3 - z * 1.1 + t * 1.2 + 1.8);
    const c = Math.sin((x + z) * 0.9 - y * 0.4 - t * 1.6 + 3.1);

    return (a * 0.5 + b * 0.3 + c * 0.2);
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
