import { GAME, STAT_LIST } from "./constants.js";
import { SpatialGrid } from "./SpatialGrid.js";
import { clamp, dist2, isFiniteNumber, normalize, wrapAngleRad } from "./math.js";
import { Player } from "./entities/Player.js";
import { Bullet } from "./entities/Bullet.js";
import { Shape } from "./entities/Shape.js";
import { Logger } from "../logger.js";
import { StatsRepo } from "../stats/StatsRepo.js";
import {
  deriveBulletDamage,
  deriveBulletSpeed,
  deriveMaxHp,
  deriveMoveSpeed,
  deriveReloadMs,
} from "./derive.js";

export class Room {
  constructor({ roomId, mode, teamId = null, friendlyFire = GAME.TEAM.FRIENDLY_FIRE }) {
    this.roomId = roomId;
    this.mode = mode; // "public" | "team"
    this.teamId = teamId;
    this.friendlyFire = friendlyFire;

    this.members = new Map(); // userId -> Session
    this.players = new Map(); // userId -> Player
    this.bullets = new Map(); // bulletId -> Bullet
    this.shapes = new Map(); // shapeId -> Shape

    this._collideGrid = new SpatialGrid(GAME.NETWORK.GRID_CELL_SIZE);
    this._visionGrid = new SpatialGrid(GAME.NETWORK.GRID_CELL_SIZE);

    this._shapeSpawnBudget = 0;
    this._lastBroadcastAtMs = 0;
    this._lastLeaderboardAtMs = 0;
  }

  addMember(session, nowMs) {
    this.members.set(session.userId, session);
    let p = this.players.get(session.userId);
    if (!p) {
      p = new Player({ userId: session.userId, name: session.name });
      this.players.set(session.userId, p);
    } else if (p.name !== session.name) {
      // Keep server-authoritative name in sync with the session (from JWT).
      p.name = session.name;
    }

    // Always spawn or re-spawn on join.
    this._spawnPlayer(p, nowMs);
    session.socket.emit("spawn", this._serializeSelf(p));
  }

  removeMember(userId) {
    this.members.delete(userId);
    // For now, delete player state on leave to keep memory bounded.
    this.players.delete(userId);
  }

  getPlayerSummary(userId) {
    const p = this.players.get(userId);
    if (!p) return null;
    return {
      userId: p.userId,
      name: p.name,
      score: p.score,
      level: p.level,
      roomId: this.roomId,
      mode: this.mode,
      teamId: this.teamId,
    };
  }

  tick({ dtSec, nowMs, shouldBroadcast, shouldSendLeaderboard }) {
    // 1) Process inputs (intent only) and upgrades.
    for (const session of this.members.values()) {
      const p = this.players.get(session.userId);
      if (!p) continue;
      this._applySessionIntent(session, p, { dtSec, nowMs });
    }

    // 2) Update entities.
    this._updateBullets({ dtSec, nowMs });
    this._maintainShapes({ dtSec });

    // 3) Collisions (server-authoritative).
    this._handleCollisions({ nowMs });

    // 4) Broadcast state (can be lower than tick rate, but still executed from the loop).
    if (shouldBroadcast) this._broadcastState(nowMs);
    if (shouldSendLeaderboard) this._broadcastLeaderboard();
  }

