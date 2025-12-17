// Centralized gameplay constants (no magic numbers).
export const GAME = Object.freeze({
  WORLD: {
    WIDTH: 5000,
    HEIGHT: 5000,
    SPAWN_MARGIN: 200,
  },

  NETWORK: {
    VISION_RADIUS: 900,
    GRID_CELL_SIZE: 300,
    MAX_STATE_ENTITIES_PER_TYPE: 400,
    COLLISION_QUERY_RADIUS: 120,
    LEADERBOARD_SIZE: 10,
  },

  PLAYER: {
    RADIUS: 24,
    BASE_MAX_HP: 100,
    BASE_MOVE_SPEED: 260,
    RESPAWN_DELAY_MS: 1500,
    MAX_LEVEL: 45,
    STAT_POINTS_PER_LEVEL: 1,
    ROTATION_RATE: Infinity,
  },

  BULLET: {
    RADIUS: 6,
    BASE_SPEED: 700,
    BASE_DAMAGE: 18,
    BASE_LIFETIME_MS: 1200,
    MAX_ACTIVE_PER_PLAYER: 18,
    BASE_RELOAD_MS: 420,
    MIN_RELOAD_MS: 120,
    MAX_RELOAD_MS: 1500,
    BARREL_OFFSET: 34,
  },

  SHAPES: {
    MIN_COUNT: 120,
    MAX_COUNT: 400,
    SPAWN_PER_SECOND: 12,
    // Weighted distribution when spawning random shapes.
    // Values represent cumulative thresholds (0..1).
    SPAWN_DISTRIBUTION: Object.freeze({
      TRIANGLE_THRESHOLD: 0.62,
      PENTAGON_THRESHOLD: 0.86,
    }),
    TYPES: Object.freeze({
      SQUARE: { hp: 25, xp: 15, radius: 18 },
      TRIANGLE: { hp: 40, xp: 30, radius: 22 },
      PENTAGON: { hp: 80, xp: 75, radius: 30 },
    }),
  },

  XP: {
    // Simple progression curve; can be tuned later without affecting protocol.
    REQUIRED_FOR_LEVEL: (nextLevel) => 50 + nextLevel * nextLevel * 18,
    PLAYER_KILL_XP: 80,
  },

  TEAM: {
    MAX_PLAYERS: 24,
    FRIENDLY_FIRE: false,
  },

  ANTI_CHEAT: {
    MAX_VIOLATIONS_BEFORE_DISCONNECT: 30,
    MOVE_INPUT_ABS_MAX: 1.2,
    ANGLE_ABS_MAX: Math.PI * 4,
    TEAM_ID_MAX_LEN: 32,
    MAX_UPGRADES_PER_TICK: 12,
    PLAYER_NAME_MAX_LEN: 20,
  },
});

export const STAT = Object.freeze({
  MOVE_SPEED: "movementSpeed",
  BULLET_DAMAGE: "bulletDamage",
  BULLET_SPEED: "bulletSpeed",
  RELOAD_SPEED: "reloadSpeed",
  MAX_HEALTH: "maxHealth",
});

export const STAT_LIST = Object.freeze([
  STAT.MOVE_SPEED,
  STAT.BULLET_DAMAGE,
  STAT.BULLET_SPEED,
  STAT.RELOAD_SPEED,
  STAT.MAX_HEALTH,
]);


