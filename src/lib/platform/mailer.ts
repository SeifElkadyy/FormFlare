/**
 * Outbound email behind a narrow interface (Section 6.2).
 *
 * Email is optional at runtime: Email Sending may not be enabled, the domain may
 * not be onboarded, or the account may be on the free plan. The app must keep
 * working without it (design principle 5), so `available` lets the UI explain
 * what is off instead of failing a submission.
 */
export interface MailMessage {
  to: string;
  from: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}

export interface Mailer {
  send(msg: MailMessage): Promise<{ ok: boolean; error?: string }>;
  readonly available: boolean;
}

/**
 * Mailer used when the EMAIL binding is absent.
 *
 * Reports `available: false` and fails softly, so callers surface a banner rather
 * than throwing inside a queue consumer and retrying forever.
 */
export const unavailableMailer: Mailer = {
  available: false,
  async send() {
    return { ok: false, error: "Email Sending is not configured for this instance." };
  },
};

export function cloudflareMailer(binding: SendEmail | undefined): Mailer {
  if (!binding) return unavailableMailer;

  return {
    available: true,
    async send(msg) {
      try {
        await binding.send({
          to: msg.to,
          from: msg.from,
          subject: msg.subject,
          html: msg.html,
          text: msg.text,
          ...(msg.replyTo ? { replyTo: msg.replyTo } : {}),
        });
        return { ok: true };
      } catch (err) {
        // Surfaced to the dashboard; Cloudflare's messages name the fix
        // (domain not onboarded, recipient not verified, plan limits).
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}
