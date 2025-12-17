import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import { GameCanvas } from "./GameCanvas.jsx";
import { UPGRADE_DEFS } from "./upgrades.js";

const MAX_SNAPSHOTS = 30;
const AUTH_STORAGE_KEY = "shootingGameAuth.v1";

// Deployment:
// - In dev, we rely on Vite's proxy (`vite.config.js`) so relative URLs work.
// - In prod (different domains), set Vercel env var(s) for the client build:
//   - VITE_BACKEND_URL=https://your-server-domain
//   - (optional) VITE_SOCKET_URL=https://your-server-domain
const BACKEND_URL = String(import.meta.env.VITE_BACKEND_URL || "").trim();
const SOCKET_URL = String(import.meta.env.VITE_SOCKET_URL || "").trim();

function resolveBackendUrl(path) {
  if (typeof path !== "string") return path;
  if (/^https?:\/\//i.test(path)) return path;
  if (!BACKEND_URL) return path;
  try {
    return new URL(path, BACKEND_URL).toString();
  } catch (_e) {
    return path;
  }
}

function getSocketBaseUrl() {
  return SOCKET_URL || BACKEND_URL || "/";
}

function saveAuthSession(auth) {
  if (!auth?.token) return;
  const safe = {
    token: auth.token,
    userId: auth.userId,
    email: auth.email || null,
    name: auth.name || "Guest",
    kind: auth.kind || "unknown",
    savedAt: Date.now(),
  };
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(safe));
}

function loadAuthSession() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s?.token || typeof s.token !== "string") return null;
    return s;
  } catch (_e) {
    return null;
  }
}

function clearAuthSession() {
  localStorage.removeItem(AUTH_STORAGE_KEY);
}

