import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { requireUser } from "@/lib/auth/guard";
import { forms } from "@/lib/db/schema";
import { getServices } from "@/lib/env";
import { hostedPath } from "@/lib/waitlist/slug";
import { ExternalIcon } from "@/components/icons";
import { PageHeader } from "@/components/page-header";
import { btnGhost, btnSecondary, pillClass } from "@/lib/ui";
import { setFormActiveAction } from "../actions";
import { FormTabs } from "./form-tabs";

export const dynamic = "force-dynamic";

/** Header and tabs shared by every tab of a form. */
export default async function FormLayout({
  params,
  children,
}: {
  params: Promise<{ formId: string }>;
  children: ReactNode;
}) {
  await requireUser();
  const { formId } = await params;
  const { db } = await getServices();
  const rows = await db.select().from(forms).where(eq(forms.id, formId)).limit(1);
  const form = rows[0];
  if (!form) notFound();

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title={
          <span className="flex items-center gap-2.5">
            <Link
              href="/forms"
              className="font-normal text-neutral-400 no-underline hover:text-ink dark:hover:text-mist"
            >
              Forms
            </Link>
            <span className="font-normal text-neutral-300 dark:text-neutral-600">/</span>
            <span className="truncate">{form.name}</span>
            {form.mode === "waitlist" ? <span className={pillClass}>Waitlist</span> : null}
          </span>
        }
        description={
          <span className="flex items-center gap-2">
            <span
              className={`size-2 rounded-full ${form.active ? "bg-emerald-500" : "bg-neutral-300 dark:bg-neutral-600"}`}
              aria-hidden
            />
            {form.active ? "Live — accepting submissions" : "Paused — visitors can't submit"}
          </span>
        }
        actions={
          <>
            {form.active ? (
              <a
                href={hostedPath(form)}
                target="_blank"
                rel="noreferrer"
                className={`${btnGhost} no-underline`}
              >
                View page
                <ExternalIcon />
              </a>
            ) : null}
            <form action={setFormActiveAction}>
              <input type="hidden" name="id" value={form.id} />
              <input type="hidden" name="active" value={String(!form.active)} />
              <button type="submit" className={btnSecondary}>
                {form.active ? "Pause" : "Resume"}
              </button>
            </form>
          </>
        }
      >
        <FormTabs formId={form.id} />
      </PageHeader>
      {children}
    </div>
  );
}
