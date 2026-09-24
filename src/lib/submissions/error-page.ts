import { BRAND } from "../brand";
import { fieldLabel } from "./fields";

/**
 * What a visitor sees when a plain HTML form (no JavaScript) is rejected. JSON callers
 * get the stable `{ ok: false, code }` body instead; this is only for a browser that
 * navigated here and would otherwise be shown raw JSON.
 *
 * The browser's back button keeps what they typed, so every message ends by sending
 * them back rather than offering a link we would have to trust.
 */
const MESSAGES: Record<string, { title: string; body: string }> = {
  form_not_found: {
    title: "This form isn't available",
    body: "It may have been paused or removed. Contact the site owner another way.",
  },
  origin_not_allowed: {
    title: "This form can't be sent from here",
    body: "The form's owner only accepts it from their own website.",
  },
  payload_too_large: {
    title: "That was too large to send",
    body: "Go back and try a smaller file, or a shorter message.",
  },
  unsupported_media_type: {
    title: "Something went wrong sending the form",
    body: "Go back and try again.",
  },
  malformed_body: {
    title: "Something went wrong sending the form",
    body: "Go back and try again.",
  },
  validation_failed: {
    title: "Please check your answers",
    body: "Go back and fix these, then send again:",
  },
  captcha_failed: {
    title: "The bot check didn't pass",
    body: "Go back, complete the check, and send again.",
  },
  rate_limited: {
    title: "Too many tries",
    body: "Wait a minute, then go back and send again.",
  },
  method_not_allowed: {
    title: "Nothing to see here",
    body: "This address receives form submissions. Open the page with the form instead.",
  },
};

export function errorPageHtml(code: string, fields?: Record<string, string>): string {
  const message = MESSAGES[code] ?? MESSAGES.malformed_body;
  const list = fields
    ? `<ul>${Object.entries(fields)
        .map(
          ([name, problem]) =>
            `<li><strong>${escape(fieldLabel(name))}</strong>: ${escape(problem)}</li>`,
        )
        .join("")}</ul>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escape(message.title)}</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px;
    font: 15px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif; background: #fafafa; color: #050505; }
  main { max-width: 26rem; width: 100%; background: #fff; border-radius: 16px; padding: 28px;
    box-shadow: 0 0 0 1px rgb(0 0 0 / .08), 0 2px 4px rgb(0 0 0 / .04); }
  h1 { font-size: 20px; margin: 0 0 8px; letter-spacing: -.01em; }
  p, li { color: #525252; margin: 0; }
  ul { margin: 12px 0 0; padding-left: 20px; }
  strong { color: #050505; font-weight: 600; }
  small { display: block; margin-top: 20px; color: #a3a3a3; font-size: 12px; }
  @media (prefers-color-scheme: dark) {
    body { background: #0a0a0a; color: #f5f5f5; }
    main { background: #171717; box-shadow: 0 0 0 1px rgb(255 255 255 / .1); }
    p, li { color: #a3a3a3; } strong { color: #f5f5f5; }
  }
</style>
</head>
<body>
<main>
  <h1>${escape(message.title)}</h1>
  <p>${escape(message.body)}</p>
  ${list}
  <small>Use your browser's back button; what you typed is usually still there. Powered by ${escape(BRAND.name)}.</small>
</main>
</body>
</html>`;
}

function escape(value: string): string {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
