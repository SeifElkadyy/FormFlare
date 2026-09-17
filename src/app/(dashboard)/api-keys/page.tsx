import { desc } from "drizzle-orm";
import { requireUser } from "@/lib/auth/guard";
import { apiKeys } from "@/lib/db/schema";
import { getServices } from "@/lib/env";
import { ApiKeyManager } from "./manager";

export const dynamic = "force-dynamic";

export default async function ApiKeysPage() {
  await requireUser();
  const { db } = await getServices();

  const rows = await db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      prefix: apiKeys.prefix,
      lastUsedAt: apiKeys.lastUsedAt,
      createdAt: apiKeys.createdAt,
    })
    .from(apiKeys)
    .orderBy(desc(apiKeys.createdAt));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">API keys</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Read submissions programmatically. Send as <code>Authorization: Bearer ff_live_…</code>
        </p>
      </div>

      <ApiKeyManager keys={rows} />
    </div>
  );
}
