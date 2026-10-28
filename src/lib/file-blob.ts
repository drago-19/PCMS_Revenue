import { gunzipSync, gzipSync } from "node:zlib";

const GZIP_MAGIC_0 = 0x1f;
const GZIP_MAGIC_1 = 0x8b;

export function isGzipBuffer(buffer: Buffer | Uint8Array | null | undefined): boolean {
  if (!buffer || buffer.length < 2) return false;
  return buffer[0] === GZIP_MAGIC_0 && buffer[1] === GZIP_MAGIC_1;
}

export function compressFileBlob(buffer: Buffer): Buffer {
  if (!buffer || buffer.length === 0) return buffer;
  if (isGzipBuffer(buffer)) return buffer;
  return gzipSync(buffer, { level: 6 });
}

export function decompressFileBlob(rawBlob: unknown): Buffer | null {
  const buffer =
    rawBlob instanceof Buffer
      ? rawBlob
      : rawBlob instanceof Uint8Array
        ? Buffer.from(rawBlob)
        : null;
  if (!buffer || buffer.length === 0) return null;
  if (isGzipBuffer(buffer)) {
    try {
      return gunzipSync(buffer);
    } catch {
      return buffer;
    }
  }
  return buffer;
}
