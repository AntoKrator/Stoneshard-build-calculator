import { describe, it, expect } from 'vitest'
import { sha256, verifyChecksum } from './checksum'

describe('checksum verification', () => {
  it('produces a stable sha256:<hex> digest', () => {
    expect(sha256('hello datastrings')).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it('accepts content matching the expected digest', () => {
    const buf = 'hello datastrings'
    expect(() => verifyChecksum('x', buf, sha256(buf))).not.toThrow()
  })

  it('rejects a tampered/mismatched vendored file', () => {
    expect(() => verifyChecksum('weapon-data.wikitext', 'tampered', sha256('original'))).toThrow(
      /Checksum mismatch/,
    )
  })
})
