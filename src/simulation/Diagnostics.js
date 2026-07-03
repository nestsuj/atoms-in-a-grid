window.Atoms = window.Atoms || {};

window.Atoms.Diagnostics = class Diagnostics {
  constructor(config) {
    this.config = config;
    this.values = this.empty();
  }

  empty() {
    return {
      kineticEnergy: 0,
      springEnergy: 0,
      maxStrain: 0,
      averageStrain: 0,
      springCount: 0,
    };
  }

  update(lattice, physicsRate) {
    const velocityScale = physicsRate || 60;
    const mass = Math.max(0.1, this.config.atomMass);
    const result = this.empty();

    for (const atom of lattice.atoms) {
      if (atom.fixed) {
        continue;
      }

      const velocityX = (atom.position.x - atom.previousPosition.x) * velocityScale;
      const velocityY = (atom.position.y - atom.previousPosition.y) * velocityScale;
      const velocityZ = (atom.position.z - atom.previousPosition.z) * velocityScale;
      result.kineticEnergy += 0.5 * mass * (velocityX * velocityX + velocityY * velocityY + velocityZ * velocityZ);
    }

    this.measureSprings(result, lattice.bonds, this.config.stiffness);
    this.measureSprings(result, lattice.shearSprings, this.config.shearStiffness);
    this.measureSprings(result, lattice.bendingConstraints, this.config.bendStiffness * 0.35);
    this.values = result;
    return result;
  }

  measureSprings(result, springs, stiffness) {
    if (!springs.length || stiffness <= 0) {
      return;
    }

    let strainTotal = result.averageStrain * result.springCount;
    let springCount = result.springCount;

    for (const spring of springs) {
      const length = window.Atoms.distance(spring.a.position, spring.b.position);
      const extension = length - spring.restLength;
      const strain = Math.abs(extension) / spring.restLength;
      result.springEnergy += 0.5 * stiffness * extension * extension;
      result.maxStrain = Math.max(result.maxStrain, strain);
      strainTotal += strain;
      springCount += 1;
    }

    result.springCount = springCount;
    result.averageStrain = springCount > 0 ? strainTotal / springCount : 0;
  }
};
