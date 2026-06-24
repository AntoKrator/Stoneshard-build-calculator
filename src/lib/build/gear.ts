/**
 * Gear stat aggregation (M3 U2) — the bridge between item stats and the formula
 * sheet.
 *
 * Item stats are keyed in snake_case (`magic_power`, `block_chance`,
 * `slashing_damage`); the derived-sheet / formula engine speaks PascalCase
 * identifiers (`Magic_Power`, `Block_Chance`). `aggregateGear` sums every equipped
 * item's `stats` and splits them two ways:
 *   - **contributions** — stats that map to a *known formula identifier*, keyed by
 *     that identifier, ready to merge into the derived sheet and scope (U3). This
 *     is what lights up the Phase-1 tooltips that referenced gear/passive stats.
 *   - **display** — everything else (per-type resistances, raw weapon damage,
 *     stats with no Phase-1 identifier), carried verbatim for the equipped-stats
 *     view (U8). Nothing is ever dropped.
 *
 * Pure: the set of known identifiers is injected by the caller (recompute), so
 * this module needs neither the stat model nor the identifier registry and stays
 * trivially testable. Gear is flat-additive in M3 (KTD5); percentage/mitigation
 * semantics are M4.
 */
import type { EquipmentSlot, Item } from '../types'

/**
 * Item-stat keys whose formula identifier differs from a plain capitalization.
 * Every target must be a real identifier (asserted by gear.test.ts — KTD4). Kept
 * deliberately small: only high-confidence name mismatches. Ambiguous cases
 * (e.g. `block_power`, `energy`, `spell_energy_cost`) stay display-only until the
 * damage model (M4) gives them a definite home.
 */
export const ITEM_STAT_OVERRIDES: Record<string, string> = {
  max_health: 'max_hp',
  skill_energy_cost: 'Abilities_Energy_Cost',
}

/** `magic_power` → `Magic_Power`; overrides win over the capitalize default. */
export function toIdentifier(statKey: string): string {
  if (statKey in ITEM_STAT_OVERRIDES) return ITEM_STAT_OVERRIDES[statKey]
  return statKey
    .split('_')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join('_')
}

export interface GearAggregate {
  /** Stat contributions keyed by formula identifier, additive across items. */
  contributions: Record<string, number>
  /** Stats with no formula identifier, keyed by their snake_case item key. */
  display: Record<string, number>
}

/**
 * Sum equipped items' stats into formula-identifier contributions + a display
 * bag. A stat maps to `contributions` iff its identifier is in `knownIdentifiers`
 * (the union of the formula vocabulary and the enumerated derived stats); every
 * other stat lands in `display`.
 */
export function aggregateGear(
  equipped: Partial<Record<EquipmentSlot, Item>>,
  knownIdentifiers: ReadonlySet<string>,
): GearAggregate {
  // Null-prototype so an item-stat key like `__proto__` can't pollute the
  // accumulator (matching the derived-stat accumulator in stats.ts).
  const contributions: Record<string, number> = Object.create(null)
  const display: Record<string, number> = Object.create(null)

  for (const item of Object.values(equipped)) {
    if (!item) continue
    for (const [key, value] of Object.entries(item.stats)) {
      const id = toIdentifier(key)
      if (knownIdentifiers.has(id)) {
        contributions[id] = (contributions[id] ?? 0) + value
      } else {
        display[key] = (display[key] ?? 0) + value
      }
    }
  }

  return { contributions, display }
}
