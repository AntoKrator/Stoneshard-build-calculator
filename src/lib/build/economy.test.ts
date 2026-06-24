import { describe, it, expect } from 'vitest'
import {
  earnedAttributePoints,
  earnedSkillPoints,
  investedInAttributes,
  isUnlocked,
  type Attributes,
} from './economy'
import type { Constants } from '../types'

const constants: Constants = {
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
}

const attrs = (p: Partial<Attributes>): Attributes => ({
  STR: 10,
  AGI: 10,
  PER: 10,
  VIT: 10,
  WIL: 10,
  ...p,
})

describe('point economy (R3)', () => {
  it('earns +1 attribute and +1 skill point per level over the starting grant', () => {
    expect(earnedAttributePoints(1, constants)).toBe(0)
    expect(earnedSkillPoints(1, constants)).toBe(2)
    expect(earnedAttributePoints(10, constants)).toBe(9)
    expect(earnedSkillPoints(10, constants)).toBe(11)
    expect(earnedAttributePoints(30, constants)).toBe(29)
  })

  it('sums invested points across listed attributes (above base)', () => {
    expect(investedInAttributes(attrs({ STR: 13, WIL: 12 }), ['STR', 'WIL'], 10)).toBe(5)
    expect(investedInAttributes(attrs({ STR: 13 }), ['WIL'], 10)).toBe(0)
    expect(investedInAttributes(attrs({ STR: 9 }), ['STR'], 10)).toBe(0) // never negative
  })
})

describe('isUnlocked (KTD11)', () => {
  it('unlocks via the level path', () => {
    const u = { level: 10, attributePoints: 8, attributes: ['WIL' as const] }
    expect(isUnlocked(u, 10, attrs({}), 10)).toBe(true)
    expect(isUnlocked(u, 9, attrs({}), 10)).toBe(false)
  })

  it('unlocks via the combined invested-attribute path even below the level', () => {
    const u = { level: 10, attributePoints: 8, attributes: ['WIL' as const, 'AGI' as const] }
    // 5 in WIL + 3 in AGI = 8 invested -> satisfied regardless of level.
    expect(isUnlocked(u, 1, attrs({ WIL: 15, AGI: 13 }), 10)).toBe(true)
    // 7 invested -> not yet.
    expect(isUnlocked(u, 1, attrs({ WIL: 15, AGI: 12 }), 10)).toBe(false)
  })

  it('treats a skill with no unlock as ungated', () => {
    expect(isUnlocked(undefined, 1, attrs({}), 10)).toBe(true)
  })
})
