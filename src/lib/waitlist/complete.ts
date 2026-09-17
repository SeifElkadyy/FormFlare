import { eq } from "drizzle-orm";
import { createDb } from "../db/client";
import { forms, submissions } from "../db/schema";
import { SETTING, getSetting } from "../db/settings";
import { fanOutSubmission } from "../jobs/fanout";
import { cloudflareQueue } from "../platform/queue";
import { claimPosition } from "./position";
import { creditReferral } from "./referral";
import { waitlistRank } from "./rank";
import { verifyConfirmToken } from "./confirm";

export type ConfirmResult =
  | {
      ok: true;
      already: boolean;
      formName: string;
      position: number | null;
      rank: number | null;
      referralCode: string | null;
      formPublicId: string;
    }
  | { ok: false; code: "invalid" | "expired" | "not_found" };

/**
 * Confirm a double-opt-in waitlist signup.
 *
 * Idempotent: a second click on a valid link returns the existing position instead
 * of assigning another. The token is verified before any write.
 */
export async function confirmSignup(
  env: CloudflareEnv,
  submissionId: string,
  exp: number,
  sig: string,
  now: number = Date.now(),
): Promise<ConfirmResult> {
  const db = createDb(env.DB);
  const sessionSecret = (await getSetting(db, SETTING.sessionSecret)) ?? "";
  if (!sessionSecret) return { ok: false, code: "invalid" };

  if (!(await verifyConfirmToken(submissionId, exp, sig, sessionSecret, now))) {
    return { ok: false, code: exp <= now ? "expired" : "invalid" };
  }

  const rows = await db
    .select({ submission: submissions, form: forms })
    .from(submissions)
    .innerJoin(forms, eq(forms.id, submissions.formId))
    .where(eq(submissions.id, submissionId))
    .limit(1);

  const row = rows[0];
  if (!row) return { ok: false, code: "not_found" };

  const { submission, form } = row;

  if (submission.optedInAt) {
    const ranked = await waitlistRank(env.DB, form.id, submission.id);
    return {
      ok: true,
      already: true,
      formName: form.name,
      position: ranked?.rank ?? submission.waitlistPosition,
      rank: ranked?.rank ?? null,
      referralCode: submission.referralCode,
      formPublicId: form.publicId,
    };
  }

  const position = submission.waitlistPosition ?? (await claimPosition(env.DB, form.id));

  await db
    .update(submissions)
    .set({ optedInAt: now, waitlistPosition: position })
    .where(eq(submissions.id, submission.id));

  if (submission.referredById) {
    await creditReferral(db, submission.referredById);
  }

  const [fresh] = await db.select().from(submissions).where(eq(submissions.id, submission.id));
  if (fresh) {
    const jobs = await fanOutSubmission(db, form, fresh, now);
    const queue = cloudflareQueue(env.JOBS);
    for (const job of jobs) await queue.send(job);
  }

  const ranked = await waitlistRank(env.DB, form.id, submission.id);
  return {
    ok: true,
    already: false,
    formName: form.name,
    position: ranked?.rank ?? position,
    rank: ranked?.rank ?? null,
    referralCode: submission.referralCode,
    formPublicId: form.publicId,
  };
}
