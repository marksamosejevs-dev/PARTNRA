import { defineConfig } from "vitest/config";

// Plain Node unit tests over src/lib -- no React/DOM/jsdom needed, and
// deliberately excluded from Next.js's own build (see build's default
// exclusion of *.test.ts) so tests never ship as app code.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
