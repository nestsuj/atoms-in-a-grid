const {
  assert,
  assertClose,
  assertFinitePosition,
  loadAtoms,
  test,
} = require("./testHarness");

const Atoms = loadAtoms();

function config(overrides = {}) {
  return {
    ...Atoms.defaultConfig,
    pinLayout: "none",
    width: 4,
    height: 4,
    depth: 1,
    collisionEnabled: true,
    collisionRadiusScale: 1.5,
    collisionStiffness: 0.5,
    collisionPasses: 1,
    ...overrides,
  };
}

function worldFor(lattice, solver, time = 0, dt = 1) {
  return solver.world.bind(lattice, solver, time, dt);
}

test("gravity force affects free atoms and ignores fixed atoms", () => {
  const cfg = config({ gravityEnabled: true, gravityStrength: 0.5, atomMass: 2 });
  const lattice = new Atoms.Lattice(cfg);
  const solver = new Atoms.VerletSolver(cfg);
  const world = worldFor(lattice, solver);
  const fixed = lattice.atoms[0];
  const free = lattice.atoms[1];
  fixed.fixed = true;

  world.clearForces();
  new Atoms.GravityForce().apply(world);

  assertClose(free.force.y, -1, 0.000001, "free atom receives gravity force");
  assertClose(fixed.force.y, 0, 0.000001, "fixed atom receives no gravity force");
});

test("distance spring force applies equal and opposite restoring forces", () => {
  const cfg = config();
  const solver = new Atoms.VerletSolver(cfg);
  const a = new Atoms.Atom(1, Atoms.vec3(0, 0, 0));
  const b = new Atoms.Atom(2, Atoms.vec3(20, 0, 0));
  const bond = new Atoms.Bond(a, b, 10);
  const lattice = { atoms: [a, b] };
  const world = worldFor(lattice, solver);

  world.clearForces();
  new Atoms.DistanceSpringForce(() => [bond], () => 0.5, () => 0).apply(world);

  assert.ok(a.force.x > 0, "left atom is pulled right");
  assert.ok(b.force.x < 0, "right atom is pulled left");
  assertClose(a.force.x, -b.force.x, 0.000001, "spring forces are equal and opposite");
});

test("mouse spring force is capped during large drag jumps", () => {
  const cfg = config({ mouseStiffness: 10, mouseDamping: 0, mouseMaxForce: 2 });
  const solver = new Atoms.VerletSolver(cfg);
  const atom = new Atoms.Atom(1, Atoms.vec3(0, 0, 0));
  const lattice = { atoms: [atom] };
  const world = worldFor(lattice, solver);

  solver.pin(atom, Atoms.vec3(100, 0, 0));
  world.clearForces();
  new Atoms.MouseSpringForce().apply(world);

  assert.ok(Math.hypot(atom.force.x, atom.force.y, atom.force.z) <= 2.000001, "mouse force is capped");
});

test("drag target movement is speed limited and requests adaptive substeps", () => {
  const cfg = config({ dragMaxStepScale: 0.5, dragMaxSubsteps: 12 });
  const solver = new Atoms.VerletSolver(cfg);
  const atom = new Atoms.Atom(1, Atoms.vec3(0, 0, 0));

  solver.currentRestLength = 10;
  solver.pin(atom, Atoms.vec3(0, 0, 0));
  solver.movePin(atom, Atoms.vec3(100, 0, 0));

  assert.ok(solver.adaptiveSubsteps(1) > 1, "large pending drag requests extra substeps");
  solver.advancePins(1);

  const pin = solver.pinned.get(atom.id);
  assertClose(pin.current.x, 5, 0.000001, "pin current advances by capped step");
  assertClose(pin.goal.x, 100, 0.000001, "pin goal preserves the cursor target");
  assertClose(pin.velocity.x, 5, 0.000001, "pin velocity follows capped target movement");
});

test("distance constraint moves free particles toward rest length", () => {
  const cfg = config();
  const solver = new Atoms.VerletSolver(cfg);
  const a = new Atoms.Atom(1, Atoms.vec3(0, 0, 0));
  const b = new Atoms.Atom(2, Atoms.vec3(20, 0, 0));
  const bond = new Atoms.Bond(a, b, 10);
  const lattice = { atoms: [a, b] };
  const world = worldFor(lattice, solver);

  new Atoms.DistanceConstraintSolver(() => [bond], () => 1).solve(world, 0);

  assertClose(Atoms.distance(a.position, b.position), 10, 0.000001, "constraint restores rest length");
});

