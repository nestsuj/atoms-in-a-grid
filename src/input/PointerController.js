window.Atoms = window.Atoms || {};

window.Atoms.PointerController = class PointerController {
  constructor(canvas) {
    this.canvas = canvas;
  }

  getPoint(event) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }
};
