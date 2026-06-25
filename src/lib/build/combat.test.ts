import { describe, it, expect } from 'vitest'
import { computeCombat, DAMAGE_TYPES, DAMAGE_TYPE_GROUPS, type CombatInput } from './combat'
import type { Item } from '../types'

/* --- synthetic fixtures: build CombatInput pieces directly for precise control --- */

const item = (
  key: string,
  slot: Item['slot'],
  stats: Record<string, number> = {},
  category: Item['category'] = 'weapon',
): Item => ({ key, name: { english: key }, category, slot, stats, properties: {} })

/** Base-character modifiers (no gear effect): the stat-model bases. Crit off by
 *  default so `modified` assertions are clean; individual tests opt into crit. */
function input(over: Partial<CombatInput> = {}): CombatInput {
  return {
    derived: {
      Weapon_Damage: 100,
      Mainhand_Efficiency: 100,
      Crit_Chance: 0,
      Crit_Efficiency: 0,
      max_hp: 100,
      ...(over.derived ?? {}),
    },
    gearStats: over.gearStats ?? {},
    equipped: over.equipped ?? {},
  }
}

const row = (sheet: ReturnType<typeof computeCombat>, type: string) =>
  sheet.damage.find((d) => d.type === type)

describe('combat — vocabulary invariants (KTD7/KTD8 fail-loud)', () => {
  it('the three resistance groups partition exactly the 13 damage types', () => {
    const grouped = [
      ...DAMAGE_TYPE_GROUPS.physical,
      ...DAMAGE_TYPE_GROUPS.nature,
      ...DAMAGE_TYPE_GROUPS.magic,
    ]
    expect(grouped.length).toBe(13)
    expect(new Set(grouped).size).toBe(13)
    expect([...grouped].sort()).toEqual([...DAMAGE_TYPES].sort())
  })
})

describe('combat — damage output ("deal", U1/R1/R2)', () => {
  it('modifies a weapon per-type damage by Weapon Damage % and Mainhand Efficiency %', () => {
    const sheet = computeCombat(
      input({ equipped: { main_hand: item('sword', 'main_hand', { slashing_damage: 20 }) } }),
    )
    expect(sheet.hasWeapon).toBe(true)
    const s = row(sheet, 'slashing')!
    expect(s.base).toBe(20)
    expect(s.modified).toBe(20) // base modifiers → ×1 ×1
    expect(s.expected).toBe(20) // crit off
  })

  it('scales modified with Weapon Damage % (150 → ×1.5)', () => {
    const sheet = computeCombat(
      input({
        derived: {
          Weapon_Damage: 150,
          Mainhand_Efficiency: 100,
          Crit_Chance: 0,
          Crit_Efficiency: 0,
        },
        equipped: { main_hand: item('sword', 'main_hand', { slashing_damage: 20 }) },
      }),
    )
    expect(row(sheet, 'slashing')!.modified).toBe(30)
  })

  it('clamps Weapon Damage at 200%', () => {
    const sheet = computeCombat(
      input({
        derived: {
          Weapon_Damage: 250,
          Mainhand_Efficiency: 100,
          Crit_Chance: 0,
          Crit_Efficiency: 0,
        },
        equipped: { main_hand: item('sword', 'main_hand', { slashing_damage: 20 }) },
      }),
    )
    expect(row(sheet, 'slashing')!.modified).toBe(40) // ×2.0, not ×2.5
  })

  it('folds crit as a bonus (1 + CE/100), not a total multiplier; clamps CE at 150', () => {
    const sheet = computeCombat(
      input({
        derived: {
          Weapon_Damage: 100,
          Mainhand_Efficiency: 100,
          Crit_Chance: 25,
          Crit_Efficiency: 200,
        },
        equipped: { main_hand: item('sword', 'main_hand', { slashing_damage: 20 }) },
      }),
    )
    const s = row(sheet, 'slashing')!
    expect(s.modified).toBe(20)
    // CE clamps 200→150 → critMult 2.5; expected = 0.75×20 + 0.25×20×2.5 = 27.5
    expect(s.expected).toBe(27.5)
  })

  it('produces one independently-modified row per weapon damage type', () => {
    const sheet = computeCombat(
      input({
        derived: {
          Weapon_Damage: 150,
          Mainhand_Efficiency: 100,
          Crit_Chance: 0,
          Crit_Efficiency: 0,
        },
        equipped: {
          main_hand: item('flamebrand', 'main_hand', { slashing_damage: 20, fire_damage: 10 }),
        },
      }),
    )
    expect(sheet.damage.length).toBe(2)
    expect(row(sheet, 'slashing')!.modified).toBe(30)
    expect(row(sheet, 'fire')!.modified).toBe(15)
  })

  it('ignores modifier-style _damage keys (weapon/armor/bodypart) — not damage types', () => {
    const sheet = computeCombat(
      input({
        equipped: {
          main_hand: item('maul', 'main_hand', {
            crushing_damage: 12,
            armor_damage: 50,
            bodypart_damage: 30,
            weapon_damage: 5,
          }),
        },
      }),
    )
    expect(sheet.damage.map((d) => d.type)).toEqual(['crushing'])
  })

  it('folds a flat per-type damage bonus from non-weapon gear, post-multiplier', () => {
    const sheet = computeCombat(
      input({
        derived: {
          Weapon_Damage: 200,
          Mainhand_Efficiency: 100,
          Crit_Chance: 0,
          Crit_Efficiency: 0,
        },
        equipped: {
          main_hand: item('sword', 'main_hand', { fire_damage: 10 }),
          ring: item('emberband', 'ring', { fire_damage: 5 }, 'accessory'),
        },
      }),
    )
    // weapon base 10 × 2.0 = 20, + ring flat 5 (post-multiplier) = 25
    expect(row(sheet, 'fire')!.modified).toBe(25)
  })

  it('renders no damage rows when unarmed', () => {
    const sheet = computeCombat(input({ equipped: {} }))
    expect(sheet.hasWeapon).toBe(false)
    expect(sheet.damage).toEqual([])
  })
})
