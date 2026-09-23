import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/guard";
import { forms } from "@/lib/db/schema";
import { getEnv, getServices } from "@/lib/env";
import {
  DAY_MS,
  formActivity,
  formSources,
  waitlistSummary,
  type DailyPoint,
  type SourceRow,
} from "@/lib/insights/form";
import { PageHeader } from "@/components/page-header";
import { btnGhost, cardClass, hintClass, sectionTitle } from "@/lib/ui";

export const dynamic = "force-dynamic";

const WINDOW_DAYS = 30;

export default async function FormInsightsPage({
  params,
}: {
  params: Promise<{ formId: string }>;
}) {
  await requireUser();
  const { formId } = await params;
  const { db } = await getServices();
  const env = await getEnv();

  const rows = await db.select().from(forms).where(eq(forms.id, formId)).limit(1);
  const form = rows[0];
  if (!form) notFound();

  const waitlist = form.mode === "waitlist";
  const [activity, sources, board] = await Promise.all([
    formActivity(env.DB, form.id, WINDOW_DAYS),
    formSources(env.DB, form.id, WINDOW_DAYS),
    waitlist ? waitlistSummary(env.DB, form.id, form.referralBoost) : null,
  ]);

  const conversion =
    activity.conversion === null ? "—" : `${Math.round(activity.conversion * 1000) / 10}%`;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title={`${form.name} · Insights`}
        description={`Last ${WINDOW_DAYS} days, UTC. Spam is left out.`}
        actions={
          <Link href={`/forms/${form.id}`} className={`${btnGhost} no-underline`}>
            Edit form
          </Link>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="Submissions" value={activity.totals.submissions} />
            <Stat
              label="Page views"
              value={activity.totals.views}
              hint="Hosted page and widget only"
            />
            <Stat label="Conversion" value={conversion} hint="Submissions ÷ views" />
            {board ? (
              <>
                <Stat label="On the list" value={board.confirmed} />
                <Stat
                  label="Unconfirmed"
                  value={board.pending}
                  hint={form.doubleOptIn ? "Waiting on the email link" : undefined}
                />
                <Stat
                  label="Via referral"
                  value={board.referred}
                  hint={
                    board.confirmed > 0
                      ? `${Math.round((board.referred / board.confirmed) * 100)}% of the list`
                      : undefined
                  }
                />
              </>
            ) : null}
          </div>

          <section className={cardClass}>
            <h2 className={sectionTitle}>Submissions per day</h2>
            {activity.totals.submissions === 0 ? (
              <p className={`${hintClass} mt-3`}>
                Nothing in the last {WINDOW_DAYS} days. Share the form from{" "}
                <Link href={`/forms/${form.id}`}>its page</Link> and this fills in.
              </p>
            ) : (
              <DailyBars days={activity.days} />
            )}
          </section>

          {activity.totals.submissions > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <SourceList title="Where they came from" rows={sources.referrers} />
              <SourceList title="Countries" rows={sources.countries} />
            </div>
          ) : null}

          {board ? (
            <section className={cardClass}>
              <h2 className={sectionTitle}>Leaderboard</h2>
              <p className={`${hintClass} mt-1`}>
                {form.referralBoost > 0
                  ? `Each confirmed referral moves a signup up ${form.referralBoost} ${form.referralBoost === 1 ? "place" : "places"}.`
                  : "Signup order. Set a referral boost on the form to reward sharing."}
              </p>
              {board.top.length === 0 ? (
                <p className={`${hintClass} mt-3`}>No confirmed signups yet.</p>
              ) : (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-slate">
                        <th className="py-2 pe-3 font-medium">Rank</th>
                        <th className="py-2 pe-3 font-medium">Email</th>
                        <th className="py-2 pe-3 text-right font-medium">Signed up as</th>
                        <th className="py-2 text-right font-medium">Referrals</th>
                      </tr>
                    </thead>
                    <tbody>
                      {board.top.map((row) => (
                        <tr
                          key={row.id}
                          className="border-t border-neutral-100 dark:border-neutral-800"
                        >
                          <td className="py-2 pe-3 tabular-nums">#{row.rank}</td>
                          <td className="max-w-[16rem] truncate py-2 pe-3">{row.email ?? "—"}</td>
                          <td className="py-2 pe-3 text-right tabular-nums text-slate">
                            #{row.position}
                          </td>
                          <td className="py-2 text-right tabular-nums">{row.referrals}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {board.confirmed > board.top.length ? (
                    <p className={`${hintClass} mt-2`}>
                      Top {board.top.length} of {board.confirmed}. Export the full list from Inbox.
                    </p>
                  ) : null}
                </div>
              )}
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className={cardClass}>
      <p className={sectionTitle}>{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
      {hint ? <p className={`${hintClass} mt-1`}>{hint}</p> : null}
    </div>
  );
}

const dateFmt = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" });
const dayLabel = (day: number) => dateFmt.format(new Date(day * DAY_MS));

/**
 * One series, so no legend: the card title names it. Each bar's hover target is the
 * full column, not just the mark. The chart is hidden from assistive tech and keyboard
 * focus; the table below carries every value instead (30 tab stops would be worse, and
 * Flare is under 3:1 on white, so the numbers must not depend on the bars anyway).
 */
function DailyBars({ days }: { days: DailyPoint[] }) {
  const max = Math.max(1, ...days.map((d) => d.submissions));
  return (
    <>
      <div className="relative mt-4">
        <span className={`${hintClass} absolute -top-1 left-0`}>{max}</span>
        <div
          className="flex h-40 items-end gap-[2px] border-b border-neutral-200 pt-4 dark:border-neutral-700"
          aria-hidden
        >
          {days.map((d) => (
            <div key={d.day} className="group relative flex h-full flex-1 items-end">
              <div
                className="w-full rounded-t-[4px] bg-flare group-hover:opacity-80"
                style={{ height: d.submissions ? `${(d.submissions / max) * 100}%` : 0 }}
              />
              <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-xs text-mist group-hover:block dark:bg-mist dark:text-ink">
                <strong className="tabular-nums">{d.submissions}</strong> · {dayLabel(d.day)}
                {d.views ? ` · ${d.views} views` : ""}
              </span>
            </div>
          ))}
        </div>
        <div className={`${hintClass} mt-1 flex justify-between`}>
          <span>{dayLabel(days[0].day)}</span>
          <span>{dayLabel(days[days.length - 1].day)}</span>
        </div>
      </div>
      <details className="mt-3">
        <summary className={`${hintClass} cursor-pointer`}>Show as table</summary>
        <table className="mt-2 w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate">
              <th className="py-1 font-medium">Day</th>
              <th className="py-1 text-right font-medium">Submissions</th>
              <th className="py-1 text-right font-medium">Views</th>
            </tr>
          </thead>
          <tbody>
            {[...days].reverse().map((d) => (
              <tr key={d.day} className="border-t border-neutral-100 dark:border-neutral-800">
                <td className="py-1">{dayLabel(d.day)}</td>
                <td className="py-1 text-right tabular-nums">{d.submissions}</td>
                <td className="py-1 text-right tabular-nums">{d.views}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </>
  );
}

function SourceList({ title, rows }: { title: string; rows: SourceRow[] }) {
  const total = rows.reduce((sum, r) => sum + r.count, 0);
  return (
    <section className={cardClass}>
      <h2 className={sectionTitle}>{title}</h2>
      {rows.length === 0 ? (
        <p className={`${hintClass} mt-3`}>Not recorded for these submissions.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {rows.map((row) => (
            <li key={row.label} className="flex items-center justify-between gap-3 text-sm">
              <span className="truncate">{row.label}</span>
              <span className="tabular-nums text-slate">
                {row.count} · {Math.round((row.count / total) * 100)}%
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
