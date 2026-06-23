import { describe, it, expect } from 'vitest'
import { renderTooltip, NEUTRAL_MARKER } from './render'
import { buildScope } from '../formula/scope'
import { computeDerivedStats } from '../build/stats'
import { statModel } from '../data/load'
import type { Scope } from '../formula/eval'

// A realistic in-scope scope: attributes (WIL 20) + the derived sheet they produce.
const attributes = { STR: 10, AGI: 10, PER: 10, VIT: 10, WIL: 20 }
const scope: Scope = buildScope(attributes, computeDerivedStats(attributes, statModel), statModel)

const onlyText = (segs: ReturnType<typeof renderTooltip>) =>
  segs.filter((s) => s.kind === 'text').map((s) => (s as { text: string }).text)

describe('tooltip render (R7)', () => {
  it('substitutes a number for a fully-in-scope formula', () => {
    // Magic_Power = 100 + 7.5*2 (WIL 20) = 115.
    const segs = renderTooltip('Power: /*MP*/', { MP: 'Magic_Power' }, scope)
    const value = segs.find((s) => s.kind === 'text' && s.resolved === 'value')
    expect(value).toMatchObject({ text: '115', resolved: 'value' })
  })

  it('substitutes a number for an attribute-only (WIL) formula', () => {
    // 15 + 1.5 * 20 = 45.
    const segs = renderTooltip('/*Bleed_Res*/%', { Bleed_Res: '(15 + 1.5 * WIL)' }, scope)
    expect(onlyText(segs)).toContain('45')
  })

  it('shows the neutral marker for an out-of-scope SORCERY formula (Arcanistic_Power)', () => {
    // Wormhole's actual Arcane_Damage formula — Arcanistic_Power is deferred.
    const wormhole = '(10 * (1 + Arcanistic_Power / 100) * Magic_Power / 100)'
    const segs = renderTooltip('Deals /*Arcane_Damage*/', { Arcane_Damage: wormhole }, scope)
    const marker = segs.find((s) => s.kind === 'text' && s.resolved === 'marker')
    expect(marker).toMatchObject({ text: NEUTRAL_MARKER, resolved: 'marker' })
  })

  it('shows the neutral marker for an out-of-scope NON-sorcery formula (Body_DEF)', () => {
    // Proves the deferral is broader than sorcery — a weaponry/shield stat too.
    const segs = renderTooltip('/*Reduction*/', { Reduction: '(Body_DEF * 0.5)' }, scope)
    expect(onlyText(segs)).toContain(NEUTRAL_MARKER)
    expect(onlyText(segs)).not.toContain('0')
  })

  it('shows the marker when a placeholder has no backing formula', () => {
    const segs = renderTooltip('/*Missing*/', {}, scope)
    expect(onlyText(segs)).toEqual([NEUTRAL_MARKER])
  })

  it('treats injected HTML as inert text, never markup (XSS — KTD8)', () => {
    const evil = 'Cast <img src=x onerror=alert(1)> now'
    const segs = renderTooltip(evil, {}, scope)
    // Only plain text/break segments exist — no HTML node kind, and the dangerous
    // string survives verbatim as data for the component to escape.
    expect(segs.every((s) => s.kind === 'text' || s.kind === 'break')).toBe(true)
    expect(onlyText(segs).join('')).toContain('<img src=x onerror=alert(1)>')
  })
})
