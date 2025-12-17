import { GAME } from "../game/constants.js";

export function sanitizePlayerName(input) {
  // Server-authoritative validation: do not trust arbitrary client strings.
  const raw = typeof input === "string" ? input : "";
  let s = raw.trim();
  if (s.length === 0) s = "Guest";

  // Remove control chars and limit to a conservative set.
  // Allowed: letters, numbers, space, underscore, hyphen.
  s = s.replace(/[\u0000-\u001f\u007f]/g, "");
  s = s.replace(/[^a-zA-Z0-9 _-]/g, "");
  s = s.trim();
  if (s.length === 0) s = "Guest";

  if (s.length > GAME.ANTI_CHEAT.PLAYER_NAME_MAX_LEN) {
    s = s.slice(0, GAME.ANTI_CHEAT.PLAYER_NAME_MAX_LEN);
  }

  return s;
}


