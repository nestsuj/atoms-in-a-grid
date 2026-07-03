window.Atoms = window.Atoms || {};

window.Atoms.defaultConfig = Object.freeze({
  width: 7,
  height: 7,
  depth: 7,
  restLength: 56,
  atomRadius: 7,
  material: "molecular",
  physicsMode: "spring",
  stiffness: 0.24,
  shearStiffness: 0.16,
  springDamping: 0.16,
  bendStiffness: 0.08,
  atomMass: 1,
  releaseEnergy: 0.85,
  dragStrength: 1,
  mouseStiffness: 2.8,
  mouseDamping: 0.4,
  allowCornerPinEditing: false,
  gravityEnabled: false,
  gravityStrength: 0.18,
  damping: 0.998,
  iterations: 4,
  physicsRate: 60,
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

window.Atoms.materialProperties = Object.freeze({
  molecular: Object.freeze({
    label: "Molecular",
    stiffness: 0.32,
    shearStiffness: 0.16,
    springDamping: 0.12,
    bendStiffness: 0.16,
    atomMass: 1,
    mouseStiffness: 2.8,
    mouseDamping: 0.4,
  }),
  cloth: Object.freeze({
    label: "Cloth",
    stiffness: 0.22,
    shearStiffness: 0.18,
    springDamping: 0.18,
    bendStiffness: 0.025,
    atomMass: 0.75,
    mouseStiffness: 2.4,
    mouseDamping: 0.55,
  }),
  rubber: Object.freeze({
    label: "Rubber",
    stiffness: 0.18,
    shearStiffness: 0.22,
    springDamping: 0.32,
    bendStiffness: 0.09,
    atomMass: 1.1,
    mouseStiffness: 2.2,
    mouseDamping: 0.85,
  }),
  gel: Object.freeze({
    label: "Gel",
    stiffness: 0.09,
    shearStiffness: 0.08,
    springDamping: 0.42,
    bendStiffness: 0.035,
    atomMass: 0.8,
    mouseStiffness: 1.4,
    mouseDamping: 1.1,
  }),
  heavy: Object.freeze({
    label: "Heavy lattice",
    stiffness: 0.42,
    shearStiffness: 0.28,
    springDamping: 0.22,
    bendStiffness: 0.22,
    atomMass: 4,
    mouseStiffness: 4.2,
    mouseDamping: 1.2,
  }),
});

window.Atoms.materialKeys = Object.freeze([
  "stiffness",
  "shearStiffness",
  "springDamping",
  "bendStiffness",
  "atomMass",
  "mouseStiffness",
  "mouseDamping",
]);

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
