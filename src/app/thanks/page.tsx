import { BRAND } from "@/lib/brand";
import { BrandMark } from "@/components/brand-mark";
import { authCardClass } from "@/lib/ui";
import { FrameHeight } from "@/components/frame-height";

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
  searchParams: Promise<{ pos?: string; form?: string; pending?: string; embed?: string }>;
}) {
  const { pos, pending, embed } = await searchParams;
  const framed = embed === "1";
  const position = pos && /^\d{1,9}$/.test(pos) ? Number(pos) : null;
  const needsConfirm = pending === "1";

  return (
    <div className={framed ? "bg-white p-4 dark:bg-ink" : "min-h-dvh bg-mist dark:bg-ink"}>
      {framed ? (
        <FrameHeight />
      ) : (
        <header className="mx-auto flex h-16 w-full max-w-6xl items-center px-4 sm:px-6">
          <BrandMark href="/" />
        </header>
      )}
      <main className={framed ? "flex justify-center py-8" : "flex justify-center px-6 py-24"}>
        <div className={`max-w-md text-center ${framed ? "" : authCardClass}`}>
          <h1 className="text-2xl font-semibold tracking-tight">
            {needsConfirm ? "Check your email." : "Thanks — we got it."}
          </h1>
          {needsConfirm ? (
            <p className="mt-3 text-lg text-neutral-600 dark:text-neutral-400">
              Confirm the link we sent and we&rsquo;ll lock in your spot.
            </p>
          ) : position !== null ? (
            <p className="mt-3 text-lg text-neutral-600 dark:text-neutral-400">
              You&rsquo;re{" "}
              <span className="font-semibold text-neutral-950 dark:text-white">#{position}</span> on
              the list.
            </p>
          ) : null}
          <p className="mt-4 text-sm text-neutral-500">
            {framed ? "" : "You can close this tab. "}Powered by {BRAND.name}.
          </p>
        </div>
      </main>
    </div>
  );
}
