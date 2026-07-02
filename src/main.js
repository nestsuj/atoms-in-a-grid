const canvas = document.getElementById("scene");
const config = { ...window.Atoms.defaultConfig, zoomVisualScale: 1 };
const camera = new window.Atoms.Camera(config);
let lattice = new window.Atoms.Lattice(config);
const solver = new window.Atoms.VerletSolver(config);
const energy = new window.Atoms.EnergyModel(config);
const renderer = new window.Atoms.CanvasRenderer(canvas, config);
const pointer = new window.Atoms.PointerController(canvas);
const orbit = new window.Atoms.OrbitController(camera);
const drag = new window.Atoms.DragController(canvas, lattice, solver, camera, config);
let paused = false;

function configureRuntime() {
  solver.configure(config);
  config.zoomVisualScale = Math.sqrt(camera.zoom);
}

function rebuild() {
  lattice = new window.Atoms.Lattice(config);
  drag.setLattice(lattice);
  solver.pinned.clear();
  energy.update(lattice);
}

function reset() {
  solver.pinned.clear();
  drag.end();
  lattice.reset();
}

new window.Atoms.ControlPanel(config, {
  onConfigure: configureRuntime,
  onRebuild: rebuild,
  onReset: reset,
  onTogglePause: () => {
    paused = !paused;
    return paused;
  },
});

function resize() {
  renderer.resize(camera);
  config.zoomVisualScale = Math.sqrt(camera.zoom);
}

window.addEventListener("resize", resize);
if ("ResizeObserver" in window) {
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);
}
resize();

canvas.addEventListener("contextmenu", (event) => event.preventDefault());

canvas.addEventListener("pointerdown", (event) => {
  canvas.setPointerCapture(event.pointerId);
  const point = pointer.getPoint(event);
  const wantsOrbit = event.button === 1 || event.button === 2 || event.shiftKey || event.altKey;

  if (!wantsOrbit && drag.begin(point)) {
    return;
  }

  orbit.begin(point);
});

canvas.addEventListener("pointermove", (event) => {
  const point = pointer.getPoint(event);
  drag.move(point);

  if (drag.isActive() && (event.shiftKey || event.altKey) && !orbit.active) {
    orbit.begin(point);
  }

  if (drag.isActive() && !event.shiftKey && !event.altKey && orbit.active) {
    orbit.end();
  }

  if (orbit.active) {
    orbit.move(point);
    drag.syncAfterCameraChange();
    config.zoomVisualScale = Math.sqrt(camera.zoom);
  }
});

canvas.addEventListener("pointerup", (event) => {
  canvas.releasePointerCapture(event.pointerId);
  drag.end();
  orbit.end();
});

canvas.addEventListener("pointercancel", () => {
  drag.end();
  orbit.end();
});

canvas.addEventListener("wheel", (event) => {
  event.preventDefault();
  orbit.zoom(event.deltaY);
  drag.syncAfterCameraChange();
  config.zoomVisualScale = Math.sqrt(camera.zoom);
}, { passive: false });

function animate() {
  requestAnimationFrame(animate);
  configureRuntime();

  if (!paused) {
    solver.step(lattice);
  }

  energy.update(lattice);
  renderer.render(lattice, camera);
}

animate();
