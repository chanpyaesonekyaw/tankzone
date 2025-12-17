import dotenv from "dotenv";

dotenv.config();

function getEnvString(name, fallback) {
  const v = process.env[name];
  if (typeof v === "string" && v.length > 0) return v;
  return fallback;
}

function getEnvInt(name, fallback) {
  const raw = process.env[name];
  if (raw == null || raw === "") return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

export class Config {
  // NOTE: All server/game constants are centralized in either Config (deployment/runtime)
  // or `src/game/constants.js` (gameplay tuning). This avoids magic numbers.
  static HOST = getEnvString("HOST", "0.0.0.0");
  static PORT = getEnvInt("PORT", 3000);
  // Accept a single origin or a comma-separated allowlist.
  // Examples:
  // - "http://localhost:5173"
  // - "http://localhost:5173,http://localhost:5174,http://localhost:3001"
  static CLIENT_ORIGIN = getEnvString(
    "CLIENT_ORIGIN",
    "https://tankzone.vercel.app,http://localhost:5173,http://localhost:5174,http://localhost:3001",
  );

  static JWT_SECRET = getEnvString("JWT_SECRET", "dev_change_me");
  static JWT_EXPIRES_IN = getEnvString("JWT_EXPIRES_IN", "7d");

  // Optional persistence (MongoDB). If unset, the server still runs (guest mode only).
  static MONGO_URI = getEnvString("MONGO_URI", "");

  static TICK_RATE = getEnvInt("TICK_RATE", 30);
  static STATE_BROADCAST_RATE = getEnvInt("STATE_BROADCAST_RATE", 15);
  static LEADERBOARD_RATE = getEnvInt("LEADERBOARD_RATE", 2);
}


