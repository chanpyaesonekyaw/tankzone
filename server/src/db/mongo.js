import { MongoClient } from "mongodb";
import { Config } from "../config.js";
import { Logger } from "../logger.js";

export class MongoConn {
  static _client = null;
  static _db = null;

  static async connect() {
    if (this._db) return this._db;
    if (!Config.MONGO_URI) {
      throw new Error("MONGO_URI is not set");
    }

    this._client = new MongoClient(Config.MONGO_URI, {
      // Keep defaults conservative; tune later when needed.
      maxPoolSize: 10,
    });

    await this._client.connect();
    this._db = this._client.db(); // uses db name from connection string

    await this._ensureIndexes();
    return this._db;
  }

  static isConnected() {
    return Boolean(this._db);
  }

  static db() {
    if (!this._db) throw new Error("MongoConn not connected");
    return this._db;
  }

  static async close() {
    if (this._client) await this._client.close();
    this._client = null;
    this._db = null;
  }

  static async _ensureIndexes() {
    const db = this._db;
    if (!db) return;

    const users = db.collection("users");
    // Migration: previous iterations used a unique username index. Email OTP auth doesn't set
    // username, so that index will cause E11000 dup key { username: null }.
    try {
      const idx = await users.indexes();
      if (idx.some((i) => i.name === "username_1")) {
        await users.dropIndex("username_1");
        Logger.warn("dropped legacy users.username_1 index");
      }
    } catch (e) {
      Logger.warn("could not inspect/drop legacy username_1 index", { message: e?.message });
    }

    await users.createIndex({ email: 1 }, { unique: true });
    await users.createIndex({ createdAt: 1 });
    await users.createIndex({ highestScore: -1 });

    const emailOtps = db.collection("emailOtps");
    await emailOtps.createIndex({ email: 1 }, { unique: true });
    await emailOtps.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    await emailOtps.createIndex({ createdAt: 1 });

    const runs = db.collection("runs");
    await runs.createIndex({ userId: 1, at: -1 });
    await runs.createIndex({ score: -1, at: -1 });
  }
}


