import { headers } from "next/headers";
import { requireUser } from "@/lib/auth/guard";
import { getServices } from "@/lib/env";
import { rememberInstanceUrl } from "@/lib/instance/url";
import { getUpdateStatus } from "@/lib/update/check";
import { DashboardShell } from "@/components/shell";
import { UpdateBanner } from "@/components/update-banner";

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
  const { db } = await getServices();
  const headerList = await headers();
  await rememberInstanceUrl(db, headerList.get("host"));
  const update = await getUpdateStatus(db);

  return (
    <DashboardShell
      email={user.email}
      banner={
        update.newer && update.latest ? (
          <UpdateBanner latest={update.latest} htmlUrl={update.htmlUrl} />
        ) : null
      }
    >
      {children}
    </DashboardShell>
  );
}
