window.Atoms = window.Atoms || {};

window.Atoms.ParticleCollisionSolver = class ParticleCollisionSolver {
  solve(world, collisionRadius) {
    const lattice = world.lattice;
    const minDistance = collisionRadius * 2;
    const minDistanceSquared = minDistance * minDistance;
    const cellSize = Math.max(0.001, minDistance);
    const buckets = this.buildBuckets(lattice, cellSize);
    const excludedPairs = this.excludedPairs(lattice);

    for (const atom of lattice.atoms) {
      const cellX = Math.floor(atom.position.x / cellSize);
      const cellY = Math.floor(atom.position.y / cellSize);
      const cellZ = Math.floor(atom.position.z / cellSize);

      for (let z = cellZ - 1; z <= cellZ + 1; z += 1) {
        for (let y = cellY - 1; y <= cellY + 1; y += 1) {
          for (let x = cellX - 1; x <= cellX + 1; x += 1) {
            const bucket = buckets.get(this.cellKey(x, y, z));
            if (!bucket) {
              continue;
            }

            for (const other of bucket) {
              if (other.id <= atom.id || excludedPairs.has(this.pairKey(atom, other))) {
                continue;
              }

              world.solver.collisionStats.testedPairs += 1;
              this.solvePair(world, atom, other, minDistance, minDistanceSquared);
            }
          }
        }
      }
    }
  }

  buildBuckets(lattice, cellSize) {
    const buckets = new Map();

    for (const atom of lattice.atoms) {
      const x = Math.floor(atom.position.x / cellSize);
      const y = Math.floor(atom.position.y / cellSize);
      const z = Math.floor(atom.position.z / cellSize);
      const key = this.cellKey(x, y, z);
      let bucket = buckets.get(key);

      if (!bucket) {
        bucket = [];
        buckets.set(key, bucket);
      }

      bucket.push(atom);
    }

    return buckets;
  }

  solvePair(world, a, b, minDistance, minDistanceSquared) {
    const aLocked = world.isLocked(a);
    const bLocked = world.isLocked(b);

    if (aLocked && bLocked) {
      return;
    }

    let deltaX = b.position.x - a.position.x;
    let deltaY = b.position.y - a.position.y;
    let deltaZ = b.position.z - a.position.z;
    let distanceSquared = deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ;

    if (distanceSquared >= minDistanceSquared) {
      return;
    }

    if (distanceSquared < 0.000001) {
      deltaX = ((b.id * 928371 + a.id * 364479) % 1000) / 1000 - 0.5;
      deltaY = ((b.id * 193496 + a.id * 834927) % 1000) / 1000 - 0.5;
      deltaZ = ((b.id * 738561 + a.id * 129837) % 1000) / 1000 - 0.5;
      distanceSquared = deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ;
    }

    const distance = Math.max(Math.sqrt(distanceSquared), 0.000001);
    const overlap = (minDistance - distance) * world.solver.collisionStiffness;

    if (overlap <= 0) {
      return;
    }

    const normalX = deltaX / distance;
    const normalY = deltaY / distance;
    const normalZ = deltaZ / distance;
    const aVelocity = world.velocity(a);
    const bVelocity = world.velocity(b);
    const stats = world.solver.collisionStats;
    stats.corrections += 1;
    stats.maxCorrection = Math.max(stats.maxCorrection, overlap);
    stats.activeAtoms.add(a.id);
    stats.activeAtoms.add(b.id);

    if (!aLocked && !bLocked) {
      const correction = overlap * 0.5;
      a.position.x -= normalX * correction;
      a.position.y -= normalY * correction;
      a.position.z -= normalZ * correction;
      b.position.x += normalX * correction;
      b.position.y += normalY * correction;
      b.position.z += normalZ * correction;
    } else if (!aLocked) {
      a.position.x -= normalX * overlap;
      a.position.y -= normalY * overlap;
      a.position.z -= normalZ * overlap;
    } else if (!bLocked) {
      b.position.x += normalX * overlap;
      b.position.y += normalY * overlap;
      b.position.z += normalZ * overlap;
    }

    this.applyVelocityResponse(world, a, b, normalX, normalY, normalZ, aLocked, bLocked, aVelocity, bVelocity);
  }

  applyVelocityResponse(world, a, b, normalX, normalY, normalZ, aLocked, bLocked, aVelocity, bVelocity) {
    const damping = Math.max(0, Math.min(1, world.solver.collisionDamping || 0));
    if (aLocked && bLocked) {
      return;
    }

    const relativeNormalSpeed = (
      (bVelocity.x - aVelocity.x) * normalX
      + (bVelocity.y - aVelocity.y) * normalY
      + (bVelocity.z - aVelocity.z) * normalZ
    );

    if (relativeNormalSpeed < 0 && damping > 0) {
      const velocityCorrection = -relativeNormalSpeed * damping;
      const aShare = aLocked ? 0 : (bLocked ? 1 : 0.5);
      const bShare = bLocked ? 0 : (aLocked ? 1 : 0.5);

      if (!aLocked) {
        aVelocity.x -= normalX * velocityCorrection * aShare;
        aVelocity.y -= normalY * velocityCorrection * aShare;
        aVelocity.z -= normalZ * velocityCorrection * aShare;
      }

      if (!bLocked) {
        bVelocity.x += normalX * velocityCorrection * bShare;
        bVelocity.y += normalY * velocityCorrection * bShare;
        bVelocity.z += normalZ * velocityCorrection * bShare;
      }
    }

    if (!aLocked) {
      this.setVelocity(a, aVelocity);
    }

    if (!bLocked) {
      this.setVelocity(b, bVelocity);
    }
  }

  setVelocity(atom, velocity) {
    atom.previousPosition.x = atom.position.x - velocity.x;
    atom.previousPosition.y = atom.position.y - velocity.y;
    atom.previousPosition.z = atom.position.z - velocity.z;
  }

  excludedPairs(lattice) {
    if (
      lattice.collisionExcludedPairs
      && lattice.collisionExcludedBondCount === lattice.bonds.length
      && lattice.collisionExcludedShearCount === lattice.shearSprings.length
    ) {
      return lattice.collisionExcludedPairs;
    }

    const excluded = new Set();
    const add = (constraint) => {
      excluded.add(this.pairKey(constraint.a, constraint.b));
    };

    for (const bond of lattice.bonds) {
      add(bond);
    }

    for (const shear of lattice.shearSprings) {
      add(shear);
    }

    lattice.collisionExcludedPairs = excluded;
    lattice.collisionExcludedBondCount = lattice.bonds.length;
    lattice.collisionExcludedShearCount = lattice.shearSprings.length;
    return excluded;
  }

  pairKey(a, b) {
    return a.id < b.id ? `${a.id}:${b.id}` : `${b.id}:${a.id}`;
  }

  cellKey(x, y, z) {
    return `${x}:${y}:${z}`;
  }
};

