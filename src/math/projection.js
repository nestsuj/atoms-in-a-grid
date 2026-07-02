window.Atoms = window.Atoms || {};

window.Atoms.project = function project(point, camera) {
  const basis = camera.getBasis();
  return {
    x: camera.center.x + window.Atoms.dot(point, basis.right) * camera.zoom,
    y: camera.center.y - window.Atoms.dot(point, basis.up) * camera.zoom,
    depth: window.Atoms.dot(point, basis.forward),
  };
};

window.Atoms.screenToWorldOnDepth = function screenToWorldOnDepth(screen, depth, camera) {
  const basis = camera.getBasis();
  const sx = (screen.x - camera.center.x) / camera.zoom;
  const sy = -(screen.y - camera.center.y) / camera.zoom;

  return {
    x: basis.right.x * sx + basis.up.x * sy + basis.forward.x * depth,
    y: basis.right.y * sx + basis.up.y * sy + basis.forward.y * depth,
    z: basis.right.z * sx + basis.up.z * sy + basis.forward.z * depth,
  };
};
