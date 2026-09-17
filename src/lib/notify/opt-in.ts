import { BRAND } from "../brand";
import { escapeHtml, sanitiseHeader } from "./sanitise";
import type { RenderedEmail } from "./templates";

/**
 * Double opt-in confirmation.
 *
 * The link is the only thing in this email that is not owner-controlled copy: it
 * points at this instance. Submitted content is never echoed, same rule as auto-reply.
 */
export function optInEmail(formName: string, confirmUrl: string): RenderedEmail {
  const subject = sanitiseHeader(`Confirm you want to join ${formName}`, 120);
  const name = escapeHtml(formName);
  const href = escapeHtml(confirmUrl);

  const html = `<!doctype html>
<html><body style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;line-height:1.5;color:#111">
<p style="margin:0 0 12px">One more step to join <strong>${name}</strong>.</p>
<p style="margin:0 0 16px"><a href="${href}">Confirm your email</a></p>
<p style="margin:0;color:#666;font-size:13px">This link expires in 7 days. If you did not sign up, ignore this email.</p>
<p style="margin:16px 0 0;color:#666;font-size:13px">${escapeHtml(BRAND.name)}</p>
</body></html>`;

  const text = [
    `Confirm you want to join ${formName}:`,
    confirmUrl,
    "",
    "This link expires in 7 days. If you did not sign up, ignore this email.",
  ].join("\n");

  return { subject, html, text };
}
