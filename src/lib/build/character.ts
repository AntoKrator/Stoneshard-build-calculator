/**
 * The deterministic recompute core (U4, KTD4/KTD13).
 *
 * The build is a **flat, ordered log** of positive decisions — `levelUp`,
 * `addAttribute`, `addSkill`. Level-downs and refunds are performed by *removing*
 * entries (see `ledger.svelte.ts`); the log therefore only ever contains these
 * three entry types, which is also exactly what the share codec serializes.
 *
 * `recompute(entries, dataset)` rebuilds the whole character from the log and is
 * the single place legality is enforced. It tolerates *any* input log — including
 * over-budget or stale ones loaded from a share code — and never throws:
 *   - **LIFO sacrifice**: attribute/skill allocations beyond the level's budget
 *     are dropped most-recent-first (the earliest within-budget ones survive).
 *   - **Relock**: every taken skill is re-validated against the post-replay level
 *     and attributes; one whose unlock or prerequisites no longer hold is dropped,
 *     which cascades to its dependents (a skill needs *all* its `requires`).
 *   - **Patch-drift**: an entry naming a skill/tree absent from the current
 *     dataset is skipped and recorded in `notes`, never discarding the build.
 */
import { z } from 'zod'
import {
  AttributeKey,
  EquipmentSlot,
  slotFitsCategory,
  type Dataset,
  type Item,
  type StatModel,
} from '../types'
import { computeDerivedStats } from './stats'
import { aggregateGear } from './gear'
import { computeCombat, type CombatSheet } from './combat'
import { KNOWN_STAT_IDENTIFIERS } from '../formula/identifiers'
import { earnedAttributePoints, earnedSkillPoints, isUnlocked, type Attributes } from './economy'

/* ------------------------------------------------------------------ */
/* Ledger log                                                          */
/* ------------------------------------------------------------------ */

/**
 * One entry in the build log. Only positive decisions are recorded; refunds and
 * level-downs remove entries rather than adding them. (Rank is binary in Phase 1
 * — every skill is `maxRank: 1`. A future multi-rank dataset can add a `rank`
 * field to `addSkill` without changing the log's shape.)
 */
export const LedgerEntry = z.discriminatedUnion('op', [
  z.object({ op: z.literal('levelUp') }),
  z.object({ op: z.literal('addAttribute'), attr: AttributeKey }),
  z.object({ op: z.literal('addSkill'), skill: z.string().min(1) }),
  z.object({ op: z.literal('equip'), slot: EquipmentSlot, item: z.string().min(1) }),
])
export type LedgerEntry = z.infer<typeof LedgerEntry>

/** The serializable build log. */
export const Ledger = z.array(LedgerEntry)
export type Ledger = z.infer<typeof Ledger>

/* ------------------------------------------------------------------ */
/* Recompute                                                           */
/* ------------------------------------------------------------------ */

export interface RecomputeNote {
  kind: 'unknown-skill-ref' | 'unknown-tree-ref' | 'unknown-item-ref' | 'item-slot-mismatch'
  ref: string
  message: string
}

export interface Character {
  level: number
  attributes: Attributes
  /** Per-attribute points invested above the base (for unlock display). */
  invested: Attributes
  derived: Record<string, number>
  /** Skills currently taken (legal), and the order they resolved in. */
  taken: Set<string>
  takenOrder: string[]
  /** Items currently equipped, one per occupied slot (last-equip-wins). */
  equipped: Partial<Record<EquipmentSlot, Item>>
  /** Gear stats with no formula identifier (resistances, raw weapon damage, …),
   *  keyed by their snake_case item key — for the equipped-stats view. */
  gearStats: Record<string, number>
  /** Derived combat view (self damage output + mitigation), read-only for UI (M4). */
  combat: CombatSheet
  attributeBudget: number
  skillBudget: number
  attributesSpent: number
  skillsSpent: number
  /** Patch-drift skips (stale skill/tree refs from a loaded build). */
  notes: RecomputeNote[]
}

const ATTR_KEYS = AttributeKey.options

/**
 * The formula-identifier sets gear is checked against, memoized per stat model.
 * `known` (the formula vocabulary ∪ enumerated derived stats) decides whether a
 * gear stat merges into the sheet/scope; `enumerated` decides whether it shows as
 * a main sheet row or in the From Gear view. recompute runs on every build edit,
 * so memoizing avoids rebuilding these ~50-element sets on the interactive path.
 */
interface IdentifierSets {
  known: ReadonlySet<string>
  enumerated: ReadonlySet<string>
}
const identifierCache = new WeakMap<StatModel, IdentifierSets>()
function identifierSetsFor(statModel: StatModel): IdentifierSets {
  let sets = identifierCache.get(statModel)
  if (!sets) {
    const enumerated = new Set(statModel.derivedStats.map((d) => d.key))
    const known = new Set<string>([...KNOWN_STAT_IDENTIFIERS, ...enumerated])
    sets = { known, enumerated }
    identifierCache.set(statModel, sets)
  }
  return sets
}

function baseAttributes(base: number): Attributes {
  const a = {} as Attributes
  for (const k of ATTR_KEYS) a[k] = base
  return a
}

