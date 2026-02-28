/**
 * Browser-compatible shim for Node's zlib module.
 * Provides gunzipSync using pako for decompressing gzip-compressed NEXRAD data.
 */
import pako from 'pako';

export function gunzipSync(buffer: Uint8Array | Buffer): Buffer {
  const result = pako.ungzip(buffer);
  // pako returns Uint8Array; nexrad-level-2-data expects Buffer-like
  return Buffer.from(result.buffer, result.byteOffset, result.byteLength);
}

export default { gunzipSync };
