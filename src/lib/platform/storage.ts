/**
 * File storage behind a narrow interface (Section 6.2).
 *
 * Business logic depends on `Storage`, never on `env.BUCKET`, so a future
 * Docker build can swap in S3 without touching submission handling.
 */
export interface StoredObject {
  body: ReadableStream;
  contentType: string;
  size: number;
}

export interface Storage {
  put(key: string, body: ReadableStream | ArrayBuffer, contentType: string): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
  delete(key: string): Promise<void>;
  /** False when no bucket is bound, so callers can refuse uploads with a clear message. */
  readonly available: boolean;
}

/**
 * Storage used when no R2 bucket is bound.
 *
 * R2 is opt-in because activating it requires a payment method on the Cloudflare
 * account, even within the free tier — so the default deploy has no bucket and file
 * uploads are unavailable until the owner adds one.
 *
 * Reads and deletes are no-ops rather than errors: without a bucket there is nothing
 * stored, so "not found" and "already gone" are the honest answers. Only `put` throws,
 * and the submission handler checks `available` before ever calling it, so that throw
 * is a guard against a missed check rather than a path users hit.
 */
export const unavailableStorage: Storage = {
  available: false,
  async put() {
    throw new Error("File uploads need an R2 bucket bound as BUCKET.");
  },
  async get() {
    return null;
  },
  async delete() {
    // Nothing to delete.
  },
};

export function r2Storage(bucket: R2Bucket | undefined): Storage {
  if (!bucket) return unavailableStorage;

  return {
    available: true,
    async put(key, body, contentType) {
      await bucket.put(key, body, { httpMetadata: { contentType } });
    },

    async get(key) {
      const object = await bucket.get(key);
      if (!object) return null;
      return {
        body: object.body,
        // R2 does not guarantee httpMetadata survives every upload path.
        contentType: object.httpMetadata?.contentType ?? "application/octet-stream",
        size: object.size,
      };
    },

    async delete(key) {
      await bucket.delete(key);
    },
  };
}
