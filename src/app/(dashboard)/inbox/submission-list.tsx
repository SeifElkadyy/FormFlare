import Link from "next/link";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import type { Database } from "@/lib/db/client";
import { SETTING, getSetting } from "@/lib/db/settings";
import { getInstanceUrl } from "@/lib/instance/url";
import { listSubmissions, parseFilters } from "@/lib/submissions/query";
import { confirmPath, signConfirmToken } from "@/lib/waitlist/confirm";
import { btnGhost, emptyClass } from "@/lib/ui";
import { InboxFilters } from "./filters";
import { SubmissionCard } from "./submission-card";

/**
 * Filters, rows and paging, shared by Inbox (every form) and a form's Submissions tab
 * (`formId` fixed, no form picker). `params` is the page's own query string.
 */
export async function SubmissionList({
  db,
  params,
  basePath,
  formId,
  forms,
  empty,
}: {
  db: Database;
  params: Record<string, string | undefined>;
  basePath: string;
  /** Pin to one form. */
  formId?: string;
  /** Form picker options; omit to hide the picker. */
  forms?: { id: string; name: string }[];
  /** Shown when nothing has arrived yet (not when filters hide everything). */
  empty: ReactNode;
}) {
  const search = new URLSearchParams(
    Object.entries(params).filter((e): e is [string, string] => e[1] !== undefined),
  );
  if (formId) search.set("form", formId);

  const filters = parseFilters(search);
  const page = await listSubmissions(db, filters, params.cursor ?? null);
  const hasFilters = Boolean(filters.status || filters.search || (!formId && filters.formId));

  const headerList = await headers();
  const [secret, origin] = await Promise.all([
    getSetting(db, SETTING.sessionSecret),
    getInstanceUrl(db, headerList.get("host")),
  ]);

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

  if (page.items.length === 0 && !hasFilters) {
    return <div className={emptyClass}>{empty}</div>;
  }

  const exportParams = new URLSearchParams(search);
  exportParams.delete("cursor");
  const nextParams = new URLSearchParams(params as Record<string, string>);
  if (page.nextCursor) nextParams.set("cursor", page.nextCursor);

  return (
    <div className="flex flex-col">
      <InboxFilters
        basePath={basePath}
        current={params}
        forms={forms}
        exportHref={`/api/export?format=csv&${exportParams}`}
      />

      {page.items.length === 0 ? (
        <p className={emptyClass}>Nothing matches. Try another filter.</p>
      ) : (
        <ul className="mt-3 overflow-hidden rounded-xl shadow-[var(--shadow-border)]">
          {items.map(({ row, confirmUrl }) => (
            <SubmissionCard
              key={row.id}
              showForm={!formId}
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
      )}

      {page.nextCursor ? (
        <Link
          href={`${basePath}?${nextParams}`}
          className={`${btnGhost} mt-3 self-center no-underline`}
        >
          Load older
        </Link>
      ) : null}
    </div>
  );
}
