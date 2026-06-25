import { describe, it, expect } from 'vitest'
import { recompute, type Ledger } from './character'
import { buildScope } from '../formula/scope'
import { evaluate } from '../formula/eval'
import type { AttributeKey, Dataset, Item, Preset, Skill, StatModel } from '../types'

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

const item = (
  key: string,
  category: Item['category'],
  slot: Item['slot'],
  stats: Record<string, number> = {},
): Item => ({
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
  item('staff', 'weapon', 'main_hand', { pyromantic_power: 5 }),
  item('helm', 'armor', 'head', { fire_resistance: 5 }),
  item('robe', 'armor', 'body', { magic_power: 6, fire_resistance: 8 }),
  item('ring1', 'accessory', 'ring', { magic_power: 3 }),
  item('plate', 'armor', 'body', { protection: 8 }),
  item('greaves', 'armor', 'boots', { protection: 5 }),
]

const preset = (
  id: string,
  attributes: Preset['attributes'],
  startingSkills: string[] = [],
): Preset => ({
  id,
  name: id,
  attributes,
  startingSkills,
  trait: `${id}-trait`,
  affinities: [],
  dlc: false,
})

const N = { STR: 10, AGI: 10, PER: 10, VIT: 10, WIL: 10 } as const

const PRESETS: Preset[] = [
  preset('neutral', { ...N }),
  // raises STR/AGI/PER to 11 and starts with AB (a tier-2 skill needing A+B —
  // normally locked at level 1; an innate seed must bypass that).
  preset('warrior', { ...N, STR: 11, AGI: 11, PER: 11 }, ['AB']),
  // a level-3-gated innate, seeded at level 1 (innate bypass).
  preset('gated', { ...N }, ['L3']),
  // STR 12 -> 2 invested, enough to unlock the attribute-gated STRgate user skill.
  preset('strong', { ...N, STR: 12 }),
  // references a skill absent from the dataset -> defensive skip-and-note.
  preset('drifted', { ...N }, ['ghost_skill']),
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
  presets: PRESETS,
}

const up = { op: 'levelUp' } as const
const addA = (attr: AttributeKey) => ({ op: 'addAttribute', attr }) as const
const addS = (skill: string) => ({ op: 'addSkill', skill }) as const
const eq = (slot: Item['slot'], item: string) => ({ op: 'equip', slot, item }) as const
const sel = (id: string) => ({ op: 'selectCharacter', id }) as const
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

describe('recompute — gear → derived sheet (M3 U3, R6)', () => {
  it('folds a mapped gear stat into the derived sheet', () => {
    // The fixture stat model has no Magic_Power base, so gear is the whole value.
    const ch = rc([eq('body', 'robe')])
    expect(ch.derived.Magic_Power).toBe(6)
  })

  it('adds a previously-absent deferred identifier when gear provides it (R6)', () => {
    const geared = rc([eq('main_hand', 'staff')])
    expect(geared.derived.Pyromantic_Power).toBe(5)
    // Without gear the identifier is absent → a tooltip referencing it stays "—".
    expect(rc([]).derived.Pyromantic_Power).toBeUndefined()
  })

  it('sums gear into an enumerated derived stat additively across pieces', () => {
    const ch = rc([eq('body', 'robe'), eq('ring', 'ring1')])
    expect(ch.derived.Magic_Power).toBe(9) // 6 + 3
  })

  it('surfaces a deferred-identifier gear contribution in gearStats for display (R6)', () => {
    // Pyromantic_Power is a known identifier but not an enumerated derived stat, so
    // the main sheet loop never shows it — it must appear in the From Gear view.
    const ch = rc([eq('main_hand', 'staff')])
    expect(ch.derived.Pyromantic_Power).toBe(5) // merged for the tooltip/scope
    expect(ch.gearStats.Pyromantic_Power).toBe(5) // and surfaced for the sheet
  })

  it('carries unmapped gear stats (resistances) in gearStats, not derived', () => {
    const ch = rc([eq('body', 'robe')])
    expect(ch.gearStats.fire_resistance).toBe(8)
    expect(ch.derived.Fire_Resistance).toBeUndefined()
  })

  it('reverts the sheet when gear is removed', () => {
    expect(rc([]).derived.Pyromantic_Power).toBeUndefined()
    expect(rc([]).gearStats).toEqual({})
  })
})

describe('recompute — Body_DEF / Legs_DEF from equipped armor (M4 U3, R5)', () => {
  it('derives Body_DEF from the chestpiece Protection and Legs_DEF from boots', () => {
    const ch = rc([eq('body', 'plate'), eq('boots', 'greaves')])
    expect(ch.derived.Body_DEF).toBe(8)
    expect(ch.derived.Legs_DEF).toBe(5)
  })

  it('omits Body_DEF / Legs_DEF when the slot is empty, so the tooltip degrades', () => {
    const ch = rc([eq('body', 'plate')]) // boots slot empty
    expect(ch.derived.Body_DEF).toBe(8)
    expect('Legs_DEF' in ch.derived).toBe(false)

    const bare = rc([])
    expect('Body_DEF' in bare.derived).toBe(false)
    expect('Legs_DEF' in bare.derived).toBe(false)
  })

  it('resolves a Body_DEF formula in scope only when body armor is equipped (R5)', () => {
    const armored = rc([eq('body', 'plate')])
    const scope = buildScope(armored.attributes, armored.derived, statModel)
    // 0.5 * Body_DEF(8) + 0.5 * STR(10) = 9
    expect(evaluate('0.5 * Body_DEF + 0.5 * STR', scope)).toEqual({ kind: 'value', value: 9 })

    const bare = rc([])
    const bareScope = buildScope(bare.attributes, bare.derived, statModel)
    expect(evaluate('0.5 * Body_DEF + 0.5 * STR', bareScope)).toMatchObject({ kind: 'unknown-var' })
  })
})

describe('recompute — character preset seeding (U2, R1/R2/R3)', () => {
  it('seeds starting attributes outside the budget (attributesSpent stays 0)', () => {
    const ch = rc([sel('warrior')])
    expect(ch.level).toBe(1)
    expect(ch.attributes).toMatchObject({ STR: 11, AGI: 11, PER: 11, VIT: 10, WIL: 10 })
    expect(ch.attributeBudget).toBe(0) // level 1: no earned attribute points
    expect(ch.attributesSpent).toBe(0) // seeded points are free
    expect(ch.invested.STR).toBe(1) // but they count as invested (unlock gating)
    expect(ch.presetId).toBe('warrior')
  })

  it('seeds an innate skill without consuming the 2-point skill budget (R2)', () => {
    const ch = rc([sel('warrior'), addS('A'), addS('B')])
    expect(ch.taken.has('AB')).toBe(true) // innate, bypassed its A+B prereq
    expect(ch.taken.has('A')).toBe(true)
    expect(ch.taken.has('B')).toBe(true)
    expect(ch.skillBudget).toBe(2)
    expect(ch.skillsSpent).toBe(2) // only the user's two; the innate is free
  })

  it('lets user allocations layer on top of the seeded attributes (R3)', () => {
    const ch = rc([sel('warrior'), up, addA('STR')])
    expect(ch.attributes.STR).toBe(12) // 11 seed + 1 user
    expect(ch.attributesSpent).toBe(1)
  })

  it('resolves a seeded skill that would normally be locked (innate bypass)', () => {
    const ch = rc([sel('gated')]) // L3 needs level 3; seeded at level 1
    expect(ch.level).toBe(1)
    expect(ch.taken.has('L3')).toBe(true)
    expect(ch.skillsSpent).toBe(0)
  })

  it('seeded above-base attributes can unlock an attribute-gated user skill', () => {
    // STRgate needs 2 STR invested; the 'strong' preset seeds STR 12 (2 invested).
    const ch = rc([sel('strong'), addS('STRgate')])
    expect(ch.invested.STR).toBe(2)
    expect(ch.taken.has('STRgate')).toBe(true)
    expect(ch.skillsSpent).toBe(1)
  })

  it('lets the later selectCharacter win (no attribute double-seed)', () => {
    const ch = rc([sel('warrior'), sel('neutral')])
    expect(ch.presetId).toBe('neutral')
    expect(ch.attributes).toMatchObject({ STR: 10, AGI: 10, PER: 10, VIT: 10, WIL: 10 })
    expect(ch.taken.has('AB')).toBe(false) // warrior's innate did not persist
  })

  it('notes an unknown preset id and preserves the rest of the build', () => {
    const ch = rc([sel('ghost_char'), up, addS('A')])
    expect(ch.presetId).toBeNull()
    expect(ch.notes.some((n) => n.kind === 'unknown-preset-ref' && n.ref === 'ghost_char')).toBe(
      true,
    )
    expect(ch.taken.has('A')).toBe(true) // user build intact
    expect(ch.attributes).toMatchObject({ STR: 10, AGI: 10, PER: 10, VIT: 10, WIL: 10 })
  })

  it('notes a seeded skill absent from the dataset (defensive drift), build intact', () => {
    const ch = rc([sel('drifted')])
    expect(ch.presetId).toBe('drifted')
    expect(ch.taken.has('ghost_skill')).toBe(false)
    expect(ch.notes.some((n) => n.kind === 'unknown-skill-ref' && n.ref === 'ghost_skill')).toBe(
      true,
    )
  })

  it('yields the unseeded base for no selection or the neutral preset', () => {
    expect(rc([]).presetId).toBeNull()
    const neutral = rc([sel('neutral')])
    expect(neutral.presetId).toBe('neutral')
    expect(neutral.attributes).toMatchObject({ STR: 10, AGI: 10, PER: 10, VIT: 10, WIL: 10 })
    expect(neutral.taken.size).toBe(0)
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
