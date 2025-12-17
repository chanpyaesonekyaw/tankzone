import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev note:
// - If you run the backend on http://localhost:3001, this proxy lets the React dev
//   server call /auth/guest without CORS pain.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/auth": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
      "/socket.io": {
        target: "http://localhost:3001",
        ws: true,
        changeOrigin: true,
      },
    },
  },
});