  _applySessionIntent(session, player, { dtSec, nowMs }) {
    // Death/respawn: server-controlled.
    if (player.isDead) {
      if (nowMs >= player.respawnAtMs) {
        this._spawnPlayer(player, nowMs);
        session.socket.emit("spawn", this._serializeSelf(player));
      }
      return;
    }

    // Validate + apply upgrades (server authoritative).
    if (session.intent.upgradeQueue.length > 0) {
      const queue = session.intent.upgradeQueue.splice(0, GAME.ANTI_CHEAT.MAX_UPGRADES_PER_TICK);
      for (const stat of queue) {
        if (!STAT_LIST.includes(stat)) {
          session.violations += 1;
          continue;
        }
        if (player.statPoints <= 0) continue;
        player.stats[stat] += 1;
        player.statPoints -= 1;
      }

      // Derived stats updated server-side only.
      const newMax = deriveMaxHp(player);
      if (newMax !== player.maxHp) {
        const pct = player.hp / Math.max(1, player.maxHp);
        player.maxHp = newMax;
        player.hp = Math.max(1, Math.floor(newMax * pct));
      }
    }

    // Rotation follows mouse direction (client intent, server authoritative final state).
    if (session.intent.rotate.pending) {
      session.intent.rotate.pending = false;
      const a = session.intent.rotate.pendingAngle;
      if (isFiniteNumber(a) && Math.abs(a) <= GAME.ANTI_CHEAT.ANGLE_ABS_MAX) {
        session.intent.rotate.angle = wrapAngleRad(a);
      } else {
        session.violations += 1;
      }
    }
    player.angle = session.intent.rotate.angle;

    // Movement: client sends direction intent only; server computes position and clamps.
    if (session.intent.move.pending) {
      session.intent.move.pending = false;
      const dx = session.intent.move.pendingDx;
      const dy = session.intent.move.pendingDy;
      if (isFiniteNumber(dx) && isFiniteNumber(dy) && Math.abs(dx) <= GAME.ANTI_CHEAT.MOVE_INPUT_ABS_MAX && Math.abs(dy) <= GAME.ANTI_CHEAT.MOVE_INPUT_ABS_MAX) {
        session.intent.move.dx = dx;
        session.intent.move.dy = dy;
      } else {
        session.violations += 1;
      }
    }
    {
      const n = normalize(session.intent.move.dx, session.intent.move.dy);
      const speed = deriveMoveSpeed(player);
      player.x += n.x * speed * dtSec;
      player.y += n.y * speed * dtSec;
      this._clampToWorld(player);
    }

    // Shooting: server enforces fire rate and creates bullets.
    if (session.intent.shoot.requested) {
      session.intent.shoot.requested = false;
      const a = session.intent.shoot.angle;
      if (!isFiniteNumber(a) || Math.abs(a) > GAME.ANTI_CHEAT.ANGLE_ABS_MAX) {
        session.violations += 1;
        return;
      }
      if (nowMs < player.nextShotAtMs) return;
      if (player.activeBulletCount >= GAME.BULLET.MAX_ACTIVE_PER_PLAYER) return;

      const angle = wrapAngleRad(a);
      const speed = deriveBulletSpeed(player);
      const damage = deriveBulletDamage(player);
      const reloadMs = deriveReloadMs(player);

      const spawnX = player.x + Math.cos(angle) * GAME.BULLET.BARREL_OFFSET;
      const spawnY = player.y + Math.sin(angle) * GAME.BULLET.BARREL_OFFSET;
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;

      const b = new Bullet({
        ownerId: player.userId,
        x: spawnX,
        y: spawnY,
        vx,
        vy,
        damage,
        expiresAtMs: nowMs + GAME.BULLET.BASE_LIFETIME_MS,
      });
      this.bullets.set(b.id, b);
      player.activeBulletCount += 1;
      player.nextShotAtMs = nowMs + reloadMs;
    }

    // XP & leveling: server-only. (XP gained in collisions; apply level-ups here.)
    this._tryLevelUp(player);
  }

  _updateBullets({ dtSec, nowMs }) {
    for (const b of this.bullets.values()) {
      if (nowMs >= b.expiresAtMs) {
        b.dead = true;
        continue;
      }
      b.x += b.vx * dtSec;
      b.y += b.vy * dtSec;
      if (b.x < 0 || b.y < 0 || b.x > GAME.WORLD.WIDTH || b.y > GAME.WORLD.HEIGHT) {
        b.dead = true;
      }
    }
    this._cleanupDeadBullets();
  }

  _cleanupDeadBullets() {
    if (this.bullets.size === 0) return;
    for (const [id, b] of this.bullets.entries()) {
      if (!b.dead) continue;
      this.bullets.delete(id);
      const owner = this.players.get(b.ownerId);
      if (owner) owner.activeBulletCount = Math.max(0, owner.activeBulletCount - 1);
    }
  }

  _maintainShapes({ dtSec }) {
    const minCount = GAME.SHAPES.MIN_COUNT;
    const maxCount = GAME.SHAPES.MAX_COUNT;

    // Hard cap to protect performance/bandwidth.
    if (this.shapes.size > maxCount) {
      const toRemove = this.shapes.size - maxCount;
      let removed = 0;
      for (const [id] of this.shapes) {
        this.shapes.delete(id);
        removed += 1;
        if (removed >= toRemove) break;
      }
    }

    const missing = Math.max(0, Math.min(minCount, maxCount) - this.shapes.size);
    for (let i = 0; i < missing; i += 1) this._spawnRandomShape();

    if (this.shapes.size >= maxCount) return;

    this._shapeSpawnBudget += dtSec * GAME.SHAPES.SPAWN_PER_SECOND;
    while (this._shapeSpawnBudget >= 1) {
      this._shapeSpawnBudget -= 1;
      if (this.shapes.size >= maxCount) break;
      this._spawnRandomShape();
    }
  }

