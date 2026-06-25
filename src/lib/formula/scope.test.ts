import { describe, it, expect } from 'vitest'
import { buildScope, type Attributes } from './scope'
import { evaluate } from './eval'
import type { StatModel } from '../types'

const attributes: Attributes = { STR: 12, AGI: 10, PER: 10, VIT: 18, WIL: 20 }
const derived = { Magic_Power: 130, Block_Chance: 3, max_hp: 145 }

// Minimal stat-model fixture: only the fields buildScope reads.
const statModel = {
  baseAttributeValue: 10,
  mainStatThresholds: [15, 20, 25, 30],
  attributeBonuses: {},
  derivedStats: [],
  aliases: { Vitality: 'VIT', HP: 'max_hp' },
  deferredIdentifiers: ['Arcanistic_Power', 'Body_DEF'],
} as unknown as StatModel

describe('scope builder', () => {
  it('exposes attributes and derived stats', () => {
    const scope = buildScope(attributes, derived, statModel)
    expect(scope.STR).toBe(12)
    expect(scope.WIL).toBe(20)
    expect(scope.Magic_Power).toBe(130)
    expect(scope.max_hp).toBe(145)
  })

  it('resolves aliases onto an attribute or a derived stat', () => {
    const scope = buildScope(attributes, derived, statModel)
    expect(scope.Vitality).toBe(18) // -> VIT
    expect(scope.HP).toBe(145) // -> max_hp
  })

  it('omits deferred identifiers so they resolve to unknown-var', () => {
    const scope = buildScope(attributes, derived, statModel)
    expect('Arcanistic_Power' in scope).toBe(false)
    expect(evaluate('Arcanistic_Power / 100', scope)).toMatchObject({ kind: 'unknown-var' })
  })

  it('lets a gear-contributed identifier resolve a formerly-deferred formula (M3 U3, R6)', () => {
    // Recompute (U3) merges gear contributions into `derived`; a deferred
    // identifier that gear now supplies is in scope, so the same formula that
    // degraded to "—" above evaluates to a number.
    const geared = { ...derived, Arcanistic_Power: 40 }
    const scope = buildScope(attributes, geared, statModel)
    expect(scope.Arcanistic_Power).toBe(40)
    expect(evaluate('Arcanistic_Power / 100', scope)).toEqual({ kind: 'value', value: 0.4 })
  })

  it('merges optional numeric constants at lowest precedence', () => {
    const scope = buildScope(attributes, derived, statModel, { BASE_FACTOR: 2 })
    expect(scope.BASE_FACTOR).toBe(2)
  })

  it('lets a fully-in-scope formula evaluate end to end', () => {
    const scope = buildScope(attributes, derived, statModel)
    // 0.5 * Vitality + Block_Chance  (both in scope)
    expect(evaluate('0.5 * Vitality + Block_Chance', scope)).toEqual({ kind: 'value', value: 12 })
  })
})
