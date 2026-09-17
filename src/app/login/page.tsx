import { redirect } from "next/navigation";
import { anyUserExists } from "@/lib/auth/setup";
import { currentUser } from "@/lib/auth/guard";
import { getEnv } from "@/lib/env";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const env = await getEnv();

  // Nothing to log into yet — send a fresh instance to setup instead of a dead form.
  if (!(await anyUserExists(env.DB))) redirect("/setup");
  if (await currentUser()) redirect("/inbox");

  return (
    <div className="mx-auto flex min-h-full w-full max-w-sm flex-col justify-center px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
      <LoginForm />
    </div>
  );
}
