import type { ReactNode } from "react";
import Link from "next/link";
import { HomeGreeting } from "./greeting";
import { LocalTime } from "../inbox/local-time";
import {
  ArrowRightIcon,
  CheckIcon,
  ChevronRightIcon,
  FormsIcon,
  InboxIcon,
  KeysIcon,
  SettingsIcon,
  WebhooksIcon,
} from "@/components/icons";
import type { HomeChecklistItem, HomeInsight } from "@/lib/dashboard/home";
import {
  btnPrimary,
  btnSecondary,
  cn,
  hintClass,
  sectionTitle,
} from "@/lib/ui";

export function HomeView({
  email,
  insights,
  checklist,
  stats,
  quick,
  forms,
  submissions,
  newForm,
}: {
  email: string;
  insights: HomeInsight[];
  checklist: HomeChecklistItem[];
  stats: { label: string; value: string; href: string; hint: string }[];
  quick: { href: string; title: string; hint: string; icon: "inbox" | "forms" | "keys" | "webhooks" | "settings" }[];
  forms: { id: string; name: string; active: boolean; mode: string; submissionCount: number; publicId: string }[];
  submissions: { id: string; email: string | null; formName: string; createdAt: number; status: string }[];
  newForm: ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-6">
      <div className="flex items-start justify-between gap-4">
        <HomeGreeting email={email} />
        {newForm}
      </div>

      {insights.length > 0 ? (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {insights.map((insight) => (
            <li key={insight.id}>
              <InsightCard insight={insight} />
            </li>
          ))}
        </ul>
      ) : null}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((stat) => (
          <Link
            key={stat.label}
            href={stat.href}
            className="press surface flex flex-col rounded-2xl p-4 no-underline"
          >
            <p className={hintClass}>{stat.label}</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-neutral-950 dark:text-white">
              {stat.value}
            </p>
            <p className={`mt-1 ${hintClass}`}>{stat.hint}</p>
          </Link>
        ))}
      </section>

      <section>
        <h2 className={sectionTitle}>Quick access</h2>
        <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {quick.map((item) => {
            const Icon = QUICK_ICON[item.icon];
            return (
              <li key={item.href + item.title}>
                <Link
                  href={item.href}
                  className="press surface flex h-full flex-col rounded-2xl p-4 no-underline"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-200">
                    <Icon />
                  </span>
                  <span className="mt-3 text-sm font-medium text-neutral-950 dark:text-white">
                    {item.title}
                  </span>
                  <span className={`mt-1 ${hintClass}`}>{item.hint}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="rounded-2xl bg-neutral-50 p-1 dark:bg-neutral-950/40">
        <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-4">
          {checklist.map((item) => (
            <li key={item.id}>
              <Link
                href={item.href}
                aria-label={`${item.label}${item.done ? ", done" : ""}`}
                className="press flex items-center gap-2.5 rounded-xl px-3 py-2.5 no-underline"
              >
                <span
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                    item.done
                      ? "bg-emerald-600 text-white"
                      : "bg-white text-transparent shadow-[var(--shadow-border)] dark:bg-neutral-800",
                  )}
                  aria-hidden
                >
                  {item.done ? <CheckIcon /> : null}
                </span>
                <span
                  className={cn(
                    "text-sm",
                    item.done
                      ? "text-neutral-500"
                      : "font-medium text-neutral-900 dark:text-neutral-100",
                  )}
                >
                  {item.label}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className={sectionTitle}>Forms</h2>
            <Link href="/forms" className={`${btnSecondary} h-8 px-3 text-xs no-underline`}>
              All
              <span className="translate-x-px">
                <ChevronRightIcon />
              </span>
            </Link>
          </div>
          {forms.length === 0 ? (
            <p className={`${hintClass} rounded-2xl bg-neutral-50 px-4 py-8 text-center dark:bg-neutral-950/40`}>
              None yet. A form is an endpoint you point your own HTML at.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {forms.map((form) => (
                <li key={form.id}>
                  <Link
                    href={`/forms/${form.id}`}
                    className="row-hover surface flex items-center gap-3 rounded-2xl p-3 no-underline"
                  >
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-sm font-semibold text-blue-700 dark:bg-blue-950 dark:text-blue-200"
                      aria-hidden
                    >
                      {(form.name.trim()[0] ?? "F").toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-neutral-950 dark:text-white">
                        {form.name}
                      </span>
                      <span className={`block truncate font-mono ${hintClass}`}>/f/{form.publicId}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="flex items-center justify-end gap-1.5 text-xs text-neutral-500">
                        <span
                          className={`size-1.5 rounded-full ${form.active ? "bg-emerald-500" : "bg-neutral-300 dark:bg-neutral-600"}`}
                          aria-hidden
                        />
                        {form.active ? "Live" : "Paused"}
                      </span>
                      <span className={`block tabular-nums ${hintClass}`}>
                        {form.submissionCount}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className={sectionTitle}>Inbox</h2>
            <Link href="/inbox" className={`${btnSecondary} h-8 px-3 text-xs no-underline`}>
              All
              <span className="translate-x-px">
                <ChevronRightIcon />
              </span>
            </Link>
          </div>
          {submissions.length === 0 ? (
            <p className={`${hintClass} rounded-2xl bg-neutral-50 px-4 py-8 text-center dark:bg-neutral-950/40`}>
              Empty until someone submits. Copy a snippet from a form.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {submissions.map((row) => (
                <li key={row.id}>
                  <Link
                    href="/inbox"
                    className="row-hover surface flex items-center gap-3 rounded-2xl p-3 no-underline"
                  >
                    <span
                      className={`size-2 shrink-0 rounded-full ${row.status === "new" ? "bg-blue-600" : "bg-neutral-300 dark:bg-neutral-600"}`}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-neutral-950 dark:text-white">
                        {row.email ?? "(no email)"}
                      </span>
                      <span className={`block truncate ${hintClass}`}>{row.formName}</span>
                    </span>
                    <span className={`shrink-0 ${hintClass}`}>
                      <LocalTime timestamp={row.createdAt} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function InsightCard({ insight }: { insight: HomeInsight }) {
  const tone =
    insight.tone === "warning"
      ? "bg-amber-50 text-amber-950 dark:bg-amber-950/40 dark:text-amber-100"
      : insight.tone === "success"
        ? "bg-emerald-50 text-emerald-950 dark:bg-emerald-950/40 dark:text-emerald-100"
        : "bg-blue-50 text-blue-950 dark:bg-blue-950/40 dark:text-blue-100";

  const cta = insight.tone === "warning" ? btnSecondary : btnPrimary;

  return (
    <div className={`flex h-full flex-col rounded-2xl p-4 ${tone}`}>
      <p className="text-sm font-semibold">{insight.title}</p>
      <p className="mt-1 flex-1 text-xs leading-5 opacity-80">{insight.body}</p>
      <Link href={insight.href} className={`${cta} mt-4 self-start no-underline`}>
        {insight.cta}
        <span className="translate-x-px">
          <ArrowRightIcon />
        </span>
      </Link>
    </div>
  );
}

const QUICK_ICON = {
  inbox: InboxIcon,
  forms: FormsIcon,
  keys: KeysIcon,
  webhooks: WebhooksIcon,
  settings: SettingsIcon,
};
