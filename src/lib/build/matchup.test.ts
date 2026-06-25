import { describe, it, expect } from 'vitest'
import { computeMatchup, type MatchupBuildInput } from './matchup'
import type { Enemy, EnemyAbility } from '../types'

const enemy = (over: Partial<Enemy> = {}): Enemy => ({
  key: 'restless',
  name: { english: 'Restless' },
  hp: 80,
  protection: { head: 0, chest: 0, arms: 0, legs: 0 },
  stats: {},
  abilities: [],
  properties: {},
  ...over,
})

const build = (over: Partial<MatchupBuildInput> = {}): MatchupBuildInput => ({
  damage: [{ type: 'slashing', amount: 100 }],
  protection: { head: 0, chest: 0, arms: 0, legs: 0 },
  stats: {},
  maxHp: 200,
  hasWeapon: true,
  ...over,
})

const ability = (over: Partial<EnemyAbility> = {}): EnemyAbility => ({
  key: 'flame',
  name: { english: 'Flame' },
  damage: { fire: 10 },
  properties: {},
  ...over,
})

describe('computeMatchup — build → enemy (deal)', () => {
  it('mitigates the build damage through the enemy and computes hits-to-kill', () => {
    const m = computeMatchup(build(), enemy({ hp: 80 }), [])
    expect(m.deal.total).toBe(100)
    expect(m.deal.hits).toBe(1) // ceil(80/100)
  })

  it('applies the enemy resistance and ceils hits-to-kill', () => {
    const m = computeMatchup(build(), enemy({ hp: 80, stats: { physical_resistance: 50 } }), [])
    expect(m.deal.total).toBe(50) // 100 × (1 − 0.5)
    expect(m.deal.hits).toBe(2) // ceil(80/50)
  })

  it('shows the neutral marker (empty rows, null hits) when no weapon is equipped — AE1', () => {
    const m = computeMatchup(build({ damage: [], hasWeapon: false }), enemy(), [])
    expect(m.hasWeapon).toBe(false)
    expect(m.deal.rows).toEqual([])
    expect(m.deal.total).toBe(0)
    expect(m.deal.hits).toBeNull()
  })
})

describe('computeMatchup — enemy → build (take)', () => {
  it('shows basic-attack damage with abilities off, and adds an ability when toggled on — AE2', () => {
    const e = enemy({ stats: { crushing_damage: 20 } })
    const off = computeMatchup(build(), e, [])
    expect(off.take.total).toBe(20) // basic attack only

    const on = computeMatchup(build(), e, [ability({ damage: { fire: 10 } })])
    expect(on.take.total).toBe(30) // basic 20 + ability 10
    expect(on.enabledAbilities).toEqual(['flame'])
  })

  it('applies the build mitigation to incoming damage and computes hits-to-die', () => {
    const e = enemy({ stats: { crushing_damage: 20 } })
    const b = build({ maxHp: 200, stats: { physical_resistance: 50 } })
    const m = computeMatchup(b, e, [])
    expect(m.take.total).toBe(10) // 20 × (1 − 0.5)
    expect(m.take.hits).toBe(20) // ceil(200/10)
  })
})

describe('computeMatchup — approximate hit chance (KTD4)', () => {
  it('reports accuracy-vs-dodge per direction without affecting damage', () => {
    const e = enemy({ stats: { crushing_damage: 20, accuracy: 90, dodge_chance: 30 } })
    const b = build({ stats: { accuracy: 100, dodge_chance: 0 } })
    const m = computeMatchup(b, e, [])
    expect(m.approxHitChance.dealPct).toBe(70) // build acc 100 − enemy dodge 30
    expect(m.approxHitChance.takePct).toBe(90) // enemy acc 90 − build dodge 0
    // Damage is unchanged by hit chance — still the full mitigated values.
    expect(m.deal.total).toBe(100)
    expect(m.take.total).toBe(20)
  })
})