test("distance constraint respects fixed atoms", () => {
  const cfg = config();
  const solver = new Atoms.VerletSolver(cfg);
  const a = new Atoms.Atom(1, Atoms.vec3(0, 0, 0), true);
  const b = new Atoms.Atom(2, Atoms.vec3(20, 0, 0));
  const bond = new Atoms.Bond(a, b, 10);
  const lattice = { atoms: [a, b] };
  const world = worldFor(lattice, solver);

  new Atoms.DistanceConstraintSolver(() => [bond], () => 1).solve(world, 0);

  assertClose(a.position.x, 0, 0.000001, "fixed atom remains in place");
  assertClose(b.position.x, 10, 0.000001, "free atom moves to satisfy the constraint");
});

test("particle collision separates overlapping non-neighbor atoms", () => {
  const cfg = config({ width: 5, height: 5, collisionRadiusScale: 2 });
  const lattice = new Atoms.Lattice(cfg);
  const solver = new Atoms.VerletSolver(cfg);
  const world = worldFor(lattice, solver);
  const a = lattice.atomAt(1, 1, 0);
  const b = lattice.atomAt(3, 3, 0);
  const radius = lattice.atomRadius * solver.collisionRadiusScale;

  Atoms.copy(a.position, b.position);
  solver.collisionStats = solver.emptyCollisionStats();
  new Atoms.ParticleCollisionSolver().solve(world, radius);

  assert.ok(solver.collisionStats.corrections > 0, "overlap is corrected");
  assert.ok(Atoms.distance(a.position, b.position) > 0, "atoms separate");
});

test("particle collision ignores directly bonded neighbors", () => {
  const cfg = config({ width: 5, height: 5, collisionRadiusScale: 2 });
  const lattice = new Atoms.Lattice(cfg);
  const solver = new Atoms.VerletSolver(cfg);
  const world = worldFor(lattice, solver);
  const a = lattice.atomAt(1, 1, 0);
  const b = lattice.atomAt(2, 1, 0);
  const radius = lattice.atomRadius * solver.collisionRadiusScale;

  Atoms.copy(a.position, b.position);
  solver.collisionStats = solver.emptyCollisionStats();
  new Atoms.ParticleCollisionSolver().solve(world, radius);

  assert.strictEqual(solver.collisionStats.corrections, 0, "bonded neighbors are excluded");
});

test("particle collision damps closing normal velocity", () => {
  const cfg = config({
    width: 5,
    height: 5,
    collisionRadiusScale: 2,
    collisionDamping: 0.5,
  });
  const lattice = new Atoms.Lattice(cfg);
  const solver = new Atoms.VerletSolver(cfg);
  const world = worldFor(lattice, solver);
  const a = lattice.atomAt(1, 1, 0);
  const b = lattice.atomAt(3, 3, 0);
  const radius = lattice.atomRadius * solver.collisionRadiusScale;

  Atoms.copy(a.position, Atoms.vec3(0, 0, 0));
  Atoms.copy(b.position, Atoms.vec3(radius, 0, 0));
  Atoms.copy(a.previousPosition, Atoms.vec3(-1, 0, 0));
  Atoms.copy(b.previousPosition, Atoms.vec3(radius + 1, 0, 0));

  solver.collisionStats = solver.emptyCollisionStats();
  new Atoms.ParticleCollisionSolver().solve(world, radius);

  const aVelocity = world.velocity(a);
  const bVelocity = world.velocity(b);
  const relativeNormalSpeed = bVelocity.x - aVelocity.x;
  assert.ok(relativeNormalSpeed > -2, "closing velocity is reduced");
  assert.ok(relativeNormalSpeed < 0, "collision damping does not add bounce");
});

