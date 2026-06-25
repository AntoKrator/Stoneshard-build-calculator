/**
 * Dataset validation: Zod shape checks (via parseDataset) plus referential
 * integrity that Zod can't express on its own — dangling prerequisites,
 * unknown tree references, duplicate keys, and tree/skill cross-links.
 */
import { parseDataset, slotFitsCategory, type Dataset } from './types'

export interface IntegrityIssue {
  kind:
    | 'duplicate-skill-key'
    | 'duplicate-tree-id'
    | 'unknown-tree-ref'
    | 'unknown-skill-ref'
    | 'dangling-prerequisite'
    | 'self-prerequisite'
    | 'tree-missing-tier-1'
    | 'orphan-skill'
    | 'requires-cycle'
    | 'tree-membership-mismatch'
    | 'non-monotonic-tier'
    | 'duplicate-item-key'
    | 'unknown-damage-type'
    | 'weapon-missing-damage'
    | 'unknown-stat-key'
    | 'slot-category-mismatch'
    | 'duplicate-preset-id'
    | 'unknown-preset-skill'
    | 'unknown-preset-tree'
  message: string
}

/** Run referential-integrity checks over an already shape-valid dataset. */
export function checkIntegrity(ds: Dataset): IntegrityIssue[] {
  const issues: IntegrityIssue[] = []

  const skillKeys = new Set<string>()
  for (const s of ds.skills) {
    if (skillKeys.has(s.key)) {
      issues.push({ kind: 'duplicate-skill-key', message: `Duplicate skill key "${s.key}"` })
    }
    skillKeys.add(s.key)
  }
  // Lookup for the cross-checks below (last wins on duplicate keys, which are
  // already reported above).
  const skillByKey = new Map(ds.skills.map((s) => [s.key, s]))

  const treeIds = new Set<string>()
  for (const t of ds.trees) {
    if (treeIds.has(t.id)) {
      issues.push({ kind: 'duplicate-tree-id', message: `Duplicate tree id "${t.id}"` })
    }
    treeIds.add(t.id)
  }

  // Each skill points at a real tree; prerequisites resolve and aren't self-refs.
  for (const s of ds.skills) {
    if (!treeIds.has(s.treeId)) {
      issues.push({
        kind: 'unknown-tree-ref',
        message: `Skill "${s.key}" references unknown tree "${s.treeId}"`,
      })
    }
    for (const req of s.requires) {
      if (req === s.key) {
        issues.push({
          kind: 'self-prerequisite',
          message: `Skill "${s.key}" lists itself as a prerequisite`,
        })
      } else if (!skillKeys.has(req)) {
        issues.push({
          kind: 'dangling-prerequisite',
          message: `Skill "${s.key}" requires unknown skill "${req}"`,
        })
      }
    }
  }

  // Each tree.skills entry resolves; each tree has at least one tier-1 skill;
  // every skill is listed by its tree.
  const listedByTree = new Set<string>()
  for (const t of ds.trees) {
    for (const key of t.skills) {
      listedByTree.add(key)
      if (!skillKeys.has(key)) {
        issues.push({
          kind: 'unknown-skill-ref',
          message: `Tree "${t.id}" lists unknown skill "${key}"`,
        })
      }
    }
    const treeSkills = ds.skills.filter((s) => s.treeId === t.id)
    if (treeSkills.length > 0 && !treeSkills.some((s) => s.tier === 1)) {
      issues.push({
        kind: 'tree-missing-tier-1',
        message: `Tree "${t.id}" has no tier-1 (top) skill`,
      })
    }
  }
  for (const s of ds.skills) {
    if (!listedByTree.has(s.key)) {
      issues.push({
        kind: 'orphan-skill',
        message: `Skill "${s.key}" is not listed in any tree's skills[]`,
      })
    }
  }

  // A skill listed under a tree must actually belong to that tree. Catches the
  // case where tree.skills[] and skill.treeId disagree (each is built from a
  // different source during bootstrap).
  for (const t of ds.trees) {
    for (const key of t.skills) {
      const s = skillByKey.get(key)
      if (s && s.treeId !== t.id) {
        issues.push({
          kind: 'tree-membership-mismatch',
          message: `Skill "${key}" is listed under tree "${t.id}" but its treeId is "${s.treeId}"`,
        })
      }
    }
  }

  // Tier must strictly increase along a prerequisite edge: a skill sits below
  // everything it requires. An independent cross-check on topology — a pixel
  // bucketing error that disagrees with the prereq edges fails here.
  for (const s of ds.skills) {
    for (const req of s.requires) {
      const r = skillByKey.get(req)
      if (r && s.tier <= r.tier) {
        issues.push({
          kind: 'non-monotonic-tier',
          message: `Skill "${s.key}" (tier ${s.tier}) requires "${req}" (tier ${r.tier}); a skill's tier must exceed its prerequisites'`,
        })
      }
    }
  }

  // Cycle detection over the requires graph (resolvable edges only; dangling
  // prerequisites are reported separately). Phase 1's stat/unlock resolution
  // assumes a DAG, so a cycle is a hard integrity failure.
  issues.push(...findRequiresCycles(ds.skills, skillByKey))

  issues.push(...checkItems(ds))
  issues.push(...checkPresets(ds))

  return issues
}

