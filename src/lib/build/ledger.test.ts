import { describe, it, expect } from 'vitest'
import { BuildLedger } from './ledger.svelte'
import type { Dataset, Item, Preset, Skill, StatModel } from '../types'

function skill(key: string, tier: number, requires: string[]): Skill {
  return {
    key,
    treeId: 't1',
    name: { english: key },
    tier,
    position: 0,
    requires,
    formulas: {},
    isPassive: false,
    maxRank: 1,
    properties: {},
  }
}

const SKILLS = [skill('A', 1, []), skill('B', 1, []), skill('C', 1, []), skill('AB', 2, ['A', 'B'])]

const ITEMS: Item[] = [
  {
    key: 'sword',
    name: { english: 'Sword' },
    category: 'weapon',
    slot: 'main_hand',
    stats: {},
    properties: {},
  },
  {
    key: 'axe',
    name: { english: 'Axe' },
    category: 'weapon',
    slot: 'main_hand',
    stats: {},
    properties: {},
  },
  {
    key: 'helm',
    name: { english: 'Helm' },
    category: 'armor',
    slot: 'head',
    stats: {},
    properties: {},
  },
]

const PRESETS: Preset[] = [
  {
    id: 'hero',
    name: 'Hero',
    attributes: { STR: 11, AGI: 11, PER: 11, VIT: 10, WIL: 10 },
    startingSkills: ['A'], // innate, free
    trait: 'Bold',
    affinities: ['t1'],
    dlc: false,
  },
  {
    id: 'mage',
    name: 'Mage',
    attributes: { STR: 10, AGI: 10, PER: 11, VIT: 11, WIL: 11 },
    startingSkills: [],
    trait: 'Wise',
    affinities: [],
    dlc: false,
  },
]

const dataset: Dataset = {
  meta: { gameVersion: 'test', source: 'test' },
  attributes: [],
  trees: [{ id: 't1', name: 'T1', category: 'utility', skills: SKILLS.map((s) => s.key) }],
  skills: SKILLS,
  statFormulas: [],
  statModel: {
    baseAttributeValue: 10,
    mainStatThresholds: [15, 20, 25, 30],
    attributeBonuses: {},
    derivedStats: [],
    aliases: {},
    deferredIdentifiers: [],
  } as unknown as StatModel,
  constants: {
    startingLevel: 1,
    maxLevel: 30,
    startingAttributePoints: 0,
    startingSkillPoints: 2,
    attributePointsPerLevel: 1,
    skillPointsPerLevel: 1,
    baseAttributeValue: 10,
    damageTypes: [],
    itemStatKeys: [],
    enemyStatKeys: [],
    values: {},
  },
  items: ITEMS,
  enchantments: [],
  presets: PRESETS,
  enemies: [
    {
      key: 'goblin',
      name: { english: 'Goblin' },
      hp: 40,
      protection: { head: 0, chest: 0, arms: 0, legs: 0 },
      stats: { crushing_damage: 8 },
      abilities: ['smash'],
      properties: {},
    },
    {
      key: 'wolf',
      name: { english: 'Wolf' },
      hp: 30,
      protection: { head: 0, chest: 0, arms: 0, legs: 0 },
      stats: { piercing_damage: 6 },
      abilities: [],
      properties: {},
    },
  ],
  enemyAbilities: [
    {
      key: 'smash',
      name: { english: 'Smash' },
      damage: { crushing: 12 },
      properties: { source: 'https://stoneshard.com/wiki/Goblin' },
    },
  ],
}

describe('BuildLedger — level + attribute economy', () => {
  it('starts at level 1 with 2 skill points and 0 attribute points', () => {
    const l = new BuildLedger(dataset)
    expect(l.character.level).toBe(1)
    expect(l.character.skillBudget).toBe(2)
    expect(l.character.attributeBudget).toBe(0)
  })

  it('levels up and down, refusing to go below the starting level', () => {
    const l = new BuildLedger(dataset)
    expect(l.levelUp()).toEqual({ ok: true })
    expect(l.character.level).toBe(2)
    expect(l.levelDown()).toEqual({ ok: true })
    expect(l.character.level).toBe(1)
    expect(l.levelDown()).toEqual({ ok: false, reason: 'min-level' })
  })

  it('rejects attribute overspend', () => {
    const l = new BuildLedger(dataset)
    expect(l.addAttribute('STR')).toEqual({ ok: false, reason: 'no-points' }) // 0 points at level 1
    l.levelUp() // budget 1
    expect(l.addAttribute('STR')).toEqual({ ok: true })
    expect(l.character.attributes.STR).toBe(11)
    expect(l.addAttribute('STR')).toEqual({ ok: false, reason: 'no-points' })
  })
})

