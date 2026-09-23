import Link from "next/link";
import { requireUser } from "@/lib/auth/guard";
import { forms } from "@/lib/db/schema";
import { getServices } from "@/lib/env";
import { PageBody, PageHeader } from "@/components/page-header";
import { btnPrimary } from "@/lib/ui";
import { SubmissionList } from "./submission-list";

export const dynamic = "force-dynamic";

/** Every form's submissions in one list. A single form's live on its Submissions tab. */
export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireUser();
  const { db } = await getServices();
  const params = await searchParams;
  const formRows = await db.select({ id: forms.id, name: forms.name }).from(forms);

  return (
    <>
      <PageHeader title="Inbox" description="Submissions from all your forms, newest first." />
      <PageBody>
        <SubmissionList
          db={db}
          params={params}
          basePath="/inbox"
          forms={formRows.length > 1 ? formRows : undefined}
          empty={
            formRows.length === 0 ? (
              <>
                <p>Nothing here yet. Create a form to get an address visitors can send to.</p>
                <Link href="/forms?new=1" className={`${btnPrimary} no-underline`}>
                  Create a form
                </Link>
              </>
            ) : (
              <p>
                No submissions yet. They show up here as soon as someone sends one of your forms.
              </p>
            )
          }
        />
      </PageBody>
    </>
  );
}
