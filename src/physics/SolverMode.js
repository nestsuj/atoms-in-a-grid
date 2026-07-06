window.Atoms = window.Atoms || {};

window.Atoms.SolverMode = Object.freeze({
  FORCE: "force",
  POSITION: "position",

  normalize(value) {
    switch (value) {
      case "force":
      case "spring":
        return "force";
      case "position":
      case "constraint":
        return "position";
      default:
        return "force";
    }
  },

  isForce(value) {
    return this.normalize(value) === "force";
  },

  isPosition(value) {
    return this.normalize(value) === "position";
  },
});
