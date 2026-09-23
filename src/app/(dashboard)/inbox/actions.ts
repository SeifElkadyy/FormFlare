"use server";

import { eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireUserForMutation } from "@/lib/auth/guard";
import { audit } from "@/lib/auth/login";
import { submissions } from "@/lib/db/schema";
import { getServices } from "@/lib/env";
import { deleteSubmission } from "@/lib/submissions/delete";

export async function setStatusAction(formData: FormData): Promise<void> {
  const user = await requireUserForMutation();
  const { db } = await getServices();

  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!["new", "read", "archived", "spam"].includes(status)) return;

  await db
    .update(submissions)
    .set({ status: status as "new" | "read" | "archived" | "spam" })
    .where(eq(submissions.id, id));

  await audit(db, user.id, "submission.status", { submissionId: id, status });
  revalidatePath("/inbox");
  revalidatePath("/forms", "layout");
}

export async function deleteSubmissionAction(formData: FormData): Promise<void> {
  const user = await requireUserForMutation();
  const { db, storage } = await getServices();

  const id = String(formData.get("id") ?? "");
  // Deletes R2 objects too; a cascade only removes rows.
  await deleteSubmission(db, storage, id);

  await audit(db, user.id, "submission.delete", { submissionId: id });
  revalidatePath("/inbox");
  revalidatePath("/forms", "layout");
}

/** Bulk status change from the inbox. */
export async function bulkStatusAction(formData: FormData): Promise<void> {
  const user = await requireUserForMutation();
  const { db } = await getServices();

  const ids = formData.getAll("ids").map(String).filter(Boolean);
  const status = String(formData.get("status") ?? "");
  if (ids.length === 0 || !["new", "read", "archived", "spam"].includes(status)) return;

  await db
    .update(submissions)
    .set({ status: status as "new" | "read" | "archived" | "spam" })
    .where(inArray(submissions.id, ids));

  await audit(db, user.id, "submission.bulk_status", { count: ids.length, status });
  revalidatePath("/inbox");
  revalidatePath("/forms", "layout");
}
