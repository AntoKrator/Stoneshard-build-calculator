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
import type { Enemy } from '../types'
import { computeDerivedStats } from './stats'
import { aggregateGear } from './gear'
import { computeCombat, type CombatSheet } from './combat'
import { computeMatchup, type MatchupSheet } from './matchup'
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
/** Upper bound on a `selectEnemy` ability list — the codec treats decoded input as
 *  untrusted, so the array is bounded at the schema layer (not just the ledger
 *  method) to close the per-entry size hole the entry-count ceiling leaves (F15). */
const MAX_ENEMY_ABILITIES = 32

export const LedgerEntry = z.discriminatedUnion('op', [
  z.object({ op: z.literal('levelUp') }),
  z.object({ op: z.literal('addAttribute'), attr: AttributeKey }),
  z.object({ op: z.literal('addSkill'), skill: z.string().min(1) }),
  z.object({ op: z.literal('equip'), slot: EquipmentSlot, item: z.string().min(1) }),
  z.object({ op: z.literal('selectCharacter'), id: z.string().min(1) }),
  z.object({
    op: z.literal('selectEnemy'),
    id: z.string().min(1),
    abilities: z.array(z.string().min(1)).max(MAX_ENEMY_ABILITIES).default([]),
  }),
])
export type LedgerEntry = z.infer<typeof LedgerEntry>

/** The serializable build log. */
export const Ledger = z.array(LedgerEntry)
export type Ledger = z.infer<typeof Ledger>

/* ------------------------------------------------------------------ */
/* Recompute                                                           */
/* ------------------------------------------------------------------ */

export interface RecomputeNote {
  kind:
    | 'unknown-skill-ref'
    | 'unknown-tree-ref'
    | 'unknown-item-ref'
    | 'item-slot-mismatch'
    | 'unknown-preset-ref'
    | 'unknown-enemy-ref'
    | 'unknown-enemy-ability-ref'
  ref: string
  message: string
}

export interface Character {
  level: number
  /** The selected character preset id, or null for the neutral/unseeded base. */
  presetId: string | null
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
  /** The selected enemy (M5), or undefined when none is chosen. */
  enemy?: Enemy
  /** The derived two-way matchup against `enemy`, read-only for UI (M5). Undefined
   *  when no enemy is selected. Never serialized — re-derives on every recompute. */
  matchup?: MatchupSheet
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

  // Shared skill lookups + the patch-drift note channel, declared up front so
  // both preset seeding and the user-op replay can resolve refs and skip-and-note.
  const skillByKey = new Map(dataset.skills.map((s) => [s.key, s]))
  const treeIds = new Set(dataset.trees.map((t) => t.id))
  const notes: RecomputeNote[] = []
  const flagged = new Set<string>()

