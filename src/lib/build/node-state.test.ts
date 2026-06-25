import { describe, it, expect } from 'vitest'
import { nodeState, computeTreeLayout } from './node-state'
import type { Character } from './character'
import { computeCombat } from './combat'
import type { Attributes } from './economy'
import type { Skill } from '../types'

function skill(key: string, opts: Partial<Skill> = {}): Skill {
  return {
    key,
    treeId: 't1',
    name: { english: key },
    tier: 1,
    position: 0,
    requires: [],
    formulas: {},
    isPassive: false,
    maxRank: 1,
    properties: {},
    ...opts,
  }
}

const baseAttrs: Attributes = { STR: 10, AGI: 10, PER: 10, VIT: 10, WIL: 10 }

function char(p: Partial<Character> = {}): Character {
  return {
    level: 1,
    attributes: baseAttrs,
    invested: { STR: 0, AGI: 0, PER: 0, VIT: 0, WIL: 0 },
    derived: {},
    taken: new Set(),
    takenOrder: [],
    equipped: {},
    gearStats: {},
    combat: computeCombat({ derived: {}, gearStats: {}, equipped: {} }),
    attributeBudget: 0,
    skillBudget: 2,
    attributesSpent: 0,
    skillsSpent: 0,
    notes: [],
    ...p,
  }
}

describe('nodeState (R1) — the four states', () => {
  it('is "taken" when the skill is in the taken set', () => {
    expect(nodeState(skill('A'), char({ taken: new Set(['A']) }), 10)).toBe('taken')
  })

  it('is "locked" when a prerequisite is not taken', () => {
    expect(nodeState(skill('B', { requires: ['A'] }), char(), 10)).toBe('locked')
  })

  it('is "locked" when the unlock gate is unmet', () => {
    const s = skill('L', { unlock: { level: 5 } })
    expect(nodeState(s, char({ level: 1 }), 10)).toBe('locked')
  })

  it('is "affordable" when unlocked and a skill point is free', () => {
    expect(nodeState(skill('A'), char({ skillsSpent: 0, skillBudget: 2 }), 10)).toBe('affordable')
  })

  it('is "unlocked-unaffordable" when legal but no point is available', () => {
    expect(nodeState(skill('A'), char({ skillsSpent: 2, skillBudget: 2 }), 10)).toBe(
      'unlocked-unaffordable',
    )
  })

  it('treats a diamond node as locked until BOTH prerequisites are taken', () => {
    const d = skill('AB', { requires: ['A', 'B'] })
    expect(nodeState(d, char({ taken: new Set(['A']) }), 10)).toBe('locked')
    expect(nodeState(d, char({ taken: new Set(['A', 'B']) }), 10)).toBe('affordable')
  })
})

describe('computeTreeLayout (R1)', () => {
  const skills = [
    skill('A', { tier: 1, position: 0 }),
    skill('B', { tier: 1, position: 1 }),
    skill('AB', { tier: 2, position: 0, requires: ['A', 'B'] }),
  ]

  it('places nodes by tier (row) and position (column)', () => {
    const { nodes } = computeTreeLayout(skills, { cellWidth: 100, cellHeight: 100 })
    const a = nodes.find((n) => n.key === 'A')!
    const ab = nodes.find((n) => n.key === 'AB')!
    expect(a.cx).toBe(50) // position 0 -> center of first column
    expect(a.cy).toBe(50) // tier 1 -> center of first row
    expect(ab.cy).toBe(150) // tier 2 -> second row
  })

  it('emits one connection edge per in-tree prerequisite', () => {
    const { edges } = computeTreeLayout(skills)
    expect(edges).toHaveLength(2)
    expect(edges.map((e) => e.from).sort()).toEqual(['A', 'B'])
    expect(edges.every((e) => e.to === 'AB')).toBe(true)
  })

  it('sizes the canvas to the widest/tallest cells', () => {
    const layout = computeTreeLayout(skills, { cellWidth: 100, cellHeight: 100 })
    expect(layout.width).toBe(200) // positions 0..1 -> 2 columns
    expect(layout.height).toBe(200) // tiers 1..2 -> 2 rows
  })
})
