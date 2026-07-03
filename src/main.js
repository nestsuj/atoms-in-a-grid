const canvas = document.getElementById("scene");
const sceneStats = document.getElementById("sceneStats");
const physicsStats = document.getElementById("physicsStats");
const config = { ...window.Atoms.defaultConfig, zoomVisualScale: 1 };
const camera = new window.Atoms.Camera(config);
let lattice = new window.Atoms.Lattice(config);
const solver = new window.Atoms.VerletSolver(config);
const energy = new window.Atoms.EnergyModel(config);
const diagnostics = new window.Atoms.Diagnostics(config);
const renderer = new window.Atoms.CanvasRenderer(canvas, config);
const pointer = new window.Atoms.PointerController(canvas);
const orbit = new window.Atoms.OrbitController(camera);
const drag = new window.Atoms.DragController(canvas, lattice, solver, camera, config);
const pinEdit = new window.Atoms.PinEditController(canvas, lattice, camera, config);
let paused = false;
let frame = 0;
let lastTime = performance.now();
let accumulator = 0;
let needsEnergyUpdate = true;
const maxFrameTime = 250;
const maxPhysicsSteps = 8;
const pressedKeys = new Set();

function configureRuntime() {
  solver.configure(config);
  config.zoomVisualScale = Math.sqrt(camera.zoom);
}

function rebuild() {
  lattice = new window.Atoms.Lattice(config);
  drag.setLattice(lattice);
  pinEdit.setLattice(lattice);
  solver.pinned.clear();
  energy.update(lattice);
  needsEnergyUpdate = false;
  accumulator = 0;
  updateSceneStats();
}

function reset() {
  solver.pinned.clear();
  drag.end();
  pinEdit.cancel();
  lattice.reset();
  needsEnergyUpdate = true;
  accumulator = 0;
}

function clearUserPins() {
  solver.pinned.clear();
  drag.end();
  pinEdit.cancel();
  lattice.clearUserPins();
  needsEnergyUpdate = true;
}

function applyMaterialChange() {
  solver.pinned.clear();
  drag.end();
  pinEdit.cancel();
  lattice.clearMotion();
  configureRuntime();
  needsEnergyUpdate = true;
  accumulator = 0;
}

function updateSceneStats() {
  sceneStats.innerHTML = [
    `<div><span>Atoms</span>${lattice.atoms.length.toLocaleString()}</div>`,
    `<div><span>Bonds</span>${lattice.bonds.length.toLocaleString()}</div>`,
    `<div><span>Shear</span>${lattice.shearSprings.length.toLocaleString()}</div>`,
    `<div><span>Bending</span>${lattice.bendingConstraints.length.toLocaleString()}</div>`,
  ].join("");
}

function updatePhysicsStats(steps) {
  if (!config.showDiagnostics) {
    physicsStats.hidden = true;
    return;
  }

  physicsStats.hidden = false;
  const values = diagnostics.update(lattice, config.physicsRate);
  physicsStats.innerHTML = [
    `<div><span>Material</span>${formatMaterial()}</div>`,
    `<div><span>Kinetic</span>${formatMetric(values.kineticEnergy)}</div>`,
    `<div><span>Spring E</span>${formatMetric(values.springEnergy)}</div>`,
    `<div><span>Max strain</span>${formatPercent(values.maxStrain)}</div>`,
    `<div><span>Avg strain</span>${formatPercent(values.averageStrain)}</div>`,
    `<div><span>Steps</span>${steps}</div>`,
  ].join("");
}

function formatMaterial() {
  const material = window.Atoms.materialProperties[config.material];
  return material ? material.label : "Custom";
}

