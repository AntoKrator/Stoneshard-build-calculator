/**
 * Versioned, bounded, schema-validated share codec (U8, R8 — codec half).
 *
 * encode: `{ formatVersion, ledger }` → JSON → gzip (CompressionStream) → base64url.
 * decode treats its input as **untrusted** and fails closed at every step:
 *   1. reject an over-long code *before* decompressing (cheap DoS guard),
 *   2. base64url → bytes (malformed input throws → caught),
 *   3. gunzip with a hard output-byte ceiling, aborting on overflow (zip-bomb guard),
 *   4. JSON.parse,
 *   5. check `formatVersion` (unknown → fail closed, our forward-compat hook),
 *   6. Zod-validate the ledger, including an entry-count ceiling.
 *
 * Patch-drift (a structurally valid code whose skill/tree refs are stale) is NOT
 * this layer's job — `recompute` skips-and-notifies on those (U4). This layer only
 * guarantees the decoded object is *structurally* a current-version build.
 *
 * Uses Web Platform APIs (CompressionStream, btoa/atob, TextEncoder) available in
 * the browser and in the Node test runtime alike — no Node Buffer dependency.
 */
import { z } from 'zod'
import { LedgerEntry, type Ledger } from '../build/character'

export const FORMAT_VERSION = 1

/** A max-level build is ~90 entries; the ceiling leaves generous slack. */
export const MAX_LEDGER_ENTRIES = 512
/** Reject codes longer than this before doing any work. */
export const MAX_CODE_LENGTH = 8192
/** Hard ceiling on decompressed bytes (legit payloads are a few KB). */
export const MAX_DECOMPRESSED_BYTES = 64 * 1024

const Build = z.object({
  formatVersion: z.literal(FORMAT_VERSION),
  ledger: z.array(LedgerEntry).max(MAX_LEDGER_ENTRIES),
})
export type Build = z.infer<typeof Build>

export type DecodeResult =
  | { ok: true; ledger: Ledger }
  | {
      ok: false
      reason: 'empty' | 'too-long' | 'malformed' | 'too-large' | 'unknown-version' | 'schema'
    }

/* ----------------------------- base64url ----------------------------- */

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlToBytes(str: string): Uint8Array {
  const m = str.length % 4
  const padded = str
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(str.length + (m === 0 ? 0 : 4 - m), '=')
  const bin = atob(padded) // throws on invalid base64 — caller catches
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

/* ----------------------------- gzip ----------------------------- */

async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** Decompress with a hard output ceiling, aborting the stream on overflow. */
async function gunzipBounded(bytes: Uint8Array, maxBytes: number): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'))
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.length
    if (total > maxBytes) {
      // Stop reading and tear the stream down; swallow the resulting abort.
      void reader.cancel().catch(() => {})
      throw new Error('decompressed output exceeds limit')
    }
    chunks.push(value)
  }
  return concat(chunks)
}

function concat(chunks: Uint8Array[]): Uint8Array {
  let total = 0
  for (const c of chunks) total += c.length
  const out = new Uint8Array(total)
  let off = 0
  for (const c of chunks) {
    out.set(c, off)
    off += c.length
  }
  return out
}

/* ----------------------------- public API ----------------------------- */

export async function encode(ledger: Ledger): Promise<string> {
  const json = JSON.stringify({ formatVersion: FORMAT_VERSION, ledger })
  const compressed = await gzip(new TextEncoder().encode(json))
  return bytesToBase64Url(compressed)
}

export async function decode(code: string): Promise<DecodeResult> {
  if (!code) return { ok: false, reason: 'empty' }
  if (code.length > MAX_CODE_LENGTH) return { ok: false, reason: 'too-long' }

  let bytes: Uint8Array
  try {
    bytes = base64UrlToBytes(code)
  } catch {
    return { ok: false, reason: 'malformed' }
  }

  let jsonText: string
  try {
    const out = await gunzipBounded(bytes, MAX_DECOMPRESSED_BYTES)
    jsonText = new TextDecoder().decode(out)
  } catch (e) {
    return { ok: false, reason: /exceeds limit/.test(String(e)) ? 'too-large' : 'malformed' }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonText)
  } catch {
    return { ok: false, reason: 'malformed' }
  }

  // Distinguish an unknown (future) format version from a malformed one, so a
  // Phase-2 code fails with a clear reason instead of a generic schema error.
  const version = (parsed as { formatVersion?: unknown })?.formatVersion
  if (version !== FORMAT_VERSION) return { ok: false, reason: 'unknown-version' }

  const result = Build.safeParse(parsed)
  if (!result.success) return { ok: false, reason: 'schema' }

  return { ok: true, ledger: result.data.ledger }
}