window.Atoms.ClothSelfCollisionSolver = class ClothSelfCollisionSolver {
  solve(world, collisionRadius) {
    const lattice = world.lattice;
    if (lattice.depth !== 1 || !lattice.surfacePanels || lattice.surfacePanels.length === 0) {
      return;
    }

    const panels = lattice.surfacePanels.filter((panel) => panel.side === "front");
    if (panels.length === 0) {
      return;
    }

    const thickness = Math.max(0.001, collisionRadius * 0.85);

    for (const panel of panels) {
      this.solveTriangleCollisions(world, panel.a, panel.b, panel.c, thickness);
      this.solveTriangleCollisions(world, panel.a, panel.c, panel.d, thickness);
    }
  }

  solveTriangleCollisions(world, a, b, c, thickness) {
    const normal = this.triangleUnitNormal(a.position, b.position, c.position);

    if (normal.length < 0.000001) {
      return;
    }

    for (const atom of world.lattice.atoms) {
      if (this.isLocalCollision(atom, a, b, c)) {
        continue;
      }

      this.solveVertexTriangleCollision(world, atom, a, b, c, normal, thickness);
    }
  }

  triangleUnitNormal(a, b, c) {
    const abX = b.x - a.x;
    const abY = b.y - a.y;
    const abZ = b.z - a.z;
    const acX = c.x - a.x;
    const acY = c.y - a.y;
    const acZ = c.z - a.z;
    const nx = abY * acZ - abZ * acY;
    const ny = abZ * acX - abX * acZ;
    const nz = abX * acY - abY * acX;
    const length = Math.hypot(nx, ny, nz);

    if (length < 0.000001) {
      return { x: 0, y: 0, z: 0, length: 0 };
    }

    return { x: nx / length, y: ny / length, z: nz / length, length };
  }

  isLocalCollision(atom, a, b, c) {
    if (atom.id === a.id || atom.id === b.id || atom.id === c.id) {
      return true;
    }

    const minX = Math.min(a.gridX, b.gridX, c.gridX) - 1;
    const maxX = Math.max(a.gridX, b.gridX, c.gridX) + 1;
    const minY = Math.min(a.gridY, b.gridY, c.gridY) - 1;
    const maxY = Math.max(a.gridY, b.gridY, c.gridY) + 1;

    return atom.gridZ === a.gridZ
      && atom.gridX >= minX
      && atom.gridX <= maxX
      && atom.gridY >= minY
      && atom.gridY <= maxY;
  }

  solveVertexTriangleCollision(world, atom, a, b, c, normal, thickness) {
    const point = atom.position;
    const signedDistance = (
      (point.x - a.position.x) * normal.x
      + (point.y - a.position.y) * normal.y
      + (point.z - a.position.z) * normal.z
    );
    const previousSignedDistance = (
      (atom.previousPosition.x - a.position.x) * normal.x
      + (atom.previousPosition.y - a.position.y) * normal.y
      + (atom.previousPosition.z - a.position.z) * normal.z
    );

    if (Math.abs(signedDistance) >= thickness && signedDistance * previousSignedDistance > 0) {
      return;
    }

    const projected = {
      x: point.x - normal.x * signedDistance,
      y: point.y - normal.y * signedDistance,
      z: point.z - normal.z * signedDistance,
    };
    const bary = this.triangleBarycentric(projected, a.position, b.position, c.position);

    if (!bary || bary.u < -0.035 || bary.v < -0.035 || bary.w < -0.035) {
      return;
    }

    const side = signedDistance >= 0 ? 1 : -1;
    const targetDistance = thickness * side;
    const correction = (targetDistance - signedDistance) * world.solver.collisionStiffness;

    if (Math.abs(correction) <= 0.000001) {
      return;
    }

    this.applyVertexTriangleCorrection(world, atom, a, b, c, bary, normal, correction);
  }

  triangleBarycentric(point, a, b, c) {
    const v0x = b.x - a.x;
    const v0y = b.y - a.y;
    const v0z = b.z - a.z;
    const v1x = c.x - a.x;
    const v1y = c.y - a.y;
    const v1z = c.z - a.z;
    const v2x = point.x - a.x;
    const v2y = point.y - a.y;
    const v2z = point.z - a.z;
    const d00 = v0x * v0x + v0y * v0y + v0z * v0z;
    const d01 = v0x * v1x + v0y * v1y + v0z * v1z;
    const d11 = v1x * v1x + v1y * v1y + v1z * v1z;
    const d20 = v2x * v0x + v2y * v0y + v2z * v0z;
    const d21 = v2x * v1x + v2y * v1y + v2z * v1z;
    const denominator = d00 * d11 - d01 * d01;

    if (Math.abs(denominator) < 0.000001) {
      return null;
    }

    const v = (d11 * d20 - d01 * d21) / denominator;
    const w = (d00 * d21 - d01 * d20) / denominator;
    const u = 1 - v - w;
    return { u, v, w };
  }

  applyVertexTriangleCorrection(world, atom, a, b, c, bary, normal, correction) {
    const atomLocked = world.isLocked(atom);
    const weights = [
      { atom: a, weight: bary.u },
      { atom: b, weight: bary.v },
      { atom: c, weight: bary.w },
    ];
    const atomVelocity = world.velocity(atom);
    const triangleVelocities = weights.map((entry) => ({
      atom: entry.atom,
      weight: entry.weight,
      velocity: world.velocity(entry.atom),
    }));
    const movableTriangleWeight = weights.reduce((total, entry) => (
      world.isLocked(entry.atom) ? total : total + Math.max(0, entry.weight)
    ), 0);

    if (atomLocked && movableTriangleWeight <= 0) {
      return;
    }

    const atomShare = atomLocked ? 0 : (movableTriangleWeight > 0 ? 0.55 : 1);
    const triangleShare = 1 - atomShare;
    const correctionLength = Math.abs(correction);
    const stats = world.solver.collisionStats;

    if (!atomLocked) {
      atom.position.x += normal.x * correction * atomShare;
      atom.position.y += normal.y * correction * atomShare;
      atom.position.z += normal.z * correction * atomShare;
      stats.activeAtoms.add(atom.id);
    }

    if (movableTriangleWeight > 0 && triangleShare > 0) {
      for (const entry of weights) {
        if (world.isLocked(entry.atom)) {
          continue;
        }

        const share = triangleShare * Math.max(0, entry.weight) / movableTriangleWeight;
        entry.atom.position.x -= normal.x * correction * share;
        entry.atom.position.y -= normal.y * correction * share;
        entry.atom.position.z -= normal.z * correction * share;
        stats.activeAtoms.add(entry.atom.id);
      }
    }

    stats.corrections += 1;
    stats.maxCorrection = Math.max(stats.maxCorrection, correctionLength);
    this.applyVelocityResponse(world, atom, atomVelocity, triangleVelocities, normal, correction, atomShare, triangleShare);
  }

  applyVelocityResponse(world, atom, atomVelocity, triangleVelocities, normal, correction, atomShare, triangleShare) {
    const atomLocked = world.isLocked(atom);
    const damping = Math.max(0, Math.min(1, world.solver.collisionDamping || 0));
    const surfaceVelocity = this.weightedSurfaceVelocity(triangleVelocities);
    const relativeNormalSpeed = (
      (atomVelocity.x - surfaceVelocity.x) * normal.x
      + (atomVelocity.y - surfaceVelocity.y) * normal.y
      + (atomVelocity.z - surfaceVelocity.z) * normal.z
    );
    const correctionSide = correction >= 0 ? 1 : -1;
    const closingSpeed = -relativeNormalSpeed * correctionSide;

    if (closingSpeed > 0 && damping > 0) {
      const relativeCorrection = -relativeNormalSpeed * damping;

      if (!atomLocked) {
        atomVelocity.x += normal.x * relativeCorrection * atomShare;
        atomVelocity.y += normal.y * relativeCorrection * atomShare;
        atomVelocity.z += normal.z * relativeCorrection * atomShare;
      }

      this.applyTriangleVelocityCorrection(world, triangleVelocities, normal, relativeCorrection, triangleShare);
    }

    if (!atomLocked) {
      this.setVelocity(atom, atomVelocity);
    }

    for (const entry of triangleVelocities) {
      if (!world.isLocked(entry.atom)) {
        this.setVelocity(entry.atom, entry.velocity);
      }
    }
  }

  weightedSurfaceVelocity(triangleVelocities) {
    const velocity = { x: 0, y: 0, z: 0 };

    for (const entry of triangleVelocities) {
      velocity.x += entry.velocity.x * entry.weight;
      velocity.y += entry.velocity.y * entry.weight;
      velocity.z += entry.velocity.z * entry.weight;
    }

    return velocity;
  }

  applyTriangleVelocityCorrection(world, triangleVelocities, normal, relativeCorrection, triangleShare) {
    if (triangleShare <= 0) {
      return;
    }

    const movableWeight = triangleVelocities.reduce((total, entry) => (
      world.isLocked(entry.atom) ? total : total + Math.max(0, entry.weight)
    ), 0);

    if (movableWeight <= 0) {
      return;
    }

    for (const entry of triangleVelocities) {
      if (world.isLocked(entry.atom)) {
        continue;
      }

      const share = triangleShare * Math.max(0, entry.weight) / movableWeight;
      entry.velocity.x -= normal.x * relativeCorrection * share;
      entry.velocity.y -= normal.y * relativeCorrection * share;
      entry.velocity.z -= normal.z * relativeCorrection * share;
    }
  }

  setVelocity(atom, velocity) {
    atom.previousPosition.x = atom.position.x - velocity.x;
    atom.previousPosition.y = atom.position.y - velocity.y;
    atom.previousPosition.z = atom.position.z - velocity.z;
  }
};
