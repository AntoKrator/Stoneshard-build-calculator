/**
 * End-to-end integration over the REAL committed dataset (228 skills / 21 trees).
 *
 * The unit tests use synthetic fixtures for precise control; this exercises the
 * actual data through the whole stack — ledger → recompute → derived sheet →
 * tooltip render, plus a share round-trip — to catch wiring/data mismatches the
 * synthetic tests can't.
 */
import { describe, it, expect } from 'vitest'
import { dataset, statModel } from '../data/load'
import { BuildLedger } from './ledger.svelte'
import { buildScope } from '../formula/scope'
import { renderTooltip } from '../tooltip/render'
import { encode, decode } from '../share/codec'

function freshLedger() {
  return new BuildLedger(dataset)
}

describe('real-data build flow', () => {
  it('takes a tier-1 skill immediately and unlocks a gated one by leveling', () => {
    const l = freshLedger()
    expect(l.addSkill('Cleave')).toEqual({ ok: true })
    expect(l.character.taken.has('Cleave')).toBe(true)

    // gloat requires Cleave AND level 10 (or 8 invested attr points).
    expect(l.addSkill('gloat')).toEqual({ ok: false, reason: 'locked' }) // level 1
    for (let i = 0; i < 9; i++) l.levelUp() // -> level 10
    expect(l.character.level).toBe(10)
    expect(l.addSkill('gloat')).toEqual({ ok: true })
    expect(l.character.taken.has('gloat')).toBe(true)
  })

  it('cascades a real refund through a real dependent', () => {
    const l = freshLedger()
    l.addSkill('Cleave')
    for (let i = 0; i < 9; i++) l.levelUp()
    l.addSkill('gloat')

    expect(l.removeSkill('Cleave')).toEqual({ ok: true })
    expect(l.character.taken.has('Cleave')).toBe(false)
    expect(l.character.taken.has('gloat')).toBe(false) // relocked: lost its prerequisite
  })

  it('round-trips a real build through the share codec to the same character', async () => {
    const l = freshLedger()
    for (let i = 0; i < 9; i++) l.levelUp()
    l.addAttribute('STR')
    l.addAttribute('STR')
    l.addSkill('Cleave')
    l.addSkill('gloat')
    const before = l.character

    const restored = freshLedger()
    const res = await decode(await encode(l.toLedger()))
    expect(res.ok).toBe(true)
    if (res.ok) restored.load(res.ledger)

    expect(restored.character.level).toBe(before.level)
    expect(restored.character.attributes).toEqual(before.attributes)
    expect([...restored.character.taken].sort()).toEqual([...before.taken].sort())
    expect(restored.character.derived).toEqual(before.derived)
  })

  it('resolves a melee tooltip to live numbers (the day-one archetype, KTD16)', () => {
    const l = freshLedger()
    const ch = l.character
    const scope = buildScope(ch.attributes, ch.derived, statModel)
    const cleave = dataset.skills.find((s) => s.key === 'Cleave')!

    const segs = renderTooltip(cleave.tooltip!.english, cleave.formulas, scope)
    const values = segs.filter((s) => s.kind === 'text' && s.resolved === 'value')
    // Cleave's formulas reference only attributes, so all of them substitute.
    expect(values.length).toBeGreaterThanOrEqual(3)
    // Bodypart_Damage = 15 + 2*AGI(10) = 35 at base attributes.
    expect(values.some((s) => (s as { text: string }).text === '35')).toBe(true)
  })
})
