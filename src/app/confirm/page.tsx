import { BrandMark } from "@/components/brand-mark";
import { authCardClass } from "@/lib/ui";
import { getEnv } from "@/lib/env";
import { confirmSignup } from "@/lib/waitlist/complete";
import { hostedPath } from "@/lib/waitlist/slug";

export const dynamic = "force-dynamic";

export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ s?: string; exp?: string; sig?: string }>;
}) {
  const { s, exp, sig } = await searchParams;
  const env = await getEnv();

  const submissionId = s ?? "";
  const expiry = Number(exp);
  const signature = sig ?? "";

  const result =
    submissionId && Number.isFinite(expiry) && signature
      ? await confirmSignup(env, submissionId, expiry, signature)
      : { ok: false as const, code: "invalid" as const };

  return (
    <div className="min-h-dvh bg-[#f4f6fb] dark:bg-neutral-950">
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center px-4 sm:px-6">
        <BrandMark href="/" />
      </header>
      <main className="flex justify-center px-6 py-24">
        <div className={`max-w-md text-center ${authCardClass}`}>
          {result.ok ? (
            <>
              <h1 className="text-2xl font-semibold tracking-tight">
                {result.already ? "You're already on the list." : "You're in."}
              </h1>
              {result.position !== null ? (
                <p className="mt-3 text-lg text-neutral-600 dark:text-neutral-400">
                  You&rsquo;re{" "}
                  <span className="font-semibold text-neutral-950 dark:text-white">
                    #{result.position}
                  </span>{" "}
                  on {result.formName}.
                </p>
              ) : (
                <p className="mt-3 text-sm text-neutral-500">Thanks for confirming.</p>
              )}
              {result.referralCode ? (
                <p className="mt-4 text-sm text-neutral-500">
                  Share your link:{" "}
                  <code className="break-all">
                    {hostedPath({ slug: null, publicId: result.formPublicId })}?ref=
                    {result.referralCode}
                  </code>
                </p>
              ) : null}
            </>
          ) : (
            <>
              <h1 className="text-2xl font-semibold tracking-tight">
                {result.code === "expired" ? "This link has expired." : "This link is not valid."}
              </h1>
              <p className="mt-3 text-sm text-neutral-500">
                {result.code === "expired"
                  ? "Submit the form again and we will send a new confirmation email."
                  : "The confirmation link may have been copied wrong, or this signup no longer exists."}
              </p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
