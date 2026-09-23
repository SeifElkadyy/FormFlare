import { count, desc, eq, max } from "drizzle-orm";
import Link from "next/link";
import { requireUser } from "@/lib/auth/guard";
import { dashboardAlerts, loadAlertState } from "@/lib/dashboard/alerts";
import { forms, submissions } from "@/lib/db/schema";
import { getEnv, getServices } from "@/lib/env";
import { mailerStatus } from "@/lib/platform/resolve-mailer";
import { ChevronRightIcon } from "@/components/icons";
import { PageBody, PageHeader } from "@/components/page-header";
import { alertClass, pillClass } from "@/lib/ui";
import { LocalTime } from "../inbox/local-time";
import { CreateFormDialog, CreateFormFields } from "./create-form";

export const dynamic = "force-dynamic";

/** The landing page after sign-in: your forms, and anything that is broken. */
export default async function FormsPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  await requireUser();
  const { db } = await getServices();
  const env = await getEnv();
  const params = await searchParams;

  const [rows, unread, latest, mail] = await Promise.all([
    db.select().from(forms).orderBy(desc(forms.createdAt)),
    db
      .select({ formId: submissions.formId, n: count() })
      .from(submissions)
      .where(eq(submissions.status, "new"))
      .groupBy(submissions.formId),
    db
      .select({ formId: submissions.formId, at: max(submissions.createdAt) })
      .from(submissions)
      .groupBy(submissions.formId),
    mailerStatus(db, env),
  ]);
  const alerts = dashboardAlerts(await loadAlertState(db, mail.available));
  const unreadBy = new Map(unread.map((r) => [r.formId, Number(r.n)]));
  const latestBy = new Map(latest.map((r) => [r.formId, r.at]));

  if (rows.length === 0) {
    return (
      <PageBody narrow className="py-10">
        <h1 className="text-xl font-semibold tracking-tight">Create your first form</h1>
        <p className="mt-1 mb-6 text-sm text-neutral-500">
          You&rsquo;ll get a page to share and code for your own site. It takes a few seconds.
        </p>
        <CreateFormFields />
      </PageBody>
    );
  }

  return (
    <>
      <PageHeader title="Forms" actions={<CreateFormDialog defaultOpen={params.new === "1"} />} />
      <PageBody className="flex flex-col gap-4">
        {alerts.map((alert) => (
          <p
            key={alert.id}
            className={`${alertClass} flex flex-wrap items-center justify-between gap-2`}
          >
            <span>{alert.message}</span>
            <Link href={alert.href} className="font-medium">
              {alert.cta}
            </Link>
          </p>
        ))}

        <ul className="divide-y divide-neutral-100 overflow-hidden rounded-xl bg-white shadow-[var(--shadow-border)] dark:divide-neutral-800 dark:bg-neutral-900">
          {rows.map((form) => {
            const newCount = unreadBy.get(form.id) ?? 0;
            const last = latestBy.get(form.id);
            return (
              <li key={form.id}>
                <Link
                  href={`/forms/${form.id}`}
                  className="flex items-center gap-4 px-4 py-3.5 no-underline hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
                >
                  <span
                    className={`size-2 shrink-0 rounded-full ${form.active ? "bg-emerald-500" : "bg-neutral-300 dark:bg-neutral-600"}`}
                    aria-label={form.active ? "Live" : "Paused"}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-ink dark:text-mist">
                        {form.name}
                      </span>
                      {form.mode === "waitlist" ? (
                        <span className={pillClass}>Waitlist</span>
                      ) : null}
                      {!form.active ? (
                        <span className="text-xs text-neutral-400">Paused</span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block text-xs text-neutral-500">
                      {form.submissionCount === 0 ? (
                        "No submissions yet"
                      ) : (
                        <>
                          {form.submissionCount}{" "}
                          {form.submissionCount === 1 ? "submission" : "submissions"}
                          {last ? (
                            <>
                              {" · last "}
                              <LocalTime timestamp={last} />
                            </>
                          ) : null}
                        </>
                      )}
                    </span>
                  </span>
                  {newCount > 0 ? (
                    <span className="rounded-full bg-ink px-2 py-0.5 text-xs font-medium tabular-nums text-white dark:bg-mist dark:text-ink">
                      {newCount} new
                    </span>
                  ) : null}
                  <span className="text-neutral-400">
                    <ChevronRightIcon />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </PageBody>
    </>
  );
}
