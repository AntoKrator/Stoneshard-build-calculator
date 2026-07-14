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
import { DAMAGE_TYPES } from './combat'
import { buildScope } from '../formula/scope'
import { evaluate } from '../formula/eval'
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

describe('real-data character presets (U7, R1–R4)', () => {
  it('seeds Velmir outside the budget and lets user edits layer on top (R1, R3)', () => {
    const l = freshLedger()
    expect(l.selectCharacter('velmir')).toEqual({ ok: true })
    const ch = l.character
    expect(ch.presetId).toBe('velmir')
    expect(ch.attributes).toMatchObject({ STR: 11, AGI: 11, PER: 11, VIT: 10, WIL: 10 })
    expect(ch.attributesSpent).toBe(0) // seeded points are free
    expect(ch.attributeBudget).toBe(0) // level 1: no earned points yet

    l.levelUp()
    expect(l.addAttribute('STR')).toEqual({ ok: true })
    expect(l.character.attributes.STR).toBe(12) // 11 seed + 1 user
    expect(l.character.attributesSpent).toBe(1)
  })

  it("seeds Hilda's innate Resourcefulness — bypassing its prereq + level gate — for free (R2)", () => {
    // resourcefulness is tier-2: requires Flaying AND level 6 (or 4 PER). As an
    // innate seed it lands at level 1 regardless, and costs no skill points.
    const l = freshLedger()
    l.selectCharacter('hilda')
    const ch = l.character
    expect(ch.taken.has('resourcefulness')).toBe(true)
    expect(ch.taken.has('Flaying')).toBe(false) // the prereq was bypassed, not auto-taken
    expect(ch.skillsSpent).toBe(0)
    expect(ch.skillBudget).toBe(2)

    // both free points remain spendable on top of the innate.
    expect(l.addSkill('Cleave')).toEqual({ ok: true })
    expect(l.addSkill('disengage')).toEqual({ ok: true })
    expect(l.character.skillsSpent).toBe(2)
  })

  it('round-trips a character-seeded build through the share codec (R3)', async () => {
    const l = freshLedger()
    l.selectCharacter('dirwin') // innate "Make a Halt" = halt
    for (let i = 0; i < 3; i++) l.levelUp()
    l.addAttribute('STR')
    l.addSkill('Cleave')
    const before = l.character

    const restored = freshLedger()
    const res = await decode(await encode(l.toLedger()))
    expect(res.ok).toBe(true)
    if (res.ok) restored.load(res.ledger)

    expect(restored.character.presetId).toBe('dirwin')
    expect(restored.character.attributes).toEqual(before.attributes)
    expect(restored.character.taken.has('halt')).toBe(true) // innate survived
    expect([...restored.character.taken].sort()).toEqual([...before.taken].sort())
  })

  it('lets the later selection win and clearing returns to the neutral base (R4)', () => {
    const l = freshLedger()
    l.selectCharacter('dirwin')
    l.selectCharacter('jonna') // PER/VIT/WIL 11, no innate
    expect(l.character.presetId).toBe('jonna')
    expect(l.character.attributes).toMatchObject({ STR: 10, AGI: 10, PER: 11, VIT: 11, WIL: 11 })
    expect(l.character.taken.has('halt')).toBe(false) // dirwin's innate did not persist

    expect(l.clearCharacter()).toEqual({ ok: true })
    expect(l.character.presetId).toBeNull()
    expect(l.character.attributes).toMatchObject({ STR: 10, AGI: 10, PER: 10, VIT: 10, WIL: 10 })
    expect(l.character.taken.size).toBe(0)
  })
})

