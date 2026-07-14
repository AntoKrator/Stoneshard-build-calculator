/**
 * The two-way enemy matchup (M5 U6) — pure compute over the build's combat output
 * and a selected enemy. Consumes the already-computed combat sheet (KTD6: passed
 * in, not re-derived) plus the enemy record, and produces both directions of the
 * exchange through the shared {@link mitigate} chain:
 *  - **deal** (build → enemy): the build's crit-weighted per-type damage through the
 *    enemy's protection + resistances → net + `hits-to-kill`;
 *  - **take** (enemy → build): the enemy's basic-attack damage plus each enabled
 *    ability's damage through the build's protection + resistances → net +
 *    `hits-to-die`.
 *
 * Both `hits` figures assume every hit lands (KTD4) — the accuracy↔dodge hit chance
 * is returned in `approxHitChance` as a separate, explicitly-approximate figure,
 * NEVER folded into the damage. Graceful markers (R9/AE1): no weapon → empty deal
 * rows; the panel shows the neutral marker rather than 0.
 */
import type { Enemy, EnemyAbility, BodypartProtection } from '../types'
import { DAMAGE_TYPES } from './combat'
import { mitigate, type DefenderProfile, type DamageInput } from './mitigate'

export interface MatchupRow {
  type: string
  raw: number
  net: number
}

export interface MatchupSide {
  rows: MatchupRow[]
  /** Total net damage per hit (sum of row nets). */
  total: number
  /** Hits to deplete the target's HP at this net, or null when no damage lands. */
  hits: number | null
}

export interface MatchupSheet {
  enemyKey: string
  enemyName: string
  enemyHp: number
  /** Build → enemy. */
  deal: MatchupSide
  /** Enemy → build (basic attack + enabled abilities). */
  take: MatchupSide
  /** Whether the build has a weapon (drives the deal-side zero state, AE1). */
  hasWeapon: boolean
  /** Accuracy-vs-dodge hit chance per direction — APPROXIMATE context, not a factor
   *  in any net-damage value (KTD4). 0..100 percent. */
  approxHitChance: { dealPct: number; takePct: number }
  /** The enabled ability keys folded into the take side. */
  enabledAbilities: string[]
}

/** The build's side of the matchup, assembled by the caller from the combat sheet
 *  + the raw gear-stat bag (so this module needs no `Character` internals). */
export interface MatchupBuildInput {
  /** Per-type expected (crit-weighted) outgoing damage — from `combat.damage`. */
  damage: DamageInput[]
  protection: BodypartProtection
  /** Raw snake_case stat bag (resistances, block, accuracy, dodge) — `gearStats`. */
  stats: Record<string, number>
  maxHp: number
  hasWeapon: boolean
}

const clampPct = (n: number) => Math.max(0, Math.min(100, n))

/** Approximate hit chance: accuracy minus the defender's dodge, clamped (KTD4).
 *  Community-derived and flagged approximate — never folded into damage. */
function approxHit(accuracy: number, dodge: number): number {
  return clampPct(accuracy - dodge)
}

function sideFrom(rows: MatchupRow[], targetHp: number): MatchupSide {
  const total = rows.reduce((s, r) => s + r.net, 0)
  return { rows, total, hits: total > 0 ? Math.ceil(targetHp / total) : null }
}

export function computeMatchup(
  build: MatchupBuildInput,
  enemy: Enemy,
  abilities: EnemyAbility[],
): MatchupSheet {
  const enemyDefender: DefenderProfile = { protection: enemy.protection, stats: enemy.stats }
  const buildDefender: DefenderProfile = { protection: build.protection, stats: build.stats }

  // Build → enemy: the build's per-type expected damage through the enemy's mitigation.
  const dealRows = mitigate(build.damage, enemyDefender).filter((r) => r.raw > 0)
  const deal = sideFrom(dealRows, enemy.hp)

  // Enemy → build: basic attack (the enemy's per-type damage columns) plus each
  // enabled ability's flat per-type damage, summed per type, through the build's
  // mitigation.
  const incoming: Record<string, number> = Object.create(null)
  for (const type of DAMAGE_TYPES) {
    const v = enemy.stats[`${type}_damage`]
    if (v) incoming[type] = (incoming[type] ?? 0) + v
  }
  for (const ability of abilities) {
    for (const [type, v] of Object.entries(ability.damage)) {
      if (v) incoming[type] = (incoming[type] ?? 0) + v
    }
  }
  const incomingInput: DamageInput[] = Object.entries(incoming).map(([type, amount]) => ({
    type,
    amount,
  }))
  const take = sideFrom(mitigate(incomingInput, buildDefender), build.maxHp)

  return {
    enemyKey: enemy.key,
    enemyName: enemy.name.english,
    enemyHp: enemy.hp,
    deal,
    take,
    hasWeapon: build.hasWeapon,
    approxHitChance: {
      dealPct: approxHit(build.stats.accuracy ?? 100, enemy.stats.dodge_chance ?? 0),
      takePct: approxHit(enemy.stats.accuracy ?? 100, build.stats.dodge_chance ?? 0),
    },
    enabledAbilities: abilities.map((a) => a.key),
  }
}
