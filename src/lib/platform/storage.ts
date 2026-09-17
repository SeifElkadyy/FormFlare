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
}

export function r2Storage(bucket: R2Bucket): Storage {
  return {
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
