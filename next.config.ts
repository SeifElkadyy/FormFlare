import type { NextConfig } from "next";

/**
 * Security headers for dashboard pages.
 *
 * Applied via `headers()` rather than middleware, because middleware is skippable and
 * these need to hold on every response.
 *
 * ⚠️ CSP notes, verified against a real build rather than assumed:
 *
 * - **`'unsafe-inline'` in `script-src` is required.** Next.js App Router inlines
 *   hydration bootstrap and flight data as inline `<script>` tags. A nonce-based policy
 *   would need a nonce threaded through every response, which OpenNext's static
 *   rendering cannot supply — the pages would render but never hydrate, so every form
 *   silently stops working. Tightening this needs `next.config` nonce support plus
 *   fully dynamic rendering; noted as a follow-up rather than shipped broken.
 * - **`'unsafe-eval'` is development-only.** React uses `eval()` in `next dev` to
 *   reconstruct server-side error stacks in the browser. Production React never calls
 *   `eval()`, and neither does the OpenNext/workerd build, so the production policy
 *   stays without it.
 * - **Turnstile needs `challenges.cloudflare.com`** in `script-src` and `frame-src`, or
 *   the widget cannot load and no form with a captcha can be submitted.
 *
 * `frame-ancestors 'none'` is the one that matters most here: it stops the dashboard
 * being framed for clickjacking, and unlike `X-Frame-Options` it cannot be bypassed.
 */
const isDev = process.env.NODE_ENV === "development";

const CSP = [
  "default-src 'self'",
  // See the notes above: Next's inline hydration scripts require 'unsafe-inline'.
  // React's dev-only eval() for error stacks requires 'unsafe-eval' under `next dev`.
  [
    "script-src 'self' 'unsafe-inline'",
    isDev ? "'unsafe-eval'" : null,
    "https://challenges.cloudflare.com",
  ]
    .filter(Boolean)
    .join(" "),
  // Tailwind injects styles at runtime in dev; inline styles are low risk here.
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  // Same-origin API calls only; Turnstile verification happens server-side.
  "connect-src 'self'",
  "frame-src https://challenges.cloudflare.com",
  "object-src 'none'",
  "base-uri 'self'",
  // Submissions post to this origin; a form posting anywhere else is an attack.
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CSP },
  // Redundant with frame-ancestors for modern browsers, kept for older ones.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Don't leak dashboard URLs (which contain form and submission ids) to other sites.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

/*
 * Framable, and `form-action` also allows https: — Chrome applies form-action to the 303
 * that follows a submit, so a form redirecting to the owner's own site would otherwise be
 * blocked. These pages render owner-configured content only, never submitter input.
 */
const PUBLIC_PAGE_HEADERS = [
  {
    key: "Content-Security-Policy",
    value: CSP.replace("frame-ancestors 'none'", "frame-ancestors *").replace(
      "form-action 'self'",
      "form-action 'self' https:",
    ),
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        /*
         * Everything except the public submission endpoint and the public pages below.
         * `/f/:id` is handled in worker.ts before Next sees it.
         */
        source: "/((?!f/|p/|thanks).*)",
        headers: SECURITY_HEADERS,
      },
      // `/p/:slug` is iframed onto other sites by the embed widget, and `/thanks` is where
      // that iframe lands after a submit. Neither has anything worth clickjacking.
      { source: "/p/:path*", headers: PUBLIC_PAGE_HEADERS },
      { source: "/thanks", headers: PUBLIC_PAGE_HEADERS },
    ];
  },
};

export default nextConfig;

// Makes Cloudflare bindings available via getCloudflareContext() during `next dev`.
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

initOpenNextCloudflareForDev();
