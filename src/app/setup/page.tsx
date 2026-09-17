import { notFound } from "next/navigation";
import { getEnv, getServices } from "@/lib/env";
import { isSetupCompleted } from "@/lib/db/settings";
import { anyUserExists } from "@/lib/auth/setup";
import { runSystemChecks } from "@/lib/setup/checks";
import { setupTokenOk } from "@/lib/auth/setup-token";
import { AuthShell } from "@/components/shell";
import { cardClass, pillClass } from "@/lib/ui";
import { SetupForm } from "./setup-form";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = { ok: "Ready", warn: "Warning", fail: "Blocked" };

export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const env = await getEnv();
  const { db } = await getServices();

  // First-run lock: once an owner exists, /setup is gone for good.
  if ((await isSetupCompleted(db)) || (await anyUserExists(env.DB))) notFound();

  // Optional gate. When SETUP_TOKEN is unset this always passes.
  const { token } = await searchParams;
  if (!setupTokenOk(env.SETUP_TOKEN, token)) notFound();

  const checks = await runSystemChecks(env);
  const blocked = checks.some((c) => c.status === "fail");

  return (
    <AuthShell>
      <div className="w-full max-w-2xl">
        <h1 className="text-2xl font-semibold tracking-tight">Set up FormFlare</h1>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">This runs once. Afterwards this page is disabled.</p>

        <section className="mt-8">
          <h2 className="text-sm font-medium text-neutral-500">System check</h2>
          <ul className="mt-3 flex flex-col gap-3">
            {checks.map((check) => (
              <li key={check.name} className={cardClass}>
                <div className="flex items-baseline gap-2">
                  <span className={pillClass}>{STATUS_LABEL[check.status] ?? check.status}</span>
                  <span className="font-medium">{check.name}</span>
                </div>
                <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{check.detail}</p>
                {check.fix ? (
                  <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
                    <span className="font-medium text-neutral-900 dark:text-neutral-100">Fix:</span> {check.fix}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-8 rounded-2xl bg-white p-6 shadow-[var(--shadow-border)] dark:bg-neutral-900">
          <h2 className="text-sm font-medium text-neutral-500">Create your admin account</h2>
          {blocked ? (
            <p className="mt-3 text-sm leading-6 text-neutral-500">
              Fix the failing checks above, redeploy, then reload this page.
            </p>
          ) : (
            <SetupForm token={token} />
          )}
        </section>
      </div>
    </AuthShell>
  );
}
