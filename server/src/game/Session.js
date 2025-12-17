export class Session {
  constructor({ userId, name, socket }) {
    this.userId = userId;
    this.name = name || "Guest";
    this.socket = socket;

    // The spec mandates: handlers accept intent only; the authoritative loop applies it.
    // So handlers only set these fields; they NEVER mutate game state.
    this.intent = {
      // Movement/rotation are persistent intents; handlers update "pending" and the loop
      // validates and commits them to the "current" values once, preventing repeated
      // violation counting from a single bad payload.
      move: { dx: 0, dy: 0, pendingDx: 0, pendingDy: 0, pending: false },
      rotate: { angle: 0, pendingAngle: 0, pending: false },
      shoot: { angle: 0, requested: false },
      upgradeQueue: [],
      join: null, // { mode: "public" } | { mode: "team", teamId }
    };

    this.roomId = null;
    this.mode = null; // "public" | "team"
    this.teamId = null;

    this.violations = 0;
    this.disconnectRequested = false;
  }
}


