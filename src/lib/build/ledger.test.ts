import { describe, it, expect } from 'vitest'
import { BuildLedger } from './ledger.svelte'
import type { Dataset, Item, Skill, StatModel } from '../types'

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
    values: {},
  },
  items: ITEMS,
  enchantments: [],
  presets: [],
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