test("particle collision leaves separating normal velocity unchanged", () => {
  const cfg = config({
    width: 5,
    height: 5,
    collisionRadiusScale: 2,
    collisionDamping: 1,
  });
  const lattice = new Atoms.Lattice(cfg);
  const solver = new Atoms.VerletSolver(cfg);
  const world = worldFor(lattice, solver);
  const a = lattice.atomAt(1, 1, 0);
  const b = lattice.atomAt(3, 3, 0);
  const radius = lattice.atomRadius * solver.collisionRadiusScale;

  Atoms.copy(a.position, Atoms.vec3(0, 0, 0));
  Atoms.copy(b.position, Atoms.vec3(radius, 0, 0));
  Atoms.copy(a.previousPosition, Atoms.vec3(1, 0, 0));
  Atoms.copy(b.previousPosition, Atoms.vec3(radius - 1, 0, 0));

  solver.collisionStats = solver.emptyCollisionStats();
  new Atoms.ParticleCollisionSolver().solve(world, radius);

  const aVelocity = world.velocity(a);
  const bVelocity = world.velocity(b);
  assertClose(bVelocity.x - aVelocity.x, 2, 0.000001, "separating velocity is unchanged");
});

test("cloth self-collision corrects a non-local vertex crossing a triangle", () => {
  const cfg = config({ width: 5, height: 5, collisionRadiusScale: 2 });
  const lattice = new Atoms.Lattice(cfg);
  const solver = new Atoms.VerletSolver(cfg);
  const world = worldFor(lattice, solver);
  const cloth = new Atoms.ClothSelfCollisionSolver();
  const atom = lattice.atomAt(4, 4, 0);
  const a = lattice.atomAt(0, 0, 0);
  const b = lattice.atomAt(1, 0, 0);
  const c = lattice.atomAt(0, 1, 0);

  atom.position.x = (a.position.x + b.position.x + c.position.x) / 3;
  atom.position.y = (a.position.y + b.position.y + c.position.y) / 3;
  atom.position.z = 0.01;
  atom.previousPosition.x = atom.position.x;
  atom.previousPosition.y = atom.position.y;
  atom.previousPosition.z = -0.01;
  solver.collisionStats = solver.emptyCollisionStats();

  cloth.solveVertexTriangleCollision(world, atom, a, b, c, { x: 0, y: 0, z: 1, length: 1 }, 10);

  assert.ok(solver.collisionStats.corrections > 0, "cloth crossing is corrected");
  assert.ok(solver.collisionStats.activeAtoms.has(atom.id), "crossing atom is marked active");
});

test("cloth self-collision correction does not create fake normal velocity", () => {
  const cfg = config({ width: 5, height: 5, collisionRadiusScale: 2, collisionDamping: 0 });
  const lattice = new Atoms.Lattice(cfg);
  const solver = new Atoms.VerletSolver(cfg);
  const world = worldFor(lattice, solver);
  const cloth = new Atoms.ClothSelfCollisionSolver();
  const atom = lattice.atomAt(4, 4, 0);
  const a = lattice.atomAt(0, 0, 0);
  const b = lattice.atomAt(1, 0, 0);
  const c = lattice.atomAt(0, 1, 0);

  atom.position.x = (a.position.x + b.position.x + c.position.x) / 3;
  atom.position.y = (a.position.y + b.position.y + c.position.y) / 3;
  atom.position.z = 0.01;
  Atoms.copy(atom.previousPosition, atom.position);
  solver.collisionStats = solver.emptyCollisionStats();

  cloth.solveVertexTriangleCollision(world, atom, a, b, c, { x: 0, y: 0, z: 1, length: 1 }, 10);

  assert.ok(solver.collisionStats.corrections > 0, "cloth correction occurred");
  assertClose(world.velocity(atom).z, 0, 0.000001, "projection does not become normal velocity");
});

test("cloth self-collision damps closing velocity against the triangle surface", () => {
  const cfg = config({ width: 5, height: 5, collisionRadiusScale: 2, collisionDamping: 0.5 });
  const lattice = new Atoms.Lattice(cfg);
  const solver = new Atoms.VerletSolver(cfg);
  const world = worldFor(lattice, solver);
  const cloth = new Atoms.ClothSelfCollisionSolver();
  const atom = lattice.atomAt(4, 4, 0);
  const a = lattice.atomAt(0, 0, 0);
  const b = lattice.atomAt(1, 0, 0);
  const c = lattice.atomAt(0, 1, 0);

  atom.position.x = (a.position.x + b.position.x + c.position.x) / 3;
  atom.position.y = (a.position.y + b.position.y + c.position.y) / 3;
  atom.position.z = 0.01;
  atom.previousPosition.x = atom.position.x;
  atom.previousPosition.y = atom.position.y;
  atom.previousPosition.z = atom.position.z + 2;
  solver.collisionStats = solver.emptyCollisionStats();

  cloth.solveVertexTriangleCollision(world, atom, a, b, c, { x: 0, y: 0, z: 1, length: 1 }, 10);

  const relativeNormalSpeed = world.velocity(atom).z - (
    (world.velocity(a).z + world.velocity(b).z + world.velocity(c).z) / 3
  );
  assert.ok(relativeNormalSpeed > -2, "closing velocity is reduced");
  assert.ok(relativeNormalSpeed < 0, "cloth damping does not add bounce");
});

