import Link from "next/link";
import { headers } from "next/headers";
import { requireUser } from "@/lib/auth/guard";
import { SETTING, getSetting } from "@/lib/db/settings";
import { forms } from "@/lib/db/schema";
import { getServices } from "@/lib/env";
import { getInstanceUrl } from "@/lib/instance/url";
import { listSubmissions, parseFilters } from "@/lib/submissions/query";
import { confirmPath, signConfirmToken } from "@/lib/waitlist/confirm";
import { PageHeader } from "@/components/page-header";
import { btnGhost, emptyClass } from "@/lib/ui";
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
  const headerList = await headers();
  const [secret, origin] = await Promise.all([
    getSetting(db, SETTING.sessionSecret),
    getInstanceUrl(db, headerList.get("host")),
  ]);

  const params = await searchParams;
  const search = new URLSearchParams(
    Object.entries(params).filter((e): e is [string, string] => e[1] !== undefined),
  );

  const filters = parseFilters(search);
  const page = await listSubmissions(db, filters, params.cursor ?? null);
  const formRows = await db.select({ id: forms.id, name: forms.name }).from(forms);

  const nextParams = new URLSearchParams(search);
  if (page.nextCursor) nextParams.set("cursor", page.nextCursor);

  const exportParams = new URLSearchParams(search);
  exportParams.delete("cursor");

  const hasFilters = Boolean(
    filters.formId || filters.status || filters.search || filters.from || filters.to,
  );
  const showControls = page.items.length > 0 || hasFilters;

  const items = await Promise.all(
    page.items.map(async (row) => {
      let confirmUrl: string | null = null;
      if (row.optedInAt === null && secret && origin) {
        const token = await signConfirmToken(row.id, secret);
        confirmUrl = `${origin}${confirmPath(row.id, token.exp, token.sig)}`;
      }
      return { row, confirmUrl };
    }),
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Inbox"
        description="Incoming submissions from your forms."
        count={page.items.length}
        actions={
          showControls ? (
            <>
              <a href={`/api/export?format=csv&${exportParams}`} className={`${btnGhost} no-underline`}>
                Export CSV
              </a>
              <a href={`/api/export?format=json&${exportParams}`} className={`${btnGhost} no-underline`}>
                JSON
              </a>
            </>
          ) : null
        }
      />

      {showControls ? <InboxFilters forms={formRows} current={params} /> : null}

      {page.items.length === 0 ? (
        <p className={emptyClass}>
          {hasFilters ? (
            "No submissions match these filters."
          ) : formRows.length === 0 ? (
            <>
              No submissions yet — and no forms to receive them.{" "}
              <Link href="/forms?new=1" className="font-medium text-blue-700 underline">
                Create your first form
              </Link>{" "}
              to get an endpoint.
            </>
          ) : (
            "No submissions yet. Open a form and copy the HTML, fetch, or React snippet into your site."
          )}
        </p>
      ) : (
        <>
          <ul className="min-h-0 flex-1 overflow-y-auto">
            {items.map(({ row, confirmUrl }) => (
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
                  confirmUrl,
                }}
              />
            ))}
          </ul>

          {page.nextCursor ? (
            <nav aria-label="Pagination" className="border-t border-neutral-100 px-6 py-3 dark:border-neutral-800">
              <Link href={`/inbox?${nextParams}`} className={`${btnGhost} no-underline`}>
                Load older submissions
              </Link>
            </nav>
          ) : null}
        </>
      )}
    </div>
  );
}
