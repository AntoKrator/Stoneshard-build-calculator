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

  it('exercises the Mainhand Efficiency leg of the multiplier (120 → ×1.2)', () => {
    const sheet = computeCombat(
      input({
        derived: {
          Weapon_Damage: 100,
          Mainhand_Efficiency: 120,
          Crit_Chance: 0,
          Crit_Efficiency: 0,
        },
        equipped: { main_hand: item('sword', 'main_hand', { slashing_damage: 20 }) },
      }),
    )
    expect(row(sheet, 'slashing')!.modified).toBe(24) // 20 × 1.0 × 1.2
  })

  it('floors negative offensive modifiers so damage never goes below 0', () => {
    const sheet = computeCombat(
      input({
        derived: {
          Weapon_Damage: -50,
          Mainhand_Efficiency: -20,
          Crit_Chance: -10,
          Crit_Efficiency: -30,
        },
        equipped: { main_hand: item('sword', 'main_hand', { slashing_damage: 20 }) },
      }),
    )
    const s = row(sheet, 'slashing')!
    expect(s.modified).toBe(0)
    expect(s.expected).toBe(0)
  })

  it('emits a damage row from a flat gear bonus even when the weapon lacks that type', () => {
    const sheet = computeCombat(
      input({
        equipped: {
          main_hand: item('sword', 'main_hand', { slashing_damage: 20 }), // no fire
          ring: item('emberband', 'ring', { fire_damage: 5 }, 'accessory'),
        },
      }),
    )
    const fire = row(sheet, 'fire')!
    expect(fire.base).toBe(0)
    expect(fire.modified).toBe(5) // pure flat bonus, post-multiplier
  })

  it('renders no damage rows when unarmed', () => {
    const sheet = computeCombat(input({ equipped: {} }))
    expect(sheet.hasWeapon).toBe(false)
    expect(sheet.damage).toEqual([])
  })
})

describe('combat — mitigation + durability ("take", U2/R3/R4)', () => {
  const armor = (key: string, slot: Item['slot'], protection: number): Item =>
    item(key, slot, { protection }, 'armor')

  const def = (sheet: ReturnType<typeof computeCombat>, type: string) =>
    sheet.defense.find((d) => d.type === type)!

  it('reads per-bodypart protection from the four armor slots', () => {
    const sheet = computeCombat(
      input({
        equipped: { body: armor('cuirass', 'body', 8), boots: armor('greaves', 'boots', 4) },
      }),
    )
    expect(sheet.protection).toEqual({ head: 0, chest: 8, arms: 0, legs: 4 })
    expect(sheet.hasArmor).toBe(true)
  })

  it('hit-weights the average protection, normalized by the actual weight sum', () => {
    // Equal protection across all four pools → the average is that value regardless of weights.
    const all10 = computeCombat(
      input({
        equipped: {
          head: armor('helm', 'head', 10),
          body: armor('cuirass', 'body', 10),
          gloves: armor('gaunt', 'gloves', 10),
          boots: armor('greaves', 'boots', 10),
        },
      }),
    )
    expect(all10.avgProtection).toBeCloseTo(10, 6)

    // Chest 8 + legs 4 only: (8×36.7 + 4×23.4) / 100.2.
    const mixed = computeCombat(
      input({
        equipped: { body: armor('cuirass', 'body', 8), boots: armor('greaves', 'boots', 4) },
      }),
    )
    expect(mixed.avgProtection).toBeCloseTo((8 * 36.7 + 4 * 23.4) / 100.2, 6)
  })

  it('computes per-type resistance and resistance-based effective-HP', () => {
    const sheet = computeCombat(input({ gearStats: { fire_resistance: 50 } }))
    expect(def(sheet, 'fire').resistance).toBe(0.5)
    expect(def(sheet, 'fire').effectiveHp).toBe(200) // max_hp 100 / 0.5
  })

  it('clamps resistance at 75% (effective-HP floor)', () => {
    const sheet = computeCombat(input({ gearStats: { fire_resistance: 90 } }))
    expect(def(sheet, 'fire').resistance).toBe(0.75)
    expect(def(sheet, 'fire').effectiveHp).toBe(400) // 100 / 0.25
  })

  it('sums an umbrella-group resistance with a per-type resistance (KTD8)', () => {
    const sheet = computeCombat(
      input({ gearStats: { physical_resistance: 20, slashing_resistance: 10 } }),
    )
    expect(def(sheet, 'slashing').resistance).toBe(0.3) // 20 + 10
    expect(def(sheet, 'piercing').resistance).toBe(0.2) // umbrella only
    expect(def(sheet, 'crushing').resistance).toBe(0.2)
    expect(def(sheet, 'rending').resistance).toBe(0.2)
    // A nature type is untouched by physical_resistance.
    expect(def(sheet, 'fire').resistance).toBe(0)
  })

  it('produces one defense row per damage type', () => {
    const sheet = computeCombat(input({}))
    expect(sheet.defense.length).toBe(13)
    expect(sheet.defense.map((d) => d.type)).toEqual([...DAMAGE_TYPES])
  })

  it('reports neutral defense and no armor when unequipped', () => {
    const sheet = computeCombat(input({ equipped: {}, gearStats: {} }))
    expect(sheet.hasArmor).toBe(false)
    expect(sheet.avgProtection).toBe(0)
    expect(sheet.protection).toEqual({ head: 0, chest: 0, arms: 0, legs: 0 })
    expect(sheet.defense.every((d) => d.resistance === 0 && d.effectiveHp === 100)).toBe(true)
  })

  it('yields 0 effective HP (not NaN) when max_hp is 0', () => {
    const sheet = computeCombat(
      input({ derived: { max_hp: 0 }, gearStats: { fire_resistance: 50 } }),
    )
    const fire = sheet.defense.find((d) => d.type === 'fire')!
    expect(fire.effectiveHp).toBe(0)
    expect(Number.isNaN(fire.effectiveHp)).toBe(false)
  })
})