describe('real-data combat (M4)', () => {
  it('binds the combat damage-type vocabulary to the canonical constants (drift guard)', () => {
    // combat.ts hardcodes DAMAGE_TYPES (grouped for display); this fails CI if a
    // future patch adds/renames a type in constants.json without updating the groups.
    expect([...DAMAGE_TYPES].sort()).toEqual([...dataset.constants.damageTypes].sort())
  })

  it('computes self damage and mitigation from a real equipped loadout (R1–R4)', () => {
    const l = freshLedger()
    l.equip('main_hand', 'footman-sword') // slashing_damage 21
    l.equip('body', 'arcanist-mantle') // protection 4, physical_res 7, arcane_res 20
    l.equip('boots', 'aldwynn-sabatons') // protection 26, physical_res 40
    const { combat } = l.character

    // Deal: at level-1 base modifiers (Weapon_Damage 100, Mainhand 100) → modified = base.
    const slash = combat.damage.find((d) => d.type === 'slashing')!
    expect(slash.base).toBe(21)
    expect(slash.modified).toBe(21)
    expect(slash.expected).toBeCloseTo(21.05, 2) // crit 1% × Crit_Efficiency 25 (×1.25)

    // Take: per-bodypart protection read from the equipped slots.
    expect(combat.protection).toMatchObject({ head: 0, chest: 4, arms: 0, legs: 26 })
    // Physical resistance = mantle 7 + sabatons 40 = 47%; effective HP off max_hp 100.
    const phys = combat.defense.find((d) => d.type === 'slashing')!
    expect(phys.resistance).toBeCloseTo(0.47, 5)
    expect(phys.effectiveHp).toBeCloseTo(100 / 0.53, 1)
  })

  it('lights up the Body_DEF / Legs_DEF melee tooltips only with the armor (R5)', () => {
    const l = freshLedger()
    l.equip('body', 'arcanist-mantle') // protection 4 → Body_DEF
    l.equip('boots', 'aldwynn-sabatons') // protection 26 → Legs_DEF
    const ch = l.character
    const scope = buildScope(ch.attributes, ch.derived, statModel)

    const ram = dataset.skills.find((s) => s.key === 'Battering_Ram')!
    // Blunt_Damage = round(0.5*Body_DEF(4) + 0.5*STR(10)) = 7
    expect(evaluate(ram.formulas.Blunt_Damage, scope)).toEqual({ kind: 'value', value: 7 })

    const sweep = dataset.skills.find((s) => s.key === 'Sweep')! // "Leg Sweep"
    const sweepRes = evaluate(sweep.formulas.Damage, scope)
    expect(sweepRes.kind).toBe('value')
    // Damage = 4 + 0.2*Legs_DEF(26) + 0.3*STR(10) = 12.2
    if (sweepRes.kind === 'value') expect(sweepRes.value).toBeCloseTo(12.2, 6)

    // A gearless build: both identifiers are absent, so the same formulas degrade.
    const bare = freshLedger().character
    const bareScope = buildScope(bare.attributes, bare.derived, statModel)
    expect(evaluate(ram.formulas.Blunt_Damage, bareScope)).toMatchObject({ kind: 'unknown-var' })
    expect(evaluate(sweep.formulas.Damage, bareScope)).toMatchObject({ kind: 'unknown-var' })
  })

  it('keeps Body_DEF / Legs_DEF out of the From Gear view (no redundant display)', () => {
    const l = freshLedger()
    l.equip('body', 'arcanist-mantle')
    l.equip('boots', 'aldwynn-sabatons')
    const ch = l.character
    expect(ch.derived.Body_DEF).toBe(4)
    expect(ch.derived.Legs_DEF).toBe(26)
    expect('Body_DEF' in ch.gearStats).toBe(false)
    expect('Legs_DEF' in ch.gearStats).toBe(false)
  })

  it('round-trips a geared build through the codec; combat is re-derived', async () => {
    const l = freshLedger()
    l.equip('main_hand', 'footman-sword')
    l.equip('body', 'arcanist-mantle')
    l.equip('boots', 'aldwynn-sabatons')
    const before = l.character

    const restored = freshLedger()
    const res = await decode(await encode(l.toLedger()))
    expect(res.ok).toBe(true)
    if (res.ok) restored.load(res.ledger)

    // The combat view is derived, never serialized — it reconstructs identically.
    expect(restored.character.combat).toEqual(before.combat)
  })
})

describe('real-data enemy matchup (M5 U4/U6/U7)', () => {
  it('resolves a curated enemy with its linked abilities and deals into it (R10, R11)', () => {
    const l = freshLedger()
    l.equip('main_hand', 'footman-sword') // slashing_damage 21
    expect(l.selectEnemy('manticore')).toEqual({ ok: true })
    const ch = l.character
    expect(ch.enemy?.key).toBe('manticore')
    // U4 linked the curated abilities onto the bestiary entry (transform via usedBy).
    expect(ch.enemy?.abilities).toEqual(
      expect.arrayContaining(['bone-pyres', 'primal-aether', 'vengeance-of-the-dead']),
    )
    const m = ch.matchup!
    expect(m.hasWeapon).toBe(true)
    expect(m.deal.total).toBeGreaterThan(0)
    expect(Number.isInteger(m.deal.hits) && m.deal.hits! > 0).toBe(true) // hits-to-kill
  })

  it('folds a toggled ability into the incoming side and rejects a foreign one (AE2, F17)', () => {
    const l = freshLedger() // gearless: no resistances/protection, so net == raw
    l.selectEnemy('manticore')
    const base = l.character.matchup!.take.total

    // Primal Aether = 12 Arcane + 12 Sacred + 12 Unholy = 36 raw; gearless ⇒ 36 net.
    expect(l.toggleEnemyAbility('primal-aether')).toEqual({ ok: true })
    const withAbility = l.character.matchup!
    expect(withAbility.enabledAbilities).toContain('primal-aether')
    expect(withAbility.take.total).toBe(base + 36)

    // An ability the enemy does not own is rejected, leaving the selection intact.
    expect(l.toggleEnemyAbility('rock-toss')).toEqual({ ok: false, reason: 'unknown' })
    expect(l.character.matchup!.enabledAbilities).toEqual(['primal-aether'])
  })

  it('persists only the enemy selection in the codec; the matchup re-derives (R16, F18)', async () => {
    const l = freshLedger()
    l.equip('main_hand', 'footman-sword')
    l.selectEnemy('manticore')
    l.toggleEnemyAbility('primal-aether')
    const before = l.character

    const restored = freshLedger()
    const res = await decode(await encode(l.toLedger()))
    expect(res.ok).toBe(true)
    if (res.ok) restored.load(res.ledger)

    expect(restored.character.enemy?.key).toBe('manticore')
    // The matchup view is derived, never serialized — it reconstructs identically.
    expect(restored.character.matchup).toEqual(before.matchup)
  })
})
