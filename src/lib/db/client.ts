import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export type Database = ReturnType<typeof createDb>;

/**
 * Wrap a D1 binding in a Drizzle client.
 *
 * Takes the binding rather than reading it from the environment so tests can pass
 * Miniflare's D1 directly, and so nothing outside `src/lib/` needs to know how
 * bindings are resolved.
 */
export function createDb(d1: D1Database) {
  return drizzle(d1, { schema });
}

export { schema };
