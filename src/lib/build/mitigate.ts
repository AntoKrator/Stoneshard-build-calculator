/**
 * The shared damage-mitigation chain (M5 U6, KTD3) — a NEW pure module, not an
 * extraction (M4's `combat.ts` computes display metrics, never applies mitigation
 * to a damage row). Used by BOTH matchup directions so the math is identical.
 *
 * Applies the officially-documented order **block → protection → resistance** to
 * each per-type damage row, against a plain-data {@link DefenderProfile}:
 *  - **Block** drains a shared Block Power pool — physical 1 power/damage, nature
 *    & magic 2 power/damage — in physical-first order (the order the wiki worked
 *    example encodes). A single-exchange first-hit absorption estimate (KTD3), not
 *    the game's per-turn pool simulation; `block_chance` is context-only, never here.
 *  - **Protection** is the `HIT_WEIGHTS`-weighted average across the four bodypart
 *    pools (rows carry no bodypart), subtracted flat: physical 1:1, nature & magic
 *    2:1 (halved). Magic-2:1 is assumed (see plan Open Questions).
 *  - **Resistance** is the capped per-type fraction via `resistanceFor`.
 *
 * Dependency direction: this imports the resistance primitive + constants from
 * `combat.ts`; `combat.ts` imports nothing here (no cycle, M4 untouched).
 */
import type { BodypartProtection } from '../types'
import { DAMAGE_TYPE_GROUPS, HIT_WEIGHTS, resistanceFor } from './combat'

/** One per-type damage amount to mitigate. */
export interface DamageInput {
  type: string
  amount: number
}

/** One mitigated per-type result. */
export interface MitigatedRow {
  type: string
  /** Damage before mitigation. */
  raw: number
  /** Damage after block → protection → resistance. */
  net: number
}

/**
 * A target's defenses as plain data (KTD3 — no closures): per-bodypart protection
 * and a snake_case `stats` bag carrying resistances (`fire_resistance`, …) and the
 * block pool (`block_power`, `block_chance`). Built identically for both sides —
 * the enemy from `enemy.stats`/`enemy.protection`, the build from `gearStats`/the
 * combat sheet's protection.
 */
export interface DefenderProfile {
  protection: BodypartProtection
  stats: Record<string, number>
}

const PHYSICAL = new Set<string>(DAMAGE_TYPE_GROUPS.physical)
const isPhysical = (type: string) => PHYSICAL.has(type)

/** Block Power cost to block one point of damage of this type (KTD3). */
const blockCost = (type: string) => (isPhysical(type) ? 1 : 2)

/** HIT_WEIGHTS-weighted average flat protection across the four bodypart pools. */
export function weightedAvgProtection(p: BodypartProtection): number {
  let weighted = 0
  let weightSum = 0
  for (const pool of Object.keys(HIT_WEIGHTS) as (keyof typeof HIT_WEIGHTS)[]) {
    weighted += p[pool] * HIT_WEIGHTS[pool]
    weightSum += HIT_WEIGHTS[pool]
  }
  return weightSum > 0 ? weighted / weightSum : 0
}

/** Whether a defender has an active Block Power pool (can block AND has power). */
function blockPool(defender: DefenderProfile): number {
  const chance = defender.stats.block_chance ?? 0
  const power = defender.stats.block_power ?? 0
  return chance > 0 && power > 0 ? power : 0
}

/**
 * Apply the mitigation chain to a set of per-type damage rows against `defender`.
 * Deterministic and pure; returns one {@link MitigatedRow} per input in the
 * SAME order (block is computed in physical-first order internally).
 */
export function mitigate(rows: DamageInput[], defender: DefenderProfile): MitigatedRow[] {
  const avgProt = weightedAvgProtection(defender.protection)
  let pool = blockPool(defender)

  // Block drains the shared pool in physical-first order (the worked-example rule),
  // so compute the blocked amount per row in that order first.
  const blocked = new Map<number, number>() // input index → damage blocked
  const order = rows
    .map((_, i) => i)
    .sort((a, b) => {
      const pa = isPhysical(rows[a].type) ? 0 : 1
      const pb = isPhysical(rows[b].type) ? 0 : 1
      return pa - pb
    })
  for (const i of order) {
    if (pool <= 0) break
    const cost = blockCost(rows[i].type)
    const absorbable = Math.min(rows[i].amount, pool / cost)
    blocked.set(i, absorbable)
    pool -= absorbable * cost
  }

  return rows.map((row, i) => {
    let amount = row.amount - (blocked.get(i) ?? 0)
    // Protection: full for physical, halved for nature/magic.
    const prot = isPhysical(row.type) ? avgProt : avgProt / 2
    amount = Math.max(0, amount - prot)
    // Resistance: capped per-type fraction, last.
    amount *= 1 - resistanceFor(row.type, defender.stats)
    return { type: row.type, raw: row.amount, net: amount }
  })
}
