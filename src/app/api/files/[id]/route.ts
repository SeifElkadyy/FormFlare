import { eq } from "drizzle-orm";
import { currentUser } from "@/lib/auth/guard";
import { files } from "@/lib/db/schema";
import { getServices } from "@/lib/env";
import { contentDisposition } from "@/lib/files/disposition";

export const dynamic = "force-dynamic";

/**
 * Authenticated file download.
 *
 * Uploaded files are attacker-supplied content served from the instance's own origin, so
 * three things matter:
 *
 * - **Auth.** R2 keys are unguessable, but the only thing that should read a submission's
 *   file is a signed-in owner.
 * - **Never inline.** `Content-Disposition: attachment` stops the browser rendering an
 *   uploaded `.html` or SVG as a page on this origin, which would be stored XSS against
 *   the dashboard's own session.
 * - **Never sniff.** `X-Content-Type-Options: nosniff` stops the browser second-guessing
 *   the declared type and executing, say, a "text/plain" file that looks like script.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const user = await currentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  const { db, storage } = await getServices();

  const rows = await db.select().from(files).where(eq(files.id, id)).limit(1);
  const file = rows[0];
  if (!file) return new Response("Not found", { status: 404 });

  const object = await storage.get(file.r2Key);
  if (!object) return new Response("Not found", { status: 404 });

  return new Response(object.body, {
    headers: {
      // The stored type is what the uploader claimed; octet-stream would be safer still,
      // but the combination of attachment + nosniff already prevents execution, and the
      // real type lets the owner's OS open it correctly once saved.
      "Content-Type": file.contentType,
      "Content-Disposition": contentDisposition(file.filename),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
