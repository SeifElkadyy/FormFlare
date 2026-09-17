import Link from "next/link";
import { requireUser } from "@/lib/auth/guard";
import { logoutAction } from "../login/actions";
import { BRAND } from "@/lib/brand";

/**
 * Dashboard shell.
 *
 * `force-dynamic` because the layout reads the session cookie: a statically
 * rendered shell would be served from cache without ever checking auth.
 */
export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // First of the two required checks. Every server action and route handler that
  // touches data calls requireUserForMutation() as well — a layout check alone does
  // not protect server actions, which are separately addressable POST endpoints.
  const user = await requireUser();

  return (
    <div className="min-h-full">
      <header className="border-b border-black/[.08] dark:border-white/[.145]">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-6">
            <span className="text-sm font-semibold">{BRAND.name}</span>
            <nav className="flex items-center gap-4 text-sm">
              <Link href="/inbox" className="text-zinc-600 hover:underline dark:text-zinc-400">
                Inbox
              </Link>
              <Link href="/forms" className="text-zinc-600 hover:underline dark:text-zinc-400">
                Forms
              </Link>
              <Link href="/webhooks" className="text-zinc-600 hover:underline dark:text-zinc-400">
                Webhooks
              </Link>
              <Link href="/api-keys" className="text-zinc-600 hover:underline dark:text-zinc-400">
                API keys
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-zinc-600 dark:text-zinc-400">{user.email}</span>
            <form action={logoutAction}>
              <button type="submit" className="text-sm text-zinc-600 underline dark:text-zinc-400">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}
