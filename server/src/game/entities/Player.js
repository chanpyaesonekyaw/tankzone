import { BaseEntity } from "./BaseEntity.js";
import { GAME, STAT } from "../constants.js";

export class Player extends BaseEntity {
  constructor({ userId, name }) {
    super("player");
    this.userId = userId;
    this.name = name || "Guest";

    this.angle = 0;

    this.maxHp = GAME.PLAYER.BASE_MAX_HP;
    this.hp = this.maxHp;

    this.level = 1;
    this.xp = 0; // XP progress toward next level (server-authoritative)
    this.score = 0; // Leaderboard score (monotonic)

    this.statPoints = 0;
    this.stats = {
      [STAT.MOVE_SPEED]: 0,
      [STAT.BULLET_DAMAGE]: 0,
      [STAT.BULLET_SPEED]: 0,
      [STAT.RELOAD_SPEED]: 0,
      [STAT.MAX_HEALTH]: 0,
    };

    this.nextShotAtMs = 0;
    this.respawnAtMs = 0;
    this.isDead = false;

    this.activeBulletCount = 0;
  }
}