function Modal({ title, subtitle, initialValue, okText, cancelText, onResolve }) {
  const [value, setValue] = useState(initialValue || "");
  const inputRef = useRef(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === "Escape") onResolve({ ok: false, value: "" });
      if (e.key === "Enter") onResolve({ ok: true, value });
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onResolve, value]);

  return (
    <div className="modalRoot" aria-hidden="false">
      <div className="modalBackdrop" />
      <div className="modalPanel" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
        <div className="modalTitle" id="modalTitle">
          {title}
        </div>
        {subtitle ? <div className="modalSubtitle">{subtitle}</div> : null}
        <input
          ref={inputRef}
          className="modalInput"
          type="text"
          maxLength={20}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoComplete="off"
        />
        <div className="modalActions">
          <button className="btn btnSecondary" type="button" onClick={() => onResolve({ ok: false, value: "" })}>
            {cancelText || "Cancel"}
          </button>
          <button className="btn btnPrimary" type="button" onClick={() => onResolve({ ok: true, value })}>
            {okText || "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}

async function apiPost(path, body) {
  const url = resolveBackendUrl(path);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error || `http_${res.status}`;
    throw new Error(msg);
  }
  return data;
}

function sanitizeNameForUi(s) {
  if (typeof s !== "string") return "Guest";
  const t = s.trim();
  return t.length ? t : "Guest";
}

function sanitizeEmailForUi(s) {
  if (typeof s !== "string") return "";
  return s.trim().toLowerCase();
}

function AuthModal({ onAuth }) {
  const [mode, setMode] = useState("guest"); // guest | password
  const [pwMode, setPwMode] = useState("login"); // login | register
  const [name, setName] = useState("Guest");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const nameRef = useRef(null);
  const emailRef = useRef(null);
  const passwordRef = useRef(null);

  useEffect(() => {
    setTimeout(() => {
      if (mode === "guest") nameRef.current?.focus();
      if (mode === "password") emailRef.current?.focus();
    }, 0);
  }, [mode, pwMode]);

  async function submitGuest() {
    setError("");
    setBusy(true);
    try {
      const res = await apiPost("/auth/guest", { name: sanitizeNameForUi(name) });
      onAuth({ ...res, kind: "guest" });
    } catch (e) {
      setError(e?.message || "auth_failed");
    } finally {
      setBusy(false);
    }
  }

  async function submitPassword() {
    setError("");
    setBusy(true);
    try {
      const e = sanitizeEmailForUi(email);
      if (!e) throw new Error("invalid_email");
      if (!password) throw new Error("invalid_password");
      if (pwMode === "register") {
        if (password.length < 8) throw new Error("password_too_short");
        if (password !== password2) throw new Error("password_mismatch");
        const res = await apiPost("/auth/register", { email: e, password, name: sanitizeNameForUi(name) });
        onAuth({ ...res, kind: "password" });
      } else {
        const res = await apiPost("/auth/login", { email: e, password });
        onAuth({ ...res, kind: "password" });
      }
    } catch (err) {
      setError(err?.message || "auth_failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modalRoot" aria-hidden="false">
      <div className="modalBackdrop" />
      <div className="modalPanel" role="dialog" aria-modal="true" aria-labelledby="authTitle">
        <div className="modalTitle" id="authTitle">
          Sign in
        </div>
        <div className="modalSubtitle">Guest is fastest. Email + password lets you keep your account across devices.</div>

        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          <button className={`btn ${mode === "guest" ? "btnPrimary" : "btnSecondary"}`} type="button" onClick={() => setMode("guest")}>
            Guest
          </button>
          <button
            className={`btn ${mode === "password" ? "btnPrimary" : "btnSecondary"}`}
            type="button"
            onClick={() => {
              setMode("password");
              setPwMode("login");
              setError("");
            }}
          >
            Email + Password
          </button>
        </div>

        {mode === "guest" ? (
          <input
            ref={nameRef}
            className="modalInput"
            type="text"
            maxLength={20}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Display name"
            autoComplete="off"
            style={{ marginBottom: 10 }}
          />
        ) : null}

        {mode === "password" ? (
          <>
            <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
              <button
                className={`btn ${pwMode === "login" ? "btnPrimary" : "btnSecondary"}`}
                type="button"
                onClick={() => {
                  setPwMode("login");
                  setError("");
                }}
                disabled={busy}
              >
                Login
              </button>
              <button
                className={`btn ${pwMode === "register" ? "btnPrimary" : "btnSecondary"}`}
                type="button"
                onClick={() => {
                  setPwMode("register");
                  setError("");
                }}
                disabled={busy}
              >
                Register
              </button>
            </div>

            <input
              ref={emailRef}
              className="modalInput"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              autoComplete="email"
              style={{ marginBottom: 10 }}
              disabled={busy}
            />

            {pwMode === "register" ? (
              <input
                className="modalInput"
                type="text"
                maxLength={20}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Display name (optional)"
                autoComplete="off"
                disabled={busy}
                style={{ marginBottom: 10 }}
              />
            ) : null}

            <input
              ref={passwordRef}
              className="modalInput"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              autoComplete={pwMode === "register" ? "new-password" : "current-password"}
              disabled={busy}
              style={{ marginBottom: pwMode === "register" ? 10 : 0 }}
            />

            {pwMode === "register" ? (
              <input
                className="modalInput"
                type="password"
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
                placeholder="Confirm password"
                autoComplete="new-password"
                disabled={busy}
              />
            ) : null}
          </>
        ) : null}

        {error ? <div style={{ marginTop: 10, color: "rgba(255,120,120,0.95)", fontSize: 13 }}>{error}</div> : null}

        <div className="modalActions">
          {mode === "guest" ? (
            <button className="btn btnPrimary" type="button" onClick={submitGuest} disabled={busy}>
              Continue
            </button>
          ) : (
            <button className="btn btnPrimary" type="button" onClick={submitPassword} disabled={busy}>
              {pwMode === "register" ? "Register" : "Login"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function App() {
  const copyrightYear = useMemo(() => new Date().getFullYear(), []);
  const [authOpen, setAuthOpen] = useState(true);
  const [teamModal, setTeamModal] = useState({ open: false });
  const [status, setStatus] = useState("Sign in…");
  const [me, setMe] = useState(null);
  const [room, setRoom] = useState(null);
  const [statsText, setStatsText] = useState("");
  const [leaderboardText, setLeaderboardText] = useState("");
  const [authed, setAuthed] = useState(null); // { token, userId, email?, name?, kind? }

  const socketRef = useRef(null);
  const lastStateRef = useRef(null);
  const snapshotsRef = useRef([]);
  const isUiBlockedRef = useRef(true);

  const hudHelp = useMemo(
    () => (
      <div className="help">
        <div className="hudTitle">Controls</div>
        <div>
          <span className="keycap">W</span>
          <span className="keycap">A</span>
          <span className="keycap">S</span>
          <span className="keycap">D</span>
          <span className="muted"> or </span>
          <span className="keycap">↑</span>
          <span className="keycap">←</span>
          <span className="keycap">↓</span>
          <span className="keycap">→</span>
          <span className="muted"> move</span>
        </div>
        <br />
        <div>
          <span className="keycap wide">Mouse</span> <span className="muted">aim</span> ·{" "}
          <span className="keycap wide">Click</span> <span className="muted">shoot</span>
        </div>
        <br />
        <div>
          {UPGRADE_DEFS.map((u) => (
            <span
              key={u.key}
              className="keycap"
              title={`${u.label} — ${u.description}`}
              aria-label={`${u.key}: ${u.label}. ${u.description}`}
            >
              {u.key}
            </span>
          ))}
          <span className="muted"> upgrade</span>
        </div>
        <br />
        <div>
          <span className="keycap">T</span> <span className="muted">join team</span>
        </div>
        <div className="helpFooter muted">© {copyrightYear} Chan</div>
      </div>
    ),
    [copyrightYear],
  );

  useEffect(() => {
    return () => socketRef.current?.disconnect();
  }, []);

  useEffect(() => {
    // Auto-login on refresh if we have a saved JWT.
    const saved = loadAuthSession();
    if (!saved) return;
    setAuthOpen(false);
    setAuthed(saved);
    // eslint-disable-next-line no-void
    void connectWithToken(saved);
    // We intentionally run this once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    isUiBlockedRef.current = Boolean(authOpen || teamModal.open);
  }, [authOpen, teamModal.open]);

  const requestTeamJoin = useCallback(() => {
    if (!socketRef.current?.connected) return;
    setTeamModal({ open: true });
  }, []);

  async function connectWithToken(auth) {
    setStatus(`Connecting…`);

    // Ensure we don't keep old sockets around.
    try {
      socketRef.current?.disconnect();
    } catch (_e) {
      // ignore
    }

    const socket = io(getSocketBaseUrl(), { auth: { token: auth.token } });
    socketRef.current = socket;
    lastStateRef.current = null;
    snapshotsRef.current = [];

    socket.on("connect", () => {
      setStatus(`Connected as ${auth.name} · joining public…`);
      socket.emit("joinPublic");
    });

    socket.on("connect_error", (err) => {
      const msg = err?.message || String(err);
      setStatus(`Connect error: ${msg}`);
      // If the server rejected our JWT, clear stored auth and reopen the auth modal.
      if (String(msg).toLowerCase().includes("unauthorized")) {
        clearAuthSession();
        setAuthed(null);
        setAuthOpen(true);
      }
    });

    socket.on("error", (payload) => {
      setStatus(`Server error: ${payload?.message || "unknown"}`);
    });

    socket.on("spawn", (payload) => {
      setMe(payload);
      lastStateRef.current = { ...(lastStateRef.current || {}), me: payload };
    });

    socket.on("stateUpdate", (payload) => {
      lastStateRef.current = payload;
      snapshotsRef.current.push({ t: performance.now(), state: payload });
      while (snapshotsRef.current.length > MAX_SNAPSHOTS) snapshotsRef.current.shift();
      setRoom(payload.room);
      setMe(payload.me);
      setStatsText(
        [
          `HP: ${Math.floor(payload.me.hp)}/${Math.floor(payload.me.maxHp)}`,
          `Level: ${payload.me.level} (stat points: ${payload.me.statPoints})`,
          `XP: ${Math.floor(payload.me.xp)} · Score: ${Math.floor(payload.me.score)}`,
          `Room: ${payload.room?.id || "?"}`,
        ].join("\n"),
      );
    });

    socket.on("leaderboard", (payload) => {
      const lines = ["Leaderboard"];
      for (const [i, row] of (payload?.top || []).entries()) {
        const n = (row.name || row.userId || "").toString().slice(0, 12).padEnd(12, " ");
        lines.push(`${String(i + 1).padStart(2, " ")}  ${n}  ${String(row.score).padStart(6, " ")}`);
      }
      setLeaderboardText(lines.join("\n"));
    });
  }

  return (
    <div className="root">
      <GameCanvas
        socketRef={socketRef}
        lastStateRef={lastStateRef}
        snapshotsRef={snapshotsRef}
        isUiBlockedRef={isUiBlockedRef}
        onRequestTeamJoin={requestTeamJoin}
      />

      <div className="hudPanel hudTopLeft">
        <div className="status">{status}</div>
        <div className="hudDivider" />
        <div className="stats">{statsText}</div>
        {!authOpen ? (
          <div className="hudActionsRow">
            <button
              className="btn btnSecondary btnWithIcon"
              type="button"
              onClick={() => {
                clearAuthSession();
                setAuthed(null);
                setAuthOpen(true);
                try {
                  socketRef.current?.disconnect();
                } catch (_e) {
                  // ignore
                }
              }}
              aria-label="Logout"
              title="Logout"
            >
              <svg className="btnIcon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path
                  fill="currentColor"
                  d="M10 17v-2h4v-6h-4V7l-5 5 5 5Zm-7 4V3h10v2H5v14h8v2H3Zm14-4v-2h4v-6h-4V7l-5 5 5 5Z"
                />
              </svg>
              Logout
            </button>
          </div>
        ) : null}
      </div>

      <div className="hudPanel hudBottomLeft">{hudHelp}</div>

      <div className="hudPanel hudTopRight">
        <div className="hudTitle">Leaderboard</div>
        <div className="leaderboard">{leaderboardText}</div>
      </div>

      {authOpen ? (
        <AuthModal
          onAuth={async (auth) => {
            saveAuthSession(auth);
            setAuthed(auth);
            setAuthOpen(false);
            await connectWithToken(auth);
          }}
        />
      ) : null}

      {teamModal.open ? (
        <Modal
          title="Join team room"
          subtitle="Enter teamId (private room)"
          initialValue="alpha"
          okText="Join"
          cancelText="Cancel"
          onResolve={(res) => {
            setTeamModal({ open: false });
            if (res.ok && res.value && socketRef.current?.connected) socketRef.current.emit("joinTeam", { teamId: res.value });
          }}
        />
      ) : null}

    </div>
  );
}


