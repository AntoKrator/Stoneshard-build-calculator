import { describe, it, expect } from 'vitest'
import { nodeState, computeTreeLayout, computeTreeShapes, type LayoutEdge } from './node-state'
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
    presetId: null,
    attributes: baseAttrs,
    invested: { STR: 0, AGI: 0, PER: 0, VIT: 0, WIL: 0 },
    derived: {},
    taken: new Set(),
    takenOrder: [],
    equipped: {},
    gearStats: {},
    gearContribution: {},
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

describe('computeTreeShapes (wiki-faithful routing)', () => {
  // Columns at x=0,100,200; tiers at y=0 (parents) and y=100 (children); rail y=50.
  const edge = (from: string, x1: number, to: string, x2: number): LayoutEdge => ({
    from,
    to,
    x1,
    y1: 0,
    x2,
    y2: 100,
  })

  it('renders a full 2×2 cross as one bowtie with a single center dot', () => {
    // Magic Mastery tier 1→2: {A,B} × {C,D}.
    const { bowties, plain, diamonds } = computeTreeShapes([
      edge('A', 0, 'C', 0),
      edge('A', 0, 'D', 100),
      edge('B', 100, 'C', 0),
      edge('B', 100, 'D', 100),
    ])
    expect(plain).toHaveLength(0)
    expect(diamonds).toHaveLength(0)
    expect(bowties).toHaveLength(1)
    expect(bowties[0].cx).toBe(50)
    expect(bowties[0].cy).toBe(50)
    // Split brackets: upper at rail−7, lower at rail+7, joined at center.
    expect(bowties[0].d).toContain('M 50 43 V 57')
  })

  it('renders a shared-parent partial cross as elbows with one dot per riser junction', () => {
    // Swords tier 2→3: {A,B}→C and {B,X}→D share parent B — not a full cross.
    const { bowties, plain, diamonds } = computeTreeShapes([
      edge('A', 0, 'C', 0),
      edge('B', 100, 'C', 0),
      edge('B', 100, 'D', 100),
      edge('X', 200, 'D', 100),
    ])
    expect(bowties).toHaveLength(0)
    expect(plain).toHaveLength(4)
    // One connected component → no staggering, everything on the midpoint rail.
    expect(new Set(plain.map((p) => p.railY))).toEqual(new Set([50]))
    // Dots at both riser junctions (x=0: drop+riser+rail-right; x=100 likewise),
    // none at the bare x=200 corner.
    expect(diamonds.map((d) => d.x).sort((a, b) => a - b)).toEqual([0, 100])
  })

  it('staggers rails of distinct components whose spans touch (Daggers tier 2→3)', () => {
    // Fan A→{C,D} spans 0..100; merge {B,X}→E spans 100..200 — they abut at
    // x=100 and must not fuse into one continuous line.
    const { plain, diamonds } = computeTreeShapes([
      edge('A', 0, 'C', 0),
      edge('A', 0, 'D', 100),
      edge('B', 100, 'E', 200),
      edge('X', 200, 'E', 200),
    ])
    const fanY = plain.find((p) => p.edge.from === 'A')!.railY
    const mergeY = plain.find((p) => p.edge.from === 'B')!.railY
    expect(fanY).not.toBe(mergeY)
    expect(Math.abs(fanY - mergeY)).toBe(8) // one lane apart, centered on the rail
    expect((fanY + mergeY) / 2).toBe(50)
    // Each component keeps its own junction dots on its own staggered rail.
    expect(diamonds.find((d) => d.x === 0)!.y).toBe(fanY)
    expect(diamonds.find((d) => d.x === 200)!.y).toBe(mergeY)
  })

  it('leaves distant components on the shared midpoint rail', () => {
    // Spans 0..100 and 300..400 are far apart — no stagger needed.
    const { plain } = computeTreeShapes([edge('A', 0, 'C', 100), edge('B', 300, 'D', 400)])
    expect(new Set(plain.map((p) => p.railY))).toEqual(new Set([50]))
  })

  it('gives straight drops and 1×1 elbows no dots', () => {
    const straight = computeTreeShapes([edge('A', 0, 'C', 0)])
    expect(straight.diamonds).toHaveLength(0)
    expect(straight.bowties).toHaveLength(0)
    const bent = computeTreeShapes([edge('A', 0, 'C', 100)])
    expect(bent.diamonds).toHaveLength(0) // corner bend, only 2 line ends
  })

  it('keeps rails of different tier pairs independent', () => {
    // Same shape twice at different depths → two bowties, not one merged group.
    const deep = (e: LayoutEdge): LayoutEdge => ({ ...e, y1: 200, y2: 300 })
    const cross = [
      edge('A', 0, 'C', 0),
      edge('A', 0, 'D', 100),
      edge('B', 100, 'C', 0),
      edge('B', 100, 'D', 100),
    ]
    const { bowties } = computeTreeShapes([...cross, ...cross.map(deep)])
    expect(bowties).toHaveLength(2)
    expect(bowties.map((b) => b.cy).sort((a, b) => a - b)).toEqual([50, 250])
  })
})
