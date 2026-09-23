import { redirect } from "next/navigation";
import { anyUserExists } from "@/lib/auth/setup";
import { currentUser } from "@/lib/auth/guard";
import { getEnv } from "@/lib/env";
import { AuthShell } from "@/components/shell";
import { LoginForm } from "./login-form";
import { authCardClass } from "@/lib/ui";
import { UPSTREAM_REPO } from "@/lib/version";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const env = await getEnv();

  if (!(await anyUserExists(env.DB))) redirect("/setup");
  if (await currentUser()) redirect("/home");

  return (
    <AuthShell>
      <div className={`max-w-sm ${authCardClass}`}>
        <h1 className="text-2xl font-semibold tracking-tight">Log in</h1>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          Use the admin account you created at setup.
        </p>
        <LoginForm />
        {/* The one symptom a second install with default resource names shows: it reuses
            the first install's database, so there is already an owner and no /setup. */}
        <p className="mt-6 text-xs leading-5 text-slate">
          Just deployed and never saw setup? This copy may share a database with another FormFlare
          in the same Cloudflare account.{" "}
          <a
            href={`https://github.com/${UPSTREAM_REPO}/blob/main/docs/troubleshooting.md#deploy-fails-with-already-has-a-consumer-or-limit-of-5-cron-triggers`}
          >
            How to fix it
          </a>
        </p>
      </div>
    </AuthShell>
  );
}
