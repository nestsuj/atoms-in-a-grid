const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");

const sourceFiles = [
  "src/config.js",
  "src/math/vec3.js",
  "src/simulation/Atom.js",
  "src/simulation/Bond.js",
  "src/simulation/BendingConstraint.js",
  "src/simulation/Lattice.js",
  "src/simulation/WindField.js",
  "src/physics/PhysicsWorld.js",
  "src/physics/Forces.js",
  "src/physics/Constraints.js",
  "src/physics/Collisions.js",
  "src/simulation/VerletSolver.js",
];

function loadAtoms() {
  const context = {
    console,
    window: {},
  };
  context.window.window = context.window;
  vm.createContext(context);

  for (const file of sourceFiles) {
    const source = fs.readFileSync(path.join(root, file), "utf8");
    vm.runInContext(source, context, { filename: file });
  }

  return context.window.Atoms;
}

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function assertClose(actual, expected, epsilon = 0.000001, message = "values differ") {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${message}: expected ${expected}, got ${actual}`);
}

function assertFinitePosition(atom, label = `atom ${atom.id}`) {
  assert.ok(Number.isFinite(atom.position.x), `${label} x is finite`);
  assert.ok(Number.isFinite(atom.position.y), `${label} y is finite`);
  assert.ok(Number.isFinite(atom.position.z), `${label} z is finite`);
}

module.exports = {
  assert,
  assertClose,
  assertFinitePosition,
  loadAtoms,
  test,
};
