import { ObjectId } from "mongodb";
import { MongoConn } from "../db/mongo.js";

export class StatsRepo {
  static enabled() {
    return MongoConn.isConnected();
  }

  static async recordRun({ userId, name, score, level, roomId, mode, teamId, reason, by }) {
    // Guests use UUIDs; only persist if it looks like a real Mongo ObjectId.
    if (!MongoConn.isConnected()) return;
    if (!ObjectId.isValid(userId)) return;

    const _id = new ObjectId(userId);
    const at = new Date();
    const safeScore = Number.isFinite(score) ? Math.max(0, Math.floor(score)) : 0;
    const safeLevel = Number.isFinite(level) ? Math.max(1, Math.floor(level)) : 1;

    const runs = MongoConn.db().collection("runs");
    await runs.insertOne({
      userId: _id,
      name: typeof name === "string" ? name : "Guest",
      score: safeScore,
      level: safeLevel,
      roomId: typeof roomId === "string" ? roomId : "",
      mode: typeof mode === "string" ? mode : "",
      teamId: typeof teamId === "string" ? teamId : null,
      reason: typeof reason === "string" ? reason : "unknown",
      by: typeof by === "string" ? by : null,
      at,
    });

    // Update user summary for quick reads.
    const users = MongoConn.db().collection("users");
    await users.updateOne(
      { _id },
      {
        $max: { highestScore: safeScore },
        $set: {
          name: typeof name === "string" && name.length ? name : "Guest",
          updatedAt: at,
          lastSeenAt: at,
        },
      },
    );
  }
}


