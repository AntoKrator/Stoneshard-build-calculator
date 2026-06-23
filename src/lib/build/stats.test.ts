import { describe, it, expect } from 'vitest'
import { computeDerivedStats, countReachedThresholds, type Attributes } from './stats'
import { statModel } from '../data/load'

/** Build an attribute set, defaulting unspecified attributes to the base (10). */
function attrs(partial: Partial<Attributes>): Attributes {
  return { STR: 10, AGI: 10, PER: 10, VIT: 10, WIL: 10, ...partial }
}

describe('countReachedThresholds', () => {
  it('counts thresholds reached at 15/20/25/30', () => {
    const t = statModel.mainStatThresholds
    expect(countReachedThresholds(14, t)).toBe(0)
    expect(countReachedThresholds(15, t)).toBe(1)
    expect(countReachedThresholds(20, t)).toBe(2)
    expect(countReachedThresholds(25, t)).toBe(3)
    expect(countReachedThresholds(30, t)).toBe(4)
  })
})

describe('computeDerivedStats (R6) — values cross-checked vs nstratos stat-bonuses.test.js', () => {
  it('returns each stat at its base when every attribute is 10', () => {
    const sheet = computeDerivedStats(attrs({}), statModel)
    for (const def of statModel.derivedStats) {
      expect(sheet[def.key]).toBe(def.base)
    }
  })

  it('applies per-point bonuses (one point above base)', () => {
    expect(computeDerivedStats(attrs({ WIL: 11 }), statModel).Cooldowns_Duration).toBe(98.5)
    expect(computeDerivedStats(attrs({ VIT: 11 }), statModel).max_mp).toBe(104)
    expect(computeDerivedStats(attrs({ STR: 11 }), statModel).Block_Chance).toBe(1.5)
    expect(computeDerivedStats(attrs({ STR: 11 }), statModel).Weapon_Damage).toBe(101.5)
  })

  it('applies per-threshold bonuses at 15 and scales to 30', () => {
    expect(computeDerivedStats(attrs({ WIL: 15 }), statModel).Magic_Power).toBe(107.5)
    // WIL 30: 4 thresholds * 7.5 atop base = 130; per-point cooldowns 100 - 1.5*20 = 70.
    const wil30 = computeDerivedStats(attrs({ WIL: 30 }), statModel)
    expect(wil30.Magic_Power).toBe(130)
    expect(wil30.Cooldowns_Duration).toBe(70)
  })

  it('mixes per-point and per-threshold within one attribute (WIL 15)', () => {
    const sheet = computeDerivedStats(attrs({ WIL: 15 }), statModel)
    expect(sheet.Cooldowns_Duration).toBe(92.5) // 100 + (-1.5 * 5 points)
    expect(sheet.Pain_Resistance).toBe(7.5) // 1 threshold * 7.5
  })

  it('matches the agility / perception / vitality threshold sheet', () => {
    const agi = computeDerivedStats(attrs({ AGI: 15 }), statModel)
    expect(agi.Mainhand_Efficiency).toBe(102.5)
    expect(agi.Offhand_Efficiency).toBe(102.5)
    expect(agi.Dodge_Chance).toBe(6)
    expect(agi.Move_Resistance).toBe(7.5)

    const per = computeDerivedStats(attrs({ PER: 15 }), statModel)
    expect(per.Miracle_Chance).toBe(10)
    expect(per.Crit_Chance).toBe(6)
    expect(per.Vision).toBe(13)
    expect(per.Accuracy).toBe(87.5)

    const vit = computeDerivedStats(attrs({ VIT: 15 }), statModel)
    expect(vit.max_hp).toBe(115)
    expect(vit.max_mp).toBe(120)
    expect(vit.Energy_Restoration).toBe(30)
  })

  it('matches a hand-computed combined build', () => {
    // STR 12, VIT 18, WIL 20, others 10.
    const sheet = computeDerivedStats(attrs({ STR: 12, VIT: 18, WIL: 20 }), statModel)
    expect(sheet.Block_Chance).toBe(3) // STR: 1.5 * 2 points
    expect(sheet.Magic_Power).toBe(115) // WIL: 100 + 7.5 * 2 thresholds (15,20)
    expect(sheet.max_hp).toBe(115) // VIT: 100 + 15 * 1 threshold (15)
    expect(sheet.Cooldowns_Duration).toBe(85) // WIL: 100 - 1.5 * 10 points
  })
})
