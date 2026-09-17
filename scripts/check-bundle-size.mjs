#!/usr/bin/env node
/**
 * Fail the build if the Worker bundle grows unreasonably.
 *
 * Cloudflare's limit is **64 MiB uncompressed**, on every plan, since 2026-09-04 — the
 * old 3 MB (Free) / 10 MB (Paid) *compressed* limits were removed. FormFlare is nowhere
 * near that, so this is not a deploy gate; it is a regression alarm. A bundle that
 * suddenly doubles usually means a heavy dependency was pulled into the Worker by
 * accident, which costs startup time (a hard 1-second limit) long before it costs size.
 *
 * Thresholds are deliberately far below the platform limit so this fires while the cause
 * is still obvious.
 *
 * Usage: node scripts/check-bundle-size.mjs
 * Requires `opennextjs-cloudflare build` to have run.
 */
import { spawnSync } from "node:child_process";

/** Cloudflare's actual limit, for reference in the output. */
const PLATFORM_LIMIT_MIB = 64;

/**
 * Our own ceiling, well under the platform's 64 MiB.
 *
 * Raised from 14,000 once Phase 5 took the bundle to ~8,600 KiB: route count went from
 * 5 to 12, and each App Router page pulls its own SSR chunk. That is our code growing as
 * intended, not a regression — but it left only 38% headroom, which would have started
 * false-alarming on the next feature.
 */
const MAX_UNCOMPRESSED_KIB = 20_000;

/** Free-plan asset-count limit is 20,000; warn well before that. */
const MAX_ASSETS = 5_000;

const result = spawnSync("npx", ["wrangler", "deploy", "--dry-run"], {
  encoding: "utf8",
  stdio: ["inherit", "pipe", "pipe"],
});

const output = `${result.stdout}\n${result.stderr}`;

if (result.status !== 0) {
  console.error("bundle size check: wrangler dry-run failed\n");
  console.error(output);
  process.exit(1);
}

// "Total Upload: 6537.17 KiB / gzip: 1310.71 KiB"
const match = output.match(/Total Upload:\s*([\d.]+)\s*KiB\s*\/\s*gzip:\s*([\d.]+)\s*KiB/);
if (!match) {
  console.error("bundle size check: could not parse wrangler output\n");
  console.error(output);
  process.exit(1);
}

const uncompressedKiB = Number(match[1]);
const gzipKiB = Number(match[2]);

const assetsMatch = output.match(/Read (\d+) files from the assets directory/);
const assetCount = assetsMatch ? Number(assetsMatch[1]) : 0;

const pct = ((uncompressedKiB / 1024 / PLATFORM_LIMIT_MIB) * 100).toFixed(1);

console.log(`Worker bundle`);
console.log(
  `  uncompressed : ${uncompressedKiB.toFixed(0)} KiB  (${pct}% of the ${PLATFORM_LIMIT_MIB} MiB platform limit)`,
);
console.log(`  gzip         : ${gzipKiB.toFixed(0)} KiB  (reference only — no longer a limit)`);
console.log(`  assets       : ${assetCount}`);
console.log(`  ceiling      : ${MAX_UNCOMPRESSED_KIB} KiB uncompressed, ${MAX_ASSETS} assets`);

let failed = false;

if (uncompressedKiB > MAX_UNCOMPRESSED_KIB) {
  console.error(
    `\n❌ Bundle is ${uncompressedKiB.toFixed(0)} KiB, over the ${MAX_UNCOMPRESSED_KIB} KiB ceiling.\n` +
      `   Still far below Cloudflare's ${PLATFORM_LIMIT_MIB} MiB limit, but this much growth\n` +
      `   usually means a heavy dependency landed in the Worker. Check startup time too —\n` +
      `   that has a hard 1-second limit and bites earlier than size.\n` +
      `   Inspect with: npx wrangler deploy --dry-run --outdir dist && du -sh dist/*`,
  );
  failed = true;
}

if (assetCount > MAX_ASSETS) {
  console.error(
    `\n❌ ${assetCount} assets, over the ${MAX_ASSETS} ceiling (free plan allows 20,000).`,
  );
  failed = true;
}

if (failed) process.exit(1);
console.log("\n✅ within limits");
