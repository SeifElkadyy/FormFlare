import { and, count, desc, eq, gt } from "drizzle-orm";
import type { Database } from "../db/client";
import { emailDeliveries, forms, webhookDeliveries, webhooks } from "../db/schema";

/**
 * Things that are silently broken, shown above the forms list. Only problems: the old
 * home page's onboarding tips now live in empty states, where they are in context.
 */
export interface DashboardAlert {
  id: string;
  message: string;
  href: string;
  cta: string;
}

export interface AlertState {
  failedWebhookCount: number;
  /** Form whose settings show the failing webhook. Null for an all-forms webhook. */
  failedWebhookFormId: string | null;
  failedEmailCount: number;
  /** A double opt-in waitlist with no way to send its confirmation emails. */
  stuckOptInForm: { id: string; name: string } | null;
}

/** Failures older than this are history, not something to act on. */
export const FAILURE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const plural = (n: number, one: string, many: string) => (n === 1 ? `1 ${one}` : `${n} ${many}`);

export function dashboardAlerts(state: AlertState): DashboardAlert[] {
  const alerts: DashboardAlert[] = [];
  if (state.stuckOptInForm) {
    alerts.push({
      id: "opt-in-mailer",
      message: `${state.stuckOptInForm.name} asks signups to confirm by email, but email is off. They can't get a place until it's on.`,
      href: "/settings#email",
      cta: "Turn on email",
    });
  }
  if (state.failedWebhookCount > 0) {
    alerts.push({
      id: "webhook-failures",
      message: `${plural(state.failedWebhookCount, "webhook delivery", "webhook deliveries")} failed this week.`,
      // All-forms webhooks show on every form's Settings, so the forms list is fine.
      href: state.failedWebhookFormId
        ? `/forms/${state.failedWebhookFormId}/settings#webhooks`
        : "/forms",
      cta: "See webhook",
    });
  }
  if (state.failedEmailCount > 0) {
    alerts.push({
      id: "email-failures",
      message: `${plural(state.failedEmailCount, "email", "emails")} failed to send this week. Usually an unverified sender or an expired API key.`,
      href: "/settings#email",
      cta: "Check email",
    });
  }
  return alerts;
}

export async function loadAlertState(
  db: Database,
  mailerAvailable: boolean,
  now = Date.now(),
): Promise<AlertState> {
  const since = now - FAILURE_WINDOW_MS;
  // A webhook the owner switched off is not news.
  const failedHook = and(
    eq(webhookDeliveries.status, "failed"),
    gt(webhookDeliveries.updatedAt, since),
  );
  const activeHook = and(eq(webhooks.id, webhookDeliveries.webhookId), eq(webhooks.active, true));
  const [hooks, latestHook, mail, optIn] = await Promise.all([
    db
      .select({ n: count() })
      .from(webhookDeliveries)
      .innerJoin(webhooks, activeHook)
      .where(failedHook),
    db
      .select({ formId: webhooks.formId })
      .from(webhookDeliveries)
      .innerJoin(webhooks, activeHook)
      .where(failedHook)
      .orderBy(desc(webhookDeliveries.updatedAt))
      .limit(1),
    db
      .select({ n: count() })
      .from(emailDeliveries)
      .where(and(eq(emailDeliveries.status, "failed"), gt(emailDeliveries.updatedAt, since))),
    mailerAvailable
      ? Promise.resolve([])
      : db
          .select({ id: forms.id, name: forms.name })
          .from(forms)
          .where(and(eq(forms.doubleOptIn, true), eq(forms.active, true)))
          .limit(1),
  ]);
  return {
    failedWebhookCount: Number(hooks[0]?.n ?? 0),
    failedWebhookFormId: latestHook[0]?.formId ?? null,
    failedEmailCount: Number(mail[0]?.n ?? 0),
    stuckOptInForm: optIn[0] ?? null,
  };
}
