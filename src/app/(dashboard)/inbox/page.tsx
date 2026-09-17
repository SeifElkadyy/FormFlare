import Link from "next/link";
import { requireUser } from "@/lib/auth/guard";
import { forms } from "@/lib/db/schema";
import { getServices } from "@/lib/env";
import { listSubmissions, parseFilters } from "@/lib/submissions/query";
import { InboxFilters } from "./filters";
import { SubmissionCard } from "./submission-card";

export const dynamic = "force-dynamic";

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireUser();
  const { db } = await getServices();

  const params = await searchParams;
  const search = new URLSearchParams(
    Object.entries(params).filter((e): e is [string, string] => e[1] !== undefined),
  );

  const filters = parseFilters(search);
  const page = await listSubmissions(db, filters, params.cursor ?? null);
  const formRows = await db.select({ id: forms.id, name: forms.name }).from(forms);

  // Carry the filters into the "next page" link so paging does not reset them.
  const nextParams = new URLSearchParams(search);
  if (page.nextCursor) nextParams.set("cursor", page.nextCursor);

  const exportParams = new URLSearchParams(search);
  exportParams.delete("cursor");

  const hasFilters = Boolean(
    filters.formId || filters.status || filters.search || filters.from || filters.to,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Inbox</h1>

        <div className="flex items-center gap-3 text-sm">
          <a
            href={`/api/export?format=csv&${exportParams}`}
            className="rounded-md border border-black/[.12] px-3 py-1.5 hover:bg-black/[.04] focus-visible:outline-2 focus-visible:outline-offset-2 dark:border-white/[.18] dark:hover:bg-white/[.06]"
          >
            Export CSV
          </a>
          <a
            href={`/api/export?format=json&${exportParams}`}
            className="rounded-md border border-black/[.12] px-3 py-1.5 hover:bg-black/[.04] focus-visible:outline-2 focus-visible:outline-offset-2 dark:border-white/[.18] dark:hover:bg-white/[.06]"
          >
            JSON
          </a>
        </div>
      </div>

      <InboxFilters forms={formRows} current={params} />

      {page.items.length === 0 ? (
        <p className="rounded-lg border border-black/[.08] p-6 text-sm text-zinc-600 dark:border-white/[.145] dark:text-zinc-400">
          {hasFilters
            ? "No submissions match these filters."
            : "No submissions yet. Create a form to get an endpoint, then paste the snippet into your site."}
        </p>
      ) : (
        <>
          <ul className="space-y-3">
            {page.items.map((row) => (
              <SubmissionCard
                key={row.id}
                submission={{
                  id: row.id,
                  formName: row.formName,
                  email: row.email,
                  dataJson: row.dataJson,
                  status: row.status,
                  waitlistPosition: row.waitlistPosition,
                  country: row.country,
                  createdAt: row.createdAt,
                }}
              />
            ))}
          </ul>

          {page.nextCursor && (
            <nav aria-label="Pagination">
              <Link
                href={`/inbox?${nextParams}`}
                className="inline-block rounded-md border border-black/[.12] px-4 py-2 text-sm hover:bg-black/[.04] focus-visible:outline-2 focus-visible:outline-offset-2 dark:border-white/[.18] dark:hover:bg-white/[.06]"
              >
                Load older submissions
              </Link>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
