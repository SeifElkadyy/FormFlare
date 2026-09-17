import { describe, expect, it } from "vitest";
import { compareVersions, isStableTag } from "../src/lib/update/semver";
import { parseSlug } from "../src/lib/waitlist/slug";
import { waitlistScore } from "../src/lib/waitlist/rank";
import { parsePreset, webhookBody } from "../src/lib/webhooks/presets";
import { originAllowed } from "../src/lib/spam/origin";

describe("stable tags", () => {
  it("accepts vMAJOR.MINOR.PATCH only", () => {
    expect(isStableTag("v0.2.0")).toBe(true);
    expect(isStableTag("0.2.0")).toBe(true);
    expect(isStableTag("v0.2.0-beta.1")).toBe(false);
  });

  it("orders 0.10.0 after 0.9.0", () => {
    expect(compareVersions("v0.10.0", "v0.9.0")).toBeGreaterThan(0);
    expect(compareVersions("0.1.0", "0.1.0")).toBe(0);
  });
});

describe("slugs", () => {
  it("treats empty as no slug", () => {
    expect(parseSlug("")).toEqual({ ok: true, slug: null });
    expect(parseSlug("  ")).toEqual({ ok: true, slug: null });
  });

  it("rejects reserved and invalid values", () => {
    expect(parseSlug("inbox").ok).toBe(false);
    expect(parseSlug("Wait List").ok).toBe(false);
    expect(parseSlug("ok-slug").ok).toBe(true);
  });
});

describe("waitlist score", () => {
  it("subtracts boost per referral without going through stored position", () => {
    expect(waitlistScore(10, 3, 2)).toBe(4);
    expect(waitlistScore(1, 5, 1)).toBe(-4);
  });
});

describe("webhook presets", () => {
  const payload = {
    event: "submission.created",
    form: { id: "abc", name: "Contact" },
    submission: {
      id: "sub",
      createdAt: 1,
      data: { email: "a@b.com", message: "Hi" },
      files: [],
      waitlist: { position: 3 },
    },
  };

  it("keeps signed JSON for generic", () => {
    const encoded = webhookBody("generic", payload);
    expect(encoded.signed).toBe(true);
    expect(JSON.parse(encoded.body).event).toBe("submission.created");
  });

  it("sends Slack text and Discord content", () => {
    const slack = webhookBody("slack", payload);
    expect(slack.signed).toBe(false);
    expect(JSON.parse(slack.body).text).toContain("Contact");

    const discord = webhookBody("discord", payload);
    expect(JSON.parse(discord.body).content).toContain("Contact");
    expect(parsePreset("nope")).toBe("generic");
  });
});

describe("origin allow-list", () => {
  it("allows the instance's own hosted page even with an allow-list", () => {
    const request = new Request("https://forms.example/f/abc", {
      headers: { origin: "https://forms.example" },
    });
    expect(
      originAllowed(request, JSON.stringify(["https://othersite.com"])),
    ).toBe(true);
  });

  it("still rejects a third-party origin when allow-listed", () => {
    const request = new Request("https://forms.example/f/abc", {
      headers: { origin: "https://evil.example" },
    });
    expect(
      originAllowed(request, JSON.stringify(["https://othersite.com"])),
    ).toBe(false);
  });
});
