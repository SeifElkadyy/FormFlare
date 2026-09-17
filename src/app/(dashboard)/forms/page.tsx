import { desc } from "drizzle-orm";
import Link from "next/link";
import { requireUser } from "@/lib/auth/guard";
import { forms } from "@/lib/db/schema";
import { getServices } from "@/lib/env";
import { PageHeader } from "@/components/page-header";
import { ChevronRightIcon } from "@/components/icons";
import { emptyClass, hintClass } from "@/lib/ui";
import { CreateFormDialog } from "./create-form";

export const dynamic = "force-dynamic";

export default async function FormsPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  await requireUser();
  const { db } = await getServices();
  const params = await searchParams;

  const rows = await db.select().from(forms).orderBy(desc(forms.createdAt));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Forms"
        description="Each form gets an endpoint you can point any HTML form at."
        count={rows.length}
        actions={<CreateFormDialog defaultOpen={params.new === "1"} />}
      />

      {rows.length === 0 ? (
        <p className={emptyClass}>
          No forms yet. Press <strong>New form</strong> to get an endpoint and a snippet to paste
          into your site.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 p-6 sm:grid-cols-2">
          {rows.map((form) => {
            const initial = (form.name.trim()[0] ?? "F").toUpperCase();
            return (
              <li key={form.id}>
                <Link
                  href={`/forms/${form.id}`}
                  className="row-hover surface flex h-full flex-col rounded-2xl p-4 no-underline"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-sm font-semibold text-blue-700 dark:bg-blue-950 dark:text-blue-200"
                      aria-hidden
                    >
                      {initial}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-neutral-950 dark:text-white">
                        {form.name}
                      </p>
                      <p className={`mt-0.5 truncate font-mono ${hintClass}`}>/f/{form.publicId}</p>
                    </div>
                    <span className="translate-x-px pt-1 text-neutral-400">
                      <ChevronRightIcon />
                    </span>
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-3 text-xs text-neutral-500">
                    <span className="flex items-center gap-2">
                      <span
                        className={`size-1.5 rounded-full ${form.active ? "bg-emerald-500" : "bg-neutral-300 dark:bg-neutral-600"}`}
                        aria-hidden
                      />
                      {form.active ? "Live" : "Paused"}
                      <span aria-hidden>·</span>
                      {form.mode === "waitlist" ? "Waitlist" : "Standard"}
                    </span>
                    <span className="tabular-nums">
                      {form.submissionCount}{" "}
                      {form.submissionCount === 1 ? "submission" : "submissions"}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
