import { escapeHtml } from "../notify/sanitise";
import type { WebhookPayload } from "./deliver";

export type WebhookPreset = "generic" | "slack" | "discord";

export function parsePreset(raw: string | null | undefined): WebhookPreset {
  return raw === "slack" || raw === "discord" ? raw : "generic";
}

/**
 * Body + whether to attach HMAC headers.
 *
 * Slack and Discord incoming webhooks reject our signed JSON and ignore our headers.
 * They get a text/embed payload and no signature. Generic keeps the documented contract.
 */
export function webhookBody(
  preset: WebhookPreset,
  payload: WebhookPayload,
): { body: string; signed: boolean } {
  if (preset === "slack") {
    return { body: JSON.stringify({ text: plainSummary(payload) }), signed: false };
  }
  if (preset === "discord") {
    const fields = Object.entries(payload.submission.data)
      .slice(0, 25)
      .map(([name, value]) => ({
        name: String(name).slice(0, 256) || "field",
        value: String(value).slice(0, 1024) || "—",
        inline: true,
      }));
    return {
      body: JSON.stringify({
        content: `New submission on **${payload.form.name}**`,
        embeds: [
          {
            title: payload.form.name,
            color: 0x0b57d0,
            fields,
            ...(payload.submission.waitlist
              ? { footer: { text: `#${payload.submission.waitlist.position} on the waitlist` } }
              : {}),
          },
        ],
      }),
      signed: false,
    };
  }
  return { body: JSON.stringify(payload), signed: true };
}

function plainSummary(payload: WebhookPayload): string {
  const lines = [
    `New ${payload.form.name} submission`,
    payload.submission.waitlist ? `Waitlist: #${payload.submission.waitlist.position}` : "",
    ...Object.entries(payload.submission.data).map(
      ([key, value]) => `${key}: ${String(value)}`,
    ),
  ].filter(Boolean);
  return lines.join("\n");
}

/** Escape for Slack/Discord is not HTML, but we still strip control chars via this helper. */
export function safeFieldValue(value: unknown): string {
  return escapeHtml(String(value)).slice(0, 1024);
}
