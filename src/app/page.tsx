import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { anyUserExists } from "@/lib/auth/setup";
import { getEnv } from "@/lib/env";
import { BrandMark } from "@/components/brand-mark";
import { ThemeToggle } from "@/components/theme";
import { btnPrimary, btnPrimaryLead, btnSecondary } from "@/lib/ui";
import {
  ArrowRightIcon,
  FormsIcon,
  InboxIcon,
  KeysIcon,
  PlusIcon,
  SearchIcon,
  ShieldCheckIcon,
  WebhooksIcon,
} from "@/components/icons";

export const dynamic = "force-dynamic";

const PREVIEW = [
  {
    sender: "maya@northline.dev",
    form: "Waitlist",
    preview: "You're #214 on the list.",
    badge: "New",
  },
  {
    sender: "ops@halcyon.tools",
    form: "Contact",
    preview: "Can you send pricing for the team plan?",
    badge: "New",
  },
  {
    sender: "alerts@marketmesh.io",
    form: "Billing",
    preview: "Signed payload reached n8n.",
    badge: "Hook",
  },
];

export default async function Home() {
  const env = await getEnv();
  const configured = await anyUserExists(env.DB);
  const primaryHref = configured ? "/login" : "/setup";
  const primaryLabel = configured ? "Open dashboard" : "Create account";
  const secondaryHref = configured ? "/inbox" : "/login";
  const secondaryLabel = configured ? "View inbox" : "Log in";

  return (
    <div className="min-h-dvh bg-[#f4f6fb] text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <BrandMark href="/" />
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Link href="/login" className={`${btnSecondary} no-underline`}>
            Log in
          </Link>
          <Link
            href={configured ? "/inbox" : "/setup"}
            className={`${btnPrimary} no-underline`}
          >
            {configured ? "Open dashboard" : "Create account"}
          </Link>
        </div>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-4 pb-16 pt-10 sm:px-6 lg:grid-cols-[1fr_1.15fr] lg:pt-20">
          <div className="hero-enter max-w-xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-800 dark:bg-blue-950/50 dark:text-blue-200">
              <ShieldCheckIcon />
              Runs on your Cloudflare account
            </div>
            <h1 className="text-4xl font-semibold leading-[1.05] tracking-tight text-neutral-950 sm:text-5xl lg:text-6xl dark:text-white">
              A form backend without the SaaS bill.
            </h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-neutral-600 dark:text-neutral-400">
              Create an endpoint, paste a snippet, and submissions land here — waitlists, spam
              checks, and signed webhooks included.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href={primaryHref} className={`${btnPrimary} no-underline`}>
                {primaryLabel}
                <ArrowRightIcon />
              </Link>
              <Link href={secondaryHref} className={`${btnSecondary} no-underline`}>
                {secondaryLabel}
              </Link>
            </div>
          </div>

          <div className="flex min-h-[440px] overflow-hidden rounded-[20px] bg-[#f4f6fb] p-2 shadow-[var(--shadow-border)] dark:bg-neutral-950">
            <aside className="hidden w-44 shrink-0 flex-col pr-3 sm:flex">
              <div className="mb-4 px-1 text-sm font-semibold text-neutral-800 dark:text-neutral-100">
                {BRAND.name}
              </div>
              <div className={`${btnPrimaryLead} mb-6 pointer-events-none`}>
                <PlusIcon />
                New form
              </div>
              <p className="mb-1 px-2 text-[11px] font-medium uppercase tracking-wide text-neutral-400">
                Collect
              </p>
              {[
                { label: "Inbox", icon: InboxIcon, active: true },
                { label: "Forms", icon: FormsIcon },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.label}
                    className={`mb-0.5 flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm ${
                      item.active
                        ? "bg-white font-medium text-blue-700 shadow-[var(--shadow-border)]"
                        : "text-neutral-600"
                    }`}
                  >
                    <Icon />
                    {item.label}
                  </div>
                );
              })}
              <p className="mb-1 mt-4 px-2 text-[11px] font-medium uppercase tracking-wide text-neutral-400">
                Connect
              </p>
              {[
                { label: "Webhooks", icon: WebhooksIcon },
                { label: "API keys", icon: KeysIcon },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.label}
                    className="mb-0.5 flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm text-neutral-600"
                  >
                    <Icon />
                    {item.label}
                  </div>
                );
              })}
            </aside>

            <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl bg-white shadow-[var(--shadow-border)] dark:bg-neutral-900">
              <div className="flex h-12 items-center gap-2 px-3">
                <div className="surface flex h-8 flex-1 items-center gap-2 rounded-lg bg-neutral-50 px-3 text-sm text-neutral-400">
                  <SearchIcon className="size-4" />
                  Search submissions
                </div>
              </div>
              <div className="flex h-14 items-center justify-between border-b border-neutral-100 px-5 dark:border-neutral-800">
                <div>
                  <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">Inbox</h2>
                  <p className="text-xs text-neutral-400">3 new this hour</p>
                </div>
              </div>
              <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {PREVIEW.map((row) => (
                  <div key={row.sender} className="flex items-start gap-3 px-5 py-3.5">
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-600" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-neutral-900 dark:text-neutral-50">
                        {row.sender}
                      </p>
                      <p className="truncate text-sm text-neutral-500">
                        {row.form} — {row.preview}
                      </p>
                    </div>
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                      {row.badge}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
