import { BaseEntity } from "./BaseEntity.js";
import { GAME } from "../constants.js";

export class Bullet extends BaseEntity {
  constructor({ ownerId, x, y, vx, vy, damage, expiresAtMs }) {
    super("bullet");
    this.ownerId = ownerId;

    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;

    this.damage = damage;
    this.expiresAtMs = expiresAtMs;

    this.radius = GAME.BULLET.RADIUS;
  }
}


