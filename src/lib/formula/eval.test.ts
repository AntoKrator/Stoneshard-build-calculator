import { describe, it, expect } from 'vitest'
import { evaluate, FUNCTION_TABLE_NAMES, type Scope } from './eval'
import { FUNCTION_NAMES } from './identifiers'

const val = (src: string, scope: Scope = {}) => evaluate(src, scope)

describe('evaluator (R5)', () => {
  it('evaluates arithmetic with correct precedence', () => {
    expect(val('2 + 3 * 4')).toEqual({ kind: 'value', value: 14 })
    expect(val('(2 + 3) * 4')).toEqual({ kind: 'value', value: 20 })
    expect(val('-5 + 1')).toEqual({ kind: 'value', value: -4 })
    expect(val('10 / 4')).toEqual({ kind: 'value', value: 2.5 })
  })

  it('applies the function table', () => {
    expect(val('floor(3.7)')).toEqual({ kind: 'value', value: 3 })
    expect(val('ceil(3.1)')).toEqual({ kind: 'value', value: 4 })
    expect(val('max(1, 9)')).toEqual({ kind: 'value', value: 9 })
    expect(val('min(1, 9, 4)')).toEqual({ kind: 'value', value: 1 })
    expect(val('math_round(2.5)')).toEqual({ kind: 'value', value: 3 })
    expect(val('abs(-7)')).toEqual({ kind: 'value', value: 7 })
  })

  it('resolves scope variables, including a fully-in-scope formula', () => {
    // Wormhole-style shape but over an in-scope stat only.
    expect(evaluate('(9 * Magic_Power / 100)', { Magic_Power: 130 })).toEqual({
      kind: 'value',
      value: 11.7,
    })
    expect(evaluate('15 + 1.5 * WIL', { WIL: 20 })).toEqual({ kind: 'value', value: 45 })
  })

  it('never treats a function name as a scope variable (KTD15)', () => {
    // `floor` present in scope must NOT shadow the function, and using it as a
    // value is an error, not a lookup.
    const res = evaluate('floor + 1', { floor: 99 })
    expect(res.kind).toBe('error')
  })

  it('returns unknown-var for an unresolved scope variable (never a silent 0)', () => {
    expect(evaluate('Arcanistic_Power * 2', {})).toEqual({
      kind: 'unknown-var',
      name: 'Arcanistic_Power',
    })
    // Even when multiplied by zero — all identifiers must resolve.
    expect(evaluate('0 * Body_DEF', {})).toMatchObject({ kind: 'unknown-var', name: 'Body_DEF' })
  })

  it('fails closed (error, never throw) on malformed input', () => {
    expect(evaluate('2 +', {}).kind).toBe('error')
    expect(evaluate('foo(', {}).kind).toBe('error')
    expect(evaluate('1 ** 2', {}).kind).toBe('error')
    expect(evaluate('Magic_Power(2)', { Magic_Power: 100 }).kind).toBe('error') // not a function
    expect(evaluate('floor(1, 2)', {}).kind).toBe('error') // bad arity
  })

  it('fails closed on a non-finite result rather than showing Infinity', () => {
    expect(evaluate('1 / 0', {}).kind).toBe('error')
  })

  it('keeps the function table in sync with the shared registry', () => {
    expect([...FUNCTION_TABLE_NAMES].sort()).toEqual([...FUNCTION_NAMES].sort())
  })
})
