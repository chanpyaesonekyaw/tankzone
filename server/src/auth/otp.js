import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { Config } from "../config.js";

export class Otp {
  static generateCode() {
    const len = Math.max(4, Math.min(10, Config.OTP_LENGTH));
    const max = 10 ** len;
    const n = crypto.randomInt(0, max);
    return String(n).padStart(len, "0");
  }

  static async hash(code) {
    const saltRounds = 10;
    return await bcrypt.hash(code, saltRounds);
  }

  static async verify(code, hash) {
    return await bcrypt.compare(code, hash);
  }
}


