/**
 * Stable FormFlare tags only: vMAJOR.MINOR.PATCH.
 *
 * Pre-release suffixes are ignored rather than ordered. `Number("0-beta")` is NaN
 * and every NaN comparison is false, so a tag like `v0.2.0-beta.1` would otherwise
 * compare as equal to `v0.2.0`. Same rule as `scripts/check-update.mjs`.
 */
const STABLE_TAG = /^v?\d+\.\d+\.\d+$/;

export function isStableTag(tag: string): boolean {
  return STABLE_TAG.test(tag.trim());
}

/** Numeric per component, so v0.10.0 beats v0.9.0. Callers must filter with isStableTag. */
export function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/, "").split(".").map(Number);
  const pb = b.replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  }
  return 0;
}
