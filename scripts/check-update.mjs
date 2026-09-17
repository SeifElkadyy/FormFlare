#!/usr/bin/env node
// Brings a deployed copy of FormFlare up to the latest upstream release.
//
// Deployers get their repository from the "Deploy to Cloudflare" button, which
// *clones* rather than forks: there is no upstream remote and — as far as we can
// tell — no shared history, so `git merge` has nothing to stand on. Instead we
// fetch the two release tags by URL, diff them, and replay that patch onto the
// deployer's own main. That works whether or not the histories are related, and
// it keeps every local customisation, because the deployer's commits stay the
// base.
//
// Anything that cannot be applied cleanly is left out of the commit and recorded
// in .formflare/pending-updates.json, so it is reported again on every later run
// until a human deals with it.
//
// Runs in GitHub Actions (see .github/workflows/update-check.yml) but is a plain
// script: `node scripts/check-update.mjs --dry-run` works locally too.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const UPSTREAM = process.env.FORMFLARE_UPSTREAM ?? "https://github.com/SeifElkadyy/FormFlare.git";
const UPSTREAM_REPO = process.env.FORMFLARE_UPSTREAM_REPO ?? "SeifElkadyy/FormFlare";
const PENDING_FILE = ".formflare/pending-updates.json";
const BRANCH = "upstream-update";

const dryRun = process.argv.includes("--dry-run");

function git(args, opts = {}) {
  return execFileSync("git", args, { encoding: "utf8", ...opts }).trim();
}

/**
 * git output kept byte-for-byte. A binary patch is terminated by a blank line
 * that `.trim()` removes, and git then rejects the result as "corrupt binary
 * patch" — so patches must never go through git().
 */
function gitRaw(args, opts = {}) {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, ...opts });
}

/** git that is allowed to fail (conflicts are an expected outcome, not a crash). */
function gitTry(args) {
  try {
    return { ok: true, out: git(args, { stdio: ["ignore", "pipe", "pipe"] }) };
  } catch (error) {
    return { ok: false, out: `${error.stdout ?? ""}${error.stderr ?? ""}` };
  }
}

function lines(value) {
  return value.split("\n").filter(Boolean);
}

/**
 * FormFlare tags stable releases only: vMAJOR.MINOR.PATCH, nothing else.
 *
 * Anything with a pre-release suffix is ignored rather than ordered. Comparing
 * "0.2.0-beta.1" numerically yields NaN, and every NaN comparison is false, so a
 * pre-release would silently read as *equal* to the stable release of the same
 * number and could be picked as latest. Refusing to parse it is the honest
 * option — ordering pre-releases properly is real semver work that buys nothing
 * here, since we do not publish them.
 */
const STABLE_TAG = /^v?\d+\.\d+\.\d+$/;

function isStable(tag) {
  return STABLE_TAG.test(tag.trim());
}

/**
 * Compare two stable tags. Numeric per component, so v0.10.0 correctly beats
 * v0.9.0 (a string compare would not). Callers must filter with isStable first.
 */
function compareVersions(a, b) {
  const pa = a.replace(/^v/, "").split(".").map(Number);
  const pb = b.replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  }
  return 0;
}

async function githubJson(path) {
  const headers = { accept: "application/vnd.github+json", "user-agent": "formflare-updater" };
  // The token is only needed for rate limits on public reads; absence is fine.
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const api = process.env.FORMFLARE_API ?? "https://api.github.com";
  const response = await fetch(`${api}${path}`, { headers });
  if (!response.ok) throw new Error(`GitHub ${path} → ${response.status}`);
  return response.json();
}

function readPending() {
  if (!existsSync(PENDING_FILE)) return [];
  try {
    const parsed = JSON.parse(readFileSync(PENDING_FILE, "utf8"));
    return Array.isArray(parsed.items) ? parsed.items : [];
  } catch {
    // A hand-edited file that no longer parses must not wedge every future
    // update; start a fresh list rather than throwing.
    return [];
  }
}

function writePending(items) {
  mkdirSync(dirname(PENDING_FILE), { recursive: true });
  writeFileSync(
    PENDING_FILE,
    `${JSON.stringify(
      {
        $comment:
          "Files an automatic update could not apply. Apply each by hand, then delete its entry. FormFlare re-reports anything left here on every update.",
        items,
      },
      null,
      2,
    )}\n`,
  );
}

const localVersion = JSON.parse(readFileSync("package.json", "utf8")).version;

if (!isStable(localVersion)) {
  // Nothing sensible to compare against, and guessing would either spam a bogus
  // update or hide a real one. Say so and stop.
  console.log(
    `package.json has version "${localVersion}", which is not a plain MAJOR.MINOR.PATCH.\n` +
      "FormFlare releases are always stable versions, so it cannot tell which release this copy is on.\n" +
      "Set it to the FormFlare version you are running and the next check will work.",
  );
  process.exit(0);
}

