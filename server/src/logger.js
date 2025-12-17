export class Logger {
  static info(message, meta) {
    if (meta !== undefined) console.log(`[info] ${message}`, meta);
    else console.log(`[info] ${message}`);
  }

  static warn(message, meta) {
    if (meta !== undefined) console.warn(`[warn] ${message}`, meta);
    else console.warn(`[warn] ${message}`);
  }

  static error(message, meta) {
    if (meta !== undefined) console.error(`[error] ${message}`, meta);
    else console.error(`[error] ${message}`);
  }
}


