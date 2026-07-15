import { describe, it, expect } from 'vitest'
import { checkIntegrity, validateDataset, checkEnemies } from './validate'
import { parseDataset, type Dataset } from './types'

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

  it('defaults maxAttributeValue to 30 when omitted', () => {
    const ds = parseDataset(baseDataset())
    expect(ds.constants.maxAttributeValue).toBe(30)
  })

  it('honors an explicit maxAttributeValue', () => {
    const d = baseDataset()
    ;(d.constants as Record<string, unknown>).maxAttributeValue = 25
    expect(parseDataset(d).constants.maxAttributeValue).toBe(25)
  })

  it('rejects an unknown attribute key', () => {
    const bad = baseDataset()
    bad.attributes[0].key = 'LUCK'
    expect(() => parseDataset(bad)).toThrow()
  })

  it('defaults enemies and enemyAbilities to [] (M5 backward-compat)', () => {
    const ds = parseDataset(baseDataset())
    expect(ds.enemies).toEqual([])
    expect(ds.enemyAbilities).toEqual([])
  })

  it('accepts a minimal enemy + ability', () => {
    const d = baseDataset() as Record<string, unknown>
    d.enemies = [
      {
        key: 'restless',
        name: { english: 'Restless' },
        hp: 80,
        protection: { head: 0, chest: 1, arms: 1, legs: 1 },
        stats: { crushing_damage: 6, physical_resistance: 50 },
        abilities: ['lunge'],
      },
    ]
    d.enemyAbilities = [
      {
        key: 'lunge',
        name: { english: 'Lunge' },
        damage: { piercing: 12 },
        properties: { source: 'https://stoneshard.com/wiki/X' },
      },
    ]
    const ds = parseDataset(d)
    expect(ds.enemies[0].protection.chest).toBe(1)
    expect(ds.enemyAbilities[0].damage.piercing).toBe(12)
  })

  it('rejects an enemy with non-positive hp or a missing protection slot', () => {
    const noHp = baseDataset() as Record<string, unknown>
    noHp.enemies = [
      {
        key: 'x',
        name: { english: 'X' },
        hp: 0,
        protection: { head: 0, chest: 0, arms: 0, legs: 0 },
      },
    ]
    expect(() => parseDataset(noHp)).toThrow()

    const noSlot = baseDataset() as Record<string, unknown>
    noSlot.enemies = [
      { key: 'x', name: { english: 'X' }, hp: 10, protection: { head: 0, chest: 0, arms: 0 } },
    ]
    expect(() => parseDataset(noSlot)).toThrow()
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

describe('checkEnemies (M5 U5)', () => {
  const enemy = (over: Record<string, unknown> = {}) => ({
    key: 'restless',
    name: { english: 'Restless' },
    hp: 80,
    protection: { head: 0, chest: 1, arms: 1, legs: 1 },
    stats: { crushing_damage: 6, physical_resistance: 50 },
    abilities: [],
    properties: {},
    ...over,
  })
  const ability = (over: Record<string, unknown> = {}) => ({
    key: 'lunge',
    name: { english: 'Lunge' },
    damage: { piercing: 12 },
    properties: { source: 'https://stoneshard.com/wiki/X' },
    ...over,
  })
  const run = (
    enemies: unknown[],
    enemyAbilities: unknown[] = [],
    statKeys = ['crushing_damage', 'physical_resistance'],
  ) =>
    checkEnemies({
      enemies,
      enemyAbilities,
      constants: { damageTypes: ['crushing', 'piercing', 'physical'], enemyStatKeys: statKeys },
    } as unknown as Pick<Dataset, 'enemies' | 'enemyAbilities' | 'constants'>)
  const kinds = (issues: { kind: string }[]) => issues.map((i) => i.kind)

  it('passes a well-formed enemy + linked ability', () => {
    expect(run([enemy({ abilities: ['lunge'] })], [ability()])).toEqual([])
  })

  it('flags a duplicate enemy key', () => {
    expect(kinds(run([enemy(), enemy()]))).toContain('duplicate-enemy-key')
  })

  it('flags an enemy stat outside the vocabulary', () => {
    expect(kinds(run([enemy({ stats: { bogus_stat: 1 } })]))).toContain('unknown-enemy-stat-key')
  })

  it('requires a non-empty stat vocabulary once enemies exist', () => {
    expect(kinds(run([enemy()], [], []))).toContain('missing-enemy-stat-vocabulary')
  })

  it('flags an enemy referencing an unknown ability', () => {
    expect(kinds(run([enemy({ abilities: ['ghost'] })]))).toContain('unknown-enemy-ability-ref')
  })

  it('flags an ability referenced by no enemy (orphan)', () => {
    expect(kinds(run([enemy()], [ability()]))).toContain('orphan-enemy-ability')
  })

  it('requires ability provenance and non-empty known-type damage', () => {
    const k = kinds(
      run(
        [enemy({ abilities: ['lunge'] })],
        [ability({ properties: {}, damage: { piercing: 12 } })],
      ),
    )
    expect(k).toContain('missing-ability-provenance')

    const k2 = kinds(run([enemy({ abilities: ['lunge'] })], [ability({ damage: {} })]))
    expect(k2).toContain('empty-ability-damage')

    const k3 = kinds(run([enemy({ abilities: ['lunge'] })], [ability({ damage: { bogus: 5 } })]))
    expect(k3).toContain('unknown-ability-damage-type')
  })

  it('flags a duplicate ability key', () => {
    const k = kinds(run([enemy({ abilities: ['lunge'] })], [ability(), ability()]))
    expect(k).toContain('duplicate-ability-key')
  })
})
