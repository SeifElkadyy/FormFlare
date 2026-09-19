/**
 * Product name, tagline, and palette hex.
 * Keep `BRAND.colors` in sync with the CSS tokens in `src/app/globals.css`.
 * Renaming still also needs `wrangler.jsonc` and `package.json`.
 */
export const BRAND = {
  name: "FormFlare",
  tagline: "Forms and waitlists for any website — self-hosted on your own Cloudflare account.",
  colors: {
    ink: "#050505",
    flare: "#FF6A00",
    mist: "#F5F5F5",
    slate: "#9CA3AF",
  },
} as const;
