import { describe, it, expect } from 'vitest'
import { tokenize, LexError } from './lexer'

describe('tokenizer', () => {
  it('tokenizes numbers, identifiers, operators, parentheses, commas', () => {
    const kinds = tokenize('max(Magic_Power, 3.5) + STR * 2').map((t) => t.kind)
    expect(kinds).toEqual([
      'ident', // max
      'lparen',
      'ident', // Magic_Power
      'comma',
      'number', // 3.5
      'rparen',
      'op', // +
      'ident', // STR
      'op', // *
      'number', // 2
      'eof',
    ])
  })

  it('parses integer and decimal numbers, including a leading dot', () => {
    expect(tokenize('12')[0]).toMatchObject({ kind: 'number', value: 12 })
    expect(tokenize('3.75')[0]).toMatchObject({ kind: 'number', value: 3.75 })
    expect(tokenize('.5')[0]).toMatchObject({ kind: 'number', value: 0.5 })
  })

  it('keeps underscores and digits inside identifiers', () => {
    expect(tokenize('open_weapon_one_hand_skills')[0]).toMatchObject({
      kind: 'ident',
      name: 'open_weapon_one_hand_skills',
    })
  })

  it('throws LexError on an unexpected character (fails closed for e.g. **)', () => {
    expect(() => tokenize('1 % 2')).toThrow(LexError)
    expect(() => tokenize('1 & 2')).toThrow(LexError)
  })
})
