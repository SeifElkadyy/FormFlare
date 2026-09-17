import { desc } from "drizzle-orm";
import Link from "next/link";
import { requireUser } from "@/lib/auth/guard";
import { forms } from "@/lib/db/schema";
import { getServices } from "@/lib/env";
import { CreateFormForm } from "./create-form";

export const dynamic = "force-dynamic";

export default async function FormsPage() {
  await requireUser();
  const { db } = await getServices();

  const rows = await db.select().from(forms).orderBy(desc(forms.createdAt));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Forms</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Each form gets an endpoint you can point any HTML form at.
        </p>
      </div>

      <CreateFormForm />

      {rows.length === 0 ? (
        <p className="rounded-lg border border-black/[.08] p-6 text-sm text-zinc-600 dark:border-white/[.145] dark:text-zinc-400">
          No forms yet. Name one above and press <strong>Create form</strong> — you will get an
          endpoint and a snippet to paste into your site.
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map((form) => (
            <li
              key={form.id}
              className="rounded-lg border border-black/[.08] p-4 dark:border-white/[.145]"
            >
              <div className="flex items-baseline justify-between gap-4">
                <Link href={`/forms/${form.id}`} className="font-medium underline">
                  {form.name}
                </Link>
                <span className="text-xs text-zinc-600 dark:text-zinc-400">
                  {form.mode === "waitlist" ? "Waitlist" : "Standard"}
                  {!form.active && " · inactive"}
                </span>
              </div>

              <p className="mt-2 font-mono text-xs break-all text-zinc-600 dark:text-zinc-400">
                /f/{form.publicId}
              </p>

              <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                {form.submissionCount} submission{form.submissionCount === 1 ? "" : "s"}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
