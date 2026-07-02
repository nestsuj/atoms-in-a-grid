window.Atoms = window.Atoms || {};

window.Atoms.project = function project(point, camera) {
  const basis = camera.getBasis();
  return window.Atoms.projectWithBasis(point, camera, basis);
};

window.Atoms.projectWithBasis = function projectWithBasis(point, camera, basis, out) {
  const target = out || {};
  const right = basis.right;
  const up = basis.up;
  const forward = basis.forward;

  target.x = camera.center.x + (point.x * right.x + point.y * right.y + point.z * right.z) * camera.zoom;
  target.y = camera.center.y - (point.x * up.x + point.y * up.y + point.z * up.z) * camera.zoom;
  target.depth = point.x * forward.x + point.y * forward.y + point.z * forward.z;

  return target;
};

window.Atoms.screenToWorldOnDepthWithBasis = function screenToWorldOnDepthWithBasis(screen, depth, camera, basis, out) {
  const target = out || {};
  const sx = (screen.x - camera.center.x) / camera.zoom;
  const sy = -(screen.y - camera.center.y) / camera.zoom;

  target.x = basis.right.x * sx + basis.up.x * sy + basis.forward.x * depth;
  target.y = basis.right.y * sx + basis.up.y * sy + basis.forward.y * depth;
  target.z = basis.right.z * sx + basis.up.z * sy + basis.forward.z * depth;

  return target;
};

window.Atoms.screenToWorldOnDepth = function screenToWorldOnDepth(screen, depth, camera) {
  const basis = camera.getBasis();
  return window.Atoms.screenToWorldOnDepthWithBasis(screen, depth, camera, basis);
};
