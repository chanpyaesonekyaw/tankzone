import crypto from "node:crypto";
import { JwtAuth } from "./jwt.js";
import { sanitizePlayerName } from "./names.js";
import { Config } from "../config.js";
import { MongoConn } from "../db/mongo.js";
import { UsersRepo } from "./users.js";
import { Passwords } from "./passwords.js";

function badRequest(res, error) {
  res.status(400).json({ error });
}

function unauthorized(res, error) {
  res.status(401).json({ error });
}

async function ensureMongo(res) {
  if (!Config.MONGO_URI) {
    res.status(503).json({ error: "mongo_disabled" });
    return false;
  }
  if (MongoConn.isConnected()) return true;
  try {
    await MongoConn.connect();
    return true;
  } catch (_e) {
    res.status(503).json({ error: "mongo_unavailable" });
    return false;
  }
}

export class AuthHttpRoutes {
  static register(app) {
    // Guest login: creates a server-issued identity, returned as a JWT.
    // IMPORTANT: Gameplay identity is ALWAYS derived from the JWT during socket connection.
    app.post("/auth/guest", (req, res) => {
      const userId = crypto.randomUUID();
      const name = sanitizePlayerName(req?.body?.name);
      const token = JwtAuth.signForUser({ userId, name });
      res.json({ userId, name, token });
    });

    // Email + password auth (persistent users).
    app.post("/auth/register", async (req, res) => {
      if (!(await ensureMongo(res))) return;

      const email = UsersRepo.sanitizeEmail(req?.body?.email);
      if (!email) return badRequest(res, "invalid_email");

      const name = UsersRepo.sanitizeName(req?.body?.name);
      const password = typeof req?.body?.password === "string" ? req.body.password : "";
      if (password.length < 8 || password.length > 72) return badRequest(res, "invalid_password");

      const existing = await UsersRepo.findAuthByEmail(email);
      if (existing?.passwordHash) return res.status(409).json({ error: "email_in_use" });

      const passwordHash = await Passwords.hash(password);
      const user = await UsersRepo.upsertPasswordByEmail({ email, name, passwordHash });

      const token = JwtAuth.signForUser({ userId: user.userId, name: user.name || "Guest" });
      res.json({ token, userId: user.userId, email: user.email, name: user.name, isNew: user.isNew });
    });

    app.post("/auth/login", async (req, res) => {
      if (!(await ensureMongo(res))) return;

      const email = UsersRepo.sanitizeEmail(req?.body?.email);
      const password = typeof req?.body?.password === "string" ? req.body.password : "";
      if (!email || !password) return badRequest(res, "invalid_request");

      const u = await UsersRepo.findAuthByEmail(email);
      if (!u?.passwordHash) return unauthorized(res, "invalid_credentials");

      const ok = await Passwords.verify(password, u.passwordHash);
      if (!ok) return unauthorized(res, "invalid_credentials");

      // Touch lastLoginAt for analysis; don't block gameplay.
      try {
        await UsersRepo.collection().updateOne({ _id: u._id }, { $set: { lastLoginAt: new Date(), updatedAt: new Date() } });
      } catch (_e) {
        // ignore
      }

      const token = JwtAuth.signForUser({ userId: u.userId, name: u.name || "Guest" });
      res.json({ token, userId: u.userId, email: u.email, name: u.name || "Guest" });
    });
  }
}


