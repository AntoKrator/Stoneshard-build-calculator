/**
 * Pratt (precedence-climbing) parser for formula tokens (U2, step 2).
 *
 * Grammar:
 *   expr    := term (('+' | '-') term)*
 *   term    := factor (('*' | '/') factor)*
 *   factor  := '-' factor | primary
 *   primary := number | ident | ident '(' args? ')' | '(' expr ')'
 *   args    := expr (',' expr)*
 *
 * `* /` bind tighter than `+ -`; unary minus binds tighter still. A syntax error
 * (trailing operator, unbalanced parens, missing argument) throws a
 * {@link ParseError}, caught by the engine entry point and surfaced as a typed
 * error. No `eval()`, no `Function()` — only this hand-written AST.
 */
import type { Token } from './lexer'

export type Expr =
  | { type: 'num'; value: number }
  | { type: 'var'; name: string }
  | { type: 'unary'; op: '-'; operand: Expr }
  | { type: 'binary'; op: '+' | '-' | '*' | '/'; left: Expr; right: Expr }
  | { type: 'call'; name: string; args: Expr[] }

export class ParseError extends Error {}

export function parse(tokens: Token[]): Expr {
  let pos = 0
  const peek = (): Token => tokens[pos]
  const next = (): Token => tokens[pos++]

  function parseExpr(): Expr {
    let left = parseTerm()
    for (;;) {
      const t = peek()
      if (t.kind === 'op' && (t.op === '+' || t.op === '-')) {
        next()
        const right = parseTerm()
        left = { type: 'binary', op: t.op, left, right }
      } else {
        return left
      }
    }
  }

  function parseTerm(): Expr {
    let left = parseFactor()
    for (;;) {
      const t = peek()
      if (t.kind === 'op' && (t.op === '*' || t.op === '/')) {
        next()
        const right = parseFactor()
        left = { type: 'binary', op: t.op, left, right }
      } else {
        return left
      }
    }
  }

  function parseFactor(): Expr {
    const t = peek()
    if (t.kind === 'op' && t.op === '-') {
      next()
      return { type: 'unary', op: '-', operand: parseFactor() }
    }
    // A leading unary '+' is a no-op; accept it for robustness.
    if (t.kind === 'op' && t.op === '+') {
      next()
      return parseFactor()
    }
    return parsePrimary()
  }

  function parsePrimary(): Expr {
    const t = next()

    if (t.kind === 'number') {
      return { type: 'num', value: t.value }
    }

    if (t.kind === 'ident') {
      if (peek().kind === 'lparen') {
        next() // consume '('
        const args: Expr[] = []
        if (peek().kind !== 'rparen') {
          args.push(parseExpr())
          while (peek().kind === 'comma') {
            next()
            args.push(parseExpr())
          }
        }
        if (peek().kind !== 'rparen') {
          throw new ParseError(`Expected ")" after arguments to "${t.name}"`)
        }
        next() // consume ')'
        return { type: 'call', name: t.name, args }
      }
      return { type: 'var', name: t.name }
    }

    if (t.kind === 'lparen') {
      const inner = parseExpr()
      if (peek().kind !== 'rparen') {
        throw new ParseError('Expected ")"')
      }
      next()
      return inner
    }

    throw new ParseError(`Unexpected token "${t.kind}"`)
  }

  const expr = parseExpr()
  if (peek().kind !== 'eof') {
    throw new ParseError(`Unexpected trailing token "${peek().kind}"`)
  }
  return expr
}