test("cloth self-collision keeps fixed triangle vertices stable", () => {
  const cfg = config({ width: 5, height: 5, collisionRadiusScale: 2, collisionDamping: 1 });
  const lattice = new Atoms.Lattice(cfg);
  const solver = new Atoms.VerletSolver(cfg);
  const world = worldFor(lattice, solver);
  const cloth = new Atoms.ClothSelfCollisionSolver();
  const atom = lattice.atomAt(4, 4, 0);
  const a = lattice.atomAt(0, 0, 0);
  const b = lattice.atomAt(1, 0, 0);
  const c = lattice.atomAt(0, 1, 0);
  const starts = [a, b, c].map((entry) => ({
    position: Atoms.clone(entry.position),
    previousPosition: Atoms.clone(entry.previousPosition),
  }));

  for (const entry of [a, b, c]) {
    entry.fixed = true;
  }

  atom.position.x = (a.position.x + b.position.x + c.position.x) / 3;
  atom.position.y = (a.position.y + b.position.y + c.position.y) / 3;
  atom.position.z = 0.01;
  atom.previousPosition.x = atom.position.x;
  atom.previousPosition.y = atom.position.y;
  atom.previousPosition.z = -0.01;
  solver.collisionStats = solver.emptyCollisionStats();

  cloth.solveVertexTriangleCollision(world, atom, a, b, c, { x: 0, y: 0, z: 1, length: 1 }, 10);

  [a, b, c].forEach((entry, index) => {
    assertClose(entry.position.x, starts[index].position.x, 0.000001, "fixed vertex x");
    assertClose(entry.position.y, starts[index].position.y, 0.000001, "fixed vertex y");
    assertClose(entry.position.z, starts[index].position.z, 0.000001, "fixed vertex z");
    assertClose(entry.previousPosition.x, starts[index].previousPosition.x, 0.000001, "fixed previous x");
    assertClose(entry.previousPosition.y, starts[index].previousPosition.y, 0.000001, "fixed previous y");
    assertClose(entry.previousPosition.z, starts[index].previousPosition.z, 0.000001, "fixed previous z");
  });
});

test("cloth self-collision ignores local triangle vertices", () => {
  const cfg = config({ width: 5, height: 5 });
  const lattice = new Atoms.Lattice(cfg);
  const cloth = new Atoms.ClothSelfCollisionSolver();
  const a = lattice.atomAt(0, 0, 0);
  const b = lattice.atomAt(1, 0, 0);
  const c = lattice.atomAt(0, 1, 0);

  assert.strictEqual(cloth.isLocalCollision(a, a, b, c), true, "triangle vertex is local");
  assert.strictEqual(cloth.isLocalCollision(lattice.atomAt(4, 4, 0), a, b, c), false, "far vertex is not local");
});

test("cloth edge-edge collision separates crossing non-local edges", () => {
  const cfg = config({ collisionStiffness: 1, collisionDamping: 0 });
  const solver = new Atoms.VerletSolver(cfg);
  const cloth = new Atoms.ClothSelfCollisionSolver();
  const a = new Atoms.Atom(1, Atoms.vec3(-1, 0, 0));
  const b = new Atoms.Atom(2, Atoms.vec3(1, 0, 0));
  const c = new Atoms.Atom(3, Atoms.vec3(0, -1, 0));
  const d = new Atoms.Atom(4, Atoms.vec3(0, 1, 0));
  const lattice = { atoms: [a, b, c, d] };
  const world = worldFor(lattice, solver);

  solver.collisionStats = solver.emptyCollisionStats();
  cloth.solveEdgeEdgeCollision(world, { a, b }, { a: c, b: d }, 1, 1);

  const closest = cloth.closestSegmentPoints(a.position, b.position, c.position, d.position);
  assert.ok(closest.distanceSquared > 0, "crossing edges separate");
  assert.ok(solver.collisionStats.corrections > 0, "edge collision records a correction");
});

