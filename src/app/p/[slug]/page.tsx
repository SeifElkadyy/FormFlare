import { notFound } from "next/navigation";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { recordView } from "@/lib/insights/form";
import { SETTING, getSetting } from "@/lib/db/settings";
import { FILL_TOKEN_FIELD, signFillToken } from "@/lib/spam/filter";
import { getServices } from "@/lib/env";
import { loadHostedForm } from "@/lib/submissions/form-cache";
import { effectiveFields } from "@/lib/submissions/fields";
import { FormFields } from "@/components/form-fields";
import { authCardClass, btnPrimary, hintClass } from "@/lib/ui";
import { BRAND } from "@/lib/brand";
import { FrameHeight } from "@/components/frame-height";

export const dynamic = "force-dynamic";

export default async function HostedFormPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ref?: string; embed?: string }>;
}) {
  const { slug } = await params;
  const { ref, embed } = await searchParams;
  const { db } = await getServices();
  const form = await loadHostedForm(db, slug);

  if (!form || !form.active) notFound();

  // Off the render path: a failed counter must never cost a visitor the form.
  const { env, ctx } = await getCloudflareContext({ async: true });
  ctx.waitUntil(recordView((env as CloudflareEnv).DB, form.id).catch(() => {}));

  const fields = effectiveFields(form.fieldsJson, form.mode);
  // When the page was rendered, signed: a submit sooner than a person could type is spam.
  const fillToken = await signFillToken((await getSetting(db, SETTING.sessionSecret)) ?? "");
  const framed = embed === "1";
  // `?embed=1` on the endpoint carries through to /thanks so it renders compact. A form
  // with its own redirect leaves the iframe: the owner's page is unlikely to allow framing.
  const endpoint = `/f/${form.publicId}${framed ? "?embed=1" : ""}`;
  const target = framed && form.redirectUrl ? "_top" : undefined;

  return (
    <div
      className={
        framed
          ? "min-h-0 bg-white p-4 dark:bg-neutral-950"
          : "flex min-h-dvh flex-col items-center justify-center gap-6 bg-neutral-50 px-4 py-12 dark:bg-neutral-950"
      }
    >
      {framed ? <FrameHeight /> : null}
      <main className={`w-full max-w-md ${framed ? "" : authCardClass}`}>
        <h1 className="text-xl font-semibold tracking-tight">{form.name}</h1>
        {form.hostedDescription || form.mode === "waitlist" ? (
          <p className="mt-2 text-sm leading-6 text-neutral-600 dark:text-neutral-400">
            {form.hostedDescription || "Join the waitlist."}
          </p>
        ) : null}

        <form
          action={endpoint}
          method="POST"
          target={target}
          // Without multipart the browser sends only the file name, never the file.
          encType={fields.some((f) => f.type === "file") ? "multipart/form-data" : undefined}
          className="mt-6 flex flex-col gap-4"
        >
          <input
            type="text"
            name={form.honeypotField}
            className="hidden"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden
          />
          <input type="hidden" name={FILL_TOKEN_FIELD} value={fillToken} />
          {ref ? <input type="hidden" name="_ref" value={ref} /> : null}

          <FormFields fields={fields} />

          {form.turnstileSiteKey ? (
            <>
              <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />
              <div className="cf-turnstile" data-sitekey={form.turnstileSiteKey} />
            </>
          ) : null}

          <button type="submit" className={btnPrimary}>
            {form.mode === "waitlist" ? "Join waitlist" : "Send"}
          </button>
        </form>
      </main>
      {framed ? null : <p className={hintClass}>Powered by {BRAND.name}</p>}
    </div>
  );
}
