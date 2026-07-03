window.Atoms = window.Atoms || {};

window.Atoms.atomColor = function atomColor(atom, depthShade) {
  const energy = window.Atoms.clamp(atom.energy * 0.62, 0, 1);
  const shade = 0.62 + depthShade * 0.38;
  const cool = {
    r: 44 + depthShade * 66,
    g: 128 + depthShade * 84,
    b: 154 + depthShade * 79,
  };
  const hot = {
    r: 255 * shade,
    g: 102 * shade,
    b: 70 * shade,
  };

  const r = Math.round(cool.r + (hot.r - cool.r) * energy);
  const g = Math.round(cool.g + (hot.g - cool.g) * energy);
  const b = Math.round(cool.b + (hot.b - cool.b) * energy);
  return `rgb(${r}, ${g}, ${b})`;
};

window.Atoms.atomRimColor = function atomRimColor(depthShade) {
  const r = Math.round(18 + depthShade * 16);
  const g = Math.round(26 + depthShade * 22);
  const b = Math.round(36 + depthShade * 29);
  return `rgb(${r}, ${g}, ${b})`;
};

window.Atoms.bondColor = function bondColor(depthShade, strain) {
  const rawAmount = window.Atoms.clamp(Math.abs(strain) * 2.2, 0, 1);
  const amount = rawAmount * rawAmount * (3 - 2 * rawAmount);
  const neutral = {
    r: 126 + depthShade * 42,
    g: 139 + depthShade * 42,
    b: 156 + depthShade * 42,
  };
  const target = strain >= 0
    ? { r: 255, g: 103, b: 71 }
    : { r: 69, g: 199, b: 232 };
  const r = Math.round(neutral.r + (target.r - neutral.r) * amount);
  const g = Math.round(neutral.g + (target.g - neutral.g) * amount);
  const b = Math.round(neutral.b + (target.b - neutral.b) * amount);
  const alpha = 0.28 + depthShade * 0.24 + amount * 0.34;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

window.Atoms.neutralBondColor = function neutralBondColor(depthShade) {
  const value = Math.round(126 + depthShade * 42);
  const alpha = 0.28 + depthShade * 0.24;
  return `rgba(${value}, ${value + 13}, ${value + 30}, ${alpha})`;
};
