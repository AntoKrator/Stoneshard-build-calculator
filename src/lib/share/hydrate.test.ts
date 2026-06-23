import { describe, it, expect } from 'vitest'
import { hydrateLedger, extractCode } from './hydrate'
import { encode } from './codec'
import type { Ledger } from '../build/character'

const sample: Ledger = [{ op: 'levelUp' }, { op: 'addSkill', skill: 'Cleave' }]

describe('extractCode', () => {
  it('pulls the build code from a query string or full URL', () => {
    expect(extractCode('?build=ABC123')).toBe('ABC123')
    expect(extractCode('https://x.io/calc/?build=ABC123&foo=1')).toBe('ABC123')
  })
  it('accepts a bare code', () => {
    expect(extractCode('ABC123')).toBe('ABC123')
  })
  it('returns null for empty or codeless input', () => {
    expect(extractCode('')).toBeNull()
    expect(extractCode('https://x.io/calc/')).toBeNull()
  })
})

describe('hydrateLedger (R8 — hydration)', () => {
  it('reconstructs the build from a valid ?build= code', async () => {
    const code = await encode(sample)
    const res = await hydrateLedger(`?build=${code}`)
    expect(res).toEqual({ status: 'loaded', entries: sample })
  })

  it('starts fresh when there is no build param', async () => {
    expect(await hydrateLedger('')).toEqual({ status: 'none', entries: [] })
    expect(await hydrateLedger('?foo=1')).toEqual({ status: 'none', entries: [] })
  })

  it('starts fresh and reports invalid for a malformed code', async () => {
    expect(await hydrateLedger('?build=not-a-real-code')).toEqual({
      status: 'invalid',
      entries: [],
    })
  })
})
