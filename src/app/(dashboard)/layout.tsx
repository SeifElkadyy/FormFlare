import { requireUser } from "@/lib/auth/guard";
import { DashboardShell } from "@/components/shell";

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

  return <DashboardShell email={user.email}>{children}</DashboardShell>;
}
