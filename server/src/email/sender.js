import { Config } from "../config.js";
import { Logger } from "../logger.js";

async function sendViaConsole({ to, subject, text }) {
  Logger.info("EMAIL (console)", { to, subject, text });
}

async function sendViaSmtp({ to, subject, text }) {
  // Lazy-load to keep dev simple. Install with: npm i nodemailer
  let nodemailer;
  try {
    nodemailer = await import("nodemailer");
  } catch (_e) {
    throw new Error("EMAIL_PROVIDER=smtp requires nodemailer. Run: npm i nodemailer");
  }

  if (!Config.SMTP_HOST) throw new Error("SMTP_HOST not set");
  if (!Config.SMTP_USER) throw new Error("SMTP_USER not set");
  if (!Config.SMTP_PASS) throw new Error("SMTP_PASS not set");

  const transporter = nodemailer.createTransport({
    host: Config.SMTP_HOST,
    port: Config.SMTP_PORT,
    secure: Config.SMTP_PORT === 465,
    auth: { user: Config.SMTP_USER, pass: Config.SMTP_PASS },
  });

  await transporter.sendMail({
    from: Config.SMTP_FROM,
    to,
    subject,
    text,
  });
}

export class EmailSender {
  static async sendOtpEmail({ email, code }) {
    const subject = "Your login code";
    const text = `Your login code is: ${code}\n\nThis code expires in ${Math.round(Config.OTP_TTL_SEC / 60)} minutes.`;

    if (Config.EMAIL_PROVIDER === "smtp") {
      await sendViaSmtp({ to: email, subject, text });
      return;
    }

    // Default: console (developer-friendly)
    await sendViaConsole({ to: email, subject, text });
  }
}


