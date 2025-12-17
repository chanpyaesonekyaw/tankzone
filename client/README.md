# Tankzone client

This is the React (Vite) client for Tankzone.

## Deploy (different backend domain)

This client uses relative URLs in dev (via Vite proxy), but when deployed with the backend on a different domain you must set build-time env vars in the **Vercel client project**:

- `VITE_BACKEND_URL`: your backend base URL (used for REST calls like `/auth/*`)
- `VITE_SOCKET_URL` (optional): your Socket.IO base URL (defaults to `VITE_BACKEND_URL`)

Example:

- `VITE_BACKEND_URL=https://your-server.vercel.app`
- `VITE_SOCKET_URL=https://your-server.vercel.app`

See `env.example` for the variable names.

## Run (dev)

Backend (separately):

```bash
cd /Users/cpsk/game/server
PORT=3001 npm run dev
```

Client:

```bash
cd /Users/cpsk/game/client
npm install
npm run dev
```

Open the URL printed by Vite (default `http://localhost:5174`).

## How it connects

- REST: `POST /auth/guest` (proxied to backend in `vite.config.js`)
- REST: `POST /auth/register`, `POST /auth/login`
- WebSocket: Socket.IO (proxied `/socket.io` to backend)


