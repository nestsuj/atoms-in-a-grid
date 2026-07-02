import { clone } from "../math/vec3.js";

export class Atom {
  constructor(id, position, fixed = false) {
    this.id = id;
    this.position = clone(position);
    this.previousPosition = clone(position);
    this.restPosition = clone(position);
    this.fixed = fixed;
    this.selected = false;
    this.energy = 0;
  }

  reset() {
    this.position = clone(this.restPosition);
    this.previousPosition = clone(this.restPosition);
    this.selected = false;
    this.energy = 0;
  }
}
