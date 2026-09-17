/**
 * Optional runtime secrets.
 *
 * These are NOT declared in `wrangler.jsonc`, so `wrangler types` does not generate
 * them. They are optional by design: FormFlare must deploy with zero required
 * secrets (design principle 1), so every entry here has to be `?` and every code
 * path must work when it is undefined.
 */
declare global {
  interface CloudflareEnv {
    /**
     * When set, `/setup` requires this token. When unset (the default), setup is
     * protected only by the first-run lock. Stays commented in `.dev.vars.example`
     * so the deploy button never prompts for it.
     */
    SETUP_TOKEN?: string;
  }
}

export {};
