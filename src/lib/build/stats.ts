/**
 * Derived stat sheet — the coefficient-table computation (U3, KTD3).
 *
 * This is System 1 of the two computation systems: pure attribute arithmetic, no
 * formula parser. Each enumerated derived stat is
 *
 *   base + Σ perPoint·max(attr − baseAttributeValue, 0) + Σ perThreshold·count(t ≤ attr)
 *
 * summed across the five attributes, mirroring nstratos's `applyMainStatBonuses`.
 * Only the KTD14-enumerated, attribute-driven stats are produced; gear/passive
 * stats are intentionally absent (→ `unknown-var` when a tooltip references them).
 *
 * The output is keyed in the formula-identifier vocabulary so it merges directly
 * into the engine scope (`buildScope`).
 */
import type { AttributeKey, StatModel } from '../types'

export type Attributes = Record<AttributeKey, number>

/** Counts how many of the model's thresholds a stat value has reached. */
export function countReachedThresholds(statValue: number, thresholds: number[]): number {
  let n = 0
  for (const t of thresholds) if (statValue >= t) n++
  return n
}

export function computeDerivedStats(
  attributes: Attributes,
  statModel: StatModel,
): Record<string, number> {
  const out: Record<string, number> = {}

  // Seed every enumerated stat with its base value.
  for (const def of statModel.derivedStats) out[def.key] = def.base

  // Apply each attribute's per-point and per-threshold contributions.
  for (const [attr, bonuses] of Object.entries(statModel.attributeBonuses)) {
    const statValue = attributes[attr as AttributeKey]
    if (statValue == null) continue
    const pointsAbove = Math.max(statValue - statModel.baseAttributeValue, 0)
    const thresholds = countReachedThresholds(statValue, statModel.mainStatThresholds)

    for (const b of bonuses.perPoint) {
      if (b.stat in out) out[b.stat] += b.amount * pointsAbove
    }
    for (const b of bonuses.perThreshold) {
      if (b.stat in out) out[b.stat] += b.amount * thresholds
    }
  }

  return out
}
