import { describe, it, expect } from 'vitest'
import { recompute, type Ledger } from './character'
import type { AttributeKey, Dataset, Item, Skill, StatModel } from '../types'

/* --- synthetic dataset: small, hand-built topology for precise control --- */

function skill(key: string, tier: number, requires: string[], unlock?: Skill['unlock']): Skill {
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
    ...(unlock ? { unlock } : {}),
  }
}

const SKILLS: Skill[] = [
  skill('A', 1, []),
  skill('B', 1, []),
  skill('AB', 2, ['A', 'B']), // diamond: needs both
  skill('L3', 1, [], { level: 3 }), // pure level gate
  skill('STRgate', 1, [], { level: 99, attributePoints: 2, attributes: ['STR'] }), // attr-path only
]

const item = (key: string, category: Item['category'], slot: Item['slot'], stats: Record<string, number> = {}): Item => ({
  key,
  name: { english: key },
  category,
  slot,
  stats,
  properties: {},
})

const ITEMS: Item[] = [
  item('sword', 'weapon', 'main_hand', { slashing_damage: 10 }),
  item('axe', 'weapon', 'main_hand', { rending_damage: 12 }),
  item('helm', 'armor', 'head', { fire_resistance: 5 }),
  item('ring1', 'accessory', 'ring', { magic_power: 3 }),
]

const statModel = {
  baseAttributeValue: 10,
  mainStatThresholds: [15, 20, 25, 30],
  attributeBonuses: {},
  derivedStats: [],
  aliases: {},
  deferredIdentifiers: [],
} as unknown as StatModel

const dataset: Dataset = {
  meta: { gameVersion: 'test', source: 'test' },
  attributes: [],
  trees: [{ id: 't1', name: 'T1', category: 'utility', skills: SKILLS.map((s) => s.key) }],
  skills: SKILLS,
  statFormulas: [],
  statModel,
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
}

const up = { op: 'levelUp' } as const
const addA = (attr: AttributeKey) => ({ op: 'addAttribute', attr }) as const
const addS = (skill: string) => ({ op: 'addSkill', skill }) as const
const eq = (slot: Item['slot'], item: string) => ({ op: 'equip', slot, item }) as const
const rc = (entries: Ledger) => recompute(entries, dataset)

describe('recompute — level + budgets (R3)', () => {
  it('grants +1/+1 per level and caps level at the maximum', () => {
    expect(rc([]).level).toBe(1)
    expect(rc([]).skillBudget).toBe(2)
    expect(rc([]).attributeBudget).toBe(0)

    const lvl2 = rc([up])
    expect(lvl2.level).toBe(2)
    expect(lvl2.attributeBudget).toBe(1)
    expect(lvl2.skillBudget).toBe(3)

    // 35 level-ups would be level 36; capped at 30.
    expect(rc(Array(35).fill(up)).level).toBe(30)
    expect(rc(Array(35).fill(up)).attributeBudget).toBe(29)
  })
})

describe('recompute — skills: prerequisites, unlock, budget', () => {
  it('takes a legal chain and respects the diamond requirement', () => {
    const ch = rc([up, addS('A'), addS('B'), addS('AB')])
    expect([...ch.taken].sort()).toEqual(['A', 'AB', 'B'])
    expect(ch.skillsSpent).toBe(3)
  })

  it('drops a diamond dependent when one prerequisite is refunded (cascade)', () => {
    // Refunding A = removing its entry; AB requires both A and B, so it cascades out.
    const ch = rc([up, addS('B'), addS('AB')])
    expect(ch.taken.has('B')).toBe(true)
    expect(ch.taken.has('AB')).toBe(false)
  })

  it('relocks an attribute-gated skill when invested points drop below threshold', () => {
    // STRgate needs 2 STR invested (level path unreachable). 2 points -> unlocked.
    const unlocked = rc([up, up, addA('STR'), addA('STR'), addS('STRgate')])
    expect(unlocked.attributes.STR).toBe(12)
    expect(unlocked.taken.has('STRgate')).toBe(true)

    // Remove one STR point -> invested 1 -> relocks (auto-refunds STRgate).
    const relocked = rc([up, up, addA('STR'), addS('STRgate')])
    expect(relocked.attributes.STR).toBe(11)
    expect(relocked.taken.has('STRgate')).toBe(false)
  })

  it('relocks a level-gated skill on level-down', () => {
    expect(rc([up, up, addS('L3')]).taken.has('L3')).toBe(true) // level 3
    expect(rc([up, addS('L3')]).taken.has('L3')).toBe(false) // level 2 -> relocked
  })

  it('sacrifices the most recent skills when over the skill budget (LIFO)', () => {
    // Level 1: budget 2. Three legal independent skills -> earliest two survive.
    const ch = rc([addS('A'), addS('B'), addS('L3')])
    expect(ch.level).toBe(1)
    expect(ch.taken.has('A')).toBe(true)
    expect(ch.taken.has('B')).toBe(true)
    expect(ch.taken.has('L3')).toBe(false) // most recent, over budget
  })
})

