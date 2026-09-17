/**
 * Wipe this instance back to first-run setup.
 *
 * A "delete account" that left `setup_completed` set would brick a single-owner
 * install: `/setup` 404s and there is no user. So this deletes R2 objects, every
 * row, and every settings key — including `session_secret`. The next visitor sees
 * `/setup` again.
 */
import type { Database } from "../db/client";
import {
  apiKeys,
  auditLog,
  emailDeliveries,
  files as filesTable,
  forms,
  projects,
  sessions,
  settings,
  submissions,
  users,
  webhookDeliveries,
  webhooks,
} from "../db/schema";
import type { Storage } from "../platform/storage";

export async function wipeInstance(db: Database, storage: Storage): Promise<void> {
  const keys = await db.select({ r2Key: filesTable.r2Key }).from(filesTable);
  for (const { r2Key } of keys) {
    await storage.delete(r2Key).catch(() => {});
  }

  await db.delete(webhookDeliveries);
  await db.delete(emailDeliveries);
  await db.delete(filesTable);
  await db.delete(submissions);
  await db.delete(webhooks);
  await db.delete(apiKeys);
  await db.delete(auditLog);
  await db.delete(sessions);
  await db.delete(forms);
  await db.delete(projects);
  await db.delete(users);
  await db.delete(settings);
}
