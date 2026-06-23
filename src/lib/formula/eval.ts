/**
 * Formula evaluator + public engine entry point (U2, step 3).
 *
 * `evaluate(src, scope)` is the only function callers need: it tokenizes, parses,
 * and walks the AST over a typed {@link Scope}, returning a **discriminated
 * result** and **never throwing** (KTD5). Three outcomes:
 *   - `{ kind: 'value', value }`     every identifier resolved and the result is finite
 *   - `{ kind: 'unknown-var', name }` a referenced scope variable was absent
 *   - `{ kind: 'error', message }`    malformed input, bad arity, or a non-finite result
 *
 * Functions (`floor`, `max`, …) come from a table kept strictly separate from
 * scope variables (KTD15): a function name used as a value is an error, and a
 * scope variable is never callable.
 */
import { tokenize } from './lexer'
import { parse, type Expr } from './parser'
import { FUNCTION_NAMES } from './identifiers'

export type Scope = Record<string, number>

export type EvalResult =
  | { kind: 'value'; value: number }
  | { kind: 'unknown-var'; name: string }
  | { kind: 'error'; message: string }

class UnknownVarError extends Error {
  constructor(public readonly varName: string) {
    super(`Unknown variable "${varName}"`)
  }
}
class EvalError extends Error {}

interface FnDef {
  minArgs: number
  maxArgs: number
  apply: (args: number[]) => number
}

/** Function table. Its keys must stay in sync with FUNCTION_NAMES (asserted in tests). */
const FUNCTIONS: Record<string, FnDef> = {
  math_round: { minArgs: 1, maxArgs: 1, apply: ([x]) => Math.round(x) },
  round: { minArgs: 1, maxArgs: 1, apply: ([x]) => Math.round(x) },
  floor: { minArgs: 1, maxArgs: 1, apply: ([x]) => Math.floor(x) },
  ceil: { minArgs: 1, maxArgs: 1, apply: ([x]) => Math.ceil(x) },
  abs: { minArgs: 1, maxArgs: 1, apply: ([x]) => Math.abs(x) },
  min: { minArgs: 1, maxArgs: Infinity, apply: (xs) => Math.min(...xs) },
  max: { minArgs: 1, maxArgs: Infinity, apply: (xs) => Math.max(...xs) },
}

function evalNode(node: Expr, scope: Scope): number {
  switch (node.type) {
    case 'num':
      return node.value

    case 'var': {
      // A function name is never a scope variable (KTD15).
      if (FUNCTION_NAMES.has(node.name)) {
        throw new EvalError(`"${node.name}" is a function and cannot be used as a value`)
      }
      if (Object.prototype.hasOwnProperty.call(scope, node.name)) {
        return scope[node.name]
      }
      throw new UnknownVarError(node.name)
    }

    case 'unary':
      return -evalNode(node.operand, scope)

    case 'binary': {
      const l = evalNode(node.left, scope)
      const r = evalNode(node.right, scope)
      switch (node.op) {
        case '+':
          return l + r
        case '-':
          return l - r
        case '*':
          return l * r
        case '/':
          return l / r
      }
      break
    }

    case 'call': {
      const fn = FUNCTIONS[node.name]
      if (!fn) {
        throw new EvalError(`Unknown function "${node.name}"`)
      }
      if (node.args.length < fn.minArgs || node.args.length > fn.maxArgs) {
        throw new EvalError(`"${node.name}" called with ${node.args.length} argument(s)`)
      }
      const args = node.args.map((a) => evalNode(a, scope))
      return fn.apply(args)
    }
  }
  // Unreachable for a well-formed AST.
  throw new EvalError('Unhandled expression node')
}

export function evaluate(src: string, scope: Scope): EvalResult {
  try {
    const ast = parse(tokenize(src))
    const value = evalNode(ast, scope)
    if (!Number.isFinite(value)) {
      return { kind: 'error', message: 'Result is not a finite number' }
    }
    return { kind: 'value', value }
  } catch (e) {
    if (e instanceof UnknownVarError) {
      return { kind: 'unknown-var', name: e.varName }
    }
    return { kind: 'error', message: e instanceof Error ? e.message : String(e) }
  }
}

/** Exposed for a parity test against {@link FUNCTION_NAMES}; not used at runtime. */
export const FUNCTION_TABLE_NAMES: ReadonlySet<string> = new Set(Object.keys(FUNCTIONS))
