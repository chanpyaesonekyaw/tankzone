import crypto from "node:crypto";

export class BaseEntity {
  constructor(type) {
    this.id = crypto.randomUUID();
    this.type = type;
    this.x = 0;
    this.y = 0;
    this.radius = 1;
    this.dead = false;
  }
}


