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

test("solver pipelines step spring and constraint modes without invalid positions", () => {
  for (const physicsMode of ["spring", "constraint"]) {
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

    assertClose(fixed.position.x, fixedStart.x, 0.000001, `${physicsMode} fixed x`);
    assertClose(fixed.position.y, fixedStart.y, 0.000001, `${physicsMode} fixed y`);
    assertClose(fixed.position.z, fixedStart.z, 0.000001, `${physicsMode} fixed z`);
  }
});
