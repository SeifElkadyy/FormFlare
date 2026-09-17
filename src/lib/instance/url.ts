import type { Database } from "../db/client";
import { SETTING, getSetting, setSetting } from "../db/settings";

/**
 * Remember the public origin of this instance the first time we see a Host.
 *
 * Confirmation emails and referral links need an absolute URL, and the queue
 * consumer has no request. Auto-fill only when unset so an owner who typed a
 * custom domain in Settings is not overwritten by a workers.dev hit.
 */
export async function rememberInstanceUrl(db: Database, host: string | null): Promise<void> {
  if (!host) return;
  const existing = await getSetting(db, SETTING.instanceUrl);
  if (existing) return;
  const origin = originFromHost(host);
  if (origin) await setSetting(db, SETTING.instanceUrl, origin);
}

export async function getInstanceUrl(db: Database, host?: string | null): Promise<string> {
  const stored = await getSetting(db, SETTING.instanceUrl);
  if (stored) return stored.replace(/\/$/, "");
  if (host) {
    const origin = originFromHost(host);
    if (origin) return origin;
  }
  return "";
}

export function originFromHost(host: string): string | null {
  const trimmed = host.trim();
  if (!trimmed) return null;
  const local = trimmed.startsWith("localhost") || trimmed.startsWith("127.");
  return `${local ? "http" : "https"}://${trimmed}`;
}
