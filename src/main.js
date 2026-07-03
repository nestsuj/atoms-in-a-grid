const canvas = document.getElementById("scene");
const sceneStats = document.getElementById("sceneStats");
const config = { ...window.Atoms.defaultConfig, zoomVisualScale: 1 };
const camera = new window.Atoms.Camera(config);
let lattice = new window.Atoms.Lattice(config);
const solver = new window.Atoms.VerletSolver(config);
const energy = new window.Atoms.EnergyModel(config);
const renderer = new window.Atoms.CanvasRenderer(canvas, config);
const pointer = new window.Atoms.PointerController(canvas);
const orbit = new window.Atoms.OrbitController(camera);
const drag = new window.Atoms.DragController(canvas, lattice, solver, camera, config);
const pinEdit = new window.Atoms.PinEditController(canvas, lattice, camera, config);
let paused = false;
let frame = 0;

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
  updateSceneStats();
}

function reset() {
  solver.pinned.clear();
  drag.end();
  pinEdit.cancel();
  lattice.reset();
}

function clearUserPins() {
  solver.pinned.clear();
  drag.end();
  pinEdit.cancel();
  lattice.clearUserPins();
}

function updateSceneStats() {
  sceneStats.innerHTML = [
    `<div><span>Atoms</span>${lattice.atoms.length.toLocaleString()}</div>`,
    `<div><span>Bonds</span>${lattice.bonds.length.toLocaleString()}</div>`,
    `<div><span>Bending</span>${lattice.bendingConstraints.length.toLocaleString()}</div>`,
  ].join("");
}

new window.Atoms.ControlPanel(config, {
  onConfigure: configureRuntime,
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

function animate() {
  requestAnimationFrame(animate);
  configureRuntime();
  frame += 1;

  if (!paused) {
    solver.step(lattice);
  }

  if (frame % config.energyUpdateRate === 0) {
    energy.update(lattice);
  }
  renderer.render(lattice, camera);
}

animate();
