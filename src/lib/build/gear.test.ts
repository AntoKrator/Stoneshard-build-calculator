import { describe, it, expect } from 'vitest'
import { aggregateGear, toIdentifier, ITEM_STAT_OVERRIDES } from './gear'
import { KNOWN_STAT_IDENTIFIERS } from '../formula/identifiers'
import statModelJson from '../../data/stat-model.json'
import type { Item, EquipmentSlot } from '../types'

const item = (key: string, slot: EquipmentSlot, stats: Record<string, number>): Item => ({
  key,
  name: { english: key },
  category: slot === 'main_hand' ? 'weapon' : slot === 'ring' ? 'accessory' : 'armor',
  slot,
  stats,
  properties: {},
})

const known = new Set(['Magic_Power', 'Pyromantic_Power', 'Block_Chance', 'max_hp'])

function eq(...items: Item[]): Partial<Record<EquipmentSlot, Item>> {
  const out: Partial<Record<EquipmentSlot, Item>> = {}
  for (const i of items) out[i.slot] = i
  return out
}

describe('toIdentifier', () => {
  it('capitalizes each word by default', () => {
    expect(toIdentifier('magic_power')).toBe('Magic_Power')
    expect(toIdentifier('block_chance')).toBe('Block_Chance')
  })
  it('applies explicit overrides where the names differ', () => {
    expect(toIdentifier('max_health')).toBe('max_hp')
  })
})

describe('aggregateGear', () => {
  it('routes a mapped stat into contributions, keyed by formula identifier', () => {
    const { contributions } = aggregateGear(eq(item('robe', 'body', { magic_power: 6 })), known)
    expect(contributions.Magic_Power).toBe(6)
  })

  it('sums the same stat across multiple equipped items', () => {
    const r = aggregateGear(
      eq(item('robe', 'body', { magic_power: 6 }), item('ring1', 'ring', { magic_power: 3 })),
      known,
    )
    expect(r.contributions.Magic_Power).toBe(9)
  })

  it('routes a stat with no formula identifier into the display bag', () => {
    const r = aggregateGear(eq(item('cloak', 'cloak', { fire_resistance: 8 })), known)
    expect(r.contributions.Fire_Resistance).toBeUndefined()
    expect(r.display.fire_resistance).toBe(8)
  })

  it('routes raw weapon damage into display, not contributions', () => {
    const r = aggregateGear(eq(item('sword', 'main_hand', { slashing_damage: 10 })), known)
    expect(r.display.slashing_damage).toBe(10)
    expect(Object.keys(r.contributions)).toHaveLength(0)
  })

  it('honors an override target that is in the known vocabulary', () => {
    const r = aggregateGear(eq(item('amulet', 'amulet', { max_health: 20 })), known)
    expect(r.contributions.max_hp).toBe(20)
  })

  it('never drops a stat — every value lands in exactly one bag', () => {
    const r = aggregateGear(
      eq(item('mix', 'body', { magic_power: 4, fire_resistance: 7, protection: 12 })),
      known,
    )
    expect(r.contributions.Magic_Power).toBe(4)
    expect(r.display.fire_resistance).toBe(7)
    expect(r.display.protection).toBe(12)
  })

  it('returns empty bags for no gear', () => {
    expect(aggregateGear({}, known)).toEqual({ contributions: {}, display: {} })
  })
})

describe('mapping integrity (KTD4 — fail loud on a bad override target)', () => {
  it('every override points at a real formula identifier', () => {
    const vocab = new Set<string>([
      ...KNOWN_STAT_IDENTIFIERS,
      ...statModelJson.derivedStats.map((d) => d.key),
    ])
    for (const target of Object.values(ITEM_STAT_OVERRIDES)) {
      expect(vocab.has(target)).toBe(true)
    }
  })
})
