/// <reference types="@cloudflare/vitest-plugin/types" />

/**
 * Test-only bindings.
 *
 * `BUCKET` is optional in production — R2 is opt-in, because activating it requires a
 * payment method on the Cloudflare account — so it is not in `wrangler.jsonc` and
 * `wrangler types` does not generate it. Tests bind one through `vitest.config.mts`,
 * and declare it non-optional here so the upload paths can be exercised without a null
 * check in every test.
 */
declare namespace Cloudflare {
  interface Env {
    BUCKET: R2Bucket;
  }
}
