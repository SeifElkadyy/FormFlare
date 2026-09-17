import { eq, sql } from "drizzle-orm";
import type { Database } from "../db/client";
import { submissions } from "../db/schema";
import { publicId } from "../ids";

export async function findReferrer(
  d1: D1Database,
  formId: string,
  code: string,
): Promise<{ id: string } | null> {
  const trimmed = code.trim();
  if (!trimmed) return null;
  const row = await d1
    .prepare(
      `SELECT id FROM submissions
        WHERE form_id = ?1 AND referral_code = ?2
        LIMIT 1`,
    )
    .bind(formId, trimmed)
    .first<{ id: string }>();
  return row ?? null;
}

/** Credit one confirmed referral to the referrer. Safe to call more than once: +1 each call. */
export async function creditReferral(db: Database, referrerId: string): Promise<void> {
  await db
    .update(submissions)
    .set({ referralCount: sql`${submissions.referralCount} + 1` })
    .where(eq(submissions.id, referrerId));
}

export function newReferralCode(): string {
  return publicId();
}
