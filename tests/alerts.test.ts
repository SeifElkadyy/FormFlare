import { describe, expect, it } from "vitest";
import { dashboardAlerts, type AlertState } from "../src/lib/dashboard/alerts";

const quiet: AlertState = {
  failedWebhookCount: 0,
  failedWebhookFormId: null,
  failedEmailCount: 0,
  stuckOptInForm: null,
};

describe("dashboardAlerts", () => {
  it("says nothing when nothing is broken", () => {
    expect(dashboardAlerts(quiet)).toEqual([]);
  });

  it("links a failing webhook to its form's settings", () => {
    const [alert] = dashboardAlerts({ ...quiet, failedWebhookCount: 2, failedWebhookFormId: "f1" });
    expect(alert.message).toBe("2 webhook deliveries failed this week.");
    expect(alert.href).toBe("/forms/f1/settings#webhooks");
  });

  it("puts a stuck double opt-in first", () => {
    const alerts = dashboardAlerts({
      ...quiet,
      failedEmailCount: 1,
      stuckOptInForm: { id: "f1", name: "Waitlist" },
    });
    expect(alerts.map((a) => a.id)).toEqual(["opt-in-mailer", "email-failures"]);
  });
});
