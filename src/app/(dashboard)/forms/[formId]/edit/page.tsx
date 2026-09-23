import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/guard";
import { forms } from "@/lib/db/schema";
import { getServices } from "@/lib/env";
import { PageBody } from "@/components/page-header";
import { EditForm } from "./edit-form";

export const dynamic = "force-dynamic";

export default async function FormEditPage({ params }: { params: Promise<{ formId: string }> }) {
  await requireUser();
  const { formId } = await params;
  const { db, storage } = await getServices();
  const rows = await db.select().from(forms).where(eq(forms.id, formId)).limit(1);
  const form = rows[0];
  if (!form) notFound();

  return (
    <PageBody>
      <EditForm
        form={{
          id: form.id,
          name: form.name,
          mode: form.mode,
          fieldsJson: form.fieldsJson,
          hostedDescription: form.hostedDescription ?? "",
        }}
        uploadsAvailable={storage.available}
      />
    </PageBody>
  );
}