describe('BuildLedger — skills', () => {
  it('rejects unknown, duplicate, locked, and over-budget picks', () => {
    const l = new BuildLedger(dataset)
    expect(l.addSkill('does-not-exist')).toEqual({ ok: false, reason: 'unknown' })
    expect(l.addSkill('AB')).toEqual({ ok: false, reason: 'locked' }) // needs A and B
    expect(l.addSkill('A')).toEqual({ ok: true })
    expect(l.addSkill('A')).toEqual({ ok: false, reason: 'duplicate' })
    expect(l.addSkill('B')).toEqual({ ok: true })
    expect(l.addSkill('C')).toEqual({ ok: false, reason: 'no-points' }) // only 2 skill points
  })

  it('cascades a refund through dependents', () => {
    const l = new BuildLedger(dataset)
    l.levelUp() // budget 3, enough for A, B, AB
    l.addSkill('A')
    l.addSkill('B')
    expect(l.addSkill('AB')).toEqual({ ok: true })
    expect(l.character.taken.has('AB')).toBe(true)

    expect(l.removeSkill('A')).toEqual({ ok: true })
    expect(l.character.taken.has('A')).toBe(false)
    expect(l.character.taken.has('AB')).toBe(false) // cascaded
    expect(l.character.taken.has('B')).toBe(true)
  })

  it('round-trips its log through toLedger/load', () => {
    const l = new BuildLedger(dataset)
    l.levelUp()
    l.addSkill('A')
    const snapshot = l.toLedger()

    const l2 = new BuildLedger(dataset)
    l2.load(snapshot)
    expect(l2.character.level).toBe(2)
    expect(l2.character.taken.has('A')).toBe(true)
  })
})

describe('BuildLedger — equip/unequip (M3 U4, R2)', () => {
  it('equips a fitting item into its slot', () => {
    const l = new BuildLedger(dataset)
    expect(l.equip('main_hand', 'sword')).toEqual({ ok: true })
    expect(l.character.equipped.main_hand?.key).toBe('sword')
  })

  it('refuses an unknown item', () => {
    const l = new BuildLedger(dataset)
    expect(l.equip('main_hand', 'ghost')).toEqual({ ok: false, reason: 'no-item' })
  })

  it('refuses an item that does not fit the slot', () => {
    const l = new BuildLedger(dataset)
    expect(l.equip('head', 'sword')).toEqual({ ok: false, reason: 'wrong-slot' })
    expect(l.character.equipped.head).toBeUndefined()
  })

  it('replaces the occupant, keeping one equip per slot in the log', () => {
    const l = new BuildLedger(dataset)
    l.equip('main_hand', 'sword')
    l.equip('main_hand', 'axe')
    expect(l.character.equipped.main_hand?.key).toBe('axe')
    expect(l.toLedger().filter((e) => e.op === 'equip')).toHaveLength(1)
  })

  it('unequips a slot and refuses to unequip an empty one', () => {
    const l = new BuildLedger(dataset)
    l.equip('head', 'helm')
    expect(l.unequip('head')).toEqual({ ok: true })
    expect(l.character.equipped.head).toBeUndefined()
    expect(l.unequip('head')).toEqual({ ok: false, reason: 'not-found' })
  })
})

describe('BuildLedger — character select (U3, R3/R4)', () => {
  it('selects a known preset and seeds its identity, attributes, and innate skill', () => {
    const l = new BuildLedger(dataset)
    expect(l.selectCharacter('hero')).toEqual({ ok: true })
    expect(l.character.presetId).toBe('hero')
    expect(l.character.attributes).toMatchObject({ STR: 11, AGI: 11, PER: 11 })
    expect(l.character.taken.has('A')).toBe(true) // innate
    expect(l.character.skillsSpent).toBe(0) // the innate is free
  })

  it('refuses an unknown preset id', () => {
    const l = new BuildLedger(dataset)
    expect(l.selectCharacter('nobody')).toEqual({ ok: false, reason: 'unknown' })
    expect(l.character.presetId).toBeNull()
  })

  it('replaces a prior selection (last-wins, one entry in the log)', () => {
    const l = new BuildLedger(dataset)
    l.selectCharacter('hero')
    l.selectCharacter('mage')
    expect(l.character.presetId).toBe('mage')
    expect(l.toLedger().filter((e) => e.op === 'selectCharacter')).toHaveLength(1)
    expect(l.character.taken.has('A')).toBe(false) // hero's innate did not persist
  })

  it('clears back to the neutral base and refuses to clear when none is set', () => {
    const l = new BuildLedger(dataset)
    l.selectCharacter('hero')
    expect(l.clearCharacter()).toEqual({ ok: true })
    expect(l.character.presetId).toBeNull()
    expect(l.character.attributes).toMatchObject({ STR: 10, AGI: 10, PER: 10, VIT: 10, WIL: 10 })
    expect(l.clearCharacter()).toEqual({ ok: false, reason: 'not-found' })
  })

  it('keeps user attribute/skill edits layered on top of a selection', () => {
    const l = new BuildLedger(dataset)
    l.selectCharacter('hero')
    l.levelUp() // attribute budget 1
    expect(l.addAttribute('STR')).toEqual({ ok: true })
    expect(l.character.attributes.STR).toBe(12) // 11 seed + 1 user
    expect(l.addSkill('B')).toEqual({ ok: true }) // a user skill on top of innate A
    expect(l.character.skillsSpent).toBe(1)
  })

  it('collapses multiple selectCharacter entries from a crafted code on clear/select', () => {
    const l = new BuildLedger(dataset)
    // A hand-crafted or older share code could carry two selectCharacter entries.
    const crafted = [
      { op: 'selectCharacter', id: 'hero' },
      { op: 'selectCharacter', id: 'mage' },
    ] as const
    l.load([...crafted])
    expect(l.character.presetId).toBe('mage') // recompute honors the last

    // Clearing removes ALL of them, so the build truly returns to neutral.
    expect(l.clearCharacter()).toEqual({ ok: true })
    expect(l.character.presetId).toBeNull()
    expect(l.toLedger().filter((e) => e.op === 'selectCharacter')).toHaveLength(0)

    // Re-selecting after a crafted multi-entry load also collapses to one entry.
    l.load([...crafted])
    l.selectCharacter('hero')
    expect(l.character.presetId).toBe('hero')
    expect(l.toLedger().filter((e) => e.op === 'selectCharacter')).toHaveLength(1)
  })
})

