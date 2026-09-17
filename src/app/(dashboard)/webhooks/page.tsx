import { desc } from "drizzle-orm";
import { requireUser } from "@/lib/auth/guard";
import { forms, webhookDeliveries, webhooks } from "@/lib/db/schema";
import { getServices } from "@/lib/env";
import { CreateWebhookForm } from "./create-webhook";
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
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Webhooks</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Send each submission to any https endpoint, signed so the receiver can verify it came from
          you.
        </p>
      </div>

      <CreateWebhookForm forms={formRows} />

      {rows.length === 0 ? (
        <p className="rounded-lg border border-black/[.08] p-6 text-sm text-zinc-600 dark:border-white/[.145] dark:text-zinc-400">
          No webhooks yet. Add one above to forward submissions to n8n, Slack, or your own endpoint.
        </p>
      ) : (
        <ul className="space-y-3">
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
