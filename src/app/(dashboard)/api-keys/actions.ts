"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireUserForMutation } from "@/lib/auth/guard";
import { audit } from "@/lib/auth/login";
import { createApiKey, revokeApiKey } from "@/lib/auth/api-key";
import { apiKeys } from "@/lib/db/schema";
import { getServices } from "@/lib/env";

export type ApiKeyState = { error?: string; created?: { plaintext: string } };

export async function createKeyAction(
  _prev: ApiKeyState,
  formData: FormData,
): Promise<ApiKeyState> {
  const user = await requireUserForMutation();
  const { db } = await getServices();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Give the key a name so you can recognise it later." };

  const key = await createApiKey(db, name);

  // Key creation and revocation are security events: an unexplained key is the first
  // sign of a compromised dashboard session.
  await audit(db, user.id, "api_key.create", { keyId: key.id, name, prefix: key.prefix });
  revalidatePath("/api-keys");

  // Shown once; only the SHA-256 is stored.
  return { created: { plaintext: key.plaintext } };
}

export async function revokeKeyAction(formData: FormData): Promise<void> {
  const user = await requireUserForMutation();
  const { db } = await getServices();

  const id = String(formData.get("id") ?? "");
  const rows = await db.select().from(apiKeys).where(eq(apiKeys.id, id)).limit(1);
  if (!rows[0]) return;

  await revokeApiKey(db, id);
  await audit(db, user.id, "api_key.revoke", { keyId: id, name: rows[0].name });
  revalidatePath("/api-keys");
}
