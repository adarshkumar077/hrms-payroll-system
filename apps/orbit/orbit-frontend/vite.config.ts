import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev: proxy /api → the Laravel API at 127.0.0.1:8000 (php artisan serve).
// Prod: build produces a static dist/ (upload to public_html); set VITE_API_URL
// to the Laravel host if the API is served from a different origin.
export default defineConfig({
  plugins: [react()],
  server: {
    // Honor a harness/host-assigned PORT when present; default to Vite's 5173.
    port: Number(process.env.PORT) || 5173,
    proxy: {
      "/api": { target: "http://127.0.0.1:8000", changeOrigin: true },
    },
  },
});
