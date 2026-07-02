window.Atoms = window.Atoms || {};

window.Atoms.defaultConfig = Object.freeze({
  width: 7,
  height: 7,
  depth: 7,
  restLength: 56,
  atomRadius: 7,
  stiffness: 0.24,
  bendStiffness: 0.08,
  releaseEnergy: 0.85,
  dragStrength: 1,
  gravityEnabled: false,
  gravityStrength: 0.18,
  damping: 0.998,
  iterations: 4,
  fastBending: true,
  fastLargeGridAtoms: true,
  sortBonds: true,
  sortAtoms: true,
  simpleBondColors: false,
  energyUpdateRate: 1,
  energyScale: 0.12,
  minZoom: 0.35,
  maxZoom: 3.2,
});

window.Atoms.clamp = function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
};

window.Atoms.readNumber = function readNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return window.Atoms.clamp(parsed, min, max);
};
