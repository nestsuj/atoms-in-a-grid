window.Atoms = window.Atoms || {};

window.Atoms.vec3 = function vec3(x = 0, y = 0, z = 0) {
  return { x, y, z };
};

window.Atoms.clone = function clone(v) {
  return { x: v.x, y: v.y, z: v.z };
};

window.Atoms.setVec3 = function set(out, x, y, z) {
  out.x = x;
  out.y = y;
  out.z = z;
  return out;
};

window.Atoms.copy = function copy(out, v) {
  out.x = v.x;
  out.y = v.y;
  out.z = v.z;
  return out;
};

window.Atoms.add = function add(a, b) {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
};

window.Atoms.sub = function sub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
};

window.Atoms.scale = function scale(v, amount) {
  return { x: v.x * amount, y: v.y * amount, z: v.z * amount };
};

window.Atoms.dot = function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
};

window.Atoms.cross = function cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
};

window.Atoms.length = function length(v) {
  return Math.hypot(v.x, v.y, v.z);
};

window.Atoms.distance = function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
};

window.Atoms.normalize = function normalize(v) {
  const size = window.Atoms.length(v);
  if (size < 0.000001) {
    return { x: 0, y: 0, z: 0 };
  }
  return { x: v.x / size, y: v.y / size, z: v.z / size };
};