export function recompute(entries: Ledger, dataset: Dataset): Character {
  const c = dataset.constants
  const base = c.baseAttributeValue
  const statModel = dataset.statModel as StatModel

  // 1. Level — capped at the configured maximum.
  const levelUps = entries.reduce((n, e) => n + (e.op === 'levelUp' ? 1 : 0), 0)
  const level = Math.min(c.startingLevel + levelUps, c.maxLevel ?? Infinity)

  // 2. Budgets earned by that level.
  const attributeBudget = earnedAttributePoints(level, c)
  const skillBudget = earnedSkillPoints(level, c)

  // 3. Attributes — keep the earliest `attributeBudget` allocations, sacrificing
  //    the most recent ones over budget (LIFO).
  const attributes = baseAttributes(base)
  let attributesSpent = 0
  for (const e of entries) {
    if (e.op !== 'addAttribute') continue
    if (attributesSpent >= attributeBudget) continue // LIFO sacrifice over budget
    attributes[e.attr]++
    attributesSpent++
  }
  const invested = baseAttributes(0)
  for (const k of ATTR_KEYS) invested[k] = Math.max(attributes[k] - base, 0)

  // 4. Derived sheet from the surviving attributes.
  const derived = computeDerivedStats(attributes, statModel)

  // 5. Skills — forward replay enforcing budget, prerequisites, and unlock against
  //    the final level/attributes. Illegal skills drop and cascade naturally:
  //    a dependent processed after a dropped prerequisite fails its requires-check.
  const skillByKey = new Map(dataset.skills.map((s) => [s.key, s]))
  const treeIds = new Set(dataset.trees.map((t) => t.id))
  const taken = new Set<string>()
  const takenOrder: string[] = []
  const notes: RecomputeNote[] = []
  const flagged = new Set<string>()

  for (const e of entries) {
    if (e.op !== 'addSkill') continue
    const key = e.skill
    if (taken.has(key)) continue // de-dupe

    const skill = skillByKey.get(key)
    if (!skill) {
      if (!flagged.has(`skill:${key}`)) {
        flagged.add(`skill:${key}`)
        notes.push({
          kind: 'unknown-skill-ref',
          ref: key,
          message: `Skill "${key}" is no longer in the dataset and was skipped`,
        })
      }
      continue
    }
    if (!treeIds.has(skill.treeId)) {
      if (!flagged.has(`tree:${skill.treeId}`)) {
        flagged.add(`tree:${skill.treeId}`)
        notes.push({
          kind: 'unknown-tree-ref',
          ref: skill.treeId,
          message: `Tree "${skill.treeId}" is no longer in the dataset; skill "${key}" was skipped`,
        })
      }
      continue
    }

    if (taken.size >= skillBudget) continue // LIFO sacrifice over budget
    if (!skill.requires.every((r) => taken.has(r))) continue // cascade: prereq missing
    if (!isUnlocked(skill.unlock, level, attributes, base)) continue // relock

    taken.add(key)
    takenOrder.push(key)
  }

  // 6. Equipment — replay equip entries; last-equip-wins per slot. An equip whose
  //    item is absent from the dataset, or whose item doesn't fit the target slot,
  //    is skipped and noted — the same fail-soft posture as skills (patch-drift).
  const itemByKey = new Map(dataset.items.map((i) => [i.key, i]))
  const equipped: Partial<Record<EquipmentSlot, Item>> = {}
  for (const e of entries) {
    if (e.op !== 'equip') continue
    const it = itemByKey.get(e.item)
    if (!it) {
      if (!flagged.has(`item:${e.item}`)) {
        flagged.add(`item:${e.item}`)
        notes.push({
          kind: 'unknown-item-ref',
          ref: e.item,
          message: `Item "${e.item}" is no longer in the dataset and was skipped`,
        })
      }
      continue
    }
    if (it.slot !== e.slot || !slotFitsCategory(it.category, e.slot)) {
      if (!flagged.has(`slot:${e.item}:${e.slot}`)) {
        flagged.add(`slot:${e.item}:${e.slot}`)
        notes.push({
          kind: 'item-slot-mismatch',
          ref: e.item,
          message: `Item "${e.item}" (slot "${it.slot}") does not fit slot "${e.slot}" and was skipped`,
        })
      }
      continue
    }
    equipped[e.slot] = it
  }

  // 7. Gear → sheet: split equipped stats into formula-identifier contributions
  //    (merged additively into the derived sheet, so a stat gear provides — incl.
  //    a previously-deferred identifier — enters the scope and lights up its
  //    tooltip) and a display bag for everything without an identifier (U2/U3).
  const { known, enumerated } = identifierSetsFor(statModel)
  const gear = aggregateGear(equipped, known)
  const gearStats: Record<string, number> = Object.assign(Object.create(null), gear.display)
  for (const [id, v] of Object.entries(gear.contributions)) {
    derived[id] = (derived[id] ?? 0) + v
    // A contribution to an enumerated stat shows in its main sheet row; one to a
    // deferred identifier (Pyromantic_Power, Knockback_Chance, …) would otherwise
    // render nowhere, so surface it in the From Gear view too.
    if (!enumerated.has(id)) gearStats[id] = (gearStats[id] ?? 0) + v
  }

  // 8. Combat view (M4): self damage output + mitigation, derived purely from the
  //    sheet, gear bag, and equipped items. Read-only — consumed by UI, not scope.
  const combat = computeCombat({ derived, gearStats, equipped })

  return {
    level,
    attributes,
    invested,
    derived,
    taken,
    takenOrder,
    equipped,
    gearStats,
    combat,
    attributeBudget,
    skillBudget,
    attributesSpent,
    skillsSpent: taken.size,
    notes,
  }
}
