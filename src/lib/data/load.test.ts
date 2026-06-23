import { describe, it, expect } from 'vitest'
import { dataset, statModel } from './load'
import { parseDataset, StatModel } from '../types'
import metaJson from '../../data/meta.json'
import attributesJson from '../../data/attributes.json'
import treesJson from '../../data/trees.json'
import skillsJson from '../../data/skills.json'
import constantsJson from '../../data/constants.json'
import statModelJson from '../../data/stat-model.json'

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

describe('Phase-1 economy constants (R3)', () => {
  it('models +1/+1 per level, max 30, base 10, starting 0/2', () => {
    const c = dataset.constants
    expect(c.startingLevel).toBe(1)
    expect(c.maxLevel).toBe(30)
    expect(c.attributePointsPerLevel).toBe(1)
    expect(c.skillPointsPerLevel).toBe(1)
    expect(c.startingAttributePoints).toBe(0)
    expect(c.startingSkillPoints).toBe(2)
    expect(c.baseAttributeValue).toBe(10)
  })
})

describe('stat model (KTD14)', () => {
  it('is present and exposes the coefficient table + enumerated derived stats', () => {
    expect(statModel.baseAttributeValue).toBe(10)
    expect(statModel.mainStatThresholds).toEqual([15, 20, 25, 30])
    expect(statModel.derivedStats.length).toBeGreaterThan(0)
    // The headline in-scope stat is attribute-derived (WIL per-threshold).
    const magic = statModel.derivedStats.find((s) => s.key === 'Magic_Power')
    expect(magic?.base).toBe(100)
    const wil = statModel.attributeBonuses.WIL!
    expect(wil.perThreshold.find((b) => b.stat === 'Magic_Power')?.amount).toBe(7.5)
  })

  it('classifies deferred (gear/passive) identifiers explicitly', () => {
    for (const deferred of ['Arcanistic_Power', 'Body_DEF', 'Legs_DEF']) {
      expect(statModel.deferredIdentifiers).toContain(deferred)
    }
  })

  it('rejects a stat-model missing attributeBonuses (typed ZodError)', () => {
    const bad = { ...statModel } as Record<string, unknown>
    delete bad.attributeBonuses
    const res = StatModel.safeParse(bad)
    expect(res.success).toBe(false)
  })

  it('rejects a coefficient that targets an unkeyed derived stat (typed ZodError)', () => {
    const bad = structuredClone(statModel)
    bad.attributeBonuses.STR!.perPoint.push({ stat: 'Not_A_Real_Stat', amount: 1 })
    const res = StatModel.safeParse(bad)
    expect(res.success).toBe(false)
    if (!res.success) {
      expect(res.error.issues.some((i) => i.message.includes('Not_A_Real_Stat'))).toBe(true)
    }
  })
})

describe('dual-loader parity (KTD10)', () => {
  // load.ts (app) and validate-data.ts (gate) compose the dataset from the same
  // split JSON files independently. If a new data file is added to one loader but
  // not the other, the app and the gate silently diverge. This composes from the
  // exact file set the gate reads and asserts it matches the app loader's output,
  // so a forgotten file in either loader fails the build.
  it('composes an identical dataset from the full file set the gate reads', () => {
    const composedLikeGate = parseDataset({
      meta: metaJson,
      attributes: attributesJson,
      trees: treesJson,
      skills: skillsJson,
      constants: constantsJson,
      statModel: statModelJson,
    })
    expect(composedLikeGate).toEqual(parseDataset(dataset))
  })
})
