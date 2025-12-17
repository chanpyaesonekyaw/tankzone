import { ObjectId } from "mongodb";
import { MongoConn } from "../db/mongo.js";
import { sanitizePlayerName } from "./names.js";

function sanitizeEmail(input) {
  const raw = typeof input === "string" ? input : "";
  const email = raw.trim().toLowerCase();
  // Basic sanity check (not perfect, but enough for API validation).
  if (email.length < 5 || email.length > 254) return "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "";
  return email;
}

export class UsersRepo {
  static collection() {
    return MongoConn.db().collection("users");
  }

  static sanitizeEmail = sanitizeEmail;
  static sanitizeName = sanitizePlayerName;

  static async upsertByEmail({ email, name }) {
    const now = new Date();
    // `username` is legacy; we set it on insert as a safety net in case a legacy unique index exists.
    const $setOnInsert = { email, createdAt: now, username: email };
    const $set = { updatedAt: now };
    if (typeof name === "string" && name.length > 0) $set.name = name;

    // NOTE: We intentionally use updateOne + findOne for maximum compatibility.
    // Some Mongo deployments/drivers can return a null value for findOneAndUpdate even on success.
    const res = await this.collection().updateOne({ email }, { $setOnInsert, $set }, { upsert: true });
    const isNew = Boolean(res?.upsertedId);

    const doc = await this.collection().findOne({ email });
    if (!doc) throw new Error("user upsert failed");

    return { userId: doc._id.toString(), email: doc.email, name: doc.name || "Guest", isNew };
  }

  static async findByEmail(email) {
    const doc = await this.collection().findOne({ email });
    if (!doc) return null;
    return {
      _id: doc._id,
      userId: doc._id.toString(),
      email: doc.email,
      name: doc.name,
      emailVerifiedAt: doc.emailVerifiedAt || null,
    };
  }

  static async findAuthByEmail(email) {
    const doc = await this.collection().findOne({ email });
    if (!doc) return null;
    return {
      _id: doc._id,
      userId: doc._id.toString(),
      email: doc.email,
      name: doc.name || "Guest",
      passwordHash: doc.passwordHash || null,
      highestScore: doc.highestScore || 0,
    };
  }

  static async createWithPassword({ email, name, passwordHash }) {
    const now = new Date();
    const doc = {
      email,
      name: typeof name === "string" && name.length ? name : "Guest",
      passwordHash,
      highestScore: 0,
      createdAt: now,
      updatedAt: now,
      // Legacy safety net:
      username: email,
    };
    const res = await this.collection().insertOne(doc);
    return { userId: res.insertedId.toString(), email, name: doc.name, isNew: true };
  }

  static async upsertPasswordByEmail({ email, name, passwordHash }) {
    const now = new Date();
    const $set = { passwordHash, updatedAt: now };
    if (typeof name === "string" && name.length > 0) $set.name = name;

    const res = await this.collection().updateOne(
      { email },
      { $setOnInsert: { email, createdAt: now, username: email, highestScore: 0 }, $set },
      { upsert: true },
    );

    const doc = await this.collection().findOne({ email });
    if (!doc) throw new Error("user upsert failed");

    return { userId: doc._id.toString(), email: doc.email, name: doc.name || "Guest", isNew: Boolean(res?.upsertedId) };
  }

  static async markEmailVerifiedByEmail(email) {
    const now = new Date();
    await this.collection().updateOne({ email }, { $set: { emailVerifiedAt: now, updatedAt: now } });
    const doc = await this.collection().findOne({ email });
    if (!doc) return null;
    return { userId: doc._id.toString(), email: doc.email, name: doc.name || "Guest", emailVerifiedAt: doc.emailVerifiedAt };
  }

  static async findById(userId) {
    const _id = new ObjectId(userId);
    const doc = await this.collection().findOne({ _id });
    if (!doc) return null;
    return {
      _id: doc._id,
      userId: doc._id.toString(),
      email: doc.email,
      name: doc.name,
      emailVerifiedAt: doc.emailVerifiedAt || null,
    };
  }
}


