"use client";

import type { ReactNode } from "react";
import { Suspense, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { BrandMark } from "./brand-mark";
import {
  CloseIcon,
  FormsIcon,
  InboxIcon,
  KeysIcon,
  MenuIcon,
  PlusIcon,
  SearchIcon,
  WebhooksIcon,
} from "./icons";
import { ThemeToggle } from "./theme";
import { btnPrimary, btnPrimaryLead, btnSecondary, cn } from "@/lib/ui";
import { logoutAction } from "@/app/login/actions";

const NAV = [
  {
    label: "Collect",
    items: [
      { href: "/inbox", label: "Inbox", icon: InboxIcon, match: "/inbox" },
      { href: "/forms", label: "Forms", icon: FormsIcon, match: "/forms" },
    ],
  },
  {
    label: "Connect",
    items: [
      { href: "/webhooks", label: "Webhooks", icon: WebhooksIcon, match: "/webhooks" },
      { href: "/api-keys", label: "API keys", icon: KeysIcon, match: "/api-keys" },
    ],
  },
] as const;

export function DashboardShell({
  email,
  children,
}: {
  email: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const initial = (email.trim()[0] ?? "F").toUpperCase();

  return (
    <div className="flex h-dvh gap-3 bg-[#f4f6fb] p-3 dark:bg-neutral-950">
      <aside className="hidden min-h-0 w-56 shrink-0 flex-col lg:flex">
        <SidebarNav email={email} initial={initial} pathname={pathname} />
      </aside>

      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-neutral-900/30"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
          />
          <aside className="relative z-50 h-full w-64 overflow-y-auto bg-[#f4f6fb] p-3 dark:bg-neutral-950">
            <div className="mb-2 flex justify-end">
            <button
                type="button"
                className="press flex h-9 w-9 items-center justify-center rounded-lg text-neutral-600"
                aria-label="Close menu"
                onClick={() => setOpen(false)}
              >
                <CloseIcon />
              </button>
            </div>
            <SidebarNav
              email={email}
              initial={initial}
              pathname={pathname}
              onNavigate={() => setOpen(false)}
            />
          </aside>
        </div>
      ) : null}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[20px] bg-white shadow-[var(--shadow-border)] dark:bg-neutral-900">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-neutral-100 px-4 dark:border-neutral-800">
          <button
            type="button"
            className="press flex h-9 w-9 items-center justify-center rounded-lg text-neutral-600 lg:hidden"
            aria-label="Open menu"
            onClick={() => setOpen(true)}
          >
            <MenuIcon />
          </button>

          <Suspense fallback={<SearchFallback />}>
            <ShellSearch />
          </Suspense>

          <ThemeToggle className="ml-auto" />
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}

function SidebarNav({
  email,
  initial,
  pathname,
  onNavigate,
}: {
  email: string;
  initial: string;
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex min-h-full flex-col" aria-label="Dashboard">
      <div className="px-1 pb-4">
        <BrandMark href="/inbox" size="sm" />
      </div>

      <Link
        href="/forms?new=1"
        onClick={onNavigate}
        className={`${btnPrimaryLead} mb-6 no-underline`}
      >
        <PlusIcon />
        New form
      </Link>

      {NAV.map((group) => (
        <div key={group.label} className="mb-6">
          <p className="mb-2 px-2.5 text-[11px] font-medium uppercase tracking-wide text-neutral-400">
            {group.label}
          </p>
          <div className="flex flex-col gap-1">
            {group.items.map((item) => {
              const active = pathname === item.match || pathname.startsWith(`${item.match}/`);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  className={cn(
                    "flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm no-underline",
                    active
                      ? "bg-white font-medium text-blue-700 shadow-[var(--shadow-border)] dark:bg-neutral-800 dark:text-blue-200"
                      : "row-hover text-neutral-600 dark:text-neutral-300",
                  )}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon />
                  <span className="flex-1">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}

      <span className="flex-1" />

      <div className="rounded-2xl bg-white p-2 shadow-[var(--shadow-border)] dark:bg-neutral-900">
        <div className="flex items-center gap-2 px-1 py-1">
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-xs font-semibold text-white"
            aria-hidden
          >
            {initial}
          </div>
          <p className="min-w-0 flex-1 truncate text-xs text-neutral-600 dark:text-neutral-300" title={email}>
            {email}
          </p>
        </div>
        <form action={logoutAction}>
          <button
            type="submit"
            className="press mt-1 w-full rounded-lg px-2 py-1.5 text-left text-xs font-medium text-neutral-500"
          >
            Sign out
          </button>
        </form>
      </div>
    </nav>
  );
}

function SearchFallback() {
  return (
    <div className="surface flex h-9 max-w-md flex-1 items-center gap-2 rounded-lg bg-neutral-50 px-3 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
      <SearchIcon className="size-4" />
      <span className="text-sm text-neutral-400">Search submissions</span>
    </div>
  );
}

function ShellSearch() {
  const pathname = usePathname();
  const params = useSearchParams();
  const inbox = pathname === "/inbox";
  const q = inbox ? (params.get("q") ?? "") : "";

  return (
    <form
      method="GET"
      action="/inbox"
      role="search"
      className="surface flex h-9 max-w-md flex-1 items-center gap-2 rounded-lg bg-neutral-50 px-3 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400"
    >
      {inbox ? (
        <>
          {["form", "status", "from", "to"].map((key) => {
            const value = params.get(key);
            return value ? <input key={key} type="hidden" name={key} value={value} /> : null;
          })}
        </>
      ) : null}
      <SearchIcon className="size-4" />
      <input
        name="q"
        type="search"
        key={q}
        defaultValue={q}
        placeholder="Search submissions"
        className="h-full min-w-0 flex-1 border-none bg-transparent text-sm text-neutral-800 shadow-none outline-none placeholder:text-neutral-400 dark:text-neutral-100"
      />
    </form>
  );
}

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-[#f4f6fb] text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <BrandMark href="/" />
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Link href="/login" className={`${btnSecondary} no-underline`}>
            Log in
          </Link>
          <Link href="/setup" className={`${btnPrimary} no-underline`}>
            Create account
          </Link>
        </div>
      </header>
      <div className="flex justify-center px-4 py-12">{children}</div>
    </div>
  );
}
