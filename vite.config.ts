import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Phase 1: pure scaffold. No deploy-specific config yet (added in the Vercel phase).
export default defineConfig({
  plugins: [react()],
});
