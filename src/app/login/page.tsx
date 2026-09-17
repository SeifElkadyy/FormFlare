import { redirect } from "next/navigation";
import { anyUserExists } from "@/lib/auth/setup";
import { currentUser } from "@/lib/auth/guard";
import { getEnv } from "@/lib/env";
import { AuthShell } from "@/components/shell";
import { LoginForm } from "./login-form";
import { authCardClass } from "@/lib/ui";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const env = await getEnv();

  if (!(await anyUserExists(env.DB))) redirect("/setup");
  if (await currentUser()) redirect("/inbox");

  return (
    <AuthShell>
      <div className={`max-w-sm ${authCardClass}`}>
        <h1 className="text-2xl font-semibold tracking-tight">Log in</h1>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          Use the admin account you created at setup.
        </p>
        <LoginForm />
      </div>
    </AuthShell>
  );
}
