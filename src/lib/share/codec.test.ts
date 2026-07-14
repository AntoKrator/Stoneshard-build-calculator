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

  it('round-trips a build with equipped gear (M3 U5, R16)', async () => {
    const geared: Ledger = [
      { op: 'levelUp' },
      { op: 'addSkill', skill: 'Cleave' },
      { op: 'equip', slot: 'main_hand', item: 'sword03' },
      { op: 'equip', slot: 'body', item: 'chest01' },
    ]
    expect(await decode(await encode(geared))).toEqual({ ok: true, ledger: geared })
  })

  it('still decodes a pre-M3 (gearless) code (R16 — backward compatibility)', async () => {
    // A v1 code minted before the equip op existed: only the original three ops.
    const legacy = await rawCode({ formatVersion: FORMAT_VERSION, ledger: sample })
    expect(await decode(legacy)).toEqual({ ok: true, ledger: sample })
  })

  it('round-trips a build with a selected character (U3, R3)', async () => {
    // selectCharacter rides the same LedgerEntry union — no FORMAT_VERSION bump.
    const seeded: Ledger = [
      { op: 'selectCharacter', id: 'velmir' },
      { op: 'levelUp' },
      { op: 'addAttribute', attr: 'STR' },
      { op: 'addSkill', skill: 'Cleave' },
    ]
    expect(await decode(await encode(seeded))).toEqual({ ok: true, ledger: seeded })
  })

  it('rejects a structurally invalid selectCharacter entry', async () => {
    const missingId = await rawCode({
      formatVersion: FORMAT_VERSION,
      ledger: [{ op: 'selectCharacter' }],
    })
    expect(await decode(missingId)).toEqual({ ok: false, reason: 'schema' })
  })

  it('rejects a structurally invalid equip entry', async () => {
    const missingItem = await rawCode({
      formatVersion: FORMAT_VERSION,
      ledger: [{ op: 'equip', slot: 'main_hand' }],
    })
    expect(await decode(missingItem)).toEqual({ ok: false, reason: 'schema' })

    const badSlot = await rawCode({
      formatVersion: FORMAT_VERSION,
      ledger: [{ op: 'equip', slot: 'pocket', item: 'x' }],
    })
    expect(await decode(badSlot)).toEqual({ ok: false, reason: 'schema' })
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

describe('share codec — M5 selectEnemy (rides FORMAT_VERSION 1)', () => {
  it('round-trips a selectEnemy entry with abilities', async () => {
    const led: Ledger = [
      { op: 'levelUp' },
      { op: 'selectEnemy', id: 'goblin', abilities: ['smash', 'wail'] },
    ]
    expect(await decode(await encode(led))).toEqual({ ok: true, ledger: led })
  })

  it('decodes a pre-M5 code with no selectEnemy (backward-compat)', async () => {
    expect(await decode(await encode(sample))).toEqual({ ok: true, ledger: sample })
  })

  it('fails closed on an oversized abilities array (schema bound, F15)', async () => {
    const huge = Array.from({ length: 100 }, (_, i) => `a${i}`)
    const code = await rawCode({
      formatVersion: FORMAT_VERSION,
      ledger: [{ op: 'selectEnemy', id: 'goblin', abilities: huge }],
    })
    expect(await decode(code)).toMatchObject({ ok: false, reason: 'schema' })
  })

  it('is byte-stable across encode/decode/encode', async () => {
    const led: Ledger = [{ op: 'selectEnemy', id: 'goblin', abilities: ['a', 'b'] }]
    const code1 = await encode(led)
    const decoded = await decode(code1)
    expect(decoded.ok).toBe(true)
    const code2 = await encode((decoded as { ledger: Ledger }).ledger)
    expect(code2).toBe(code1)
  })
})
