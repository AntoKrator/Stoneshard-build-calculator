/**
 * Transform the vendored wiki snapshot into `src/data/items.json`.
 *
 * Reads the checksum-verified vendored datastrings, parses them by header,
 * normalizes rows into the `Item` schema, validates shape before writing, and
 * emits deterministic key-sorted JSON. Item warnings/notes are folded into the
 * existing `bootstrap-report.json` the data gate already reads, and the derived
 * item-stat vocabulary is written into `constants.json` — both via read-merge so
 * the nstratos-sourced sections are preserved.
 *
 * Run with: `npm run transform-items` (after `npm run vendor:wiki`). Output is
 * committed; CI does not run this.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { Item } from '../src/lib/types'
import { parseDatastring } from '../src/lib/data/wiki-datastring'
import { WIKI_PAGES } from '../src/lib/data/wiki-pages'
import { transformItems } from '../src/lib/bootstrap/items'
import { verifyChecksum } from './checksum'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const vendorDir = resolve(root, 'vendor/stoneshard-wiki')
const dataDir = resolve(root, 'src/data')
const readJson = (path: string) => JSON.parse(readFileSync(path, 'utf8'))
const writeJson = (path: string, value: unknown) =>
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n')

interface PageManifest {
  sha256: string
}
const manifest = readJson(resolve(vendorDir, 'manifest.json')) as {
  pages: Record<string, PageManifest>
}

// Read + checksum-verify each vendored datastring, then parse it by header.
const pages = WIKI_PAGES.map((page) => {
  const entry = manifest.pages[page.file]
  if (!entry) throw new Error(`Manifest has no entry for vendored file "${page.file}"`)
  const wikitext = readFileSync(resolve(vendorDir, page.file), 'utf8')
  verifyChecksum(page.file, wikitext, entry.sha256)
  return { page, parsed: parseDatastring(wikitext, { leadingColumns: page.leadingColumns }) }
})

const constants = readJson(resolve(dataDir, 'constants.json')) as {
  damageTypes: string[]
  itemStatKeys?: string[]
}
const { items, itemStatKeys, report } = transformItems({
  pages,
  damageTypes: constants.damageTypes ?? [],
})

// Validate shape BEFORE writing anything — a malformed item fails the run.
const parsed = z.array(Item).parse(items)

// Emit the dataset section (already key-sorted by the transform).
writeJson(resolve(dataDir, 'items.json'), parsed)

// Write the derived item-stat vocabulary into constants (read-merge).
writeJson(resolve(dataDir, 'constants.json'), { ...constants, itemStatKeys })

// Fold item warnings/notes/count into the report the gate reads (idempotent:
// drop any prior item-* entries first, then re-add this run's).
const reportPath = resolve(dataDir, 'bootstrap-report.json')
const existing = readJson(reportPath) as {
  counts: Record<string, number>
  notes: string[]
  warnings: { category: string; message: string }[]
}
const warnings = [
  ...existing.warnings.filter((w) => !w.category.startsWith('item-')),
  ...report.warnings,
]
const notes = [
  ...existing.notes.filter((n) => !n.startsWith('[items]')),
  ...report.notes.map((n) => `[items] ${n}`),
]
writeJson(reportPath, {
  ...existing,
  counts: { ...existing.counts, items: parsed.length, warnings: warnings.length },
  notes,
  warnings,
})

console.log(
  `Transformed ${parsed.length} items ` +
    `(${report.counts.weapons} weapons, ${report.counts.armor} armor, ` +
    `${report.counts.accessories} accessories; ${report.counts.skipped} skipped) → src/data/items.json`,
)
console.log(`Item-stat vocabulary: ${itemStatKeys.length} keys`)
console.log(`Report: ${report.warnings.length} item warning(s), ${report.notes.length} note(s)`)
for (const w of report.warnings) console.log(`  warning [${w.category}] ${w.message}`)
