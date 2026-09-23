"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandMark } from "./brand-mark";
import { FormsIcon, InboxIcon, LogOutIcon, SettingsIcon } from "./icons";
import { ThemeToggle } from "./theme";
import { btnIcon, cn } from "@/lib/ui";
import { logoutAction } from "@/app/login/actions";

/** Three places. Everything else lives inside a form or in Settings. */
const NAV = [
  { href: "/forms", label: "Forms", icon: FormsIcon },
  { href: "/inbox", label: "Inbox", icon: InboxIcon },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
] as const;

export function DashboardShell({
  email,
  banner,
  children,
}: {
  email: string;
  banner?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="flex h-dvh flex-col bg-white lg:flex-row dark:bg-neutral-950">
      {/* Desktop: a narrow sidebar. */}
      <aside className="hidden w-56 shrink-0 flex-col border-e border-neutral-200 bg-neutral-50 px-3 py-4 lg:flex dark:border-neutral-800 dark:bg-neutral-900/40">
        <div className="px-2 pb-6">
          <BrandMark href="/forms" size="sm" />
        </div>
        <nav aria-label="Main" className="flex flex-col gap-0.5">
          {NAV.map((item) => (
            <NavLink key={item.href} item={item} active={isActive(item.href)} />
          ))}
        </nav>
        <span className="flex-1" />
        <AccountRow email={email} />
      </aside>

      {/* Mobile: three items fit in a top bar, so no drawer. */}
      <header className="flex h-14 shrink-0 items-center gap-1 border-b border-neutral-200 px-3 lg:hidden dark:border-neutral-800">
        <BrandMark href="/forms" size="sm" iconOnly />
        <nav aria-label="Main" className="ms-2 flex flex-1 items-center gap-0.5">
          {NAV.map((item) => (
            <NavLink key={item.href} item={item} active={isActive(item.href)} compact />
          ))}
        </nav>
        <ThemeToggle />
        <SignOutButton />
      </header>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {banner}
        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}

function NavLink({
  item,
  active,
  compact = false,
}: {
  item: (typeof NAV)[number];
  active: boolean;
  compact?: boolean;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm no-underline",
        active
          ? "bg-neutral-200/70 font-medium text-ink dark:bg-neutral-800 dark:text-mist"
          : "text-neutral-600 hover:bg-neutral-100 hover:text-ink dark:text-neutral-400 dark:hover:bg-neutral-800/60 dark:hover:text-mist",
      )}
    >
      {compact ? null : <Icon />}
      {item.label}
    </Link>
  );
}

function AccountRow({ email }: { email: string }) {
  return (
    <div className="flex items-center gap-1 border-t border-neutral-200 pt-3 dark:border-neutral-800">
      <p className="min-w-0 flex-1 truncate px-2 text-xs text-neutral-500" title={email}>
        {email}
      </p>
      <ThemeToggle />
      <SignOutButton />
    </div>
  );
}

function SignOutButton() {
  return (
    <form action={logoutAction}>
      <button
        type="submit"
        className={cn(btnIcon, "size-9")}
        aria-label="Sign out"
        title="Sign out"
      >
        <LogOutIcon />
      </button>
    </form>
  );
}

/** Login and setup. No nav: there is nothing to go to before you are signed in. */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-neutral-50 text-ink dark:bg-neutral-950 dark:text-mist">
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <BrandMark href="/login" />
        <ThemeToggle />
      </header>
      <div className="flex justify-center px-4 py-12">{children}</div>
    </div>
  );
}
