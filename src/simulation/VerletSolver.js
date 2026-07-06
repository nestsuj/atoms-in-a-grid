window.Atoms = window.Atoms || {};

window.Atoms.VerletSolver = class VerletSolver {
  constructor(config) {
    this.pinned = new Map();
    this.world = new window.Atoms.PhysicsWorld();
    this.configure(config);
  }

  configure(config) {
    this.physicsMode = window.Atoms.SolverMode.normalize(config.physicsMode);
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
    this.mouseMaxForce = window.Atoms.readNumber(config.mouseMaxForce, 90, 0, 500);
    this.dragMaxStepScale = window.Atoms.readNumber(config.dragMaxStepScale, 1.15, 0.1, 5);
    this.dragMaxSubsteps = Math.round(window.Atoms.readNumber(config.dragMaxSubsteps, 18, 1, 48));
    this.strainLimitEnabled = config.strainLimitEnabled !== false;
    this.maxStretchFactor = window.Atoms.readNumber(config.maxStretchFactor, 1.75, 1, 4);
    this.minStretchFactor = window.Atoms.readNumber(config.minStretchFactor, 0.35, 0.05, 1);
    this.strainLimitStiffness = window.Atoms.readNumber(config.strainLimitStiffness, 0.85, 0, 1);
    this.panelAreaMinFactor = window.Atoms.readNumber(config.panelAreaMinFactor, 0.16, 0, 1);
    this.panelAreaStiffness = window.Atoms.readNumber(config.panelAreaStiffness, 0.25, 0, 1);
    this.collisionEnabled = config.collisionEnabled;
    this.collisionRadiusScale = config.collisionRadiusScale;
    this.collisionStiffness = config.collisionStiffness;
    this.collisionDamping = window.Atoms.readNumber(config.collisionDamping, 0.35, 0, 1);
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
    this.windForce = this.windForce || new window.Atoms.WindForce();
    this.externalForcePipeline = this.createExternalForcePipeline();
    this.springForcePipeline = this.createSpringForcePipeline();
    this.constraintPipeline = this.createConstraintPipeline();
    this.safetyPipeline = this.createSafetyPipeline();
    this.collisionPipeline = this.createCollisionPipeline();
    this.lockConstraint = new window.Atoms.LockConstraintSolver();
  }

  createExternalForcePipeline() {
    return [
      new window.Atoms.GravityForce(),
      this.windForce,
      new window.Atoms.MouseSpringForce(),
    ];
  }

  createSpringForcePipeline() {
    return [
      ...this.externalForcePipeline,
      new window.Atoms.DistanceSpringForce(
        (world) => world.lattice.bonds,
        (world) => world.solver.stiffness,
        (world) => world.solver.springDamping,
      ),
      new window.Atoms.DistanceSpringForce(
        (world) => world.lattice.shearSprings,
        (world) => world.solver.shearStiffness,
        (world) => world.solver.shearDamping,
      ),
      new window.Atoms.DistanceSpringForce(
        (world) => world.lattice.bendingConstraints,
        (world) => world.solver.bendStiffness * 0.35,
        (world) => world.solver.bendDamping,
      ),
    ];
  }

  createConstraintPipeline() {
    return [
      new window.Atoms.DistanceConstraintSolver(
        (world) => world.lattice.bonds,
        (world) => world.solver.stiffness,
      ),
      new window.Atoms.DistanceConstraintSolver(
        (world) => world.lattice.bendingConstraints,
        (world) => world.solver.effectiveBendStiffness,
        (world) => world.solver.bendCadence,
      ),
    ];
  }

  createSafetyPipeline() {
    return [
      new window.Atoms.StrainLimitConstraintSolver(
        (world) => world.lattice.bonds,
      ),
      new window.Atoms.StrainLimitConstraintSolver(
        (world) => world.lattice.shearSprings,
      ),
      new window.Atoms.ClothPanelAreaConstraintSolver(),
    ];
  }

  createCollisionPipeline() {
    return [
      new window.Atoms.ParticleCollisionSolver(),
      new window.Atoms.ClothSelfCollisionSolver(),
    ];
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
      goal: window.Atoms.clone(position),
      velocity: window.Atoms.vec3(),
    });
    atom.selected = true;
    if (this.isHardGrab()) {
      window.Atoms.copy(atom.position, position);
      window.Atoms.copy(atom.previousPosition, position);
    }
  }

  movePin(atom, position, options = {}) {
    const pin = this.pinned.get(atom.id);
    if (!pin) {
      this.pin(atom, position);
      return;
    }

    window.Atoms.copy(pin.goal, position);

    if (options.immediate) {
      window.Atoms.copy(pin.previous, position);
      window.Atoms.copy(pin.current, position);
      pin.velocity.x = 0;
      pin.velocity.y = 0;
      pin.velocity.z = 0;
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
    this.currentRestLength = Math.max(1, lattice.restLength || 1);

    if (window.Atoms.SolverMode.isForce(this.physicsMode)) {
      this.stepSpringForces(lattice, time);
      return;
    }

    this.stepConstraints(lattice, time);
  }

  stepSpringForces(lattice, time) {
    const substeps = this.springSubsteps();
    const dt = 1 / substeps;
    const substepDamping = Math.pow(this.damping, dt);
    this.collisionStats = this.emptyCollisionStats();

    for (let i = 0; i < substeps; i += 1) {
      const world = this.world.bind(lattice, this, time, dt);
      this.advancePins(dt);
      world.clearForces();
      this.applyForcePipeline(world);
      this.integrateForces(lattice, substepDamping, world.dtSquared);
      this.solveCollisions(lattice);
      this.applySafetyPipeline(world);
      this.solveLocks(world);
    }
  }

  applyForcePipeline(world) {
    for (const force of this.springForcePipeline) {
      force.apply(world);
    }
  }

  applyExternalForcePipeline(world) {
    for (const force of this.externalForcePipeline) {
      force.apply(world);
    }
  }

  applyConstraintPipeline(world, iteration) {
    for (const constraint of this.constraintPipeline) {
      constraint.solve(world, iteration);
    }
  }

  applySafetyPipeline(world) {
    for (const constraint of this.safetyPipeline) {
      constraint.solve(world);
    }
  }

  solveLocks(world) {
    this.lockConstraint.solve(world);
  }

  applyCollisionPipeline(world, collisionRadius) {
    for (const collision of this.collisionPipeline) {
      collision.solve(world, collisionRadius);
    }
  }

  springSubsteps() {
    const baseSubsteps = Math.max(1, this.iterations);
    const lightMassMultiplier = Math.ceil(Math.sqrt(1 / this.mass));
    return this.adaptiveSubsteps(baseSubsteps * Math.max(1, lightMassMultiplier));
  }

  positionSubsteps() {
    return this.adaptiveSubsteps(1);
  }

  adaptiveSubsteps(baseSubsteps) {
    if (this.pinned.size === 0) {
      return Math.min(48, baseSubsteps);
    }

    const restLength = Math.max(1, this.currentRestLength || 1);
    const maxPending = this.maxPendingPinDistance();
    const targetStep = Math.max(1, restLength * 0.35);
    const dragSubsteps = Math.ceil(Math.min(maxPending, restLength * 3) / targetStep);
    return Math.min(48, Math.max(baseSubsteps, Math.min(this.dragMaxSubsteps, dragSubsteps)));
  }

  maxPendingPinDistance() {
    let maxDistance = 0;

    for (const pin of this.pinned.values()) {
      maxDistance = Math.max(maxDistance, window.Atoms.distance(pin.current, pin.goal));
    }

    return maxDistance;
  }

  advancePins(stepFraction) {
    const restLength = Math.max(1, this.currentRestLength || 1);
    const maxStep = Math.max(0.001, restLength * this.dragMaxStepScale * stepFraction);

    for (const pin of this.pinned.values()) {
      window.Atoms.copy(pin.previous, pin.current);

      const deltaX = pin.goal.x - pin.current.x;
      const deltaY = pin.goal.y - pin.current.y;
      const deltaZ = pin.goal.z - pin.current.z;
      const distance = Math.hypot(deltaX, deltaY, deltaZ);

      if (distance <= maxStep) {
        window.Atoms.copy(pin.current, pin.goal);
      } else {
        const scale = maxStep / distance;
        pin.current.x += deltaX * scale;
        pin.current.y += deltaY * scale;
        pin.current.z += deltaZ * scale;
      }

      pin.velocity.x = pin.current.x - pin.previous.x;
      pin.velocity.y = pin.current.y - pin.previous.y;
      pin.velocity.z = pin.current.z - pin.previous.z;
    }
  }

  stepConstraints(lattice, time) {
    const substeps = this.positionSubsteps();
    const dt = 1 / substeps;
    const substepDamping = Math.pow(this.damping, dt);
    this.collisionStats = this.emptyCollisionStats();

    for (let step = 0; step < substeps; step += 1) {
      const world = this.world.bind(lattice, this, time, dt);
      this.advancePins(dt);

      world.clearForces();
      this.applyExternalForcePipeline(world);
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
          atom.position.x += (atom.position.x - atom.previousPosition.x) * substepDamping + atom.force.x * this.inverseMass * world.dtSquared;
          atom.position.y += (atom.position.y - atom.previousPosition.y) * substepDamping + atom.force.y * this.inverseMass * world.dtSquared;
          atom.position.z += (atom.position.z - atom.previousPosition.z) * substepDamping + atom.force.z * this.inverseMass * world.dtSquared;
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

      const passes = Math.max(1, Math.ceil(this.iterations / substeps));
      for (let i = 0; i < passes; i += 1) {
        const constraintWorld = this.world.bind(lattice, this, time, dt);
        this.applyConstraintPipeline(constraintWorld, i);
        this.solveCollisions(lattice);
        this.applySafetyPipeline(constraintWorld);
        this.solveLocks(constraintWorld);
      }
    }
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

  solveCollisions(lattice) {
    if (!this.collisionEnabled || this.collisionStiffness <= 0 || this.collisionRadiusScale <= 0) {
      return;
    }

    const world = this.world.bind(lattice, this, 0, 1);
    const collisionRadius = Math.max(0.001, lattice.atomRadius || 0) * this.collisionRadiusScale;
    const passes = Math.max(1, Math.round(this.collisionPasses));
    for (let i = 0; i < passes; i += 1) {
      this.applyCollisionPipeline(world, collisionRadius);
    }
  }

  isHardGrab() {
    return window.Atoms.SolverMode.isPosition(this.physicsMode) && this.dragStrength >= 0.995;
  }

  isHardPinned(atom) {
    return this.isHardGrab() && this.pinned.has(atom.id);
  }
};
