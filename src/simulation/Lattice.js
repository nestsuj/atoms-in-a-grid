window.Atoms = window.Atoms || {};

window.Atoms.Lattice = class Lattice {
  constructor(config) {
    this.rebuild(config);
  }

  rebuild(config) {
    this.width = config.width;
    this.height = config.height;
    this.depth = config.depth;
    this.restLength = config.restLength;
    this.atoms = [];
    this.bonds = [];
    this.shearSprings = [];
    this.bendingConstraints = [];

    const offsetX = (this.width - 1) * this.restLength * 0.5;
    const offsetY = (this.height - 1) * this.restLength * 0.5;
    const offsetZ = (this.depth - 1) * this.restLength * 0.5;

    for (let z = 0; z < this.depth; z += 1) {
      for (let y = 0; y < this.height; y += 1) {
        for (let x = 0; x < this.width; x += 1) {
          const id = this.index(x, y, z);
          const cornerPin = this.isCorner(x, y, z);
          const position = window.Atoms.vec3(
            x * this.restLength - offsetX,
            y * this.restLength - offsetY,
            z * this.restLength - offsetZ,
          );
          this.atoms.push(new window.Atoms.Atom(id, position, cornerPin, cornerPin));
        }
      }
    }

    this.connectNeighbors();
    this.connectShearSprings();
    this.connectBendingConstraints();
  }

  index(x, y, z) {
    return x + y * this.width + z * this.width * this.height;
  }

  atomAt(x, y, z) {
    return this.atoms[this.index(x, y, z)];
  }

  isCorner(x, y, z) {
    const onX = x === 0 || x === this.width - 1;
    const onY = y === 0 || y === this.height - 1;
    const onZ = z === 0 || z === this.depth - 1;
    return onX && onY && onZ;
  }

  connectNeighbors() {
    for (let z = 0; z < this.depth; z += 1) {
      for (let y = 0; y < this.height; y += 1) {
        for (let x = 0; x < this.width; x += 1) {
          const atom = this.atomAt(x, y, z);
          if (x + 1 < this.width) this.bonds.push(new window.Atoms.Bond(atom, this.atomAt(x + 1, y, z), this.restLength));
          if (y + 1 < this.height) this.bonds.push(new window.Atoms.Bond(atom, this.atomAt(x, y + 1, z), this.restLength));
          if (z + 1 < this.depth) this.bonds.push(new window.Atoms.Bond(atom, this.atomAt(x, y, z + 1), this.restLength));
        }
      }
    }
  }

  connectShearSprings() {
    const seen = new Set();
    const add = (a, b) => {
      const first = Math.min(a.id, b.id);
      const second = Math.max(a.id, b.id);
      const key = `${first}:${second}`;

      if (seen.has(key)) {
        return;
      }

      seen.add(key);
      this.shearSprings.push(new window.Atoms.Bond(
        a,
        b,
        window.Atoms.distance(a.restPosition, b.restPosition),
      ));
    };

    for (let z = 0; z < this.depth; z += 1) {
      for (let y = 0; y < this.height; y += 1) {
        for (let x = 0; x < this.width; x += 1) {
          if (x + 1 < this.width && y + 1 < this.height) {
            add(this.atomAt(x, y, z), this.atomAt(x + 1, y + 1, z));
            add(this.atomAt(x + 1, y, z), this.atomAt(x, y + 1, z));
          }

          if (x + 1 < this.width && z + 1 < this.depth) {
            add(this.atomAt(x, y, z), this.atomAt(x + 1, y, z + 1));
            add(this.atomAt(x + 1, y, z), this.atomAt(x, y, z + 1));
          }

          if (y + 1 < this.height && z + 1 < this.depth) {
            add(this.atomAt(x, y, z), this.atomAt(x, y + 1, z + 1));
            add(this.atomAt(x, y + 1, z), this.atomAt(x, y, z + 1));
          }
        }
      }
    }
  }

  connectBendingConstraints() {
    const seen = new Set();

    for (let z = 0; z < this.depth; z += 1) {
      for (let y = 0; y < this.height; y += 1) {
        for (let x = 0; x < this.width; x += 1) {
          const neighbors = this.neighborsOf(x, y, z);

          for (let i = 0; i < neighbors.length; i += 1) {
            for (let j = i + 1; j < neighbors.length; j += 1) {
              const a = neighbors[i];
              const b = neighbors[j];
              const first = Math.min(a.id, b.id);
              const second = Math.max(a.id, b.id);
              const key = `${first}:${second}`;

              if (seen.has(key)) {
                continue;
              }

              seen.add(key);
              this.bendingConstraints.push(new window.Atoms.BendingConstraint(
                a,
                b,
                window.Atoms.distance(a.restPosition, b.restPosition),
              ));
            }
          }
        }
      }
    }
  }

  neighborsOf(x, y, z) {
    const neighbors = [];
    if (x > 0) neighbors.push(this.atomAt(x - 1, y, z));
    if (x + 1 < this.width) neighbors.push(this.atomAt(x + 1, y, z));
    if (y > 0) neighbors.push(this.atomAt(x, y - 1, z));
    if (y + 1 < this.height) neighbors.push(this.atomAt(x, y + 1, z));
    if (z > 0) neighbors.push(this.atomAt(x, y, z - 1));
    if (z + 1 < this.depth) neighbors.push(this.atomAt(x, y, z + 1));
    return neighbors;
  }

  reset() {
    for (const atom of this.atoms) {
      atom.reset();
    }
  }

  clearUserPins() {
    for (const atom of this.atoms) {
      if (atom.cornerPin || !atom.fixed) {
        continue;
      }

      atom.fixed = false;
      window.Atoms.copy(atom.previousPosition, atom.position);
    }
  }
};
