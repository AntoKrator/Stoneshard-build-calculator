/**
 * Combat math (M4) — the derived "deal" (and, in U2, "take") layer.
 *
 * Pure: a function of the already-computed `Character` pieces — the `derived`
 * sheet, the `gearStats` display bag, and the `equipped` map. No dataset, no
 * parser, no I/O, mirroring the `stats.ts` / `gear.ts` posture so it stays
 * trivially testable and cheap on the recompute hot path. The combat numbers are
 * a **read-only view consumed by UI, not by formulas** — they never enter the
 * engine scope (only `Body_DEF`/`Legs_DEF`, derived separately in `recompute`,
 * do).
 *
 * Two stat namespaces are reconciled here (KTD4): raw per-type damage and
 * resistances live in `gearStats` keyed snake_case (`slashing_damage`,
 * `fire_resistance`); the percentage modifiers live in `derived` keyed PascalCase
 * (`Weapon_Damage`, `Crit_Efficiency`). All percentage-unit stats are normalized
 * by `/100` before use, matching the `Power / 100` convention in the game's own
 * skill formulas (KTD2 — `Crit_Efficiency` is a *bonus*, not a total multiplier).
 */
import type { EquipmentSlot, Item } from '../types'

/**
 * The 13 damage types, partitioned by their umbrella-resistance family (KTD8).
 * `physical_resistance` covers the four physical types, `nature_resistance` the
 * five nature types, `magic_resistance` the four magic types. The partition is
 * asserted exhaustive against the 13 types by `combat.test.ts` (fail-loud).
 */
export const DAMAGE_TYPE_GROUPS = {
  physical: ['slashing', 'piercing', 'crushing', 'rending'],
  nature: ['fire', 'frost', 'shock', 'poison', 'caustic'],
  magic: ['arcane', 'unholy', 'sacred', 'psionic'],
} as const

export type ResistanceGroup = keyof typeof DAMAGE_TYPE_GROUPS

/** All 13 damage types, in group order. */
export const DAMAGE_TYPES: readonly string[] = [
  ...DAMAGE_TYPE_GROUPS.physical,
  ...DAMAGE_TYPE_GROUPS.nature,
  ...DAMAGE_TYPE_GROUPS.magic,
]

/** Reverse map: damage type → its umbrella-resistance group. */
const GROUP_OF: Record<string, ResistanceGroup> = Object.create(null)
for (const group of Object.keys(DAMAGE_TYPE_GROUPS) as ResistanceGroup[]) {
  for (const t of DAMAGE_TYPE_GROUPS[group]) GROUP_OF[t] = group
}

/** Game caps (KTD7), expressed in the same percentage-point units as the stats. */
const WEAPON_DAMAGE_CAP = 200
const CRIT_EFFICIENCY_CAP = 150

/* ------------------------------------------------------------------ */
/* Shapes                                                              */
/* ------------------------------------------------------------------ */

/** The `Character` subset the combat layer reads (structurally satisfied by
 *  `Character`, so `recompute` passes the in-progress sheet directly). */
export interface CombatInput {
  derived: Record<string, number>
  gearStats: Record<string, number>
  equipped: Partial<Record<EquipmentSlot, Item>>
}

/** One damage-output row, per weapon damage type. */
export interface DamageRow {
  type: string
  /** The weapon's raw per-type damage. */
  base: number
  /** `base × Weapon_Damage% × Mainhand_Efficiency%`, plus any flat per-type gear bonus. */
  modified: number
  /** Crit-weighted expected damage on a landing hit (`Crit_Chance` × `1 + Crit_Efficiency/100`). */
  expected: number
}

export interface CombatSheet {
  /** Whether a main-hand weapon is equipped (drives the panel's zero state). */
  hasWeapon: boolean
  /** One row per weapon damage type; empty when unarmed. */
  damage: DamageRow[]
}

/* ------------------------------------------------------------------ */
/* Deal                                                                */
/* ------------------------------------------------------------------ */

/** Sum flat per-type damage contributed by equipped gear other than the weapon. */
function flatGearDamage(equipped: CombatInput['equipped']): Record<string, number> {
  const out: Record<string, number> = Object.create(null)
  for (const [slot, it] of Object.entries(equipped)) {
    if (slot === 'main_hand' || !it) continue
    for (const t of DAMAGE_TYPES) {
      const v = it.stats[`${t}_damage`]
      if (v) out[t] = (out[t] ?? 0) + v
    }
  }
  return out
}

function computeDamage(c: CombatInput): DamageRow[] {
  const weapon = c.equipped.main_hand
  const wd = Math.min(c.derived.Weapon_Damage ?? 100, WEAPON_DAMAGE_CAP) / 100
  const mh = (c.derived.Mainhand_Efficiency ?? 100) / 100
  const critChance = clamp(c.derived.Crit_Chance ?? 0, 0, 100) / 100
  const critMult = 1 + Math.min(c.derived.Crit_Efficiency ?? 0, CRIT_EFFICIENCY_CAP) / 100

  const flat = flatGearDamage(c.equipped)

  const damage: DamageRow[] = []
  for (const type of DAMAGE_TYPES) {
    const base = weapon?.stats[`${type}_damage`] ?? 0
    const bonus = flat[type] ?? 0
    if (base === 0 && bonus === 0) continue
    // Flat gear bonus applies post-multiplier (the documented default; the wiki
    // doesn't settle pre- vs post-multiplier — see the plan's Open Questions).
    const modified = base * wd * mh + bonus
    const expected = (1 - critChance) * modified + critChance * modified * critMult
    damage.push({ type, base, modified, expected })
  }
  return damage
}

/* ------------------------------------------------------------------ */
/* Entry                                                               */
/* ------------------------------------------------------------------ */

export function computeCombat(c: CombatInput): CombatSheet {
  return {
    hasWeapon: c.equipped.main_hand != null,
    damage: computeDamage(c),
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(v, hi))
}