  _spawnRandomShape() {
    const roll = Math.random();
    let kind = "square";
    if (roll > GAME.SHAPES.SPAWN_DISTRIBUTION.PENTAGON_THRESHOLD) kind = "pentagon";
    else if (roll > GAME.SHAPES.SPAWN_DISTRIBUTION.TRIANGLE_THRESHOLD) kind = "triangle";

    const spec = GAME.SHAPES.TYPES[kind.toUpperCase()];
    const margin = GAME.WORLD.SPAWN_MARGIN;
    const x = margin + Math.random() * (GAME.WORLD.WIDTH - margin * 2);
    const y = margin + Math.random() * (GAME.WORLD.HEIGHT - margin * 2);

    const s = new Shape({ kind, x, y, radius: spec.radius, hp: spec.hp, xpValue: spec.xp });
    this.shapes.set(s.id, s);
  }

  _handleCollisions({ nowMs }) {
    // Build broadphase for shapes + players (bullets are iterated).
    this._collideGrid.clear();
    for (const p of this.players.values()) {
      if (p.isDead) continue;
      p.radius = GAME.PLAYER.RADIUS;
      this._collideGrid.insert(p);
    }
    for (const s of this.shapes.values()) this._collideGrid.insert(s);

    // Bullet collisions: bullets destroyed on collision; health/xp are server-controlled.
    for (const b of this.bullets.values()) {
      if (b.dead) continue;
      const candidates = this._collideGrid.queryCircle(b.x, b.y, GAME.NETWORK.COLLISION_QUERY_RADIUS);
      for (const e of candidates) {
        if (e.type === "player") {
          const p = e;
          if (p.userId === b.ownerId) continue;
          if (this.mode === "team" && !this.friendlyFire) {
            // Single-team room => friendly fire off means no PvP within the team.
            // (Team PvP can be enabled by setting FRIENDLY_FIRE true.)
            continue;
          }
          if (p.isDead) continue;
          if (dist2(b.x, b.y, p.x, p.y) <= (b.radius + p.radius) * (b.radius + p.radius)) {
            this._damagePlayer({ target: p, amount: b.damage, nowMs, sourceUserId: b.ownerId });
            b.dead = true;
            break;
          }
        } else if (e.type === "shape") {
          const s = e;
          if (dist2(b.x, b.y, s.x, s.y) <= (b.radius + s.radius) * (b.radius + s.radius)) {
            s.hp -= b.damage;
            b.dead = true;
            if (s.hp <= 0) {
              this.shapes.delete(s.id);
              this._awardXp(b.ownerId, s.xpValue);
            }
            break;
          }
        }
      }
    }
    this._cleanupDeadBullets();
  }

  _damagePlayer({ target, amount, nowMs, sourceUserId }) {
    target.hp -= amount;
    if (target.hp > 0) return;

    target.hp = 0;
    target.isDead = true;
    target.respawnAtMs = nowMs + GAME.PLAYER.RESPAWN_DELAY_MS;

    // Award XP for player kill.
    this._awardXp(sourceUserId, GAME.XP.PLAYER_KILL_XP);

    // Notify the dead player (server authoritative death detection).
    const session = this.members.get(target.userId);
    if (session) session.socket.emit("death", { userId: target.userId, by: sourceUserId });

    // Persist run summary (optional, async).
    if (StatsRepo.enabled()) {
      StatsRepo.recordRun({
        userId: target.userId,
        name: target.name,
        score: target.score,
        level: target.level,
        roomId: this.roomId,
        mode: this.mode,
        teamId: this.teamId,
        reason: "death",
        by: sourceUserId,
      }).catch((e) => Logger.warn("stats recordRun failed", { message: e?.message }));
    }
  }

  _awardXp(userId, xp) {
    const p = this.players.get(userId);
    if (!p || p.isDead) return;
    p.xp += xp;
    p.score += xp;
  }

