import { effectiveFields, type FieldConfig } from "./fields";

/**
 * A prompt the owner pastes into an AI coding tool (Cursor, Claude Code, Lovable, v0,
 * Bolt) so it wires *this* form into *their* site, in their framework and styling.
 *
 * It states the contract, not a snippet: the agent writes code that fits the project it
 * is in, and the facts it needs (address, fields, bot trap, responses) are exact.
 */
export function agentPrompt(opts: {
  name: string;
  mode: string;
  endpoint: string;
  pageUrl: string;
  honeypot: string;
  fieldsJson: string;
  allowedOrigins: string[];
  /** Set when the form requires Turnstile; without the widget every submit fails. */
  turnstileSiteKey?: string | null;
  turnstileRequired?: boolean;
}): string {
  const fields = effectiveFields(opts.fieldsJson, opts.mode);
  const waitlist = opts.mode === "waitlist";

  const fieldLines = fields
    .filter((f) => f.type !== "file")
    .map((f) => `- \`${f.name}\`: ${describe(f)}${f.required ? ", required" : ", optional"}`)
    .join("\n");
  const files = fields.filter((f) => f.type === "file");

  return `Add a ${waitlist ? "waitlist signup" : "form"} called "${opts.name}" to this website. It submits to my FormFlare backend, so no server code, database or API key is needed.

## Where it posts
POST ${opts.endpoint}
Accepts application/json, application/x-www-form-urlencoded or multipart/form-data. No API key.

## Fields (use these exact \`name\`s)
${fieldLines}${files.length ? `\n${files.map((f) => `- \`${f.name}\`: file upload${f.required ? ", required" : ", optional"} (send as multipart/form-data)`).join("\n")}` : ""}
- \`${opts.honeypot}\`: a hidden text input that must stay empty. Hide it visually, with tabindex="-1" and autocomplete="off". It traps bots, so never remove it or fill it.

${
  opts.turnstileRequired
    ? `## Bot check (required)
This form requires Cloudflare Turnstile. Every submission without a valid token is rejected. Load \`https://challenges.cloudflare.com/turnstile/v0/api.js\` and render the widget inside the form with ${opts.turnstileSiteKey ? `site key \`${opts.turnstileSiteKey}\`` : "my Turnstile site key (ask me for it)"}. The widget adds the \`cf-turnstile-response\` field; send it along with the other fields.

`
    : ""
}## How to build it
- Match the site's existing components, styling and framework. Use proper labels and accessible error messages.
- Prefer submitting with fetch and headers \`Content-Type: application/json\` and \`Accept: application/json\`, then show the result in place without a page reload.
- Disable the button while sending. On success, replace the form with a thank-you message. Keep the user's input if it fails.

## Responses (JSON)
- Success: \`{ "ok": true, "id": "..."${waitlist ? `, "waitlist": { "position": 214, "referralCode": "abc123" }` : ""} }\`${
    waitlist
      ? `
  - Show "You're #<position> on the list".
  - If \`"pending": true\`, say "Check your email to confirm your spot" instead.
  - A repeat signup returns \`"duplicate": true\` with their current place. Treat it as success.
  - Referrals: if the page URL has \`?ref=CODE\`, send it as the field \`_ref\`. Offer a share link like <this page>?ref=<referralCode>.`
      : ""
  }
- Failure: \`{ "ok": false, "code": "..." }\`, with HTTP 4xx.
  - \`validation_failed\`: also includes \`"fields": { "<name>": "<message>" }\`. Show each message next to its field.
  - \`rate_limited\`: ask them to wait a minute.
  - \`captcha_failed\`: the bot check failed; let them retry.
  - \`origin_not_allowed\`: this site isn't on the form's allowed list (see below).
  - \`form_not_found\`: the form is paused or deleted.

## Good to know
${opts.allowedOrigins.length ? `- This form only accepts submissions from: ${opts.allowedOrigins.join(", ")}. If this site's address differs, tell me to add it in FormFlare → the form → Settings → Spam protection.` : "- Any website may post to this form."}
- If a plain HTML \`<form action="${opts.endpoint}" method="POST">\` is simpler for this site, that works too: FormFlare redirects to a thank-you page.
- No-code fallback: FormFlare also hosts this form at ${opts.pageUrl}, and the embed is \`<script src="${new URL("/widget.js", opts.endpoint).href}" data-form="${opts.pageUrl.split("/p/")[1] ?? ""}" async></script>\`.

When you're done, tell me which file you changed and how to test it.
`;
}

function describe(field: FieldConfig): string {
  switch (field.type) {
    case "email":
      return "email address";
    case "textarea":
      return "long text";
    case "number":
      return "number";
    case "url":
      return "URL";
    case "tel":
      return "phone number";
    default:
      return "short text";
  }
}
