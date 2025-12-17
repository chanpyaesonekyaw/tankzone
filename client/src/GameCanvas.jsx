import React, { useEffect, useRef } from "react";
import { UPGRADE_BY_KEY } from "./upgrades.js";

const NET_SEND_HZ = 30;
const INTERP_DELAY_MS = 120;
const MAX_SNAPSHOTS = 30;

const TANK_RADIUS = 24;
const BULLET_RADIUS = 6.5;
const OUTLINE_COLOR = "rgba(250, 250, 250, 0.85)";

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpAngle(a, b, t) {
  const twoPi = Math.PI * 2;
  let d = ((b - a + Math.PI) % twoPi) - Math.PI;
  if (d < -Math.PI) d += twoPi;
  return a + d * t;
}

function indexBy(arr, key) {
  const m = new Map();
  for (const item of arr || []) m.set(item[key], item);
  return m;
}

function interpolateState(a, b, t) {
  const out = {
    room: b.room,
    world: b.world,
    visionRadius: b.visionRadius,
    me: b.me,
    players: [],
    bullets: [],
    shapes: b.shapes || [],
  };

  const aPlayers = indexBy(a.players, "userId");
  for (const p of b.players || []) {
    const prev = aPlayers.get(p.userId);
    if (!prev) {
      out.players.push(p);
      continue;
    }
    out.players.push({
      ...p,
      x: lerp(prev.x, p.x, t),
      y: lerp(prev.y, p.y, t),
      angle: lerpAngle(prev.angle || 0, p.angle || 0, t),
    });
  }

  const aBullets = indexBy(a.bullets, "id");
  for (const bullet of b.bullets || []) {
    const prev = aBullets.get(bullet.id);
    if (!prev) {
      out.bullets.push(bullet);
      continue;
    }
    out.bullets.push({
      ...bullet,
      x: lerp(prev.x, bullet.x, t),
      y: lerp(prev.y, bullet.y, t),
    });
  }

  return out;
}

function shapeRadius(kind) {
  if (kind === "pentagon") return 30;
  if (kind === "triangle") return 22;
  return 18;
}

function drawTank(ctx, x, y, angle, radius, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = OUTLINE_COLOR;
  ctx.lineWidth = Math.max(1.5, radius * 0.10);
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.fillRect(radius * 0.2, -radius * 0.18, radius * 1.25, radius * 0.36);
  ctx.strokeStyle = OUTLINE_COLOR;
  ctx.lineWidth = Math.max(1.2, radius * 0.07);
  ctx.strokeRect(radius * 0.2, -radius * 0.18, radius * 1.25, radius * 0.36);
  ctx.restore();
}

function drawName(ctx, name, x, y) {
  const label = typeof name === "string" && name.length > 0 ? name : "Guest";
  ctx.save();
  ctx.font = "12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillText(label, x + 1, y - 30 + 1);
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.fillText(label, x, y - 30);
  ctx.restore();
}

function drawHealthBar(ctx, x, y, radius, hp, maxHp) {
  const max = typeof maxHp === "number" && Number.isFinite(maxHp) && maxHp > 0 ? maxHp : 1;
  const cur = typeof hp === "number" && Number.isFinite(hp) ? hp : 0;
  const frac = clamp(cur / max, 0, 1);

  const w = radius * 2.4;
  const h = 5;
  const pad = 1;
  const x0 = x - w / 2;
  const y0 = y + radius + 10;

  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(x0, y0, w, h);
  const hue = Math.round(frac * 120);
  ctx.fillStyle = `hsl(${hue}, 85%, 55%)`;
  ctx.fillRect(x0 + pad, y0 + pad, Math.max(0, (w - pad * 2) * frac), h - pad * 2);
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 1;
  ctx.strokeRect(x0, y0, w, h);
  ctx.restore();
}

