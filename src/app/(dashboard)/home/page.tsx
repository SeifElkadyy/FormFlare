import { and, count, desc, eq, gt, isNull } from "drizzle-orm";
import { requireUser } from "@/lib/auth/guard";
import { emailDeliveries, forms, submissions, webhookDeliveries, webhooks } from "@/lib/db/schema";
import { getEnv, getServices } from "@/lib/env";
import { failureCutoff, homeChecklist, homeInsights } from "@/lib/dashboard/home";
import { mailerStatus } from "@/lib/platform/resolve-mailer";
import { parseFields } from "@/lib/submissions/fields";
import { CreateFormDialog } from "../forms/create-form";
import { HomeView } from "./home-view";

export const dynamic = "force-dynamic";

export default async function DashboardHomePage() {
  const user = await requireUser();
  const { db } = await getServices();
  const env = await getEnv();

  const since = failureCutoff();
  const [formRows, recent, unread, pending, webhookRows, mail, failedHooks, failedMail] =
    await Promise.all([
      db.select().from(forms).orderBy(desc(forms.updatedAt)),
      db
        .select({
          id: submissions.id,
          email: submissions.email,
          status: submissions.status,
          createdAt: submissions.createdAt,
          formName: forms.name,
        })
        .from(submissions)
        .innerJoin(forms, eq(forms.id, submissions.formId))
        .orderBy(desc(submissions.id))
        .limit(5),
      db.select({ n: count() }).from(submissions).where(eq(submissions.status, "new")),
      db.select({ n: count() }).from(submissions).where(isNull(submissions.optedInAt)),
      db.select({ n: count() }).from(webhooks),
      mailerStatus(db, env),
      db
        .select({ n: count() })
        .from(webhookDeliveries)
        // A webhook the owner switched off is not news.
        .innerJoin(
          webhooks,
          and(eq(webhooks.id, webhookDeliveries.webhookId), eq(webhooks.active, true)),
        )
        .where(and(eq(webhookDeliveries.status, "failed"), gt(webhookDeliveries.updatedAt, since))),
      db
        .select({ n: count() })
        .from(emailDeliveries)
        .where(and(eq(emailDeliveries.status, "failed"), gt(emailDeliveries.updatedAt, since))),
    ]);

  const submissionCount = formRows.reduce((sum, form) => sum + form.submissionCount, 0);
  const unreadCount = Number(unread[0]?.n ?? 0);
  const pendingConfirmCount = Number(pending[0]?.n ?? 0);
  const webhookCount = Number(webhookRows[0]?.n ?? 0);
  const latestForm = formRows[0] ? { id: formRows[0].id, name: formRows[0].name } : null;
  const unconfigured = formRows.find((form) => parseFields(form.fieldsJson).length === 0);
  const doubleOptIn = formRows.find((form) => form.doubleOptIn);

  const snapshot = {
    formCount: formRows.length,
    submissionCount,
    unreadCount,
    pendingConfirmCount,
    webhookCount,
    mailerAvailable: mail.available,
    latestForm,
    unconfiguredForm: unconfigured ? { id: unconfigured.id, name: unconfigured.name } : null,
    doubleOptInForm: doubleOptIn ? { id: doubleOptIn.id, name: doubleOptIn.name } : null,
    failedWebhookCount: Number(failedHooks[0]?.n ?? 0),
    failedEmailCount: Number(failedMail[0]?.n ?? 0),
  };

  const waitlistForms = formRows.filter((form) => form.mode === "waitlist").length;
  const live = formRows.filter((form) => form.active).length;

  const fourthStat =
    waitlistForms > 0 || pendingConfirmCount > 0
      ? {
          label: "Unconfirmed",
          value: String(pendingConfirmCount),
          href: "/inbox",
          hint: "waiting on email",
        }
      : {
          label: "Webhooks",
          value: String(webhookCount),
          href: "/webhooks",
          hint: webhookCount === 1 ? "endpoint" : "endpoints",
        };

  return (
    <HomeView
      email={user.email}
      insights={homeInsights(snapshot)}
      checklist={homeChecklist(snapshot)}
      stats={[
        {
          label: "Forms",
          value: String(formRows.length),
          href: "/forms",
          hint: live === 1 ? "1 live" : `${live} live`,
        },
        {
          label: "Submissions",
          value: String(submissionCount),
          href: "/inbox",
          hint: "all time",
        },
        {
          label: "New",
          value: String(unreadCount),
          href: "/inbox?status=new",
          hint: "unread",
        },
        fourthStat,
      ]}
      quick={[
        {
          href: unreadCount > 0 ? "/inbox?status=new" : "/inbox",
          title: "Inbox",
          hint: unreadCount > 0 ? `${unreadCount} new` : "Submissions land here",
          icon: "inbox",
        },
        latestForm
          ? {
              href: `/forms/${latestForm.id}`,
              title: latestForm.name,
              hint: "Fields and preview",
              icon: "forms",
            }
          : {
              href: "/forms",
              title: "Forms",
              hint: "Endpoints you own",
              icon: "forms",
            },
        mail.available
          ? {
              href: "/webhooks",
              title: "Webhooks",
              hint: webhookCount > 0 ? `${webhookCount} connected` : "Slack, Discord, https",
              icon: "webhooks",
            }
          : {
              href: "/settings#email",
              title: "Email",
              hint: "Alerts and confirmations",
              icon: "settings",
            },
        {
          href: "/api-keys",
          title: "API keys",
          hint: "Read submissions, not the POST",
          icon: "keys",
        },
      ]}
      forms={formRows.slice(0, 4).map((form) => ({
        id: form.id,
        name: form.name,
        active: form.active,
        mode: form.mode,
        submissionCount: form.submissionCount,
        publicId: form.publicId,
      }))}
      submissions={recent}
      newForm={<CreateFormDialog />}
    />
  );
}
