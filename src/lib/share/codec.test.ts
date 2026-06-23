import { describe, it, expect } from 'vitest'
import { encode, decode, FORMAT_VERSION, MAX_CODE_LENGTH, MAX_DECOMPRESSED_BYTES } from './codec'
import type { Ledger } from '../build/character'

const sample: Ledger = [
  { op: 'levelUp' },
  { op: 'addAttribute', attr: 'STR' },
  { op: 'levelUp' },
  { op: 'addSkill', skill: 'Cleave' },
]

/** Build a raw gzip+base64url code from an arbitrary JS value (bypassing encode's schema). */
async function rawCode(value: unknown): Promise<string> {
  const cs = new CompressionStream('gzip')
  const writer = cs.writable.getWriter()
  void writer.write(new TextEncoder().encode(JSON.stringify(value)))
  void writer.close()
  const buf = new Uint8Array(await new Response(cs.readable).arrayBuffer())
  let bin = ''
  for (const b of buf) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

describe('share codec (R8 — codec)', () => {
  it('round-trips a ledger', async () => {
    const code = await encode(sample)
    const result = await decode(code)
    expect(result).toEqual({ ok: true, ledger: sample })
  })

  it('round-trips a heavily-edited ledger to the same entries', async () => {
    const edited: Ledger = [
      ...Array.from({ length: 20 }, () => ({ op: 'levelUp' }) as const),
      { op: 'addAttribute', attr: 'WIL' },
      { op: 'addAttribute', attr: 'WIL' },
      { op: 'addSkill', skill: 'Wormhole' },
    ]
    const decoded = await decode(await encode(edited))
    expect(decoded).toMatchObject({ ok: true, ledger: edited })
  })

  it('embeds the format version and fails closed on an unknown version', async () => {
    const future = await rawCode({ formatVersion: FORMAT_VERSION + 1, ledger: sample })
    expect(await decode(future)).toEqual({ ok: false, reason: 'unknown-version' })
  })

  it('fails closed on empty, malformed, and non-gzip input', async () => {
    expect(await decode('')).toEqual({ ok: false, reason: 'empty' })
    expect(await decode('!!!not base64!!!')).toMatchObject({ ok: false })
    expect(await decode('aGVsbG8')).toMatchObject({ ok: false, reason: 'malformed' }) // valid b64, not gzip
  })

  it('rejects an over-long code before doing any work', async () => {
    const huge = 'A'.repeat(MAX_CODE_LENGTH + 1)
    expect(await decode(huge)).toEqual({ ok: false, reason: 'too-long' })
  })

  it('fails closed on a zip-bomb that decompresses past the ceiling', async () => {
    // Highly compressible payload that inflates well beyond the byte ceiling.
    const bomb = await rawCode({ pad: 'x'.repeat(MAX_DECOMPRESSED_BYTES * 4) })
    expect(bomb.length).toBeLessThanOrEqual(MAX_CODE_LENGTH) // passes the length cap...
    expect(await decode(bomb)).toEqual({ ok: false, reason: 'too-large' }) // ...caught while inflating
  })

  it('fails closed on a structurally invalid ledger', async () => {
    const badEntry = await rawCode({ formatVersion: FORMAT_VERSION, ledger: [{ op: 'nope' }] })
    expect(await decode(badEntry)).toEqual({ ok: false, reason: 'schema' })

    // Just over the entry-count ceiling but well under the decompressed-byte
    // ceiling, so the schema limit (not the zip-bomb guard) is what rejects it.
    const overLong = await rawCode({
      formatVersion: FORMAT_VERSION,
      ledger: Array.from({ length: 600 }, () => ({ op: 'levelUp' })),
    })
    expect(await decode(overLong)).toEqual({ ok: false, reason: 'schema' })
  })
})
