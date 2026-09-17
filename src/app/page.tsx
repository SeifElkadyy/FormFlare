import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { anyUserExists } from "@/lib/auth/setup";
import { getEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function Home() {
  const env = await getEnv();
  const configured = await anyUserExists(env.DB);

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-24">
      <main className="w-full max-w-xl space-y-6">
        <h1 className="text-3xl font-semibold tracking-tight">{BRAND.name}</h1>
        <p className="text-lg leading-8 text-zinc-600 dark:text-zinc-400">{BRAND.tagline}</p>

        {configured ? (
          <Link href="/login" className="inline-block text-sm underline">
            Sign in
          </Link>
        ) : (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            This instance has not been set up yet.{" "}
            <Link href="/setup" className="underline">
              Create your admin account
            </Link>
            .
          </p>
        )}
      </main>
    </div>
  );
}
