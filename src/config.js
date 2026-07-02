export const defaultConfig = Object.freeze({
  width: 7,
  height: 7,
  depth: 7,
  restLength: 56,
  atomRadius: 7,
  stiffness: 0.55,
  damping: 0.982,
  iterations: 7,
  energyScale: 0.12,
  minZoom: 0.35,
  maxZoom: 3.2,
});

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function readNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return clamp(parsed, min, max);
}
