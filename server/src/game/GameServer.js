import { Config } from "../config.js";
import { GAME } from "./constants.js";
import { Room } from "./Room.js";
import { Logger } from "../logger.js";
import { StatsRepo } from "../stats/StatsRepo.js";

export class GameServer {
  constructor({ io }) {
    this.io = io;

    this.sessions = new Map(); // userId -> Session
    this.rooms = new Map(); // roomId -> Room

    this.publicRoom = new Room({ roomId: "public", mode: "public" });
    this.rooms.set(this.publicRoom.roomId, this.publicRoom);

    this._tickInterval = null;
    this._lastTickAtMs = Date.now();
    this._broadcastEveryTicks = Math.max(1, Math.round(Config.TICK_RATE / Config.STATE_BROADCAST_RATE));
    this._leaderboardEveryTicks = Math.max(1, Math.round(Config.TICK_RATE / Config.LEADERBOARD_RATE));
    this._tickCount = 0;
  }

  attachSession(session) {
    this.sessions.set(session.userId, session);
  }

  detachSession(userId) {
    const s = this.sessions.get(userId);
    if (!s) return;
    // IMPORTANT: no game-state mutation here; the loop will remove membership.
    s.disconnectRequested = true;
  }

  start() {
    if (this._tickInterval) return;
    const tickMs = Math.round(1000 / Config.TICK_RATE);
    this._tickInterval = setInterval(() => this._tick(), tickMs);
  }

  stop() {
    if (this._tickInterval) clearInterval(this._tickInterval);
    this._tickInterval = null;
  }

  requestJoinPublic(session) {
    session.intent.join = { mode: "public" };
  }

  requestJoinTeam(session, teamId) {
    session.intent.join = { mode: "team", teamId };
  }

  _tick() {
    const nowMs = Date.now();
    const dtSec = 1 / Config.TICK_RATE; // fixed timestep (spec)

    this._tickCount += 1;
    const shouldBroadcast = this._tickCount % this._broadcastEveryTicks === 0;
    const shouldSendLeaderboard = this._tickCount % this._leaderboardEveryTicks === 0;

    // Process joins (intent) before room ticks.
    for (const session of this.sessions.values()) {
      if (session.disconnectRequested) continue;
      if (!session.intent.join) continue;
      this._processJoinIntent(session, nowMs);
      session.intent.join = null;
    }

    // Tick rooms (authoritative loop owns all gameplay mutation).
    for (const room of this.rooms.values()) {
      room.tick({ dtSec, nowMs, shouldBroadcast, shouldSendLeaderboard });
    }

    // Anti-cheat: repeated abuse may disconnect.
    for (const session of this.sessions.values()) {
      if (session.violations >= GAME.ANTI_CHEAT.MAX_VIOLATIONS_BEFORE_DISCONNECT) {
        session.socket.emit("error", { code: "abuse", message: "Disconnected for repeated invalid input." });
        session.socket.disconnect(true);
        session.disconnectRequested = true;
      }
    }

    // Cleanup disconnected sessions & remove from rooms (in-loop, not in socket handlers).
    const toDelete = [];
    for (const session of this.sessions.values()) {
      if (!session.disconnectRequested) continue;
      toDelete.push(session.userId);
    }
    for (const userId of toDelete) {
      const session = this.sessions.get(userId);
      if (!session) continue;
      if (session.roomId) {
        const room = this.rooms.get(session.roomId);
        if (room) {
          // Record a run snapshot on disconnect (optional, async).
          if (StatsRepo.enabled()) {
            const s = room.getPlayerSummary(session.userId);
            if (s) {
              StatsRepo.recordRun({ ...s, reason: "disconnect", by: null }).catch((e) =>
                Logger.warn("stats recordRun failed", { message: e?.message }),
              );
            }
          }
          room.removeMember(session.userId);
        }
      }
      this.sessions.delete(userId);
    }

    this._lastTickAtMs = nowMs;
  }

  _processJoinIntent(session, nowMs) {
    const req = session.intent.join;
    if (!req) return;

    if (req.mode === "public") {
      this._moveSessionToRoom(session, this.publicRoom, { nowMs, mode: "public" });
      return;
    }

    if (req.mode === "team") {
      const teamId = typeof req.teamId === "string" ? req.teamId : "";
      if (teamId.length === 0 || teamId.length > GAME.ANTI_CHEAT.TEAM_ID_MAX_LEN) {
        session.violations += 1;
        session.socket.emit("error", { code: "bad_teamId", message: "Invalid teamId." });
        return;
      }
      const roomId = `team:${teamId}`;
      let room = this.rooms.get(roomId);
      if (!room) {
        room = new Room({ roomId, mode: "team", teamId });
        this.rooms.set(roomId, room);
      }
      if (room.members.size >= GAME.TEAM.MAX_PLAYERS) {
        session.socket.emit("error", { code: "team_full", message: "Team room is full." });
        return;
      }
      this._moveSessionToRoom(session, room, { nowMs, mode: "team", teamId });
      return;
    }
  }

  _moveSessionToRoom(session, room, { nowMs, mode, teamId = null }) {
    // Leave old room first.
    if (session.roomId) {
      const old = this.rooms.get(session.roomId);
      if (old) old.removeMember(session.userId);
    }

    session.roomId = room.roomId;
    session.mode = mode;
    session.teamId = teamId;
    room.addMember(session, nowMs);
  }
}


