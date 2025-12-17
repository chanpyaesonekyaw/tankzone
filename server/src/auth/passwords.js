import bcrypt from "bcryptjs";

export class Passwords {
  static async hash(password) {
    // bcrypt cost factor; 10 is a decent baseline for dev. Tune for prod.
    const saltRounds = 10;
    return await bcrypt.hash(password, saltRounds);
  }

  static async verify(password, passwordHash) {
    return await bcrypt.compare(password, passwordHash);
  }
}


