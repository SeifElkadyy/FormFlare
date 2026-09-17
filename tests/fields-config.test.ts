import { describe, expect, it } from "vitest";
import { embedSnippets } from "../src/lib/submissions/embed";
import {
  defaultFields,
  fieldLabel,
  parseFieldsPayload,
} from "../src/lib/submissions/fields";
import { originFromInput } from "../src/lib/spam/origin-input";
import { refuseDoubleOptIn } from "../src/lib/waitlist/opt-in";

describe("parseFieldsPayload", () => {
  it("accepts company and phone on a standard form", () => {
    const result = parseFieldsPayload(
      JSON.stringify([
        { name: "name", type: "text", required: true },
        { name: "email", type: "email", required: true },
        { name: "company", type: "text" },
        { name: "phone", type: "tel" },
      ]),
      "standard",
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.fields.map((f) => f.name)).toEqual(["name", "email", "company", "phone"]);
  });

  it("rejects reserved names and duplicates", () => {
    expect(parseFieldsPayload(JSON.stringify([{ name: "_redirect", type: "text" }]), "standard").ok).toBe(
      false,
    );
    expect(
      parseFieldsPayload(
        JSON.stringify([
          { name: "email", type: "email" },
          { name: "Email", type: "text" },
        ]),
        "standard",
      ).ok,
    ).toBe(false);
  });

  it("requires an email field on waitlists", () => {
    const result = parseFieldsPayload(JSON.stringify([{ name: "name", type: "text" }]), "waitlist");
    expect(result.ok).toBe(false);
  });
});

describe("embed snippets", () => {
  it("includes configured fields in HTML, fetch and React", () => {
    const fields = JSON.stringify([
      { name: "company", type: "text", required: true },
      { name: "email", type: "email", required: true },
    ]);
    const snippets = embedSnippets("https://forms.example/f/abc", "_gotcha", "standard", fields);
    expect(snippets.html).toContain('name="company"');
    expect(snippets.fetch).toContain("company:");
    expect(snippets.react).toContain('name="company"');
    expect(snippets.fetch).toContain("application/json");
  });

  it("falls back to default fields when none are stored", () => {
    const snippets = embedSnippets("https://forms.example/f/abc", "_gotcha", "standard", "[]");
    for (const name of defaultFields("standard")) {
      expect(snippets.html).toContain(`name="${name.name}"`);
    }
  });
});

describe("double opt-in gate", () => {
  it("refuses enabling without a mailer", () => {
    expect(
      refuseDoubleOptIn({ mode: "waitlist", enable: true, alreadyOn: false, mailerAvailable: false }),
    ).toMatch(/email/i);
  });

  it("keeps an already-on waitlist so Inbox can show confirm links", () => {
    expect(
      refuseDoubleOptIn({ mode: "waitlist", enable: true, alreadyOn: true, mailerAvailable: false }),
    ).toBeNull();
  });
});

describe("origin helper", () => {
  it("normalises a bare host to an origin", () => {
    expect(originFromInput("yoursite.com")).toBe("https://yoursite.com");
    expect(originFromInput("https://www.yoursite.com/path")).toBe("https://www.yoursite.com");
  });
});

describe("fieldLabel", () => {
  it("humanises stored names", () => {
    expect(fieldLabel("company_name")).toBe("Company name");
    expect(fieldLabel("phone")).toBe("Phone");
  });
});
