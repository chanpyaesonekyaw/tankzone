import jwt from "jsonwebtoken";
import { Config } from "../config.js";

export class JwtAuth {
  static signForUser({ userId, name }) {
    return jwt.sign({ userId, name }, Config.JWT_SECRET, {
      expiresIn: Config.JWT_EXPIRES_IN,
    });
  }

  static verifyToken(token) {
    // Throws on invalid/expired token.
    const payload = jwt.verify(token, Config.JWT_SECRET);
    if (!payload || typeof payload !== "object") throw new Error("invalid token");
    const userId = payload.userId;
    if (typeof userId !== "string" || userId.length === 0) throw new Error("invalid token payload");
    const name = typeof payload.name === "string" && payload.name.length > 0 ? payload.name : "Guest";
    return { userId, name };
  }
}


