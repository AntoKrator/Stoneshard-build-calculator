/**
 * Dataset validation: Zod shape checks (via parseDataset) plus referential
 * integrity that Zod can't express on its own — dangling prerequisites,
 * unknown tree references, duplicate keys, and tree/skill cross-links.
 */
import { parseDataset, type Dataset } from './types'

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

  return issues
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
