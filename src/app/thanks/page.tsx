import { BRAND } from "@/lib/brand";

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

  // Query strings are user-controlled: only render a plain positive integer.
  const position = pos && /^\d{1,9}$/.test(pos) ? Number(pos) : null;

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-24">
      <main className="w-full max-w-md space-y-4 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Thanks — we got it.</h1>

        {position !== null && (
          <p className="text-lg text-zinc-600 dark:text-zinc-400">
            You&rsquo;re <span className="font-semibold">#{position}</span> on the list.
          </p>
        )}

        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          You can close this tab. Powered by {BRAND.name}.
        </p>
      </main>
    </div>
  );
}