describe('BuildLedger — enemy selection (M5 U7)', () => {
  it('selects, re-selects (last-wins), and clears an enemy', () => {
    const l = new BuildLedger(dataset)
    expect(l.selectEnemy('nope')).toEqual({ ok: false, reason: 'not-found' })
    expect(l.selectEnemy('goblin')).toEqual({ ok: true })
    expect(l.character.enemy?.key).toBe('goblin')
    expect(l.selectEnemy('wolf')).toEqual({ ok: true })
    // collapses to a single selectEnemy entry (last-wins)
    expect(l.entries.filter((e) => e.op === 'selectEnemy')).toHaveLength(1)
    expect(l.character.enemy?.key).toBe('wolf')
    expect(l.clearEnemy()).toEqual({ ok: true })
    expect(l.character.enemy).toBeUndefined()
    expect(l.clearEnemy()).toEqual({ ok: false, reason: 'not-found' })
  })

  it('toggles an ability the enemy has, keeping the array sorted + deduped', () => {
    const l = new BuildLedger(dataset)
    expect(l.toggleEnemyAbility('smash')).toEqual({ ok: false, reason: 'not-found' }) // no enemy yet
    l.selectEnemy('goblin')
    expect(l.toggleEnemyAbility('ghost')).toEqual({ ok: false, reason: 'unknown' }) // not goblin's
    expect(l.toggleEnemyAbility('smash')).toEqual({ ok: true })
    expect(l.character.matchup?.enabledAbilities).toEqual(['smash'])
    expect(l.toggleEnemyAbility('smash')).toEqual({ ok: true }) // off again
    expect(l.character.matchup?.enabledAbilities).toEqual([])
  })

  it('keeps abilities when re-selecting the same enemy, resets on a different one', () => {
    const l = new BuildLedger(dataset)
    l.selectEnemy('goblin')
    l.toggleEnemyAbility('smash')
    l.selectEnemy('goblin') // same → keep
    const sel = l.entries.find((e) => e.op === 'selectEnemy')
    expect(sel && 'abilities' in sel ? sel.abilities : null).toEqual(['smash'])
    l.selectEnemy('wolf') // different → reset
    const sel2 = l.entries.find((e) => e.op === 'selectEnemy')
    expect(sel2 && 'abilities' in sel2 ? sel2.abilities : null).toEqual([])
  })

  it('derives a matchup with a weapon equipped and degrades gracefully without one', () => {
    const l = new BuildLedger(dataset)
    l.selectEnemy('goblin')
    // No weapon yet → deal side shows the neutral marker (AE1).
    expect(l.character.matchup?.hasWeapon).toBe(false)
    expect(l.character.matchup?.deal.hits).toBeNull()
    // Incoming basic attack still computes.
    expect(l.character.matchup?.take.total).toBe(8)
  })
})

describe('BuildLedger — enemy patch-drift (M5 U7)', () => {
  it('skip-and-notes a stale enemy id from a loaded code', () => {
    const l = new BuildLedger(dataset)
    l.load([{ op: 'selectEnemy', id: 'ghost', abilities: [] }])
    expect(l.character.enemy).toBeUndefined()
    expect(l.character.matchup).toBeUndefined()
    expect(l.character.notes.some((n) => n.kind === 'unknown-enemy-ref')).toBe(true)
  })

  it('skip-and-notes a stale ability key, keeping the matchup', () => {
    const l = new BuildLedger(dataset)
    l.load([{ op: 'selectEnemy', id: 'goblin', abilities: ['ghost-ability'] }])
    expect(l.character.enemy?.key).toBe('goblin')
    expect(l.character.matchup?.enabledAbilities).toEqual([]) // stale ability dropped
    expect(l.character.notes.some((n) => n.kind === 'unknown-enemy-ability-ref')).toBe(true)
  })
})
