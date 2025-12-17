# Server (authoritative)

This is the server-authoritative Node.js backend for the Diep.io–style game described in `../GAME_SPEC.md`.

## Quick start

1) Configure environment:

- You can export env vars directly in your shell, or
- Create a `.env` file (developer-local; usually gitignored). A template is provided as `env.sample`.

```bash
cp env.sample .env
```

2) Install deps and run:

```bash
npm install
npm run dev
```

If you see `EADDRINUSE` on port 3000, pick a different port:

```bash
PORT=3001 npm run dev
```

Then run the React client:

```bash
cd /Users/cpsk/game/client
npm install
npm run dev
```

## HTTP endpoints

- `POST /auth/guest` → `{ token, userId, name }` (optional body: `{ "name": "yourName" }`)
- `POST /auth/register` → `{ token, userId, email, name, isNew }`
- `POST /auth/login` → `{ token, userId, email, name }`
- `GET /healthz` → `ok`

## Socket.IO (WebSocket)

Connect with JWT:

- Socket.IO client should pass `auth: { token }`
- Server validates JWT in the Socket.IO handshake
- **One active connection per `userId`** is enforced (new connection replaces old)

Client → Server events (intent only):

- `move { dx, dy }`
- `rotate { angle }`
- `shoot { angle }`
- `upgrade { stat }`
- `joinPublic`
- `joinTeam { teamId }`

Server → Client events:

- `stateUpdate`
- `spawn`
- `death`
- `leaderboard`
- `error`


