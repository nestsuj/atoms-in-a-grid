window.Atoms = window.Atoms || {};

window.Atoms.atomColor = function atomColor(atom, depthShade) {
  const energy = window.Atoms.clamp(atom.energy * 0.62, 0, 1);
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
};

window.Atoms.bondColor = function bondColor(depthShade, strain) {
  const amount = window.Atoms.clamp(Math.abs(strain) * 5, 0, 1);
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
  const alpha = 0.32 + depthShade * 0.28 + amount * 0.32;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};
