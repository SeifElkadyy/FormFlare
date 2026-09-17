"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireUserForMutation } from "@/lib/auth/guard";
import { audit } from "@/lib/auth/login";
import { decryptSecret, encryptSecret } from "@/lib/crypto/secrets";
import { webhookDeliveries, webhooks } from "@/lib/db/schema";
import { SETTING, getSetting } from "@/lib/db/settings";
import { getServices } from "@/lib/env";
import { token, ulid } from "@/lib/ids";
import { buildPayload, deliverWebhook } from "@/lib/webhooks/deliver";
import { validateWebhookUrl } from "@/lib/webhooks/sign";

export type WebhookState = { error?: string; created?: { secret: string; preset: string } };

export async function createWebhookAction(
  _prev: WebhookState,
  formData: FormData,
): Promise<WebhookState> {
  const user = await requireUserForMutation();
  const { db } = await getServices();

  const url = String(formData.get("url") ?? "").trim();
  const validated = validateWebhookUrl(url);
  if (!validated.ok) return { error: validated.error };

  const formId = String(formData.get("formId") ?? "");
  const secret = `whsec_${token(24)}`;
  const sessionSecret = (await getSetting(db, SETTING.sessionSecret)) ?? "";
  const presetRaw = String(formData.get("preset") ?? "generic");
  const preset = presetRaw === "slack" || presetRaw === "discord" ? presetRaw : "generic";

  try {
    await db.insert(webhooks).values({
      id: ulid(),
      formId: formId || null,
      url: validated.url,
      secret: await encryptSecret(secret, sessionSecret),
      preset,
      createdAt: Date.now(),
    });
  } catch {
    return { error: "Could not create the webhook." };
  }

  await audit(db, user.id, "webhook.create", { url: validated.url, preset });
  revalidatePath("/webhooks");
  revalidatePath("/home");

  return { created: { secret, preset } };
}

export async function deleteWebhookAction(formData: FormData): Promise<void> {
  const user = await requireUserForMutation();
  const { db } = await getServices();

  const id = String(formData.get("id") ?? "");
  await db.delete(webhooks).where(eq(webhooks.id, id));

  await audit(db, user.id, "webhook.delete", { webhookId: id });
  revalidatePath("/webhooks");
  revalidatePath("/home");
}

export async function toggleWebhookAction(formData: FormData): Promise<void> {
  await requireUserForMutation();
  const { db } = await getServices();

  const id = String(formData.get("id") ?? "");
  const rows = await db.select().from(webhooks).where(eq(webhooks.id, id)).limit(1);
  if (!rows[0]) return;

  await db.update(webhooks).set({ active: !rows[0].active }).where(eq(webhooks.id, id));
  revalidatePath("/webhooks");
}

/**
 * Send a test payload.
 *
 * Delivered synchronously rather than through the queue: the owner is waiting for the
 * result, and a test that reports "queued" tells them nothing about whether their
 * receiver works.
 */
export async function testWebhookAction(
  _prev: WebhookState,
  formData: FormData,
): Promise<WebhookState> {
  await requireUserForMutation();
  const { db } = await getServices();

  const id = String(formData.get("id") ?? "");
  const rows = await db.select().from(webhooks).where(eq(webhooks.id, id)).limit(1);
  const hook = rows[0];
  if (!hook) return { error: "Webhook not found." };

  const sessionSecret = (await getSetting(db, SETTING.sessionSecret)) ?? "";
  const secret = (await decryptSecret(hook.secret, sessionSecret)) ?? "";
  if (!secret) return { error: "Could not decrypt the signing secret." };

  const payload = buildPayload(
    { id: hook.formId ?? "test", publicId: "test", name: "Test" } as never,
    {
      id: "test_submission",
      createdAt: Date.now(),
      waitlistPosition: null,
    } as never,
    { email: "test@example.com", message: "This is a test delivery from FormFlare." },
  );

  const result = await deliverWebhook(
    hook.url,
    secret,
    payload,
    `test_${ulid()}`,
    Date.now(),
    hook.preset === "slack" || hook.preset === "discord" ? hook.preset : "generic",
  );

  revalidatePath("/webhooks");
  return result.ok
    ? {}
    : {
        error:
          result.error ?? `Delivery failed${result.statusCode ? ` (${result.statusCode})` : ""}.`,
      };
}

export async function clearDeliveryLogAction(formData: FormData): Promise<void> {
  await requireUserForMutation();
  const { db } = await getServices();

  const id = String(formData.get("id") ?? "");
  await db.delete(webhookDeliveries).where(eq(webhookDeliveries.webhookId, id));
  revalidatePath("/webhooks");
}