/**
 * Referential integrity for character presets: unique ids, and innate
 * `startingSkills` / `affinities` that resolve to real skill keys / tree ids.
 * These cross-section refs (presets × skills × trees) live here, not in the
 * per-preset Zod schema, mirroring the item damage-type check. A drifted preset
 * (a typo'd or patch-dropped skill/tree id) fails the gate loudly rather than
 * silently seeding nothing.
 */
export function checkPresets(ds: Pick<Dataset, 'presets' | 'skills' | 'trees'>): IntegrityIssue[] {
  const issues: IntegrityIssue[] = []
  const skillKeys = new Set(ds.skills.map((s) => s.key))
  const treeIds = new Set(ds.trees.map((t) => t.id))

  const seen = new Set<string>()
  for (const p of ds.presets) {
    if (seen.has(p.id)) {
      issues.push({ kind: 'duplicate-preset-id', message: `Duplicate preset id "${p.id}"` })
    }
    seen.add(p.id)

    for (const key of p.startingSkills) {
      if (!skillKeys.has(key)) {
        issues.push({
          kind: 'unknown-preset-skill',
          message: `Preset "${p.id}" starting skill "${key}" is not a known skill`,
        })
      }
    }
    for (const tree of p.affinities) {
      if (!treeIds.has(tree)) {
        issues.push({
          kind: 'unknown-preset-tree',
          message: `Preset "${p.id}" affinity "${tree}" is not a known tree`,
        })
      }
    }
  }

  return issues
}

/**
 * Referential integrity for items, mirroring the skill checks: unique keys, a
 * slot that fits the item's family, and — for weapons — a damage type that
 * resolves to the recognized vocabulary (M2 U4). The damage-type and stat-key
 * cross-checks span two dataset sections (items × constants), so they live here
 * rather than in the per-item Zod schema. The vocabulary checks are skipped when
 * the relevant constants list is empty, so a minimal/partial dataset isn't
 * flagged for a vocabulary it never declared.
 *
 * Exported so the item generator (`scripts/transform-items.ts`) can run the same
 * checks before it writes `items.json`, the way the bootstrap generator does —
 * hence the narrow input (only the sections these checks read).
 */
export function checkItems(ds: Pick<Dataset, 'items' | 'constants'>): IntegrityIssue[] {
  const issues: IntegrityIssue[] = []
  const damageTypes = new Set(ds.constants.damageTypes)
  const statKeys = new Set(ds.constants.itemStatKeys)

  const seen = new Set<string>()
  for (const it of ds.items) {
    if (seen.has(it.key)) {
      issues.push({ kind: 'duplicate-item-key', message: `Duplicate item key "${it.key}"` })
    }
    seen.add(it.key)

    if (!slotFitsCategory(it.category, it.slot)) {
      issues.push({
        kind: 'slot-category-mismatch',
        message: `Item "${it.key}" is a ${it.category} but sits in slot "${it.slot}"`,
      })
    }

    if (it.category === 'weapon') {
      if (!it.damageType) {
        issues.push({
          kind: 'weapon-missing-damage',
          message: `Weapon "${it.key}" has no damage type`,
        })
      } else if (damageTypes.size && !damageTypes.has(it.damageType)) {
        issues.push({
          kind: 'unknown-damage-type',
          message: `Weapon "${it.key}" damage type "${it.damageType}" is not in constants.damageTypes`,
        })
      }
    }

    if (statKeys.size) {
      for (const key of Object.keys(it.stats)) {
        if (!statKeys.has(key)) {
          issues.push({
            kind: 'unknown-stat-key',
            message: `Item "${it.key}" stat "${key}" is not in constants.itemStatKeys`,
          })
        }
      }
    }
  }

  return issues
}

/** DFS cycle detection; each distinct cycle is reported once. */
function findRequiresCycles(
  skills: Dataset['skills'],
  skillByKey: Map<string, Dataset['skills'][number]>,
): IntegrityIssue[] {
  const found: IntegrityIssue[] = []
  const enum_WHITE = 0
  const enum_GRAY = 1
  const enum_BLACK = 2
  const color = new Map<string, number>()
  const stack: string[] = []
  const reported = new Set<string>()

  const visit = (key: string): void => {
    color.set(key, enum_GRAY)
    stack.push(key)
    const skill = skillByKey.get(key)
    if (skill) {
      for (const req of skill.requires) {
        if (req === key || !skillByKey.has(req)) continue // self/dangling handled elsewhere
        const c = color.get(req) ?? enum_WHITE
        if (c === enum_GRAY) {
          const start = stack.indexOf(req)
          const cycle = stack.slice(start)
          const fingerprint = [...cycle].sort().join(',')
          if (!reported.has(fingerprint)) {
            reported.add(fingerprint)
            found.push({
              kind: 'requires-cycle',
              message: `Prerequisite cycle: ${[...cycle, req].join(' → ')}`,
            })
          }
        } else if (c === enum_WHITE) {
          visit(req)
        }
      }
    }
    stack.pop()
    color.set(key, enum_BLACK)
  }

  for (const s of skills) {
    if ((color.get(s.key) ?? enum_WHITE) === enum_WHITE) visit(s.key)
  }
  return found
}

/**
 * Parse + integrity-check raw data. Throws on shape errors (ZodError); returns
 * the dataset together with any integrity issues for the caller to act on.
 */
export function validateDataset(raw: unknown): {
  dataset: Dataset
  issues: IntegrityIssue[]
} {
  const dataset = parseDataset(raw)
  const issues = checkIntegrity(dataset)
  return { dataset, issues }
}
