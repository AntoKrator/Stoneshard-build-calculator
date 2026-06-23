import { describe, it, expect } from 'vitest'
import { tokenize } from './lexer'
import { parse, ParseError, type Expr } from './parser'

const ast = (src: string): Expr => parse(tokenize(src))

describe('parser', () => {
  it('binds * / tighter than + - (precedence)', () => {
    // 2 + 3 * 4 => 2 + (3 * 4)
    expect(ast('2 + 3 * 4')).toEqual({
      type: 'binary',
      op: '+',
      left: { type: 'num', value: 2 },
      right: {
        type: 'binary',
        op: '*',
        left: { type: 'num', value: 3 },
        right: { type: 'num', value: 4 },
      },
    })
  })

  it('respects parentheses as grouping', () => {
    expect(ast('(2 + 3) * 4')).toEqual({
      type: 'binary',
      op: '*',
      left: {
        type: 'binary',
        op: '+',
        left: { type: 'num', value: 2 },
        right: { type: 'num', value: 3 },
      },
      right: { type: 'num', value: 4 },
    })
  })

  it('parses unary minus tighter than binary operators', () => {
    expect(ast('-5 + 1')).toEqual({
      type: 'binary',
      op: '+',
      left: { type: 'unary', op: '-', operand: { type: 'num', value: 5 } },
      right: { type: 'num', value: 1 },
    })
  })

  it('parses function calls with multiple arguments', () => {
    expect(ast('max(1, STR)')).toEqual({
      type: 'call',
      name: 'max',
      args: [
        { type: 'num', value: 1 },
        { type: 'var', name: 'STR' },
      ],
    })
  })

  it('throws ParseError on malformed input (fails closed)', () => {
    expect(() => ast('2 +')).toThrow(ParseError) // trailing operator
    expect(() => ast('foo(')).toThrow(ParseError) // unbalanced paren
    expect(() => ast('(1 + 2')).toThrow(ParseError) // missing close paren
    expect(() => ast('1 2')).toThrow(ParseError) // trailing token
  })
})