function formatMetric(value) {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}m`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return value.toFixed(1);
}

function formatPercent(value) {
  return `${(value * 100).toFixed(1)}%`;
}

new window.Atoms.ControlPanel(config, {
  onConfigure: configureRuntime,
  onMaterialChange: applyMaterialChange,
  onRebuild: rebuild,
  onReset: reset,
  onClearUserPins: clearUserPins,
  onTogglePause: () => {
    paused = !paused;
    return paused;
  },
});

function resize() {
  renderer.resize(camera);
  config.zoomVisualScale = Math.sqrt(camera.zoom);
  updateSceneStats();
}

window.addEventListener("resize", resize);
if ("ResizeObserver" in window) {
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);
}
resize();
updateSceneStats();

canvas.addEventListener("contextmenu", (event) => event.preventDefault());

canvas.addEventListener("pointerdown", (event) => {
  canvas.setPointerCapture(event.pointerId);
  const point = pointer.getPoint(event);

  if (event.button === 0 && event.shiftKey && pinEdit.begin(point)) {
    return;
  }

  if (event.button === 0 && drag.begin(point)) {
    return;
  }

  if (event.button === 1 || event.button === 2) {
    orbit.begin(point);
  }
});

canvas.addEventListener("pointermove", (event) => {
  const point = pointer.getPoint(event);
  const isLeftDown = (event.buttons & 1) !== 0;
  const isOrbitButtonDown = (event.buttons & 2) !== 0 || (event.buttons & 4) !== 0;

  if (pinEdit.isActive() && !isLeftDown) {
    pinEdit.end();
  }

  if (drag.isActive() && !isLeftDown) {
    drag.end();
  }

  pinEdit.move(point);
  drag.move(point);

  if ((drag.isActive() || pinEdit.isActive()) && isOrbitButtonDown && !orbit.active) {
    orbit.begin(point);
  }

  if (orbit.active && !isOrbitButtonDown) {
    orbit.end();
  }

  if (orbit.active) {
    orbit.move(point);
    drag.syncAfterCameraChange();
    pinEdit.syncAfterCameraChange();
    config.zoomVisualScale = Math.sqrt(camera.zoom);
  }
});

canvas.addEventListener("pointerup", (event) => {
  if (pinEdit.isActive() && (event.buttons & 1) === 0) {
    pinEdit.end();
  }

  if (drag.isActive() && (event.buttons & 1) === 0) {
    drag.end();
  }

  if (orbit.active && (event.buttons & 2) === 0 && (event.buttons & 4) === 0) {
    orbit.end();
  }

  if (event.buttons === 0 && canvas.hasPointerCapture(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
  }
});

canvas.addEventListener("pointercancel", () => {
  drag.end();
  pinEdit.cancel();
  orbit.end();
});

canvas.addEventListener("wheel", (event) => {
  event.preventDefault();
  orbit.zoom(event.deltaY);
  drag.syncAfterCameraChange();
  pinEdit.syncAfterCameraChange();
  config.zoomVisualScale = Math.sqrt(camera.zoom);
}, { passive: false });

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  if (!["w", "a", "s", "d"].includes(key) || isTextInput(event.target)) {
    return;
  }

  event.preventDefault();
  pressedKeys.add(key);
});

window.addEventListener("keyup", (event) => {
  pressedKeys.delete(event.key.toLowerCase());
});

function isTextInput(target) {
  return target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement;
}

function updateKeyboardPan(elapsed) {
  const right = Number(pressedKeys.has("d")) - Number(pressedKeys.has("a"));
  const up = Number(pressedKeys.has("w")) - Number(pressedKeys.has("s"));

  if (right === 0 && up === 0) {
    return;
  }

  const length = Math.hypot(right, up) || 1;
  const speed = 420;
  const scale = (speed * elapsed) / 1000 / length;
  camera.pan(right * scale, -up * scale);
  drag.syncAfterCameraChange();
  pinEdit.syncAfterCameraChange();
}

function animate(time) {
  requestAnimationFrame(animate);
  configureRuntime();
  const elapsed = Math.min(maxFrameTime, time - lastTime);
  lastTime = time;
  let steps = 0;

  updateKeyboardPan(elapsed);

  if (!paused) {
    const fixedStep = 1000 / config.physicsRate;
    accumulator += elapsed;

    while (accumulator >= fixedStep && steps < maxPhysicsSteps) {
      solver.step(lattice);
      accumulator -= fixedStep;
      steps += 1;
      frame += 1;
      if (frame % config.energyUpdateRate === 0) {
        needsEnergyUpdate = true;
      }
    }

    if (steps === maxPhysicsSteps) {
      accumulator = 0;
    }
  } else {
    accumulator = 0;
  }

  if (needsEnergyUpdate) {
    energy.update(lattice);
    needsEnergyUpdate = false;
  }
  updatePhysicsStats(steps);
  renderer.render(lattice, camera);
}

requestAnimationFrame(animate);
