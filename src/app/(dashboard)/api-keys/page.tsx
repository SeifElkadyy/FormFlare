import { desc } from "drizzle-orm";
import { requireUser } from "@/lib/auth/guard";
import { apiKeys } from "@/lib/db/schema";
import { getServices } from "@/lib/env";
import { PageHeader } from "@/components/page-header";
import { ApiKeyList, CreateKeyDialog } from "./manager";

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
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="API keys"
        count={rows.length}
        description={
          <>
            Read submissions. Public forms post without a key. Send as{" "}
            <code>Authorization: Bearer ff_live_…</code>
          </>
        }
        actions={<CreateKeyDialog />}
      />

      <ApiKeyList keys={rows} />
    </div>
  );
}
