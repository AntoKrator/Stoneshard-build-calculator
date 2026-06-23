import { describe, it, expect } from 'vitest'
import { dataset } from './load'
import { parseDataset } from '../types'

describe('dataset loader', () => {
  it('loads the committed dataset with the expected counts', () => {
    expect(dataset.skills.length).toBe(228)
    expect(dataset.trees.length).toBe(21)
  })

  it('produces data that satisfies the schema', () => {
    // The loader already parses in dev; re-parsing must not throw either.
    expect(() => parseDataset(dataset)).not.toThrow()
  })

  it('round-trips a representative skill (tier / requires / icon)', () => {
    const cleave = dataset.skills.find((s) => s.key === 'Cleave')
    expect(cleave).toBeDefined()
    expect(cleave?.tier).toBe(1)
    expect(cleave?.requires).toEqual([])
    expect(cleave?.icon).toBe('img/abilities/swords/Cleaving_Strike.png')

    const gloat = dataset.skills.find((s) => s.key === 'gloat')
    expect(gloat?.requires).toEqual(['Cleave'])
  })
})