  /** Resolve a skill key against the dataset, recording a one-time patch-drift
   *  note (unknown skill, or a known skill whose tree is gone) and returning null
   *  when it can't be used. Shared by preset seeding and the user-skill replay. */
  const resolveSkill = (key: string) => {
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
      return null
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
      return null
    }
    return skill
  }

  // 3. Character preset (KTD2/KTD3) — the LAST `selectCharacter` wins. It seeds
  //    the build OUTSIDE the point budget: a level-1 character's three innate
  //    attribute points and starting abilities exceed the level-1 budgets and
  //    would otherwise be LIFO-sacrificed/relocked. An unknown preset id is
  //    skipped-and-noted, like other patch-drift; the build is preserved.
  let presetId: string | null = null
  let preset: Dataset['presets'][number] | undefined
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i]
    if (e.op !== 'selectCharacter') continue
    preset = dataset.presets.find((p) => p.id === e.id)
    if (preset) {
      presetId = preset.id
    } else {
      notes.push({
        kind: 'unknown-preset-ref',
        ref: e.id,
        message: `Character preset "${e.id}" is no longer in the dataset and was skipped`,
      })
    }
    break
  }

  // 4. Attributes — seed the preset's starting values (innate, above base), then
  //    keep the earliest `attributeBudget` USER allocations, sacrificing the most
  //    recent ones over budget (LIFO). Seeded points don't consume the budget but
  //    do count as invested, so they gate user skills exactly as in game.
  const attributes = baseAttributes(base)
  if (preset) for (const k of ATTR_KEYS) attributes[k] = preset.attributes[k]
  const cap = c.maxAttributeValue
  let attributesSpent = 0
  for (const e of entries) {
    if (e.op !== 'addAttribute') continue
    if (attributesSpent >= attributeBudget) continue // LIFO sacrifice over budget
    // Per-attribute cap (30): skip WITHOUT spending so the freed point rolls
    // forward to a later un-capped allocation — a capped point is never wasted.
    // Distinct from the over-budget sacrifice above, which drops the point.
    if (attributes[e.attr] >= cap) continue
    attributes[e.attr]++
    attributesSpent++
  }
  const invested = baseAttributes(0)
  for (const k of ATTR_KEYS) invested[k] = Math.max(attributes[k] - base, 0)

  // 5. Derived sheet from the surviving attributes.
  const derived = computeDerivedStats(attributes, statModel)

  // 6. Skills — seed the preset's innate abilities first, outside the budget and
  //    bypassing prereq/unlock (a starting ability may be innate regardless of
  //    tier), but still resolved against the dataset so a drifted id is
  //    skipped-and-noted rather than silently taken. Then forward-replay the USER
  //    skill ops against the budget, prerequisites, and unlock. `userSkillsSpent`
  //    is the real budget counter — NOT `taken.size`, which now includes innate
  //    seeds; counting those would wrongly eat the user's free skill points.
  const taken = new Set<string>()
  const takenOrder: string[] = []
  if (preset) {
    for (const key of preset.startingSkills) {
      if (taken.has(key)) continue // de-dupe within the seed
      if (!resolveSkill(key)) continue
      taken.add(key)
      takenOrder.push(key)
    }
  }

  let userSkillsSpent = 0
  for (const e of entries) {
    if (e.op !== 'addSkill') continue
    const key = e.skill
    if (taken.has(key)) continue // de-dupe (incl. an innate the user re-buys)

    const skill = resolveSkill(key)
    if (!skill) continue

    if (userSkillsSpent >= skillBudget) continue // LIFO sacrifice over budget
    if (!skill.requires.every((r) => taken.has(r))) continue // cascade: prereq missing
    if (!isUnlocked(skill.unlock, level, attributes, base)) continue // relock

    taken.add(key)
    takenOrder.push(key)
    userSkillsSpent++
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

  // 7b. Body_DEF / Legs_DEF (M4 U3, R5): the equipped chestpiece's and boots'
  //     Protection feed three melee skill formulas (Battering Ram, Leg Sweep,
  //     Mighty Kick). Read from the slot directly — NOT the summed
  //     gearStats.protection, which has lost the per-slot split. Written into
  //     `derived` (and thus the scope) only when the slot is occupied, so the
  //     tooltips resolve with armor and degrade to the neutral marker without it.
  if (equipped.body) derived.Body_DEF = equipped.body.stats.protection ?? 0
  if (equipped.boots) derived.Legs_DEF = equipped.boots.stats.protection ?? 0

  // 8. Combat view (M4): self damage output + mitigation, derived purely from the
  //    sheet, gear bag, and equipped items. Read-only — consumed by UI, not scope.
  const combat = computeCombat({ derived, gearStats, equipped })

  // 9. Enemy matchup (M5): the LAST `selectEnemy` wins. Resolve the enemy and its
  //    enabled abilities against the dataset (stale id/ability → skip-and-note, like
  //    other patch-drift), then derive the two-way exchange from the just-computed
  //    combat sheet. Never serialized — re-derives here on every recompute.
  let enemy: Enemy | undefined
  let matchup: MatchupSheet | undefined
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i]
    if (e.op !== 'selectEnemy') continue
    enemy = dataset.enemies.find((en) => en.key === e.id)
    if (!enemy) {
      notes.push({
        kind: 'unknown-enemy-ref',
        ref: e.id,
        message: `Enemy "${e.id}" is no longer in the dataset and was skipped`,
      })
      break
    }
    const abilityByKey = new Map(dataset.enemyAbilities.map((a) => [a.key, a]))
    const ownAbilities = new Set(enemy.abilities)
    const abilities = []
    for (const key of e.abilities) {
      const ability = abilityByKey.get(key)
      if (ability && ownAbilities.has(key)) {
        abilities.push(ability)
      } else if (!flagged.has(`enemy-ability:${key}`)) {
        flagged.add(`enemy-ability:${key}`)
        notes.push({
          kind: 'unknown-enemy-ability-ref',
          ref: key,
          message: `Enemy ability "${key}" is not available on "${enemy.key}" and was skipped`,
        })
      }
    }
    matchup = computeMatchup(
      {
        damage: combat.damage.map((d) => ({ type: d.type, amount: d.expected })),
        protection: combat.protection,
        stats: gearStats,
        maxHp: combat.maxHp,
        hasWeapon: combat.hasWeapon,
      },
      enemy,
      abilities,
    )
    break
  }

  return {
    level,
    presetId,
    attributes,
    invested,
    derived,
    taken,
    takenOrder,
    equipped,
    gearStats,
    combat,
    ...(enemy ? { enemy } : {}),
    ...(matchup ? { matchup } : {}),
    attributeBudget,
    skillBudget,
    attributesSpent,
    skillsSpent: userSkillsSpent,
    notes,
  }
}
