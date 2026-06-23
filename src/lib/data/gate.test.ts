import { describe, it, expect } from 'vitest'
import { gateDataset, warningSignature } from './gate'

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

describe('gateDataset', () => {
  it('passes a clean dataset with no warnings', () => {
    const r = gateDataset(baseDataset(), [], [])
    expect(r.ok).toBe(true)
    expect(r.errors).toEqual([])
    expect(r.skillCount).toBe(2)
    expect(r.treeCount).toBe(1)
  })

  it('reports an integrity issue', () => {
    const d = baseDataset()
    d.skills[1].requires = ['missing']
    const r = gateDataset(d, [], [])
    expect(r.ok).toBe(false)
    expect(r.errors.join(' ')).toContain('dangling-prerequisite')
  })

  it('reports a schema (shape) failure', () => {
    const d = baseDataset()
    // tier is required + positive; remove it to force a ZodError
    delete (d.skills[0] as { tier?: number }).tier
    const r = gateDataset(d, [], [])
    expect(r.ok).toBe(false)
    expect(r.errors.join(' ')).toContain('schema')
  })

  it('fails on a non-allowlisted warning even when schema + integrity are clean', () => {
    const w = [{ category: 'unmapped-icon', message: 'Skill "x" has no icon' }]
    const r = gateDataset(baseDataset(), w, [])
    expect(r.ok).toBe(false)
    expect(r.errors.join(' ')).toContain('unmapped-icon')
  })

  it('passes when the warning is explicitly allowlisted', () => {
    const w = [{ category: 'unmapped-icon', message: 'Skill "x" has no icon' }]
    const r = gateDataset(baseDataset(), w, [warningSignature(w[0])])
    expect(r.ok).toBe(true)
  })
})
