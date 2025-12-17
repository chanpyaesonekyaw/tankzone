import http from "node:http";
import express from "express";
import cors from "cors";
import { Server as SocketIOServer } from "socket.io";

import { Config } from "./config.js";
import { Logger } from "./logger.js";
import { JwtAuth } from "./auth/jwt.js";
import { AuthHttpRoutes } from "./auth/http.js";
import { MongoConn } from "./db/mongo.js";
import { GameServer } from "./game/GameServer.js";
import { Session } from "./game/Session.js";

const app = express();
app.use(express.json());

const allowedOrigins = Config.CLIENT_ORIGIN.split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const corsOptions = { origin: allowedOrigins, credentials: true };
app.use(cors(corsOptions));
// Ensure browser CORS preflights succeed.
app.options("*", cors(corsOptions));

app.get("/healthz", (_req, res) => res.send("ok"));
AuthHttpRoutes.register(app);

const server = http.createServer(app);

const io = new SocketIOServer(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
  },
});

const gameServer = new GameServer({ io });

// Enforce "one active connection per userId" (spec rule).
const activeSocketByUserId = new Map(); // userId -> Socket

// JWT validation occurs at websocket handshake time (spec rule).
io.use((socket, next) => {
  try {
    const token =
      socket.handshake?.auth?.token ||
      socket.handshake?.headers?.authorization?.replace(/^Bearer\s+/i, "") ||
      "";
    const { userId, name } = JwtAuth.verifyToken(token);
    socket.data.userId = userId;
    socket.data.name = name;
    next();
  } catch (_err) {
    next(new Error("unauthorized"));
  }
});

io.on("connection", (socket) => {
  const userId = socket.data.userId;
  const name = socket.data.name || "Guest";
  if (typeof userId !== "string" || userId.length === 0) {
    socket.disconnect(true);
    return;
  }

  // If an old socket exists for this userId, replace it.
  const oldSocket = activeSocketByUserId.get(userId);
  if (oldSocket && oldSocket.id !== socket.id) {
    // IMPORTANT: Do not mutate gameplay state here. Just swap the live socket binding.
    const existingSession = gameServer.sessions.get(userId);
    if (existingSession) existingSession.socket = socket;
    oldSocket.disconnect(true);
  }
  activeSocketByUserId.set(userId, socket);

  // Create-or-rebind the session object. Gameplay mutation only happens in the game loop.
  let session = gameServer.sessions.get(userId);
  if (!session) {
    session = new Session({ userId, name, socket });
    gameServer.attachSession(session);
  } else {
    session.socket = socket;
    session.name = name;
    session.disconnectRequested = false;
  }

  // Client → Server events (intent only).
  socket.on("move", (payload) => {
    session.intent.move.pendingDx = payload?.dx;
    session.intent.move.pendingDy = payload?.dy;
    session.intent.move.pending = true;
  });

  socket.on("rotate", (payload) => {
    session.intent.rotate.pendingAngle = payload?.angle;
    session.intent.rotate.pending = true;
  });

  socket.on("shoot", (payload) => {
    session.intent.shoot.angle = payload?.angle;
    session.intent.shoot.requested = true;
  });

  socket.on("upgrade", (payload) => {
    session.intent.upgradeQueue.push(payload?.stat);
  });

  socket.on("joinPublic", () => {
    gameServer.requestJoinPublic(session);
  });

  socket.on("joinTeam", (payload) => {
    gameServer.requestJoinTeam(session, payload?.teamId);
  });

  socket.on("disconnect", (reason) => {
    const current = activeSocketByUserId.get(userId);
    if (current && current.id === socket.id) activeSocketByUserId.delete(userId);

    // IMPORTANT: do not remove from rooms here (spec: no game logic in handlers).
    const s = gameServer.sessions.get(userId);
    if (s && s.socket.id === socket.id) gameServer.detachSession(userId);

    Logger.info("socket disconnected", { userId, reason });
  });
});

function shutdown(signal) {
  Logger.info("shutting down", { signal });
  try {
    gameServer.stop();
  } catch (_e) {
    // ignore
  }
  try {
    io.close();
  } catch (_e) {
    // ignore
  }
  try {
    // Optional: close DB connection if enabled.
    void MongoConn.close();
  } catch (_e) {
    // ignore
  }
  server.close(() => process.exit(0));
  // Force-exit if something hangs.
  setTimeout(() => process.exit(1), 1500).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

server.on("error", (err) => {
  if (err && err.code === "EADDRINUSE") {
    Logger.error("port already in use; set PORT env var to another value", {
      host: Config.HOST,
      port: Config.PORT,
    });
    process.exit(1);
  }
  Logger.error("server error", { code: err?.code, message: err?.message });
  process.exit(1);
});

async function start() {
  // Mongo is optional. Gameplay can run without it (guest-only), but persistence/auth will be disabled.
  if (Config.MONGO_URI) {
    await MongoConn.connect();
    Logger.info("mongo connected");
  } else {
    Logger.warn("MONGO_URI not set; persistence + email/password auth will be unavailable");
  }

  gameServer.start();

  server.listen(Config.PORT, Config.HOST, () => {
    Logger.info("server listening", { host: Config.HOST, port: Config.PORT });
  });
}

start().catch((err) => {
  Logger.error("startup failed", { message: err?.message });
  process.exit(1);
});


