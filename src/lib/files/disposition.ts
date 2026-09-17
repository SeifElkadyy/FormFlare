/**
 * Build a Content-Disposition header that cannot be broken out of.
 *
 * A filename is submitted by a stranger. Quotes, semicolons, CR/LF or path separators
 * would let it inject header parameters or escape the directory on save, so the quoted
 * form is reduced to a safe subset and the real name is carried in `filename*`
 * (RFC 5987), which is percent-encoded and therefore injection-proof.
 *
 * Lives here rather than beside the route so it can be tested without pulling Next's
 * request-scoped modules into the test worker.
 */
export function contentDisposition(filename: string): string {
  const base = filename.replace(/^.*[\\/]/, "");

  const fallback =
    base
      .replace(/[\u0000-\u001f\u007f"\;]/g, "_")
      .trim()
      .slice(0, 100) || "download";

  const encoded = encodeURIComponent(base.slice(0, 200) || "download");

  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
