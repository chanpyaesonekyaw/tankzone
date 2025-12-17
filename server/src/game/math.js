export function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

export function isFiniteNumber(v) {
  return typeof v === "number" && Number.isFinite(v);
}

export function len2(x, y) {
  return x * x + y * y;
}

export function dist2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

export function normalize(x, y) {
  const l = Math.hypot(x, y);
  if (!Number.isFinite(l) || l <= 0) return { x: 0, y: 0 };
  return { x: x / l, y: y / l };
}

export function wrapAngleRad(a) {
  if (!Number.isFinite(a)) return 0;
  // Keep values bounded to avoid float blowups.
  const twoPi = Math.PI * 2;
  let r = a % twoPi;
  if (r > Math.PI) r -= twoPi;
  if (r < -Math.PI) r += twoPi;
  return r;
}


