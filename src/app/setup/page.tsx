import { notFound } from "next/navigation";
import { getEnv, getServices } from "@/lib/env";
import { isSetupCompleted } from "@/lib/db/settings";
import { anyUserExists } from "@/lib/auth/setup";
import { runSystemChecks } from "@/lib/setup/checks";
import { setupTokenOk } from "@/lib/auth/setup-token";
import { SetupForm } from "./setup-form";

export const dynamic = "force-dynamic";

const STATUS_MARK: Record<string, string> = { ok: "✅", warn: "⚠️", fail: "❌" };

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
    <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col justify-center px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Set up Formflare</h1>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">
        This runs once. Afterwards this page is disabled.
      </p>

      <section className="mt-8">
        <h2 className="text-sm font-medium text-zinc-600 dark:text-zinc-400">System check</h2>
        <ul className="mt-3 space-y-3">
          {checks.map((check) => (
            <li
              key={check.name}
              className="rounded-lg border border-black/[.08] p-4 dark:border-white/[.145]"
            >
              <div className="flex items-baseline gap-2">
                <span aria-hidden>{STATUS_MARK[check.status]}</span>
                <span className="font-medium">{check.name}</span>
              </div>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{check.detail}</p>
              {check.fix && (
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                  <span className="font-medium">Fix:</span> {check.fix}
                </p>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
          Create your admin account
        </h2>
        {blocked ? (
          <p className="mt-3 rounded-lg border border-black/[.08] p-4 text-sm text-zinc-600 dark:border-white/[.145] dark:text-zinc-400">
            Fix the failing checks above, redeploy, then reload this page.
          </p>
        ) : (
          <SetupForm token={token} />
        )}
      </section>
    </div>
  );
}
