/**
 * Checksum helpers for the vendored snapshots (dev/CI-script only — uses Node
 * crypto, so it lives under `scripts/` with the other IO, not in the browser app).
 *
 * The bootstrap and item pipelines run off committed, network-independent
 * snapshots; verifying each file against a manifest `sha256` before use means a
 * truncated download, an accidental edit, or a tampered vendor file fails closed
 * rather than silently feeding corrupt data into the dataset (KTD3).
 */
import { createHash } from 'node:crypto'

/** `sha256:<hex>` digest of a buffer, matching the manifest format. */
export function sha256(buf: Buffer | string): string {
  return 'sha256:' + createHash('sha256').update(buf).digest('hex')
}

/** Throw if `buf` does not match the expected `sha256:<hex>` digest. */
export function verifyChecksum(name: string, buf: Buffer | string, expected: string): void {
  const got = sha256(buf)
  if (got !== expected) {
    throw new Error(`Checksum mismatch for ${name}\n  expected ${expected}\n  got      ${got}`)
  }
}
