import { describe, it, expect } from 'vitest'
import { mitigate, weightedAvgProtection, type DefenderProfile } from './mitigate'

const prot = (v: number) => ({ head: v, chest: v, arms: v, legs: v })
const net = (rows: { type: string; net: number }[], type: string) =>
  rows.find((r) => r.type === type)!.net

describe('mitigate — official worked examples (M5 U6)', () => {
  it('subtracts full protection from physical damage (17 Crushing − 8 → 9)', () => {
    const d: DefenderProfile = { protection: prot(8), stats: {} }
    expect(net(mitigate([{ type: 'crushing', amount: 17 }], d), 'crushing')).toBe(9)
  })

  it('subtracts HALF protection from nature damage (10 Fire − 8/2 → 6)', () => {
    const d: DefenderProfile = { protection: prot(8), stats: {} }
    expect(net(mitigate([{ type: 'fire', amount: 10 }], d), 'fire')).toBe(6)
  })

  it('applies protection per damage type independently (8 Crushing + 10 Fire vs 8 → 0 + 6)', () => {
    const d: DefenderProfile = { protection: prot(8), stats: {} }
    const r = mitigate(
      [
        { type: 'crushing', amount: 8 },
        { type: 'fire', amount: 10 },
      ],
      d,
    )
    expect(net(r, 'crushing')).toBe(0)
    expect(net(r, 'fire')).toBe(6)
  })

  it('applies the capped per-type resistance last (10 Fire × (1 − 0.5) → 5)', () => {
    const d: DefenderProfile = { protection: prot(0), stats: { fire_resistance: 50 } }
    expect(net(mitigate([{ type: 'fire', amount: 10 }], d), 'fire')).toBe(5)
  })

  it('clamps resistance at 75% (10 Fire, 100 resist → 2.5)', () => {
    const d: DefenderProfile = { protection: prot(0), stats: { fire_resistance: 100 } }
    expect(net(mitigate([{ type: 'fire', amount: 10 }], d), 'fire')).toBeCloseTo(2.5, 5)
  })

  it('sums umbrella + per-type resistance', () => {
    // physical_resistance 30 + crushing_resistance 20 = 50% → 10 × 0.5 = 5
    const d: DefenderProfile = {
      protection: prot(0),
      stats: { physical_resistance: 30, crushing_resistance: 20 },
    }
    expect(net(mitigate([{ type: 'crushing', amount: 10 }], d), 'crushing')).toBe(5)
  })

  it('drains the shared Block Power pool physical-first at 1:1 / 2:1 (10 Crushing + 12 Unholy into 30 → 2 Unholy)', () => {
    const d: DefenderProfile = {
      protection: prot(0),
      stats: { block_chance: 50, block_power: 30 },
    }
    const r = mitigate(
      [
        { type: 'crushing', amount: 10 },
        { type: 'unholy', amount: 12 },
      ],
      d,
    )
    expect(net(r, 'crushing')).toBe(0) // 10 dmg drains 10 power
    expect(net(r, 'unholy')).toBe(2) // remaining 20 power blocks 10 of 12 (2:1)
  })

  it('ignores block power when the defender cannot block (block_chance 0)', () => {
    const d: DefenderProfile = { protection: prot(0), stats: { block_power: 30, block_chance: 0 } }
    expect(net(mitigate([{ type: 'crushing', amount: 10 }], d), 'crushing')).toBe(10)
  })

  it('never produces negative net damage', () => {
    const d: DefenderProfile = { protection: prot(100), stats: {} }
    expect(net(mitigate([{ type: 'crushing', amount: 5 }], d), 'crushing')).toBe(0)
  })

  it('preserves input order and carries raw alongside net', () => {
    const d: DefenderProfile = { protection: prot(0), stats: {} }
    const r = mitigate(
      [
        { type: 'fire', amount: 4 },
        { type: 'crushing', amount: 9 },
      ],
      d,
    )
    expect(r.map((x) => x.type)).toEqual(['fire', 'crushing'])
    expect(r[0].raw).toBe(4)
  })
})

describe('weightedAvgProtection', () => {
  it('returns the uniform value when all slots match', () => {
    expect(weightedAvgProtection(prot(8))).toBeCloseTo(8, 5)
  })

  it('weights chest most heavily (HIT_WEIGHTS)', () => {
    // Only chest armored → avg is chest×chestWeight / totalWeight, well below the slot value.
    const onlyChest = weightedAvgProtection({ head: 0, chest: 40, arms: 0, legs: 0 })
    expect(onlyChest).toBeGreaterThan(0)
    expect(onlyChest).toBeLessThan(40)
  })
})