const releases = await githubJson(`/repos/${UPSTREAM_REPO}/releases?per_page=100`);
const published = releases
  // Both checks matter: the API flag is only set if whoever cut the release
  // ticked the box, so a tag named -beta.1 can arrive marked as stable.
  .filter((release) => !release.draft && !release.prerelease && isStable(release.tag_name))
  .map((release) => ({ tag: release.tag_name, name: release.name, url: release.html_url, body: release.body ?? "" }))
  .sort((a, b) => compareVersions(a.tag, b.tag));

if (published.length === 0) {
  console.log("No upstream releases yet. Nothing to do.");
  process.exit(0);
}

const latest = published[published.length - 1];
const pending = readPending();

if (compareVersions(latest.tag, `v${localVersion}`) <= 0) {
  console.log(`Up to date (local v${localVersion}, latest ${latest.tag}).`);
  if (pending.length > 0) {
    // Being current does not mean being finished — skipped files stay skipped.
    // This is a reminder, not a failure: the run did everything it could, so it
    // exits 0 rather than showing a red cross against a working repository.
    const note = [
      `### ${pending.length} file(s) still need your attention`,
      "",
      ...pending.map((item) => `- \`${item.file}\` (${item.from} → ${item.to}) — ${item.reason}`),
      "",
      `Apply each by hand, then delete its entry from \`${PENDING_FILE}\`.`,
    ].join("\n");
    console.log(`\n${note}`);
    if (process.env.GITHUB_STEP_SUMMARY) {
      writeFileSync(process.env.GITHUB_STEP_SUMMARY, `${note}\n`, { flag: "a" });
    }
  }
  process.exit(0);
}

const fromTag = `v${localVersion}`;
const toTag = latest.tag;
console.log(`Update available: ${fromTag} → ${toTag}`);

// Every release strictly between the installed one and the newest, so the PR can
// show the notes a deployer skipped over when jumping several versions at once.
const spanned = published.filter(
  (release) => compareVersions(release.tag, fromTag) > 0 && compareVersions(release.tag, toTag) <= 0,
);

// Fetch both endpoints of the jump. This needs no common ancestor, which is the
// whole reason the updater works on an unrelated-history clone.
git(["fetch", "--quiet", UPSTREAM, `refs/tags/${fromTag}:refs/tags/up-${fromTag}`, `refs/tags/${toTag}:refs/tags/up-${toTag}`]);

const changedFiles = lines(
  git(["diff", "--name-only", `up-${fromTag}`, `up-${toTag}`], { maxBuffer: 256 * 1024 * 1024 }),
);
if (changedFiles.length === 0) {
  console.log("Releases are identical in content. Nothing to do.");
  process.exit(0);
}

const base = git(["rev-parse", "HEAD"]);
git(["checkout", "--quiet", "-B", BRANCH, base]);

// One `git apply` over the whole diff is atomic: a single file that will not
// apply throws away every other file's changes too. Apply per file instead, so
// one conflict costs one file.
// --binary so images, fonts and file modes survive the round trip.
const conflicted = [];
for (const file of changedFiles) {
  const filePatch = gitRaw(["diff", "--binary", `up-${fromTag}`, `up-${toTag}`, "--", file]);
  if (!filePatch.trim()) continue;
  writeFileSync(".git/formflare-update.patch", filePatch);
  const applied = gitTry(["apply", "--3way", "--index", "--binary", ".git/formflare-update.patch"]);
  // Either a real conflict (markers in the index) or a patch that will not apply
  // at all — both mean "a human has to look at this file".
  if (!applied.ok || gitTry(["diff", "--name-only", "--diff-filter=U", "--", file]).out) {
    conflicted.push(file);
  }
}

// GITHUB_TOKEN is refused by GitHub when a push touches .github/workflows/ —
// verified, the remote rejects it outright regardless of `contents: write`. So
// unless a PAT carrying the `workflows` permission is present, keep those files
// out of the commit entirely rather than letting the push fail.
const hasPat = Boolean(process.env.UPDATE_PAT);
const touchedWorkflows = lines(gitTry(["diff", "--cached", "--name-only", "--diff-filter=ACMRT", "HEAD"]).out).filter(
  (file) => file.startsWith(".github/workflows/"),
);
const skippedWorkflows = hasPat ? [] : touchedWorkflows;

const excluded = [...new Set([...conflicted, ...skippedWorkflows])];
for (const file of excluded) {
  // Restore the deployer's own version, in index and worktree, so no conflict
  // markers or half-applied hunks reach the commit.
  gitTry(["checkout", "--quiet", "--force", "HEAD", "--", file]);
}

