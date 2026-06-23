import { describe, it, expect } from 'vitest'
import { transform, type TransformInput } from './transform'
import type { TopoNode } from './topology'
import { parseDataset, type Skill } from '../types'
import { checkIntegrity } from '../validate'

function input(): TransformInput {
  const nodes: TopoNode[] = [
    {
      id: 'swords-1',
      tree: 'swords',
      key: 'Cleave',
      label: 'Cleaving Strike',
      icon: 'img/abilities/swords/Cleaving_Strike.png',
      top: 85,
      left: 37,
      parents: [],
      children: ['swords-2'],
    },
    {
      id: 'swords-2',
      tree: 'swords',
      key: 'gloat',
      label: 'Gloat',
      icon: 'img/abilities/swords/Gloat.png',
      top: 231,
      left: 37,
      parents: ['swords-1'],
      children: [],
      unlock: { level: 10, attributePoints: 8, attributes: ['STR'] },
    },
  ]
  return {
    tooltips: {
      swords: [
        {
          key: 'Cleave',
          name: { english: 'Cleaving Strike' },
          tooltip: { english: 'hit' },
          formulas: { dmg: '(2 * AGL + Vitality)', bad: '(PRC_bonus)' },
          is_passive: false,
          attributes: {
            energy: '10',
            cooldown: '0',
            range: '1',
            stance: '',
            meta_category: 'weapon',
          },
        },
        {
          key: 'gloat',
          name: { english: 'Gloat' },
          formulas: {},
          is_passive: true,
          attributes: { meta_category: 'weapon' },
        },
      ],
    },
    skillKeys: { swords: ['Cleave', 'gloat'] },
    nodes,
    source: 'test',
    gameVersion: '0.9.4.x',
  }
}

function skillsOf(inp: TransformInput): Skill[] {
  return parseDataset(transform(inp).dataset).skills
}

describe('transform', () => {
  it('produces a schema-valid, integrity-clean dataset', () => {
    const ds = parseDataset(transform(input()).dataset)
    expect(ds.skills).toHaveLength(2)
    expect(ds.trees).toHaveLength(1)
    expect(checkIntegrity(ds)).toEqual([])
  })

  it('normalizes stat tokens whole-word and leaves substrings intact', () => {
    const cleave = skillsOf(input()).find((s) => s.key === 'Cleave')!
    expect(cleave.formulas.dmg).toBe('(2 * AGI + Vitality)') // AGL -> AGI, Vitality kept
    expect(cleave.formulas.bad).toBe('(PRC_bonus)') // NOT corrupted to PER_bonus
  })

  it('reports an unknown formula token but not known derived stats', () => {
    const { report } = transform(input())
    expect(report.warnings).toHaveLength(1)
    expect(report.warnings[0].category).toBe('unknown-formula-token')
    expect(report.warnings[0].message).toContain('PRC_bonus')
  })

  it('coerces the attribute bag (typed energy/cooldown, dropped empties)', () => {
    const cleave = skillsOf(input()).find((s) => s.key === 'Cleave')!
    expect(cleave.energy).toBe(10)
    expect(cleave.cooldown).toBe(0) // "0" kept, not dropped
    expect(cleave.properties.range).toBe(1)
    expect(cleave.properties.stance).toBeUndefined() // empty string dropped
    expect(cleave.properties.energy).toBeUndefined() // promoted to a typed field
  })

  it('derives requires from parent edges and carries unlock', () => {
    const gloat = skillsOf(input()).find((s) => s.key === 'gloat')!
    expect(gloat.requires).toEqual(['Cleave'])
    expect(gloat.tier).toBe(2)
    expect(gloat.unlock).toEqual({ level: 10, attributePoints: 8, attributes: ['STR'] })
  })

  it('assembles trees and maps category from meta_category', () => {
    const ds = parseDataset(transform(input()).dataset)
    expect(ds.trees[0]).toMatchObject({
      id: 'swords',
      category: 'weaponry',
      skills: ['Cleave', 'gloat'],
    })
  })

  it('resolves a key-less node by label and records a note', () => {
    const inp = input()
    inp.nodes[0] = { ...inp.nodes[0], key: null }
    const { dataset, report } = transform(inp)
    const ds = parseDataset(dataset)
    expect(ds.skills.find((s) => s.key === 'Cleave')).toBeDefined()
    expect(report.notes.some((n) => n.includes('resolved'))).toBe(true)
  })

  it('is deterministic across runs', () => {
    expect(JSON.stringify(transform(input()).dataset)).toBe(
      JSON.stringify(transform(input()).dataset),
    )
  })

  it('fails closed on a dangling parent reference', () => {
    const inp = input()
    inp.nodes[1] = { ...inp.nodes[1], parents: ['swords-99'] }
    expect(() => transform(inp)).toThrow()
  })
})
