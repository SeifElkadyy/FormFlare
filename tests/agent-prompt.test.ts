import { describe, expect, it } from "vitest";
import { agentPrompt } from "../src/lib/submissions/agent-prompt";

const base = {
  name: "Contact",
  mode: "standard",
  endpoint: "https://forms.example.com/f/abc123",
  pageUrl: "https://forms.example.com/p/contact",
  honeypot: "_gotcha",
  fieldsJson: JSON.stringify([
    { name: "email", type: "email", required: true },
    { name: "company", type: "text" },
  ]),
  allowedOrigins: [] as string[],
};

describe("agentPrompt", () => {
  it("carries the exact endpoint, field names and honeypot", () => {
    const prompt = agentPrompt(base);
    expect(prompt).toContain("POST https://forms.example.com/f/abc123");
    expect(prompt).toContain("`email`: email address, required");
    expect(prompt).toContain("`company`: short text, optional");
    expect(prompt).toContain("`_gotcha`");
    expect(prompt).toContain('data-form="contact"');
    expect(prompt).not.toContain("waitlist");
  });

  it("explains positions and referrals for waitlists", () => {
    const prompt = agentPrompt({ ...base, mode: "waitlist" });
    expect(prompt).toContain("waitlist signup");
    expect(prompt).toContain("You're #<position> on the list");
    expect(prompt).toContain("`_ref`");
  });

  it("names the allowed sites when the form is locked down", () => {
    const prompt = agentPrompt({ ...base, allowedOrigins: ["https://acme.com"] });
    expect(prompt).toContain("only accepts submissions from: https://acme.com");
  });

  it("requires the Turnstile widget when the form checks for it", () => {
    const prompt = agentPrompt({ ...base, turnstileRequired: true, turnstileSiteKey: "0x4AAA" });
    expect(prompt).toContain("Bot check (required)");
    expect(prompt).toContain("site key `0x4AAA`");
    expect(agentPrompt(base)).not.toContain("Turnstile");
  });
});