const staged = lines(gitTry(["diff", "--cached", "--name-only", "HEAD"]).out);

// Carry forward anything still unresolved from earlier runs, and add this run's
// skips. Keyed by file so a file skipped twice does not appear twice.
const byFile = new Map(pending.map((item) => [item.file, item]));
for (const file of excluded) {
  byFile.set(file, {
    file,
    from: fromTag,
    to: toTag,
    reason: conflicted.includes(file)
      ? "You changed this file and the update changes it too — merge the two by hand."
      : "Updating a workflow file needs an UPDATE_PAT secret with the 'workflows' permission.",
  });
}
const nextPending = [...byFile.values()].sort((a, b) => a.file.localeCompare(b.file));

if (staged.length === 0 && excluded.length === 0) {
  console.log("Nothing to apply.");
  process.exit(0);
}

const migrations = staged.filter((file) => file.startsWith("migrations/"));
const wrangler = [...staged, ...excluded].some((file) => file.startsWith("wrangler."));

const body = [
  `Updates FormFlare from **${fromTag}** to **${toTag}**.`,
  "",
  "Your own commits are the base of this branch, so everything you changed is kept.",
  "",
  `### Releases included`,
  ...spanned.map((release) => `- [${release.tag}](${release.url})${release.name && release.name !== release.tag ? ` — ${release.name}` : ""}`),
  "",
  `### Files updated (${staged.length})`,
  ...(staged.length > 0 ? staged.map((file) => `- \`${file}\``) : ["- _none_"]),
  ...(migrations.length > 0
    ? [
        "",
        "### ⚠️ Database migrations",
        "This update adds migrations. They are additive and safe to apply to a live database, but run them before the new code goes out:",
        "",
        "```bash",
        "npm run db:migrate:remote",
        "```",
      ]
    : []),
  ...(wrangler
    ? [
        "",
        "### ⚠️ `wrangler.jsonc`",
        "This update touches Worker configuration. Keep **your** Worker name, database id and bucket names — take only the new bindings, compatibility date or flags from the incoming side.",
      ]
    : []),
  ...(nextPending.length > 0
    ? [
        "",
        `### ⚠️ Needs you (${nextPending.length})`,
        "These files are **not** in this PR and still hold your version:",
        "",
        ...nextPending.map((item) => `- \`${item.file}\` (${item.from} → ${item.to}) — ${item.reason}`),
        "",
        `They are tracked in \`${PENDING_FILE}\` and will be listed again on every future update. Apply each by hand, then delete its entry from that file.`,
        "",
        `<details><summary>See upstream's version of these files</summary>`,
        "",
        "```bash",
        `git fetch ${UPSTREAM} refs/tags/${toTag}:refs/tags/up-${toTag}`,
        `git diff up-${fromTag} up-${toTag} -- ${nextPending.map((item) => item.file).join(" ")}`,
        "```",
        "",
        "</details>",
      ]
    : []),
  "",
  "---",
  "",
  `Opened automatically by \`.github/workflows/update-check.yml\`. Close it to skip ${toTag}; the next release opens a new one.`,
].join("\n");

if (dryRun) {
  console.log(`\n--- would commit ${staged.length} file(s), skip ${excluded.length} ---\n`);
  console.log(body);
  process.exit(0);
}

if (nextPending.length > 0 || existsSync(PENDING_FILE)) {
  writePending(nextPending);
  git(["add", PENDING_FILE]);
}

// The version in package.json is how the next run works out where this copy
// stands, so it must end up at the new release no matter what the patch did.
// It would otherwise be left behind whenever package.json conflicted, or when a
// release changed no other line of it — and the same update would then be
// offered again forever.
const packageJson = readFileSync("package.json", "utf8");
const bumped = packageJson.replace(
  /("version"\s*:\s*)"[^"]*"/,
  `$1"${toTag.replace(/^v/, "")}"`,
);
if (bumped !== packageJson) {
  writeFileSync("package.json", bumped);
  git(["add", "package.json"]);
}

git(["commit", "--quiet", "-m", `chore: update FormFlare to ${toTag}`]);
git(["push", "--quiet", "--force", "origin", `${BRANCH}:${BRANCH}`]);

writeFileSync(process.env.GITHUB_OUTPUT ?? "/dev/null", `updated=true\nfrom=${fromTag}\nto=${toTag}\n`, { flag: "a" });
writeFileSync("/tmp/pr-body.md", body);
console.log(`Pushed ${BRANCH}: ${staged.length} file(s) updated, ${excluded.length} skipped.`);
