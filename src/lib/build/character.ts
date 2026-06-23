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
import { AttributeKey, type Dataset, type StatModel } from '../types'
import { computeDerivedStats } from './stats'
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
])
export type LedgerEntry = z.infer<typeof LedgerEntry>

/** The serializable build log. */
export const Ledger = z.array(LedgerEntry)
export type Ledger = z.infer<typeof Ledger>

/* ------------------------------------------------------------------ */
/* Recompute                                                           */
/* ------------------------------------------------------------------ */

export interface RecomputeNote {
  kind: 'unknown-skill-ref' | 'unknown-tree-ref'
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
  attributeBudget: number
  skillBudget: number
  attributesSpent: number
  skillsSpent: number
  /** Patch-drift skips (stale skill/tree refs from a loaded build). */
  notes: RecomputeNote[]
}

const ATTR_KEYS = AttributeKey.options

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

  return {
    level,
    attributes,
    invested,
    derived,
    taken,
    takenOrder,
    attributeBudget,
    skillBudget,
    attributesSpent,
    skillsSpent: taken.size,
    notes,
  }
}
