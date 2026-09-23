import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/guard";
import { forms } from "@/lib/db/schema";
import { getEnv, getServices } from "@/lib/env";
import { formActivity, waitlistSummary, type WaitlistSummary } from "@/lib/insights/form";
import { DailyBars } from "@/components/daily-bars";
import { PageBody } from "@/components/page-header";
import { btnPrimary, cardClass, hintClass, segmentItem, segmentTrack } from "@/lib/ui";
import { SubmissionList } from "../../inbox/submission-list";

export const dynamic = "force-dynamic";

const WINDOW_DAYS = 30;

export default async function FormSubmissionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ formId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireUser();
  const { formId } = await params;
  const query = await searchParams;
  const { db } = await getServices();
  const env = await getEnv();

  const rows = await db.select().from(forms).where(eq(forms.id, formId)).limit(1);
  const form = rows[0];
  if (!form) notFound();

  const base = `/forms/${form.id}`;
  const waitlist = form.mode === "waitlist";
  const showLeaderboard = waitlist && query.view === "leaderboard";

  if (form.submissionCount === 0) {
    return (
      <PageBody>
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <p className="text-base font-medium">No submissions yet</p>
          <p className={`${hintClass} max-w-sm text-sm`}>
            Put the form on your site, or share its page. Every submission shows up here.
          </p>
          <Link href={`${base}/share`} className={`${btnPrimary} mt-2 no-underline`}>
            Share this form
          </Link>
        </div>
      </PageBody>
    );
  }

  const [activity, board] = await Promise.all([
    formActivity(env.DB, form.id, WINDOW_DAYS),
    waitlist ? waitlistSummary(env.DB, form.id, form.referralBoost) : null,
  ]);
  const conversion =
    activity.conversion === null ? "—" : `${Math.round(activity.conversion * 1000) / 10}%`;

  return (
    <PageBody className="flex flex-col gap-6">
      <section className={cardClass}>
        <div className="flex flex-wrap gap-x-10 gap-y-4">
          <Stat label="Submissions" value={activity.totals.submissions} />
          <Stat label="Page views" value={activity.totals.views} />
          <Stat label="Conversion" value={conversion} />
          {board ? <Stat label="On the list" value={board.confirmed} /> : null}
          {board && board.pending > 0 ? <Stat label="Unconfirmed" value={board.pending} /> : null}
          {board && board.referred > 0 ? (
            <Stat label="Via referral" value={board.referred} />
          ) : null}
        </div>
        <DailyBars days={activity.days} />
        <p className={`${hintClass} mt-2`}>
          Last {WINDOW_DAYS} days. Views count the hosted page and widget only; forms on your own
          site aren&rsquo;t tracked.
        </p>
      </section>

      {waitlist ? (
        <nav aria-label="View" className={`${segmentTrack} self-start`}>
          <Link href={base} className={segmentItem(!showLeaderboard)}>
            Latest
          </Link>
          <Link href={`${base}?view=leaderboard`} className={segmentItem(showLeaderboard)}>
            Leaderboard
          </Link>
        </nav>
      ) : null}

      {showLeaderboard && board ? (
        <Leaderboard board={board} boost={form.referralBoost} settingsHref={`${base}/settings`} />
      ) : (
        <SubmissionList
          db={db}
          params={query}
          basePath={base}
          formId={form.id}
          empty={<p>No submissions yet.</p>}
        />
      )}
    </PageBody>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <p className={hintClass}>{label}</p>
      <p className="text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
    </div>
  );
}

function Leaderboard({
  board,
  boost,
  settingsHref,
}: {
  board: WaitlistSummary;
  boost: number;
  settingsHref: string;
}) {
  if (board.top.length === 0) {
    return <p className={hintClass}>No confirmed signups yet.</p>;
  }
  return (
    <section>
      <p className={hintClass}>
        {boost > 0 ? (
          `Each confirmed referral moves someone up ${boost} ${boost === 1 ? "place" : "places"}.`
        ) : (
          <>
            Signup order. <Link href={settingsHref}>Reward referrals</Link> to let people move up by
            sharing.
          </>
        )}
      </p>
      <div className="mt-3 overflow-x-auto rounded-xl shadow-[var(--shadow-border)]">
        <table className="w-full bg-white text-sm dark:bg-neutral-900">
          <thead>
            <tr className="text-left text-xs text-neutral-500">
              <th className="px-4 py-2.5 font-medium">Place</th>
              <th className="px-4 py-2.5 font-medium">Email</th>
              <th className="px-4 py-2.5 text-right font-medium">Joined as</th>
              <th className="px-4 py-2.5 text-right font-medium">Referrals</th>
            </tr>
          </thead>
          <tbody>
            {board.top.map((row) => (
              <tr key={row.id} className="border-t border-neutral-100 dark:border-neutral-800">
                <td className="px-4 py-2.5 tabular-nums">#{row.rank}</td>
                <td className="max-w-[16rem] truncate px-4 py-2.5">{row.email ?? "—"}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-neutral-500">
                  #{row.position}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">{row.referrals}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {board.confirmed > board.top.length ? (
        <p className={`${hintClass} mt-2`}>
          Top {board.top.length} of {board.confirmed}. Export CSV from Latest for everyone.
        </p>
      ) : null}
    </section>
  );
}