test("strain limit clamps over-stretched and collapsed constraints without adding velocity", () => {
  const cfg = config({
    maxStretchFactor: 1.5,
    minStretchFactor: 0.5,
    strainLimitStiffness: 1,
  });
  const solver = new Atoms.VerletSolver(cfg);
  const a = new Atoms.Atom(1, Atoms.vec3(0, 0, 0));
  const b = new Atoms.Atom(2, Atoms.vec3(30, 0, 0));
  const bond = new Atoms.Bond(a, b, 10);
  const lattice = { atoms: [a, b], bonds: [bond], shearSprings: [] };
  const world = worldFor(lattice, solver);

  new Atoms.StrainLimitConstraintSolver((entryWorld) => entryWorld.lattice.bonds).solve(world);

  assertClose(Atoms.distance(a.position, b.position), 15, 0.000001, "over-stretched bond is clamped");
  assertClose(world.velocity(a).x, 0, 0.000001, "a correction does not add velocity");
  assertClose(world.velocity(b).x, 0, 0.000001, "b correction does not add velocity");

  Atoms.copy(a.position, Atoms.vec3(0, 0, 0));
  Atoms.copy(a.previousPosition, a.position);
  Atoms.copy(b.position, Atoms.vec3(2, 0, 0));
  Atoms.copy(b.previousPosition, b.position);
  new Atoms.StrainLimitConstraintSolver((entryWorld) => entryWorld.lattice.bonds).solve(world);

  assertClose(Atoms.distance(a.position, b.position), 5, 0.000001, "collapsed bond is expanded");
});

test("cloth panel area guard expands near-collapsed panels", () => {
  const cfg = config({
    width: 2,
    height: 2,
    depth: 1,
    restLength: 10,
    panelAreaMinFactor: 0.25,
    panelAreaStiffness: 1,
  });
  const lattice = new Atoms.Lattice(cfg);
  const solver = new Atoms.VerletSolver(cfg);
  const panel = lattice.surfacePanels.find((entry) => entry.side === "front");
  const guard = new Atoms.ClothPanelAreaConstraintSolver();
  const world = worldFor(lattice, solver);

  Atoms.copy(panel.a.position, Atoms.vec3(0, 0, 0));
  Atoms.copy(panel.b.position, Atoms.vec3(0.1, 0, 0));
  Atoms.copy(panel.c.position, Atoms.vec3(0.1, 0.1, 0));
  Atoms.copy(panel.d.position, Atoms.vec3(0, 0.1, 0));
  for (const atom of [panel.a, panel.b, panel.c, panel.d]) {
    Atoms.copy(atom.previousPosition, atom.position);
  }

  const before = guard.panelArea(panel);
  guard.solve(world);

  assert.ok(guard.panelArea(panel) > before, "near-collapsed panel area increases");
});

test("wind panel pressure is much stronger broadside than edge-on", () => {
  const cfg = config({
    width: 4,
    height: 4,
    depth: 1,
    windEnabled: true,
    windStrength: 1,
    windDirection: "z+",
    windTurbulence: 0,
    windFlutter: 0,
    windDrag: 0.7,
    windResponse: 1,
  });
  const lattice = new Atoms.Lattice(cfg);
  const solver = new Atoms.VerletSolver(cfg);
  const world = worldFor(lattice, solver, 0);
  const wind = new Atoms.WindForce();
  const atoms = [
    lattice.atomAt(1, 1, 0),
    lattice.atomAt(2, 1, 0),
    lattice.atomAt(2, 2, 0),
    lattice.atomAt(1, 2, 0),
  ];
  const centroid = Atoms.vec3(0, 0, 0);
  const doubleArea = 2 * lattice.restLength * lattice.restLength;

  const broadside = wind.windPanelForce(world, atoms, { x: 0, y: 0, z: 1 }, centroid, doubleArea);
  const edgeOn = wind.windPanelForce(world, atoms, { x: 1, y: 0, z: 0 }, centroid, doubleArea);
  const broadsideLength = Math.hypot(broadside.x, broadside.y, broadside.z);
  const edgeOnLength = Math.hypot(edgeOn.x, edgeOn.y, edgeOn.z);

  assert.ok(Math.abs(broadside.z) > 0.01, "broadside panel receives normal pressure");
  assert.ok(broadsideLength > edgeOnLength * 10, "edge-on skin drag is much weaker than broadside pressure");
});

