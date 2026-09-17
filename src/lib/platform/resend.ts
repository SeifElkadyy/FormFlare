import type { Mailer, MailMessage } from "./mailer";

const ENDPOINT = "https://api.resend.com/emails";

/**
 * Resend via fetch. No SDK: a package would inflate the Worker for one POST, and
 * Resend's HTTP contract is small enough to keep in this file.
 */
export function resendMailer(apiKey: string): Mailer {
  return {
    available: true,
    async send(msg: MailMessage) {
      try {
        const response = await fetch(ENDPOINT, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: msg.from,
            to: [msg.to],
            subject: msg.subject,
            html: msg.html,
            text: msg.text,
            ...(msg.replyTo ? { reply_to: msg.replyTo } : {}),
          }),
          signal: AbortSignal.timeout(10_000),
        });

        if (response.ok) return { ok: true };

        const body = await response.text().catch(() => "");
        return {
          ok: false,
          error: `Resend returned ${response.status}${body ? `: ${body.slice(0, 200)}` : ""}`,
        };
      } catch (err) {
        const timedOut = err instanceof Error && err.name === "TimeoutError";
        return {
          ok: false,
          error: timedOut ? "Resend did not respond in time." : "Could not reach Resend.",
        };
      }
    },
  };
}