function drawShape(ctx, kind, x, y, r) {
  ctx.save();
  ctx.translate(x, y);
  if (kind === "square") {
    ctx.fillStyle = "#f2c94c";
    ctx.fillRect(-r, -r, r * 2, r * 2);
    ctx.strokeStyle = OUTLINE_COLOR;
    ctx.lineWidth = Math.max(1.2, r * 0.10);
    ctx.strokeRect(-r, -r, r * 2, r * 2);
  } else if (kind === "triangle") {
    ctx.fillStyle = "#56ccf2";
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.lineTo(r, r);
    ctx.lineTo(-r, r);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = OUTLINE_COLOR;
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(1.2, r * 0.10);
    ctx.stroke();
  } else {
    ctx.fillStyle = "#eb5757";
    ctx.beginPath();
    for (let i = 0; i < 5; i += 1) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
      const px = Math.cos(a) * r;
      const py = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = OUTLINE_COLOR;
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(1.2, r * 0.10);
    ctx.stroke();
  }
  ctx.restore();
}

function drawMinimap(ctx, renderState, dpr, cssW, cssH, camX, camY) {
  const worldW = renderState?.world?.width;
  const worldH = renderState?.world?.height;
  if (!(Number.isFinite(worldW) && Number.isFinite(worldH) && worldW > 0 && worldH > 0)) return;

  const size = 180;
  const pad = 12;
  const x0 = cssW - pad - size;
  const y0 = cssH - pad - size;

  function roundRectPath(x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    if (typeof ctx.roundRect === "function") {
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, rr);
      return;
    }
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  roundRectPath(x0, y0, size, size, 14);
  ctx.fillStyle = "rgba(10,12,16,0.62)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = "rgba(255,255,255,0.78)";
  ctx.font = "11px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText("MINIMAP", x0 + 10, y0 + 8);

  const vr = Number.isFinite(renderState?.visionRadius) ? renderState.visionRadius : 0;
  if (vr > 0) {
    const sx = size / worldW;
    const sy = size / worldH;
    const r = vr * Math.min(sx, sy);
    const cx = x0 + (camX / worldW) * size;
    const cy = y0 + (camY / worldH) * size;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.10)";
    ctx.stroke();
  }

  function dot(wx, wy, color, r) {
    const px = x0 + (wx / worldW) * size;
    const py = y0 + (wy / worldH) * size;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const s of renderState.shapes || []) {
    const c = s.kind === "pentagon" ? "#eb5757" : s.kind === "triangle" ? "#56ccf2" : "#f2c94c";
    dot(s.x, s.y, c, 1.6);
  }
  for (const p of renderState.players || []) {
    dot(p.x, p.y, "rgba(255,255,255,0.55)", 2.0);
  }
  dot(camX, camY, "rgba(255,255,255,0.92)", 2.6);

  ctx.restore();
}