test("wind force skips locked atoms and records free atom samples", () => {
  const cfg = config({
    width: 2,
    height: 2,
    depth: 1,
    windEnabled: true,
    windStrength: 1,
    windDirection: "z+",
    windTurbulence: 0,
    windFlutter: 0,
  });
  const lattice = new Atoms.Lattice(cfg);
  const solver = new Atoms.VerletSolver(cfg);
  const world = worldFor(lattice, solver, 0);
  const wind = new Atoms.WindForce();
  const fixed = lattice.atomAt(0, 0, 0);

  fixed.fixed = true;
  world.clearForces();
  wind.apply(world);

  assertClose(fixed.force.x, 0, 0.000001, "fixed atom x force remains zero");
  assertClose(fixed.force.y, 0, 0.000001, "fixed atom y force remains zero");
  assertClose(fixed.force.z, 0, 0.000001, "fixed atom z force remains zero");
  assert.ok(solver.windStats.samples > 0, "wind records force samples for free atoms");
  assert.strictEqual(solver.windStats.direction, "z+", "wind stats keep direction label");
});

test("solver mode normalizes new names, old aliases, and unknown values", () => {
  assert.strictEqual(Atoms.SolverMode.normalize("force"), "force", "force mode stays force");
  assert.strictEqual(Atoms.SolverMode.normalize("position"), "position", "position mode stays position");
  assert.strictEqual(Atoms.SolverMode.normalize("spring"), "force", "old spring alias maps to force");
  assert.strictEqual(Atoms.SolverMode.normalize("constraint"), "position", "old constraint alias maps to position");
  assert.strictEqual(Atoms.SolverMode.normalize("mystery"), "force", "unknown modes fall back to force");
});

test("solver pipelines step force and position modes without invalid positions", () => {
  for (const physicsMode of ["force", "position", "spring", "constraint", "unknown"]) {
    const cfg = config({
      physicsMode,
      pinLayout: "corners",
      windEnabled: true,
      windStrength: 0.4,
      gravityEnabled: true,
      gravityStrength: 0.05,
    });
    const lattice = new Atoms.Lattice(cfg);
    const fixed = lattice.atoms.find((atom) => atom.fixed);
    const fixedStart = Atoms.clone(fixed.position);
    const solver = new Atoms.VerletSolver(cfg);

    solver.step(lattice, 0.1);

    for (const atom of lattice.atoms) {
      assertFinitePosition(atom);
    }

    assert.strictEqual(solver.physicsMode, Atoms.SolverMode.normalize(physicsMode), `${physicsMode} normalizes`);
    assertClose(fixed.position.x, fixedStart.x, 0.000001, `${physicsMode} fixed x`);
    assertClose(fixed.position.y, fixedStart.y, 0.000001, `${physicsMode} fixed y`);
    assertClose(fixed.position.z, fixedStart.z, 0.000001, `${physicsMode} fixed z`);
  }
});

test("constraint mode applies wind and gravity through accumulated forces", () => {
  const cfg = config({
    physicsMode: "position",
    pinLayout: "none",
    width: 4,
    height: 4,
    depth: 1,
    windEnabled: true,
    windStrength: 0.5,
    windDirection: "z+",
    windTurbulence: 0,
    windFlutter: 0,
    gravityEnabled: true,
    gravityStrength: 0.05,
  });
  const lattice = new Atoms.Lattice(cfg);
  const atom = lattice.atomAt(3, 3, 0);
  const start = Atoms.clone(atom.position);
  const solver = new Atoms.VerletSolver(cfg);

  solver.step(lattice, 0);

  assert.ok(atom.position.y < start.y, "gravity moves position-mode atoms downward");
  assert.ok(atom.position.z > start.z, "wind moves position-mode atoms along wind direction");
  assert.ok(solver.windStats.samples > 0, "position mode records wind force samples");
});
