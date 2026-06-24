import { describe, it, expect } from 'vitest'
import { dataset, statModel } from './load'
import { parseDataset, StatModel, Item } from '../types'
import metaJson from '../../data/meta.json'
import attributesJson from '../../data/attributes.json'
import treesJson from '../../data/trees.json'
import skillsJson from '../../data/skills.json'
import constantsJson from '../../data/constants.json'
import statModelJson from '../../data/stat-model.json'
import itemsJson from '../../data/items.json'

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

describe('item schema (M2 U1, R3)', () => {
  it('round-trips a weapon with a damage profile + modifiers', () => {
    const broom = Item.parse({
      key: 'broom',
      name: { english: 'Broom' },
      category: 'weapon',
      slot: 'main_hand',
      type: 'Mace',
      tier: 1,
      rarity: 'Common',
      material: 'wood',
      damageType: 'crushing',
      stats: { crushing: 6, fumble_chance: 3 },
      properties: { durability: 10, price: 10, obtainability: 'special' },
    })
    expect(broom.category).toBe('weapon')
    expect(broom.damageType).toBe('crushing')
    expect(broom.stats.crushing).toBe(6)
    // Non-numeric / unmapped columns survive verbatim in the bag.
    expect(broom.properties.obtainability).toBe('special')
  })

  it('round-trips an armor piece (shield) and an accessory', () => {
    const shield = Item.parse({
      key: 'shield01',
      name: { english: 'Board Shield' },
      category: 'armor',
      slot: 'off_hand',
      type: 'Shield',
      stats: { block_chance: 10, crushing_resistance: 8 },
    })
    expect(shield.category).toBe('armor')
    expect(shield.slot).toBe('off_hand')

    const ring = Item.parse({
      key: 'ring_iron',
      name: { english: 'Iron Ring' },
      category: 'accessory',
      slot: 'ring',
    })
    // Defaults apply when absent.
    expect(ring.stats).toEqual({})
    expect(ring.properties).toEqual({})
  })

  it('rejects an item missing its category (typed ZodError)', () => {
    const res = Item.safeParse({
      key: 'x',
      name: { english: 'X' },
      slot: 'head',
    })
    expect(res.success).toBe(false)
  })

  it('exposes the damage-type vocabulary in constants', () => {
    expect(dataset.constants.damageTypes).toContain('crushing')
    expect(dataset.constants.damageTypes).toContain('arcane')
    expect(dataset.constants.damageTypes.length).toBe(13)
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
      items: itemsJson,
    })
    expect(composedLikeGate).toEqual(parseDataset(dataset))
  })
})

describe('item dataset (M2 U4, R3/R4/R15)', () => {
  it('loads the committed items into the dataset', () => {
    expect(dataset.items.length).toBe(731)
    const byCategory = (c: string) => dataset.items.filter((i) => i.category === c).length
    expect(byCategory('weapon')).toBe(350)
    expect(byCategory('armor')).toBe(290)
    expect(byCategory('accessory')).toBe(91)
  })

  it('round-trips a representative weapon (damage type + per-type stat)', () => {
    const sword = dataset.items.find((i) => i.key === 'footman-sword')
    expect(sword?.category).toBe('weapon')
    expect(sword?.slot).toBe('main_hand')
    expect(sword?.damageType).toBe('slashing')
    expect(sword?.stats.slashing_damage).toBe(21)
  })

  it('every weapon damage type resolves to the constants vocabulary', () => {
    const types = new Set(dataset.constants.damageTypes)
    const weapons = dataset.items.filter((i) => i.category === 'weapon')
    expect(weapons.length).toBeGreaterThan(0)
    expect(weapons.every((w) => w.damageType && types.has(w.damageType))).toBe(true)
  })
})
