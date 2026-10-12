import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Separate from vite.config.ts so test-only setup (fake-indexeddb) never
// leaks into the real dev/build config.
export default defineConfig({
  plugins: [react()],
  test: {
    // "node", not "jsdom": Phase 1 only tests the IndexedDB layer, not
    // React components, so we avoid pulling in an extra dependency.
    // Revisit when component tests are added in a later phase.
    environment: "node",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
  },
});
