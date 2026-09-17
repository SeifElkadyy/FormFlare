import type { MailMessage, Mailer } from "../src/lib/platform/mailer";

/**
 * A Mailer that records instead of sending.
 *
 * Cloudflare Email Sending cannot be exercised locally — Miniflare has no real
 * `send_email` binding, and sending to arbitrary recipients needs a paid plan and an
 * onboarded domain. So everything about *what* we send (headers, escaping, throttling,
 * idempotency) is tested here, and *that* it sends is a Phase 6 checklist item against
 * the deployed instance.
 */
export interface FakeMailer extends Mailer {
  sent: MailMessage[];
  /** Force the next N sends to fail, to exercise retry paths. */
  failNext(count: number, error?: string): void;
  reset(): void;
}

export function fakeMailer(available = true): FakeMailer {
  const sent: MailMessage[] = [];
  let failures = 0;
  let failureError = "temporary failure";

  return {
    available,
    sent,
    failNext(count: number, error = "temporary failure") {
      failures = count;
      failureError = error;
    },
    reset() {
      sent.length = 0;
      failures = 0;
    },
    async send(msg: MailMessage) {
      if (!available) return { ok: false, error: "Email Sending is not configured." };
      if (failures > 0) {
        failures--;
        return { ok: false, error: failureError };
      }
      sent.push(msg);
      return { ok: true };
    },
  };
}
