import path from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// Read in Node (not in the Worker) so tests run against the same migrations,
// including the hand-written partial index, that production applies.
const migrations = await readD1Migrations(path.join(import.meta.dirname, "drizzle/migrations"));

export default defineConfig({
  // Match the app's tsconfig paths, so a test importing a route handler resolves the
  // same "@/..." specifiers the route itself uses.
  resolve: {
    alias: { "@": path.join(import.meta.dirname, "src") },
  },
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          TEST_MIGRATIONS: migrations,
          // Worker sandboxes get an empty process.env, so opt-in flags have to be
          // passed through explicitly. LIVE_TESTS=1 enables tests that call real
          // external services (Cloudflare's Turnstile siteverify).
          LIVE_TESTS: process.env.LIVE_TESTS ?? "",
        },
      },
    }),
  ],
  test: {
    include: ["tests/**/*.test.ts"],
    setupFiles: ["./tests/apply-migrations.ts"],
  },
});
