import { desc } from "drizzle-orm";
import { requireUser } from "@/lib/auth/guard";
import { forms, webhookDeliveries, webhooks } from "@/lib/db/schema";
import { getServices } from "@/lib/env";
import { PageHeader } from "@/components/page-header";
import { emptyClass } from "@/lib/ui";
import { CreateWebhookDialog } from "./create-webhook";
import { WebhookRow } from "./webhook-row";

export const dynamic = "force-dynamic";

export default async function WebhooksPage() {
  await requireUser();
  const { db } = await getServices();

  const rows = await db.select().from(webhooks).orderBy(desc(webhooks.createdAt));
  const formRows = await db.select({ id: forms.id, name: forms.name }).from(forms);

  const deliveries = await db
    .select()
    .from(webhookDeliveries)
    .orderBy(desc(webhookDeliveries.updatedAt))
    .limit(50);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Webhooks"
        description="Send each submission to any https endpoint, signed so the receiver can verify it came from you."
        count={rows.length}
        actions={<CreateWebhookDialog forms={formRows} />}
      />

      {rows.length === 0 ? (
        <p className={emptyClass}>
          No webhooks yet. Press <strong>Add webhook</strong> to forward submissions to n8n, Slack,
          or your own endpoint.
        </p>
      ) : (
        <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
          {rows.map((hook) => (
            <WebhookRow
              key={hook.id}
              hook={{
                id: hook.id,
                url: hook.url,
                active: hook.active,
                formName: formRows.find((f) => f.id === hook.formId)?.name ?? "All forms",
              }}
              deliveries={deliveries
                .filter((d) => d.webhookId === hook.id)
                .slice(0, 5)
                .map((d) => ({
                  id: d.id,
                  status: d.status,
                  attempts: d.attempts,
                  lastStatusCode: d.lastStatusCode,
                  lastError: d.lastError,
                  updatedAt: d.updatedAt,
                }))}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
