import { GAME, STAT } from "./constants.js";
import { clamp } from "./math.js";

export function deriveMaxHp(player) {
  const lvl = player.stats[STAT.MAX_HEALTH] ?? 0;
  const mult = 1 + lvl * 0.12;
  return Math.floor(GAME.PLAYER.BASE_MAX_HP * mult);
}

export function deriveMoveSpeed(player) {
  const lvl = player.stats[STAT.MOVE_SPEED] ?? 0;
  const mult = 1 + lvl * 0.08;
  return GAME.PLAYER.BASE_MOVE_SPEED * mult;
}

export function deriveBulletDamage(player) {
  const lvl = player.stats[STAT.BULLET_DAMAGE] ?? 0;
  const mult = 1 + lvl * 0.12;
  return GAME.BULLET.BASE_DAMAGE * mult;
}

export function deriveBulletSpeed(player) {
  const lvl = player.stats[STAT.BULLET_SPEED] ?? 0;
  const mult = 1 + lvl * 0.1;
  return GAME.BULLET.BASE_SPEED * mult;
}

export function deriveReloadMs(player) {
  const lvl = player.stats[STAT.RELOAD_SPEED] ?? 0;
  const mult = 1 + lvl * 0.08;
  const ms = GAME.BULLET.BASE_RELOAD_MS / mult;
  return clamp(ms, GAME.BULLET.MIN_RELOAD_MS, GAME.BULLET.MAX_RELOAD_MS);
}


