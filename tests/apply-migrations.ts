import { applyD1Migrations, env } from "cloudflare:test";
import type { D1Migration } from "@cloudflare/vitest-plugin";

/**
 * Apply the real migrations to the test D1 before any test runs.
 *
 * Tests therefore exercise the same schema as production — including the
 * hand-written partial unique index that Drizzle cannot generate.
 *
 * `TEST_MIGRATIONS` is injected in vitest.config.mts via `readD1Migrations()`,
 * which must run in Node (it reads the filesystem), not inside the Worker.
 */
const testEnv = env as unknown as { DB: D1Database; TEST_MIGRATIONS: D1Migration[] };

await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
