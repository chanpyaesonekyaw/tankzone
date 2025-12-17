import { Config } from "../config.js";
import { MongoConn } from "../db/mongo.js";
import { Otp } from "./otp.js";

export class EmailOtpRepo {
  static collection() {
    return MongoConn.db().collection("emailOtps");
  }

  static async requestOtp({ email, userId }) {
    const now = new Date();
    const existing = await this.collection().findOne({ email });
    if (existing?.lastSentAt) {
      const last = new Date(existing.lastSentAt).getTime();
      const deltaSec = (Date.now() - last) / 1000;
      if (deltaSec < Config.OTP_COOLDOWN_SEC) {
        return { ok: false, reason: "cooldown" };
      }
    }

    const code = Otp.generateCode();
    const codeHash = await Otp.hash(code);
    const expiresAt = new Date(Date.now() + Config.OTP_TTL_SEC * 1000);

    await this.collection().updateOne(
      { email },
      {
        $setOnInsert: { email, createdAt: now },
        $set: { userId, codeHash, expiresAt, lastSentAt: now, updatedAt: now, verifyAttempts: 0 },
        $inc: { sendCount: 1 },
      },
      { upsert: true },
    );

    return { ok: true, code, expiresAt };
  }

  static async verifyOtp(email, code) {
    const doc = await this.collection().findOne({ email });
    if (!doc) return { ok: false, reason: "missing" };

    const expiresAt = doc.expiresAt ? new Date(doc.expiresAt).getTime() : 0;
    if (!expiresAt || Date.now() > expiresAt) return { ok: false, reason: "expired" };

    const attempts = Number.isFinite(doc.verifyAttempts) ? doc.verifyAttempts : 0;
    if (attempts >= Config.OTP_MAX_VERIFY_ATTEMPTS) return { ok: false, reason: "locked" };

    const ok = await Otp.verify(code, doc.codeHash);
    if (!ok) {
      await this.collection().updateOne({ email }, { $inc: { verifyAttempts: 1 }, $set: { updatedAt: new Date() } });
      return { ok: false, reason: "invalid" };
    }

    await this.collection().deleteOne({ email });
    return { ok: true };
  }
}


