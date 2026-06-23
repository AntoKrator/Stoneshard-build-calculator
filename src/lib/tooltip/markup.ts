/**
 * Parser for Stoneshard's skill-tooltip markup (U7, step 1).
 *
 * The game encodes tooltips as a tiny markup language:
 *   - `~code~ … ~/~`  — a colored span (e.g. `~r~`, `~w~`, `~p~`, `~lg~`)
 *   - `##`            — a paragraph break, `#` — a line break
 *   - a formula placeholder written `slash-star NAME star-slash`, resolved to a
 *     number by the engine
 *
 * This produces a flat list of **structured nodes** carrying the current color
 * context. It is forgiving by design (KTD8): unclosed spans simply stay colored
 * to the end, a stray `~/~` just clears color, and a malformed placeholder with no
 * closer is emitted as plain text — nothing throws, so untrusted game text always
 * degrades to readable output rather than breaking the UI.
 *
 * This module is presentation-agnostic: it emits color *codes*, never CSS. The
 * component maps a fixed set of codes to fixed CSS values, so a span color can
 * never be attacker-influenced.
 */

export interface MarkupText {
  kind: 'text'
  text: string
  color: string | null
}
export interface MarkupPlaceholder {
  kind: 'placeholder'
  name: string
  color: string | null
}
export interface MarkupBreak {
  kind: 'break'
  paragraph: boolean
}
export type MarkupNode = MarkupText | MarkupPlaceholder | MarkupBreak

const OPEN_COLOR = /^~([a-z]+)~/
const PLACEHOLDER = /^\/\*([A-Za-z0-9_]+)\*\//

export function parseMarkup(src: string): MarkupNode[] {
  const nodes: MarkupNode[] = []
  let color: string | null = null
  let buf = ''
  let i = 0

  const flush = () => {
    if (buf) {
      nodes.push({ kind: 'text', text: buf, color })
      buf = ''
    }
  }

  while (i < src.length) {
    const rest = src.slice(i)

    if (rest.startsWith('~/~')) {
      flush()
      color = null
      i += 3
      continue
    }

    const open = OPEN_COLOR.exec(rest)
    if (open) {
      flush()
      color = open[1]
      i += open[0].length
      continue
    }

    if (rest.startsWith('##')) {
      flush()
      nodes.push({ kind: 'break', paragraph: true })
      i += 2
      continue
    }
    if (src[i] === '#') {
      flush()
      nodes.push({ kind: 'break', paragraph: false })
      i += 1
      continue
    }

    const ph = PLACEHOLDER.exec(rest)
    if (ph) {
      flush()
      nodes.push({ kind: 'placeholder', name: ph[1], color })
      i += ph[0].length
      continue
    }

    buf += src[i]
    i += 1
  }

  flush()
  return nodes
}
