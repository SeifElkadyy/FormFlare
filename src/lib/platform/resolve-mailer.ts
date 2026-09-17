import { decryptSecret } from "../crypto/secrets";
import type { Database } from "../db/client";
import { SETTING, getSetting } from "../db/settings";
import { cloudflareMailer, unavailableMailer, type Mailer } from "./mailer";
import { resendMailer } from "./resend";

export type MailProvider = "cloudflare" | "resend" | "off";

export interface MailerStatus {
  provider: MailProvider;
  available: boolean;
}

/**
 * Pick a mailer from Settings, falling back to the Cloudflare binding.
 *
 * Unset provider preserves v0.1.0 behaviour: Cloudflare if `EMAIL` is bound, else off.
 * An explicit "cloudflare" with no binding is unavailable rather than silently
 * switching to Resend — the owner picked a provider, so we do not guess.
 */
export async function resolveMailer(
  db: Database,
  env: { EMAIL?: SendEmail },
): Promise<Mailer> {
  const { provider } = await mailerStatus(db, env);
  if (provider === "off") return unavailableMailer;
  if (provider === "resend") return resendFromSettings(db);
  return cloudflareMailer(env.EMAIL);
}

export async function mailerStatus(
  db: Database,
  env: { EMAIL?: SendEmail },
): Promise<MailerStatus> {
  const stored = await getSetting(db, SETTING.mailProvider);
  const provider: MailProvider =
    stored === "resend" || stored === "cloudflare" || stored === "off"
      ? stored
      : env.EMAIL
        ? "cloudflare"
        : "off";

  if (provider === "off") return { provider, available: false };
  if (provider === "cloudflare") return { provider, available: Boolean(env.EMAIL) };

  const key = await getSetting(db, SETTING.resendApiKey);
  return { provider, available: Boolean(key) };
}

async function resendFromSettings(db: Database): Promise<Mailer> {
  const sessionSecret = (await getSetting(db, SETTING.sessionSecret)) ?? "";
  const stored = await getSetting(db, SETTING.resendApiKey);
  if (!stored) return unavailableMailer;
  const key = await decryptSecret(stored, sessionSecret);
  if (!key) return unavailableMailer;
  return resendMailer(key);
}
