/**
 * Optional bindings and secrets.
 *
 * These are NOT declared in `wrangler.jsonc`, so `wrangler types` does not generate
 * them. Each is optional by design, and every code path must work when it is undefined.
 *
 * This file is a global script, not a module — no imports or exports — because
 * `cloudflare-env.d.ts` declares `CloudflareEnv` at global scope, and interface merging
 * only works from the same scope.
 */
interface CloudflareEnv {
  /**
   * When set, `/setup` requires this token. When unset (the default), setup is
   * protected only by the first-run lock. Stays commented in `.dev.vars.example` so the
   * deploy button never prompts for it.
   */
  SETUP_TOKEN?: string;

  /**
   * R2 bucket for uploaded files. **Optional.**
   *
   * Not in `wrangler.jsonc`, because activating R2 requires a payment method on the
   * Cloudflare account even inside the free tier — listing it would make the Deploy
   * button demand a card before anyone could finish. Add the binding yourself to enable
   * file uploads; everything else works without it.
   */
  BUCKET?: R2Bucket;
}
