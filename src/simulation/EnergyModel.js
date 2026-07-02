import { clamp } from "../config.js";
import { distance } from "../math/vec3.js";

export class EnergyModel {
  constructor(config) {
    this.energyScale = config.energyScale;
  }

  update(lattice) {
    for (const atom of lattice.atoms) {
      atom.energy = 0;
    }

    for (const bond of lattice.bonds) {
      const deformation = Math.abs(distance(bond.a.position, bond.b.position) - bond.restLength);
      bond.a.energy += deformation;
      bond.b.energy += deformation;
    }

    for (const atom of lattice.atoms) {
      atom.energy = clamp(atom.energy * this.energyScale, 0, 1);
    }
  }
}
