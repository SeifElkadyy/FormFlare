/**
 * What the dashboard home should say next.
 *
 * Ordered by how stuck the owner is: no form, then nothing arriving, then
 * confirmations that will never send, then mail they turned on without a mailer.
 * Cap at two so the page stays a launch pad, not a wall of notices.
 */
export const HOME_INSIGHT_LIMIT = 2;

export type HomeInsightTone = "info" | "warning" | "success";

export interface HomeInsight {
  id: string;
  tone: HomeInsightTone;
  title: string;
  body: string;
  href: string;
  cta: string;
}

export interface HomeChecklistItem {
  id: string;
  label: string;
  done: boolean;
  href: string;
}

export interface HomeSnapshot {
  formCount: number;
  submissionCount: number;
  unreadCount: number;
  pendingConfirmCount: number;
  webhookCount: number;
  mailerAvailable: boolean;
  latestForm: { id: string; name: string } | null;
  unconfiguredForm: { id: string; name: string } | null;
  doubleOptInForm: { id: string; name: string } | null;
}

export function homeInsights(state: HomeSnapshot): HomeInsight[] {
  const items: HomeInsight[] = [];

  if (state.formCount === 0) {
    items.push({
      id: "create",
      tone: "info",
      title: "Create your first form",
      body: "You get an endpoint and snippets — HTML, fetch, or React. Style it on your site.",
      href: "/forms?new=1",
      cta: "New form",
    });
    return items.slice(0, HOME_INSIGHT_LIMIT);
  }

  if (state.doubleOptInForm && !state.mailerAvailable) {
    items.push({
      id: "opt-in-mailer",
      tone: "warning",
      title: "Double opt-in needs email",
      body: `${state.doubleOptInForm.name} is waiting on a confirm mail that cannot send. Turn on email, or copy confirm links from Inbox.`,
      href: "/settings#email",
      cta: "Turn on sending",
    });
  }

  if (state.pendingConfirmCount > 0) {
    items.push({
      id: "pending",
      tone: "warning",
      title:
        state.pendingConfirmCount === 1
          ? "1 signup is unconfirmed"
          : `${state.pendingConfirmCount} signups are unconfirmed`,
      body: "They have no waitlist position until they click the link. Copy it from Inbox if email is off.",
      href: "/inbox",
      cta: "Open Inbox",
    });
  }

  if (state.submissionCount === 0 && state.latestForm) {
    items.push({
      id: "embed",
      tone: "info",
      title: "Put it on your site",
      body: `Copy a snippet from ${state.latestForm.name}. Your CSS, our endpoint — no API key for the POST.`,
      href: `/forms/${state.latestForm.id}`,
      cta: "Copy snippet",
    });
  }

  if (state.unreadCount > 0) {
    items.push({
      id: "unread",
      tone: "info",
      title: state.unreadCount === 1 ? "1 new submission" : `${state.unreadCount} new submissions`,
      body: "They are waiting in Inbox.",
      href: "/inbox?status=new",
      cta: "Review",
    });
  }

  if (state.unconfiguredForm) {
    items.push({
      id: "fields",
      tone: "info",
      title: `Add fields to ${state.unconfiguredForm.name}`,
      body: "It still uses the defaults. Company, phone, or anything else — the snippet follows this list.",
      href: `/forms/${state.unconfiguredForm.id}`,
      cta: "Edit fields",
    });
  }

  if (!state.mailerAvailable && state.formCount > 0) {
    items.push({
      id: "email",
      tone: "info",
      title: "Email is optional",
      body: "Inbox already collects submissions. Turn on sending only for owner alerts or waitlist confirmations — you do not connect Gmail.",
      href: "/settings#email",
      cta: "Turn on sending",
    });
  }

  if (state.webhookCount === 0 && state.submissionCount > 0) {
    items.push({
      id: "webhook",
      tone: "info",
      title: "Forward submissions",
      body: "Slack, Discord, or any https endpoint. Forms keep working without this.",
      href: "/webhooks",
      cta: "Add webhook",
    });
  }

  if (items.length === 0) {
    items.push({
      id: "ready",
      tone: "success",
      title: "You're set up",
      body: "New submissions land in Inbox. Open a form to copy a snippet or change fields.",
      href: "/inbox",
      cta: "Open Inbox",
    });
  }

  return items.slice(0, HOME_INSIGHT_LIMIT);
}

export function homeChecklist(state: HomeSnapshot): HomeChecklistItem[] {
  return [
    {
      id: "form",
      label: "Create a form",
      done: state.formCount > 0,
      href: state.formCount > 0 ? "/forms" : "/forms?new=1",
    },
    {
      id: "embed",
      label: "Get a submission",
      done: state.submissionCount > 0,
      href: state.latestForm ? `/forms/${state.latestForm.id}` : "/forms?new=1",
    },
    {
      id: "email",
      label: "Turn on email",
      done: state.mailerAvailable,
      href: "/settings#email",
    },
    {
      id: "webhook",
      label: "Add a webhook",
      done: state.webhookCount > 0,
      href: "/webhooks",
    },
  ];
}
