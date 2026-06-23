import { describe, it, expect } from 'vitest'
import { parseMarkup } from './markup'

describe('tooltip markup parser', () => {
  it('parses colored spans, placeholders, and breaks', () => {
    const nodes = parseMarkup('Deals ~p~/*Arcane_Damage*/ damage~/~.##Done')
    expect(nodes).toEqual([
      { kind: 'text', text: 'Deals ', color: null },
      { kind: 'placeholder', name: 'Arcane_Damage', color: 'p' },
      { kind: 'text', text: ' damage', color: 'p' },
      { kind: 'text', text: '.', color: null },
      { kind: 'break', paragraph: true },
      { kind: 'text', text: 'Done', color: null },
    ])
  })

  it('distinguishes paragraph (##) from line (#) breaks', () => {
    const nodes = parseMarkup('a#b##c')
    expect(nodes).toEqual([
      { kind: 'text', text: 'a', color: null },
      { kind: 'break', paragraph: false },
      { kind: 'text', text: 'b', color: null },
      { kind: 'break', paragraph: true },
      { kind: 'text', text: 'c', color: null },
    ])
  })

  it('degrades an unclosed color span to colored text without crashing', () => {
    const nodes = parseMarkup('~r~still red to the end')
    expect(nodes).toEqual([{ kind: 'text', text: 'still red to the end', color: 'r' }])
  })

  it('treats a malformed placeholder as plain text (no closer)', () => {
    const nodes = parseMarkup('value /*Broken and on')
    expect(nodes).toEqual([{ kind: 'text', text: 'value /*Broken and on', color: null }])
  })
})