  _tryLevelUp(player) {
    while (player.level < GAME.PLAYER.MAX_LEVEL) {
      const req = GAME.XP.REQUIRED_FOR_LEVEL(player.level + 1);
      if (player.xp < req) break;
      player.xp -= req;
      player.level += 1;
      player.statPoints += GAME.PLAYER.STAT_POINTS_PER_LEVEL;
    }
  }

  _spawnPlayer(player, nowMs) {
    const margin = GAME.WORLD.SPAWN_MARGIN;
    player.x = margin + Math.random() * (GAME.WORLD.WIDTH - margin * 2);
    player.y = margin + Math.random() * (GAME.WORLD.HEIGHT - margin * 2);

    player.maxHp = deriveMaxHp(player);
    player.hp = player.maxHp;
    player.isDead = false;
    player.respawnAtMs = 0;
    player.nextShotAtMs = nowMs;
    player.activeBulletCount = 0;
  }

  _clampToWorld(entity) {
    entity.x = clamp(entity.x, 0, GAME.WORLD.WIDTH);
    entity.y = clamp(entity.y, 0, GAME.WORLD.HEIGHT);
  }

  _broadcastState(nowMs) {
    // Spatial partitioning for visibility culling (performance rule).
    this._visionGrid.clear();
    for (const p of this.players.values()) {
      if (p.isDead) continue;
      this._visionGrid.insert(p);
    }
    for (const b of this.bullets.values()) this._visionGrid.insert(b);
    for (const s of this.shapes.values()) this._visionGrid.insert(s);

    for (const session of this.members.values()) {
      const me = this.players.get(session.userId);
      if (!me) continue;
      const payload = this._buildStateUpdateForPlayer(me);
      session.socket.emit("stateUpdate", payload);
    }

    this._lastBroadcastAtMs = nowMs;
  }

  _buildStateUpdateForPlayer(me) {
    const r = GAME.NETWORK.VISION_RADIUS;
    const r2 = r * r;
    const candidates = this._visionGrid.queryCircle(me.x, me.y, r);

    const players = [];
    const bullets = [];
    const shapes = [];

    for (const e of candidates) {
      if (dist2(me.x, me.y, e.x, e.y) > r2) continue;
      if (e.type === "player") {
        const p = e;
        if (p.userId === me.userId) continue;
        players.push({ userId: p.userId, name: p.name, x: p.x, y: p.y, angle: p.angle, hp: p.hp, maxHp: p.maxHp });
      } else if (e.type === "bullet") {
        const b = e;
        bullets.push({ id: b.id, ownerId: b.ownerId, x: b.x, y: b.y });
      } else if (e.type === "shape") {
        const s = e;
        shapes.push({ id: s.id, kind: s.kind, x: s.x, y: s.y, hp: s.hp });
      }
    }

    // Cap entity counts to protect bandwidth (performance rule).
    players.length = Math.min(players.length, GAME.NETWORK.MAX_STATE_ENTITIES_PER_TYPE);
    bullets.length = Math.min(bullets.length, GAME.NETWORK.MAX_STATE_ENTITIES_PER_TYPE);
    shapes.length = Math.min(shapes.length, GAME.NETWORK.MAX_STATE_ENTITIES_PER_TYPE);

    return {
      room: { id: this.roomId, mode: this.mode, teamId: this.teamId },
      world: { width: GAME.WORLD.WIDTH, height: GAME.WORLD.HEIGHT },
      visionRadius: GAME.NETWORK.VISION_RADIUS,
      me: this._serializeSelf(me),
      players,
      bullets,
      shapes,
    };
  }

  _serializeSelf(me) {
    return {
      userId: me.userId,
      name: me.name,
      x: me.x,
      y: me.y,
      angle: me.angle,
      hp: me.hp,
      maxHp: me.maxHp,
      xp: me.xp,
      level: me.level,
      score: me.score,
      statPoints: me.statPoints,
      stats: me.stats,
    };
  }

  _broadcastLeaderboard() {
    // Global leaderboard for public; team leaderboard for team rooms.
    const top = [...this.players.values()]
      .filter((p) => !p.isDead)
      .sort((a, b) => b.score - a.score)
      .slice(0, GAME.NETWORK.LEADERBOARD_SIZE)
      .map((p) => ({ userId: p.userId, name: p.name, score: p.score, level: p.level }));

    for (const session of this.members.values()) {
      session.socket.emit("leaderboard", { top, mode: this.mode, teamId: this.teamId });
    }
  }
}


