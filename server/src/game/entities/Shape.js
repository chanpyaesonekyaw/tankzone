import { BaseEntity } from "./BaseEntity.js";

export class Shape extends BaseEntity {
  constructor({ kind, x, y, radius, hp, xpValue }) {
    super("shape");
    this.kind = kind; // "square" | "triangle" | "pentagon"

    this.x = x;
    this.y = y;
    this.radius = radius;

    this.hp = hp;
    this.xpValue = xpValue;
  }
}


