import { describe, it, expect } from 'vitest'
import { FUNCTION_NAMES, KNOWN_STAT_IDENTIFIERS, KNOWN_IDENTIFIERS } from './identifiers'

describe('formula identifier registry (KTD15)', () => {
  it('exposes a non-empty function set and stat set', () => {
    expect(FUNCTION_NAMES.size).toBeGreaterThan(0)
    expect(KNOWN_STAT_IDENTIFIERS.size).toBeGreaterThan(0)
  })

  it('keeps functions and stat identifiers as disjoint sets', () => {
    for (const fn of FUNCTION_NAMES) {
      expect(KNOWN_STAT_IDENTIFIERS.has(fn)).toBe(false)
    }
    for (const stat of KNOWN_STAT_IDENTIFIERS) {
      expect(FUNCTION_NAMES.has(stat)).toBe(false)
    }
  })

  it('exposes the expected function vocabulary', () => {
    expect([...FUNCTION_NAMES].sort()).toEqual(
      ['abs', 'ceil', 'floor', 'math_round', 'max', 'min', 'round'].sort(),
    )
  })

  it('KNOWN_IDENTIFIERS is exactly the union of functions and stat identifiers', () => {
    expect(KNOWN_IDENTIFIERS.size).toBe(FUNCTION_NAMES.size + KNOWN_STAT_IDENTIFIERS.size)
    for (const id of [...FUNCTION_NAMES, ...KNOWN_STAT_IDENTIFIERS]) {
      expect(KNOWN_IDENTIFIERS.has(id)).toBe(true)
    }
  })

  it('includes the load-bearing in-scope stats and the deferred boundary stats', () => {
    for (const inScope of ['Magic_Power', 'Block_Chance', 'Miracle_Chance', 'max_hp']) {
      expect(KNOWN_STAT_IDENTIFIERS.has(inScope)).toBe(true)
    }
    for (const deferred of ['Arcanistic_Power', 'Body_DEF', 'Legs_DEF']) {
      expect(KNOWN_STAT_IDENTIFIERS.has(deferred)).toBe(true)
    }
  })
})
