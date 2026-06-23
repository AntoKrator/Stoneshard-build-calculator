/**
 * Resolves parsed tooltip markup to safe, renderable segments (U7, step 2).
 *
 * Each formula placeholder (`slash-star NAME star-slash`) is resolved through the
 * expression engine (U2) over the current scope (U3): a resolved formula becomes the formatted
 * number, and an `unknown-var`/`error`/missing formula becomes the neutral marker
 * — never a wrong number, never raw markup (KTD5/KTD9).
 *
 * The output is a flat list of **text and break segments only**. There is no HTML
 * here and no formula strings leak through; the component renders each segment's
 * `text` via escaped interpolation (never `{@html}`), so untrusted game text
 * cannot inject markup (KTD8).
 */
import { evaluate, type Scope } from '../formula/eval'
import { parseMarkup } from './markup'

export const NEUTRAL_MARKER = '—'

export type RenderSegment =
  | { kind: 'text'; text: string; color: string | null; resolved?: 'value' | 'marker' }
  | { kind: 'break'; paragraph: boolean }

/** Display a computed number: integers as-is, otherwise to one decimal. */
function formatValue(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(1)))
}

export function renderTooltip(
  src: string,
  formulas: Record<string, string>,
  scope: Scope,
): RenderSegment[] {
  const out: RenderSegment[] = []

  for (const node of parseMarkup(src)) {
    if (node.kind === 'break') {
      out.push({ kind: 'break', paragraph: node.paragraph })
      continue
    }
    if (node.kind === 'text') {
      out.push({ kind: 'text', text: node.text, color: node.color })
      continue
    }

    // Placeholder: resolve its formula, or fall back to the neutral marker.
    const expr = formulas[node.name]
    if (expr === undefined) {
      out.push({ kind: 'text', text: NEUTRAL_MARKER, color: node.color, resolved: 'marker' })
      continue
    }
    const res = evaluate(expr, scope)
    if (res.kind === 'value') {
      out.push({ kind: 'text', text: formatValue(res.value), color: node.color, resolved: 'value' })
    } else {
      out.push({ kind: 'text', text: NEUTRAL_MARKER, color: node.color, resolved: 'marker' })
    }
  }

  return out
}
