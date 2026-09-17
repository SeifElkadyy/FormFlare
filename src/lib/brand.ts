/**
 * Single source of truth for the product name.
 * Renaming the project should only require editing this file,
 * `wrangler.jsonc` (name + resource names) and `package.json`.
 */
export const BRAND = {
  name: "FormFlare",
  tagline: "Forms and waitlists for any website — self-hosted on your own Cloudflare account.",
} as const;
