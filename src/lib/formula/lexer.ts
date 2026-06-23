/**
 * Tokenizer for skill-effect formula strings (U2, step 1).
 *
 * Recognizes numbers, identifiers, the four arithmetic operators, parentheses,
 * and commas. Whitespace is skipped. An unexpected character throws a
 * {@link LexError} — the public engine entry point (`evaluate`) catches it and
 * degrades to a typed error, so a malformed formula never escapes to the UI.
 *
 * Deliberately tiny: the grammar is `number | identifier | ( ) , + - * /`. No
 * `**`, no bitwise, no strings — anything outside this set is a lex error, which
 * is how `'1 ** 2'` fails closed.
 */

export type Token =
  | { kind: 'number'; value: number }
  | { kind: 'ident'; name: string }
  | { kind: 'op'; op: '+' | '-' | '*' | '/' }
  | { kind: 'lparen' }
  | { kind: 'rparen' }
  | { kind: 'comma' }
  | { kind: 'eof' }

export class LexError extends Error {}

const IDENT_START = /[A-Za-z_]/
const IDENT_PART = /[A-Za-z0-9_]/
const DIGIT = /[0-9]/

export function tokenize(src: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  const n = src.length

  while (i < n) {
    const c = src[i]

    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i++
      continue
    }

    if (c === '+' || c === '-' || c === '*' || c === '/') {
      tokens.push({ kind: 'op', op: c })
      i++
      continue
    }
    if (c === '(') {
      tokens.push({ kind: 'lparen' })
      i++
      continue
    }
    if (c === ')') {
      tokens.push({ kind: 'rparen' })
      i++
      continue
    }
    if (c === ',') {
      tokens.push({ kind: 'comma' })
      i++
      continue
    }

    if (DIGIT.test(c) || (c === '.' && DIGIT.test(src[i + 1] ?? ''))) {
      let j = i
      let seenDot = false
      while (j < n && (DIGIT.test(src[j]) || (src[j] === '.' && !seenDot))) {
        if (src[j] === '.') seenDot = true
        j++
      }
      const text = src.slice(i, j)
      const value = Number(text)
      if (!Number.isFinite(value)) throw new LexError(`Invalid number "${text}"`)
      tokens.push({ kind: 'number', value })
      i = j
      continue
    }

    if (IDENT_START.test(c)) {
      let j = i + 1
      while (j < n && IDENT_PART.test(src[j])) j++
      tokens.push({ kind: 'ident', name: src.slice(i, j) })
      i = j
      continue
    }

    throw new LexError(`Unexpected character "${c}" at position ${i}`)
  }

  tokens.push({ kind: 'eof' })
  return tokens
}