export function GameCanvas({ socketRef, lastStateRef, snapshotsRef, isUiBlockedRef, onRequestTeamJoin }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let dpr = 1;
    let cssW = window.innerWidth;
    let cssH = window.innerHeight;

    function fitCanvas() {
      dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      cssW = window.innerWidth;
      cssH = window.innerHeight;
      canvas.width = Math.floor(cssW * dpr);
      canvas.height = Math.floor(cssH * dpr);
    }

    fitCanvas();
    window.addEventListener("resize", fitCanvas);

    const keys = new Set();
    // Use pointer events so aiming works consistently for mouse + touch.
    // Initialize to screen center so we never "default aim" to a corner.
    let mouseX = window.innerWidth / 2;
    let mouseY = window.innerHeight / 2;
    let mouseDown = false;
    let aimAngle = 0;

    function updateAimFromClientPoint(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      const dx = clientX - (rect.left + rect.width / 2);
      const dy = clientY - (rect.top + rect.height / 2);
      // If dx/dy are both 0 (rare), keep previous aimAngle to avoid NaN-ish jumps.
      if (dx === 0 && dy === 0) return;
      aimAngle = Math.atan2(dy, dx);
    }

    function getMoveIntent() {
      let dx = 0;
      let dy = 0;
      if (keys.has("w") || keys.has("ArrowUp")) dy -= 1;
      if (keys.has("s") || keys.has("ArrowDown")) dy += 1;
      if (keys.has("a") || keys.has("ArrowLeft")) dx -= 1;
      if (keys.has("d") || keys.has("ArrowRight")) dx += 1;
      return { dx, dy };
    }

    function onKeyDown(e) {
      if (isUiBlockedRef.current) return;
      keys.add(e.key);

      const sock = socketRef.current;
      if (!sock?.connected) return;

      const upgrade = UPGRADE_BY_KEY[e.key];
      if (upgrade) sock.emit("upgrade", { stat: upgrade.stat });
      if (e.key.toLowerCase() === "t") onRequestTeamJoin?.();
    }

    function onKeyUp(e) {
      keys.delete(e.key);
    }

    // Mouse input (more stable than Pointer Events on some browsers for click-to-shoot).
    function onMouseMove(e) {
      mouseX = e.clientX;
      mouseY = e.clientY;
      updateAimFromClientPoint(mouseX, mouseY);
    }

    function onMouseDown(e) {
      if (isUiBlockedRef.current) return;
      if (typeof e.button === "number" && e.button !== 0) return;
      e.preventDefault();
      mouseX = e.clientX;
      mouseY = e.clientY;
      updateAimFromClientPoint(mouseX, mouseY);
      mouseDown = true;
    }

    function onMouseUp() {
      mouseDown = false;
    }

    // Touch input (Pointer Events + capture so you can drag-aim).
    function onTouchPointerMove(e) {
      if (e.pointerType !== "touch") return;
      mouseX = e.clientX;
      mouseY = e.clientY;
      updateAimFromClientPoint(mouseX, mouseY);
    }

    function onTouchPointerDown(e) {
      if (isUiBlockedRef.current) return;
      if (e.pointerType !== "touch") return;
      if (e.isPrimary === false) return;
      e.preventDefault();
      mouseX = e.clientX;
      mouseY = e.clientY;
      updateAimFromClientPoint(mouseX, mouseY);
      mouseDown = true;
      try {
        canvas.setPointerCapture?.(e.pointerId);
      } catch (_e) {
        // ignore
      }
    }

    function onTouchPointerUp(e) {
      if (e.pointerType !== "touch") return;
      mouseDown = false;
      try {
        canvas.releasePointerCapture?.(e.pointerId);
      } catch (_e) {
        // ignore
      }
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);

    // Touch pointer events (capture targets events to the canvas).
    canvas.addEventListener("pointermove", onTouchPointerMove);
    canvas.addEventListener("pointerdown", onTouchPointerDown);
    window.addEventListener("pointerup", onTouchPointerUp);

    // Prevent context menu on right-click over canvas.
    function onContextMenu(e) {
      e.preventDefault();
    }
    canvas.addEventListener("contextmenu", onContextMenu);

    let hasMeRender = false;
    const meRender = { x: 0, y: 0, angle: 0 };

    function getRenderState(nowMs) {
      const snapshots = snapshotsRef.current;
      if (snapshots.length === 0) return null;
      const renderAt = nowMs - INTERP_DELAY_MS;
      while (snapshots.length >= 2 && snapshots[1].t <= renderAt) snapshots.shift();
      const a = snapshots[0];
      const b = snapshots[1];
      if (!b) return a.state;
      const span = Math.max(1, b.t - a.t);
      const t = clamp((renderAt - a.t) / span, 0, 1);
      return interpolateState(a.state, b.state, t);
    }

    function render() {
      const now = performance.now();

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#0b0d10";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const state = lastStateRef.current;
      if (!state?.me) {
        raf = requestAnimationFrame(render);
        return;
      }

      const me = state.me;
      if (!hasMeRender) {
        meRender.x = me.x;
        meRender.y = me.y;
        // Render local barrel using client aim only (avoid snapping if server angle lags/resets).
        meRender.angle = aimAngle;
        hasMeRender = true;
      } else {
        meRender.x = lerp(meRender.x, me.x, 0.22);
        meRender.y = lerp(meRender.y, me.y, 0.22);
        // Always render local barrel using the latest aimAngle so it stays locked to the pointer (even while shooting).
        // The server remains authoritative for actual simulation/bullets.
        const targetAngle = aimAngle;
        meRender.angle = lerpAngle(meRender.angle, targetAngle, 0.35);
      }

      const renderState = getRenderState(now) || state;
      const camX = meRender.x;
      const camY = meRender.y;

      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.translate(cssW / 2, cssH / 2);
      ctx.translate(-camX, -camY);

      // Background grid
      ctx.strokeStyle = "rgba(255,255,255,0.04)";
      ctx.lineWidth = 1;
      const step = 120;
      const left = camX - cssW / 2 - 200;
      const right = camX + cssW / 2 + 200;
      const top = camY - cssH / 2 - 200;
      const bottom = camY + cssH / 2 + 200;
      for (let x = Math.floor(left / step) * step; x < right; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, top);
        ctx.lineTo(x, bottom);
        ctx.stroke();
      }
      for (let y = Math.floor(top / step) * step; y < bottom; y += step) {
        ctx.beginPath();
        ctx.moveTo(left, y);
        ctx.lineTo(right, y);
        ctx.stroke();
      }

      // Shapes
      for (const s of renderState.shapes || []) drawShape(ctx, s.kind, s.x, s.y, shapeRadius(s.kind));

      // Bullets
      ctx.fillStyle = "rgba(255,255,255,0.90)";
      ctx.strokeStyle = OUTLINE_COLOR;
      ctx.lineWidth = 2;
      for (const b of renderState.bullets || []) {
        ctx.beginPath();
        ctx.arc(b.x, b.y, BULLET_RADIUS, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      // Others
      for (const p of renderState.players || []) {
        drawTank(ctx, p.x, p.y, p.angle || 0, TANK_RADIUS, "rgba(255,255,255,0.28)");
        drawName(ctx, p.name, p.x, p.y);
        drawHealthBar(ctx, p.x, p.y, TANK_RADIUS, p.hp, p.maxHp);
      }

      // Me
      drawTank(ctx, meRender.x, meRender.y, meRender.angle, TANK_RADIUS, "rgba(255,255,255,0.85)");
      drawName(ctx, renderState?.me?.name, meRender.x, meRender.y);
      drawHealthBar(ctx, meRender.x, meRender.y, TANK_RADIUS, renderState?.me?.hp, renderState?.me?.maxHp);

      ctx.restore();

      drawMinimap(ctx, renderState, dpr, cssW, cssH, camX, camY);

      raf = requestAnimationFrame(render);
    }

    let raf = requestAnimationFrame(render);

    const netTimer = setInterval(() => {
      if (isUiBlockedRef.current) return;
      const sock = socketRef.current;
      const state = lastStateRef.current;
      if (!sock?.connected || !state?.me) return;

      sock.emit("move", getMoveIntent());

      // Use the last computed aim angle from pointer events.
      sock.emit("rotate", { angle: aimAngle });
      if (mouseDown) sock.emit("shoot", { angle: aimAngle });
    }, Math.floor(1000 / NET_SEND_HZ));

    return () => {
      window.removeEventListener("resize", fitCanvas);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
      canvas.removeEventListener("pointermove", onTouchPointerMove);
      canvas.removeEventListener("pointerdown", onTouchPointerDown);
      window.removeEventListener("pointerup", onTouchPointerUp);
      canvas.removeEventListener("contextmenu", onContextMenu);
      clearInterval(netTimer);
      cancelAnimationFrame(raf);
    };
  }, [socketRef, lastStateRef, snapshotsRef, isUiBlockedRef, onRequestTeamJoin]);

  return <canvas ref={canvasRef} className="gameCanvas" />;
}


