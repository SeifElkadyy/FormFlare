import { BRAND } from "../brand";
import type { Form, Submission } from "../db/schema";
import { escapeHtml, sanitiseHeader } from "./sanitise";

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/**
 * Owner alert.
 *
 * Every piece of submitted content is escaped for the HTML part and stripped of
 * control characters for the subject. The subject is derived from the *form* name
 * (owner-controlled) rather than submitted content, so a submitter cannot dictate what
 * lands in the owner's inbox list.
 */
export function ownerAlert(
  form: Form,
  submission: Submission,
  data: Record<string, unknown>,
  dashboardUrl: string,
): RenderedEmail {
  const subject = sanitiseHeader(`New ${form.name} submission`, 120);

  const rows = Object.entries(data)
    .map(([key, value]) => {
      const k = escapeHtml(String(key));
      const v = escapeHtml(String(value));
      return `<tr><td style="padding:4px 12px 4px 0;vertical-align:top;color:#666">${k}</td><td style="padding:4px 0">${v}</td></tr>`;
    })
    .join("");

  const positionLine =
    submission.waitlistPosition !== null
      ? `<p style="margin:0 0 12px">Waitlist position: <strong>#${submission.waitlistPosition}</strong></p>`
      : "";

  const html = `<!doctype html>
<html><body style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;line-height:1.5;color:#111">
<h2 style="margin:0 0 4px;font-size:18px">New submission</h2>
<p style="margin:0 0 12px;color:#666">${escapeHtml(form.name)}</p>
${positionLine}
<table style="border-collapse:collapse;margin:0 0 16px">${rows}</table>
<p style="margin:0"><a href="${escapeHtml(dashboardUrl)}">View in ${escapeHtml(BRAND.name)}</a></p>
</body></html>`;

  const text = [
    `New submission — ${form.name}`,
    submission.waitlistPosition !== null
      ? `Waitlist position: #${submission.waitlistPosition}`
      : "",
    "",
    ...Object.entries(data).map(([key, value]) => `${key}: ${String(value)}`),
    "",
    `View in ${BRAND.name}: ${dashboardUrl}`,
  ]
    .filter(Boolean)
    .join("\n");

  return { subject, html, text };
}

/**
 * Auto-reply to the submitter.
 *
 * ⚠️ The body is **owner-configured text only**. No submitted content is echoed back.
 *
 * That is a deliberate anti-abuse measure, not a limitation: this email is sent to an
 * address a stranger typed into a public form. Echoing their input would make the
 * instance a free relay for sending attacker-authored text — with the owner's domain
 * and reputation — to any address they choose.
 */
export function autoReply(form: Form): RenderedEmail {
  const subject = sanitiseHeader(form.autoReplySubject || `Thanks — we got your message`, 120);

  // Owner-authored, but still escaped: the owner is trusted not to attack their own
  // submitters, not trusted to write valid HTML.
  const body = form.autoReplyBody || "Thanks for getting in touch. We'll be in contact soon.";
  const paragraphs = body
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 12px">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");

  const html = `<!doctype html>
<html><body style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;line-height:1.5;color:#111">
${paragraphs}
</body></html>`;

  return { subject, html, text: body };
}
