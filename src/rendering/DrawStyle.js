import { clamp } from "../config.js";

export function atomColor(atom, depthShade) {
  const energy = clamp(atom.energy, 0, 1);
  const cool = {
    r: 70 + depthShade * 40,
    g: 180 + depthShade * 32,
    b: 205 + depthShade * 28,
  };
  const hot = { r: 255, g: 102, b: 70 };

  const r = Math.round(cool.r + (hot.r - cool.r) * energy);
  const g = Math.round(cool.g + (hot.g - cool.g) * energy);
  const b = Math.round(cool.b + (hot.b - cool.b) * energy);
  return `rgb(${r}, ${g}, ${b})`;
}

export function bondColor(depthShade, energy) {
  const alpha = 0.28 + depthShade * 0.32 + clamp(energy, 0, 1) * 0.25;
  return `rgba(150, 166, 184, ${alpha})`;
}
