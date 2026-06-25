/**
 * Character-select preset correctness lock (U4, R5).
 *
 * Pins each playable character's starting attributes + innate starting abilities
 * to the values verified against the official Stoneshard wiki (patch ~0.9.4.x) on
 * 2026-06-25. The presets were found already correct; this test converts that
 * "unverified-correct" state into CI-enforced correctness, so any future edit or
 * patch that drifts presets.json fails loudly here.
 *
 * Provenance (per-character infobox + the Traits page):
 *   https://stoneshard.com/wiki/Verren  | /Velmir | /Jorgrim | /Arna | /Dirwin
 *   https://stoneshard.com/wiki/Jonna    | /Mahir  | /Leosthenes | /Hilda
 *   https://stoneshard.com/wiki/Traits   (Dirwin → "Make a Halt"; Hilda → "Resourcefulness")
 *
 * Scope of the lock: the starting attribute spread + innate-ability presence only.
 * Trait *effects*, starting equipment/crowns, and affinity unlock-relaxation are
 * intentionally NOT covered (separately deferred), so this test does not assert them.
 */
import { describe, it, expect } from 'vitest'
import presetsJson from '../data/presets.json'
import skillsJson from '../data/skills.json'

interface Attr {
  STR: number
  AGI: number
  PER: number
  VIT: number
  WIL: number
}
interface Ref {
  attributes: Attr
  startingSkills: string[]
}

const presets = presetsJson as Array<{ id: string; attributes: Attr; startingSkills: string[] }>
const skillByKey = new Map(
  (skillsJson as Array<{ key: string; name: { english: string } }>).map((s) => [s.key, s]),
)

/** Wiki-verified reference (see provenance above). */
const REFERENCE: Record<string, Ref> = {
  verren: { attributes: { STR: 10, AGI: 10, PER: 10, VIT: 10, WIL: 10 }, startingSkills: [] },
  velmir: { attributes: { STR: 11, AGI: 11, PER: 11, VIT: 10, WIL: 10 }, startingSkills: [] },
  jorgrim: { attributes: { STR: 11, AGI: 10, PER: 11, VIT: 11, WIL: 10 }, startingSkills: [] },
  arna: { attributes: { STR: 11, AGI: 11, PER: 10, VIT: 11, WIL: 10 }, startingSkills: [] },
  dirwin: { attributes: { STR: 10, AGI: 11, PER: 11, VIT: 11, WIL: 10 }, startingSkills: ['halt'] },
  jonna: { attributes: { STR: 10, AGI: 10, PER: 11, VIT: 11, WIL: 11 }, startingSkills: [] },
  mahir: { attributes: { STR: 10, AGI: 11, PER: 11, VIT: 10, WIL: 11 }, startingSkills: [] },
  leosthenes: { attributes: { STR: 11, AGI: 10, PER: 10, VIT: 11, WIL: 11 }, startingSkills: [] },
  hilda: {
    attributes: { STR: 11, AGI: 11, PER: 10, VIT: 11, WIL: 10 },
    startingSkills: ['resourcefulness'],
  },
}

const byId = new Map(presets.map((p) => [p.id, p]))

describe('character-select preset correctness (R5)', () => {
  it('covers exactly the nine documented characters', () => {
    expect(new Set(presets.map((p) => p.id))).toEqual(new Set(Object.keys(REFERENCE)))
  })

  for (const [id, ref] of Object.entries(REFERENCE)) {
    it(`${id}: attributes and starting skills match the wiki reference`, () => {
      const p = byId.get(id)
      expect(p, `preset "${id}" is missing from presets.json`).toBeDefined()
      expect(p!.attributes).toEqual(ref.attributes)
      expect(p!.startingSkills).toEqual(ref.startingSkills)
    })
  }

  it('every non-Verren character invests exactly +3 above base across its attributes', () => {
    for (const [id, ref] of Object.entries(REFERENCE)) {
      if (id === 'verren') continue
      const investedTotal = Object.values(ref.attributes).reduce((sum, v) => sum + (v - 10), 0)
      expect(investedTotal, `${id} should invest exactly +3`).toBe(3)
    }
  })

  it('only Dirwin and Hilda carry an innate starting skill; the other seven carry none', () => {
    for (const p of presets) {
      const expectInnate = p.id === 'dirwin' || p.id === 'hilda'
      expect(p.startingSkills.length > 0, `${p.id}`).toBe(expectInnate)
    }
  })

  it("Dirwin's innate skill key 'halt' resolves to the 'Make a Halt' ability", () => {
    const halt = skillByKey.get('halt')
    expect(halt, "skill key 'halt' should exist in the dataset").toBeDefined()
    expect(halt!.name.english).toBe('Make a Halt')
  })

  it('every preset startingSkills key resolves to a real skill', () => {
    for (const p of presets) {
      for (const key of p.startingSkills) {
        expect(skillByKey.has(key), `${p.id} → "${key}" is not a known skill`).toBe(true)
      }
    }
  })
})
