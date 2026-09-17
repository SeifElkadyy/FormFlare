import { describe, expect, it } from "vitest";
import { homeChecklist, homeInsights, type HomeSnapshot } from "../src/lib/dashboard/home";

const empty: HomeSnapshot = {
  formCount: 0,
  submissionCount: 0,
  unreadCount: 0,
  pendingConfirmCount: 0,
  webhookCount: 0,
  mailerAvailable: false,
  latestForm: null,
  unconfiguredForm: null,
  doubleOptInForm: null,
};

describe("homeInsights", () => {
  it("asks for a form when the instance is empty", () => {
    const [first, ...rest] = homeInsights(empty);
    expect(first.id).toBe("create");
    expect(rest).toHaveLength(0);
  });

  it("points at the snippet when a form has never been submitted", () => {
    const items = homeInsights({
      ...empty,
      formCount: 1,
      latestForm: { id: "f1", name: "Contact" },
    });
    expect(items.map((item) => item.id)).toContain("embed");
    expect(items[0].href).toBe("/forms/f1");
    expect(items.length).toBeLessThanOrEqual(2);
  });

  it("blocks on email when double opt-in cannot send", () => {
    const items = homeInsights({
      ...empty,
      formCount: 1,
      latestForm: { id: "f1", name: "Waitlist" },
      doubleOptInForm: { id: "f1", name: "Waitlist" },
      mailerAvailable: false,
    });
    expect(items[0].id).toBe("opt-in-mailer");
    expect(items[0].tone).toBe("warning");
  });

  it("caps at two banners", () => {
    const items = homeInsights({
      ...empty,
      formCount: 2,
      submissionCount: 4,
      unreadCount: 3,
      pendingConfirmCount: 2,
      webhookCount: 0,
      mailerAvailable: false,
      latestForm: { id: "f1", name: "Contact" },
      unconfiguredForm: { id: "f1", name: "Contact" },
    });
    expect(items).toHaveLength(2);
  });

  it("says you are set up when nothing is blocked", () => {
    const items = homeInsights({
      formCount: 1,
      submissionCount: 10,
      unreadCount: 0,
      pendingConfirmCount: 0,
      webhookCount: 1,
      mailerAvailable: true,
      latestForm: { id: "f1", name: "Contact" },
      unconfiguredForm: null,
      doubleOptInForm: null,
    });
    expect(items).toEqual([expect.objectContaining({ id: "ready", tone: "success" })]);
  });
});

describe("homeChecklist", () => {
  it("marks steps from the snapshot", () => {
    const items = homeChecklist({
      ...empty,
      formCount: 1,
      submissionCount: 2,
      mailerAvailable: true,
      latestForm: { id: "f1", name: "Contact" },
    });
    expect(items.find((item) => item.id === "form")?.done).toBe(true);
    expect(items.find((item) => item.id === "embed")?.done).toBe(true);
    expect(items.find((item) => item.id === "email")?.done).toBe(true);
    expect(items.find((item) => item.id === "webhook")?.done).toBe(false);
  });
});
