import { BRAND } from "@/lib/brand";
import { BrandMark } from "@/components/brand-mark";
import { authCardClass } from "@/lib/ui";

/**
 * Default post-submission page, used when a form has no redirect configured.
 *
 * Deliberately reads nothing from the database: it is shown to the public on every
 * submission, and `pos` is already known to the submitter. Rendering the number from
 * the query string keeps this page static and unauthenticated.
 */
export default async function ThanksPage({
  searchParams,
}: {
  searchParams: Promise<{ pos?: string; form?: string }>;
}) {
  const { pos } = await searchParams;
  const position = pos && /^\d{1,9}$/.test(pos) ? Number(pos) : null;

  return (
    <div className="min-h-dvh bg-[#f4f6fb] dark:bg-neutral-950">
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center px-4 sm:px-6">
        <BrandMark href="/" />
      </header>
      <main className="flex justify-center px-6 py-24">
        <div className={`max-w-md text-center ${authCardClass}`}>
          <h1 className="text-2xl font-semibold tracking-tight">Thanks — we got it.</h1>
          {position !== null ? (
            <p className="mt-3 text-lg text-neutral-600 dark:text-neutral-400">
              You&rsquo;re <span className="font-semibold text-neutral-950 dark:text-white">#{position}</span>{" "}
              on the list.
            </p>
          ) : null}
          <p className="mt-4 text-sm text-neutral-500">You can close this tab. Powered by {BRAND.name}.</p>
        </div>
      </main>
    </div>
  );
}
