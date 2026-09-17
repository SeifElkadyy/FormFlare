#!/usr/bin/env node
/**
 * Reset a user's password from the command line.
 *
 * The only recovery path for a locked-out owner: FormFlare has no "forgot password"
 * email flow, because that would require a configured mailer, and email is optional
 * at runtime by design.
 *
 * Usage:
 *   npm run reset-password -- --email you@example.com --local
 *   npm run reset-password -- --email you@example.com --remote
 *   npm run reset-password -- --email you@example.com --remote -c wrangler.dev.jsonc
 *
 * The hash is computed here with Node's WebCrypto, in exactly the format
 * src/lib/auth/password.ts produces, then written with `wrangler d1 execute`.
 * Every session for that user is deleted in the same statement batch, so anyone
 * holding a stolen cookie is signed out by the reset.
 */
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { webcrypto as crypto } from "node:crypto";

// Must match PBKDF2_ITERATIONS in src/lib/auth/password.ts. Production workerd
// rejects anything above 100_000.
const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const KEY_BITS = 256;
const MIN_PASSWORD_LENGTH = 12;

function parseArgs(argv) {
  const args = { email: undefined, target: undefined, config: undefined };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--email") args.email = argv[++i];
    else if (arg === "--local") args.target = "local";
    else if (arg === "--remote") args.target = "remote";
    // Lets the reset target a non-default instance (e.g. wrangler.dev.jsonc).
    else if (arg === "--config" || arg === "-c") args.config = argv[++i];
  }
  return args;
}

function die(message) {
  console.error(`\nError: ${message}\n`);
  process.exit(1);
}

/**
 * Prompt for passwords on a single readline interface.
 *
 * One interface for both questions: closing one and opening another leaves the second
 * read with no stdin (piped input is already consumed), which silently yields an empty
 * password.
 *
 * On a TTY the echo is muted so the password is not displayed. When stdin is not a TTY
 * (piped input, CI, a test) there is nothing to mask — and `process.stdout.clearLine`
 * does not exist there — so it reads plainly instead of crashing.
 */
function createPrompter() {
  const isTty = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: isTty,
  });

  // Pull lines from an async iterator rather than calling rl.question() twice.
  // With piped stdin both lines can arrive in a single chunk, and a second
  // question() callback then never fires — the script would exit silently with an
  // empty password, appearing to succeed while changing nothing.
  const lines = rl[Symbol.asyncIterator]();

  let muted = false;
  if (isTty) {
    const originalWrite = rl._writeToOutput?.bind(rl);
    rl._writeToOutput = (chunk) => {
      // Always render the prompt itself; swallow the typed characters.
      if (!muted) originalWrite?.(chunk);
    };
  }

  return {
    async ask(question) {
      process.stdout.write(question);
      if (isTty) muted = true;

      const { value, done } = await lines.next();

      muted = false;
      if (isTty) process.stdout.write("\n");
      if (done) die("No input received.");
      return String(value).trim();
    },
    close() {
      rl.close();
    },
  };
}

function toBase64(bytes) {
  return Buffer.from(bytes).toString("base64");
}

async function hashPassword(password) {
  const salt = new Uint8Array(SALT_BYTES);
  crypto.getRandomValues(salt);

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: PBKDF2_ITERATIONS },
    key,
    KEY_BITS,
  );

  return `pbkdf2$${PBKDF2_ITERATIONS}$${toBase64(salt)}$${toBase64(new Uint8Array(bits))}`;
}

/** Single-quote escaping for SQL string literals. */
function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function runWrangler(args) {
  const result = spawnSync("npx", ["wrangler", ...args], {
    stdio: ["inherit", "pipe", "pipe"],
    encoding: "utf8",
  });
  if (result.status !== 0) {
    die(`wrangler failed:\n${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

async function main() {
  const { email, target, config } = parseArgs(process.argv.slice(2));

  if (!email)
    die("Missing --email. Example: npm run reset-password -- --email you@example.com --local");
  if (!target) die("Pass --local or --remote to choose which database to update.");

  const normalisedEmail = email.trim().toLowerCase();
  const flag = `--${target}`;
  // Every wrangler call must carry the same config, or the lookup and the write
  // could land on different databases.
  const configArgs = config ? ["-c", config] : [];

  // Confirm the account exists first, so a typo does not silently do nothing.
  const lookup = runWrangler([
    "d1",
    "execute",
    "DB",
    flag,
    ...configArgs,
    "--json",
    "--command",
    `SELECT id FROM users WHERE email = ${sqlString(normalisedEmail)};`,
  ]);

  let userId;
  try {
    const parsed = JSON.parse(lookup.slice(lookup.indexOf("[")));
    userId = parsed[0]?.results?.[0]?.id;
  } catch {
    die(`Could not parse wrangler output:\n${lookup}`);
  }
  if (!userId) die(`No user found with email ${normalisedEmail} in the ${target} database.`);

  console.log(
    `\nResetting password for ${normalisedEmail} (${target}${config ? `, ${config}` : ""}).`,
  );

  const prompter = createPrompter();
  let password, confirm;
  try {
    password = await prompter.ask("New password: ");
    confirm = await prompter.ask("Confirm password: ");
  } finally {
    prompter.close();
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    die(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  if (password !== confirm) die("Passwords do not match.");

  const hash = await hashPassword(password);

  // Update and sign out in one file: any cookie issued before the reset stops working,
  // which is the point of a reset after a suspected compromise.
  const dir = mkdtempSync(join(tmpdir(), "formflare-reset-"));
  const file = join(dir, "reset.sql");
  try {
    writeFileSync(
      file,
      [
        `UPDATE users SET password_hash = ${sqlString(hash)} WHERE id = ${sqlString(userId)};`,
        `DELETE FROM sessions WHERE user_id = ${sqlString(userId)};`,
      ].join("\n"),
    );
    runWrangler(["d1", "execute", "DB", flag, ...configArgs, "--file", file]);
  } finally {
    // The file contains the password hash; do not leave it in the temp directory.
    rmSync(dir, { recursive: true, force: true });
  }

  console.log(`\n✅ Password updated and all sessions for ${normalisedEmail} signed out.`);
  console.log("   Sign in with the new password.\n");
}

main().catch((err) => die(err instanceof Error ? err.message : String(err)));
