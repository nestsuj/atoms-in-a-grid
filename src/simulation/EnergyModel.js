window.Atoms = window.Atoms || {};

window.Atoms.EnergyModel = class EnergyModel {
  constructor(config) {
    this.energyScale = config.energyScale;
  }

  update(lattice) {
    for (const atom of lattice.atoms) {
      atom.energy = 0;
    }

    for (const bond of lattice.bonds) {
      const deformation = Math.abs(window.Atoms.distance(bond.a.position, bond.b.position) - bond.restLength);
      bond.a.energy += deformation;
      bond.b.energy += deformation;
    }

    for (const atom of lattice.atoms) {
      atom.energy = window.Atoms.clamp(atom.energy * this.energyScale, 0, 1);
    }
  }
};
