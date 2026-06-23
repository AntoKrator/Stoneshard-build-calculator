import { describe, it, expect } from 'vitest'
import { checkIntegrity, validateDataset } from './validate'
import { parseDataset } from './types'

/** A minimal, valid dataset; Zod fills in the rest of the defaults. */
function baseDataset() {
  return {
    meta: { gameVersion: '0.9.4.x', source: 'test' },
    attributes: [{ key: 'STR', name: 'Strength' }],
    trees: [{ id: 'swords', name: 'Swords', category: 'weaponry', skills: ['cleave', 'advance'] }],
    skills: [
      { key: 'cleave', treeId: 'swords', name: { english: 'Cleave' }, tier: 1, position: 0 },
      {
        key: 'advance',
        treeId: 'swords',
        name: { english: 'Advance' },
        tier: 2,
        position: 0,
        requires: ['cleave'],
      },
    ],
    constants: {},
  }
}

describe('parseDataset', () => {
  it('applies defaults for omitted fields', () => {
    const ds = parseDataset(baseDataset())
    expect(ds.skills[0].formulas).toEqual({})
    expect(ds.skills[0].requires).toEqual([])
    expect(ds.skills[0].maxRank).toBe(1)
    expect(ds.constants.startingLevel).toBe(1)
  })

  it('rejects an unknown attribute key', () => {
    const bad = baseDataset()
    bad.attributes[0].key = 'LUCK'
    expect(() => parseDataset(bad)).toThrow()
  })
})

describe('checkIntegrity', () => {
  it('passes a well-formed dataset', () => {
    expect(checkIntegrity(parseDataset(baseDataset()))).toEqual([])
  })

  it('flags a dangling prerequisite', () => {
    const d = baseDataset()
    d.skills[1].requires = ['does-not-exist']
    const issues = checkIntegrity(parseDataset(d))
    expect(issues.map((i) => i.kind)).toContain('dangling-prerequisite')
  })

  it('flags an unknown tree reference', () => {
    const d = baseDataset()
    d.skills[1].treeId = 'bogus'
    const issues = checkIntegrity(parseDataset(d))
    expect(issues.map((i) => i.kind)).toContain('unknown-tree-ref')
  })

  it('flags duplicate skill keys', () => {
    const d = baseDataset()
    d.skills[1].key = 'cleave'
    d.trees[0].skills = ['cleave']
    const issues = checkIntegrity(parseDataset(d))
    expect(issues.map((i) => i.kind)).toContain('duplicate-skill-key')
  })

  it('flags a tree with no tier-1 skill', () => {
    const d = baseDataset()
    d.skills[0].tier = 3
    const issues = checkIntegrity(parseDataset(d))
    expect(issues.map((i) => i.kind)).toContain('tree-missing-tier-1')
  })

  it('flags an orphan skill not listed by its tree', () => {
    const d = baseDataset()
    d.trees[0].skills = ['cleave'] // drop 'advance'
    const issues = checkIntegrity(parseDataset(d))
    expect(issues.map((i) => i.kind)).toContain('orphan-skill')
  })

  it('does not flag a cycle in an acyclic dataset', () => {
    const issues = checkIntegrity(parseDataset(baseDataset()))
    expect(issues.map((i) => i.kind)).not.toContain('requires-cycle')
  })

  it('flags a two-node requires cycle', () => {
    const d = baseDataset()
    d.skills[0].requires = ['advance']
    d.skills[1].requires = ['cleave']
    const issues = checkIntegrity(parseDataset(d))
    expect(issues.map((i) => i.kind)).toContain('requires-cycle')
  })

  it('detects a longer cycle (a -> b -> c -> a)', () => {
    const d = baseDataset()
    d.trees[0].skills = ['a', 'b', 'c']
    d.skills = [
      { key: 'a', treeId: 'swords', name: { english: 'A' }, tier: 1, position: 0, requires: ['c'] },
      { key: 'b', treeId: 'swords', name: { english: 'B' }, tier: 2, position: 0, requires: ['a'] },
      { key: 'c', treeId: 'swords', name: { english: 'C' }, tier: 3, position: 0, requires: ['b'] },
    ]
    const issues = checkIntegrity(parseDataset(d))
    expect(issues.map((i) => i.kind)).toContain('requires-cycle')
  })

  it('flags a tree-membership mismatch', () => {
    const d = baseDataset()
    // 'advance' (treeId 'swords') is also listed under a different tree.
    d.trees.push({ id: 'axes', name: 'Axes', category: 'weaponry', skills: ['advance'] })
    const issues = checkIntegrity(parseDataset(d))
    expect(issues.map((i) => i.kind)).toContain('tree-membership-mismatch')
  })

  it('flags a non-monotonic tier across a prerequisite edge', () => {
    const d = baseDataset()
    d.skills[0].requires = ['advance'] // cleave (tier 1) requires advance (tier 2)
    d.skills[1].requires = []
    const issues = checkIntegrity(parseDataset(d))
    expect(issues.map((i) => i.kind)).toContain('non-monotonic-tier')
  })
})

describe('validateDataset', () => {
  it('returns the parsed dataset and an empty issue list for valid data', () => {
    const { dataset, issues } = validateDataset(baseDataset())
    expect(dataset.skills).toHaveLength(2)
    expect(issues).toEqual([])
  })
})