describe('recompute — attribute LIFO sacrifice (R4)', () => {
  it('keeps the earliest allocations within budget, refunding the most recent first', () => {
    const allocations = [addA('STR'), addA('AGI'), addA('PER'), addA('VIT'), addA('WIL')]
    // Plenty of levels -> all five survive.
    const full = rc([...Array(5).fill(up), ...allocations])
    expect(full.attributes).toMatchObject({ STR: 11, AGI: 11, PER: 11, VIT: 11, WIL: 11 })

    // Drop to level 4 (budget 3): the earliest three survive; VIT and WIL refunded.
    const trimmed = rc([...Array(3).fill(up), ...allocations])
    expect(trimmed.attributeBudget).toBe(3)
    expect(trimmed.attributes).toMatchObject({ STR: 11, AGI: 11, PER: 11, VIT: 10, WIL: 10 })
    expect(trimmed.attributesSpent).toBe(3)
  })
})

describe('recompute — gear equipping (M3 U1, R2)', () => {
  it('equips an item into its slot', () => {
    const ch = rc([eq('main_hand', 'sword')])
    expect(ch.equipped.main_hand?.key).toBe('sword')
    expect(ch.equipped.head).toBeUndefined()
  })

  it('lets the later equip win for the same slot', () => {
    const ch = rc([eq('main_hand', 'sword'), eq('main_hand', 'axe')])
    expect(ch.equipped.main_hand?.key).toBe('axe')
  })

  it('equips across multiple distinct slots', () => {
    const ch = rc([eq('main_hand', 'sword'), eq('head', 'helm'), eq('ring', 'ring1')])
    expect(ch.equipped.main_hand?.key).toBe('sword')
    expect(ch.equipped.head?.key).toBe('helm')
    expect(ch.equipped.ring?.key).toBe('ring1')
  })

  it('skips an equip naming an unknown item and records a note', () => {
    const ch = rc([eq('main_hand', 'ghost_item')])
    expect(ch.equipped.main_hand).toBeUndefined()
    expect(ch.notes.some((n) => n.kind === 'unknown-item-ref' && n.ref === 'ghost_item')).toBe(true)
  })

  it('skips an equip whose item does not fit the target slot', () => {
    // sword is a main_hand weapon; equipping it in the head slot is illegal.
    const ch = rc([eq('head', 'sword')])
    expect(ch.equipped.head).toBeUndefined()
    expect(ch.notes.some((n) => n.kind === 'item-slot-mismatch')).toBe(true)
  })

  it('leaves equipped empty for a gearless build', () => {
    expect(rc([up, addS('A')]).equipped).toEqual({})
  })
})

describe('recompute — patch-drift + determinism (R4)', () => {
  it('skips unknown skill refs, keeps the rest, and records a note', () => {
    const ch = rc([up, addS('A'), addS('ghost_skill'), addS('B')])
    expect(ch.taken.has('A')).toBe(true)
    expect(ch.taken.has('B')).toBe(true)
    expect(ch.taken.has('ghost_skill')).toBe(false)
    expect(ch.notes).toHaveLength(1)
    expect(ch.notes[0]).toMatchObject({ kind: 'unknown-skill-ref', ref: 'ghost_skill' })
  })

  it('is deterministic and preserves level order', () => {
    const entries: Ledger = [up, addA('STR'), up, addS('A'), addS('B')]
    const a = rc(entries)
    const b = rc(entries)
    expect(a).toEqual(b)
    expect(a.takenOrder).toEqual(['A', 'B'])
  })
})
