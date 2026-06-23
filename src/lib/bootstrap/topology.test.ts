import { describe, it, expect } from 'vitest'
import { parseAbilityPicks, computeTierPosition, checkEdges, type TopoNode } from './topology'

const HTML = `
<ability-pick id="swords-1" key="Cleave" label="Cleaving Strike" img="img/abilities/swords/Cleaving_Strike.png" style="top: 85px; left: 37px" children="swords-2 swords-3" attack energy="10">
<ability-pick id="swords-2" key="gloat" label="Gloat" img="img/abilities/swords/Gloat.png" style="top: 231px; left: 37px" parents="swords-1" passive unlock-level="10" unlock-attribute-points="8" unlock-attributes="STR PER VIT">
<ability-pick id="maces-6" label="Hammer and Anvil" img="img/abilities/maces/Hammer_and_Anvil.png" style="top: 231px; left: 137px" parents="maces-1|maces-2">
`

function node(id: string, top: number, left: number, partial: Partial<TopoNode> = {}): TopoNode {
  return {
    id,
    tree: id.replace(/-\d+$/, ''),
    key: id,
    label: id,
    icon: `${id}.png`,
    top,
    left,
    parents: [],
    children: [],
    ...partial,
  }
}

describe('parseAbilityPicks', () => {
  const nodes = parseAbilityPicks(HTML)

  it('parses every ability-pick element', () => {
    expect(nodes).toHaveLength(3)
  })

  it('extracts id, tree, key, icon, and coordinates', () => {
    const cleave = nodes[0]
    expect(cleave.id).toBe('swords-1')
    expect(cleave.tree).toBe('swords')
    expect(cleave.key).toBe('Cleave')
    expect(cleave.icon).toBe('img/abilities/swords/Cleaving_Strike.png')
    expect(cleave.top).toBe(85)
    expect(cleave.left).toBe(37)
  })

  it('splits children on whitespace and parents on the pipe separator', () => {
    expect(nodes[0].children).toEqual(['swords-2', 'swords-3'])
    expect(nodes[2].parents).toEqual(['maces-1', 'maces-2']) // pipe-separated
  })

  it('leaves key null when the element omits it', () => {
    expect(nodes[2].key).toBeNull()
  })

  it('parses unlock requirements when present', () => {
    expect(nodes[1].unlock).toEqual({
      level: 10,
      attributePoints: 8,
      attributes: ['STR', 'PER', 'VIT'],
    })
    expect(nodes[0].unlock).toBeUndefined()
  })

  it('throws when an element has no parseable coordinates', () => {
    expect(() =>
      parseAbilityPicks('<ability-pick id="x-1" key="X" style="top: ; left: 5px">'),
    ).toThrow()
  })
})

describe('computeTierPosition', () => {
  it('assigns tiers by vertical band and positions left-to-right', () => {
    const nodes = [node('swords-1', 85, 137), node('swords-2', 85, 37), node('swords-3', 231, 37)]
    const tp = computeTierPosition(nodes)
    expect(tp.get('swords-2')).toEqual({ tier: 1, position: 0 }) // leftmost in tier 1
    expect(tp.get('swords-1')).toEqual({ tier: 1, position: 1 })
    expect(tp.get('swords-3')).toEqual({ tier: 2, position: 0 })
  })

  it('clusters near-equal tops into one tier and bands per tree independently', () => {
    const nodes = [
      node('a-1', 85, 0),
      node('a-2', 88, 100), // within tolerance of 85 -> same tier
      node('a-3', 200, 0),
      node('b-1', 85, 0), // different tree, own banding
    ]
    const tp = computeTierPosition(nodes)
    expect(tp.get('a-1')?.tier).toBe(1)
    expect(tp.get('a-2')?.tier).toBe(1)
    expect(tp.get('a-3')?.tier).toBe(2)
    expect(tp.get('b-1')?.tier).toBe(1)
  })
})

describe('checkEdges', () => {
  it('returns clean for symmetric edges', () => {
    const nodes = [
      node('swords-1', 85, 0, { children: ['swords-2'] }),
      node('swords-2', 231, 0, { parents: ['swords-1'] }),
    ]
    expect(checkEdges(nodes)).toEqual({ hard: [], soft: [] })
  })

  it('flags a dangling parent as hard', () => {
    const nodes = [node('swords-2', 231, 0, { parents: ['swords-99'] })]
    const { hard } = checkEdges(nodes)
    expect(hard.join(' ')).toContain('swords-99')
  })

  it('flags a missing-mirror asymmetry as soft, not hard', () => {
    const nodes = [
      node('swords-1', 85, 0, { children: [] }), // does not mirror the child edge
      node('swords-2', 231, 0, { parents: ['swords-1'] }),
    ]
    const { hard, soft } = checkEdges(nodes)
    expect(hard).toEqual([])
    expect(soft.length).toBeGreaterThan(0)
  })
})
