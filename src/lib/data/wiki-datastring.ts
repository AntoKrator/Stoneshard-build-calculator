/**
 * Parser for the official wiki's item "datastrings" (Weapon data / Armor data).
 *
 * Each Data page is a MediaWiki template: a `<noinclude>` block documenting the
 * column order (a numeric-index row followed by a named-header row), then an
 * `<includeonly>{{#switch: {{{1}}} … }}` block whose cases are the items:
 *
 *     |Arna's Sword=2;sword01;Sword;Unique;metal;80;…;<description>
 *
 * Values are `;`-delimited, positional, with empty cells as consecutive `;` and a
 * free-text Description last. We map every cell to its header **label** (never by
 * blind position) and fail loudly on any header/column-count mismatch, so a patch
 * that adds or reorders columns surfaces as a hard error rather than silently
 * misaligning fields (KTD5).
 *
 * Pure string → rows: no network, no filesystem. The orchestrator
 * (`scripts/transform-items.ts`) owns reading the checksum-verified vendored
 * snapshot and the normalize step.
 */

export interface DatastringRow {
  /** The `#switch` case label — the item's English display name. */
  name: string
  /** Header-label → raw cell value, in column order. Empty cells are `''`. */
  fields: Record<string, string>
}

export interface ParsedDatastring {
  /** The reconciled, de-duplicated column header (includes any `leadingColumns`). */
  header: string[]
  rows: DatastringRow[]
}

export interface ParseOptions {
  /**
   * Column labels the page's own named-header row omits, prepended to it. The
   * Armor data page starts its numeric index at 1 (not 0), dropping the leading
   * `Tier` label its rows nonetheless carry; pass `['Tier']` to restore it. The
   * count is asserted against the data, so if the wiki ever fixes its header this
   * fails loudly rather than shifting every column by one.
   */
  leadingColumns?: string[]
}

/** Thrown on any structural problem that would misalign fields. */
export class DatastringError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DatastringError'
  }
}

/** Split a `;`-delimited line, dropping a single trailing-`;` artifact cell. */
function splitCells(line: string, expected: number): string[] {
  const cells = line.split(';')
  // A trailing `;` yields a spurious empty final cell; drop it only when doing so
  // hits the expected width, so genuine empty Description fields are preserved and
  // real drift still fails the width check below.
  if (cells.length === expected + 1 && cells[cells.length - 1] === '') cells.pop()
  return cells
}

/** Make repeated header labels addressable (the wiki repeats some), so no column
 *  is silently collapsed: `X`, `X (2)`, `X (3)`, … */
function dedupeHeader(header: string[]): string[] {
  const seen = new Map<string, number>()
  return header.map((name) => {
    const n = (seen.get(name) ?? 0) + 1
    seen.set(name, n)
    return n === 1 ? name : `${name} (${n})`
  })
}

/**
 * Parse a datastring wikitext blob into header-keyed rows.
 *
 * @throws {DatastringError} on a missing header, an empty switch block, or any
 *   data row whose cell count disagrees with the header (column drift).
 */
export function parseDatastring(wikitext: string, opts: ParseOptions = {}): ParsedDatastring {
  const lines = wikitext.split('\n')

  // The named header is the line immediately after the numeric-index row
  // (`0;1;2;…` for weapons, `1;2;3;…` for armor), inside <noinclude>.
  let namedHeader: string[] | null = null
  for (let i = 0; i < lines.length - 1; i++) {
    if (/^\s*\d+(;\d+)+;?\s*$/.test(lines[i])) {
      namedHeader = lines[i + 1].trim().replace(/;$/, '').split(';')
      break
    }
  }
  if (!namedHeader) {
    throw new DatastringError('No numeric-index/header row found in the <noinclude> block')
  }

  const header = dedupeHeader([...(opts.leadingColumns ?? []), ...namedHeader])

  // Data rows live in the {{#switch}} block as `|<name>=<;-delimited values>`.
  const rows: DatastringRow[] = []
  for (const line of lines) {
    const m = /^\|([^=\n]+)=(.*)$/.exec(line)
    if (!m) continue
    const name = m[1].trim()
    if (name === '#default') continue // the switch fallthrough case, not an item

    const cells = splitCells(m[2], header.length)
    if (cells.length !== header.length) {
      throw new DatastringError(
        `Row "${name}" has ${cells.length} cells but the header has ${header.length} ` +
          `(column drift — parse by header, never position)`,
      )
    }
    const fields: Record<string, string> = {}
    for (let i = 0; i < header.length; i++) fields[header[i]] = cells[i]
    rows.push({ name, fields })
  }

  if (rows.length === 0) {
    throw new DatastringError('No `|name=…` item rows found in the <includeonly> switch block')
  }
  return { header, rows }
}
