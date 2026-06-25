/**
 * Transform the vendored `Enemy data` snapshot into `src/data/enemies.json` (M5 U3).
 *
 * Reads the checksum-verified vendored datastring, parses it by header legend,
 * normalizes rows into the `Enemy` schema, validates shape before writing, and
 * emits deterministic key-sorted JSON. Enemy warnings/notes are folded into the
 * existing `bootstrap-report.json` the data gate reads, and the derived
 * enemy-stat vocabulary is read-merged into `constants.json` (preserving the
 * item vocabulary). The curated `enemy-abilities.json` (U4) supplies the
 * enemy→ability linkage via each ability's `usedBy` list when present.
 *
 * Run with: `npm run transform-enemies` (after `npm run vendor:enemies`). Output
 * is committed; CI does not run this.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { Enemy } from '../src/lib/types'
import { parseDatastring } from '../src/lib/data/wiki-datastring'
import { ENEMY_PAGE } from '../src/lib/data/wiki-pages'
import { transformEnemies } from '../src/lib/bootstrap/enemies'
import { verifyChecksum } from './checksum'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const vendorDir = resolve(root, 'vendor/stoneshard-wiki')
const dataDir = resolve(root, 'src/data')
const readJson = (path: string) => JSON.parse(readFileSync(path, 'utf8'))
const writeJson = (path: string, value: unknown) =>
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n')

const manifest = readJson(resolve(vendorDir, 'enemy-manifest.json')) as {
  pages: Record<string, { sha256: string }>
}
const entry = manifest.pages[ENEMY_PAGE.file]
if (!entry) throw new Error(`Enemy manifest has no entry for "${ENEMY_PAGE.file}"`)
const wikitext = readFileSync(resolve(vendorDir, ENEMY_PAGE.file), 'utf8')
verifyChecksum(ENEMY_PAGE.file, wikitext, entry.sha256)
const parsed = parseDatastring(wikitext, { headerLinePrefix: ENEMY_PAGE.headerLinePrefix })

const constants = readJson(resolve(dataDir, 'constants.json')) as Record<string, unknown> & {
  damageTypes?: string[]
}

// Curated enemy → ability linkage (U4): each EnemyAbility lists the enemy keys
// that use it in `properties.usedBy` (a ;-joined string); invert to key → abilities.
const abilitiesByKey: Record<string, string[]> = {}
const abilitiesPath = resolve(dataDir, 'enemy-abilities.json')
if (existsSync(abilitiesPath)) {
  const abilities = readJson(abilitiesPath) as {
    key: string
    properties?: { usedBy?: string }
  }[]
  for (const a of abilities) {
    const usedBy = (a.properties?.usedBy ?? '')
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean)
    for (const enemyKey of usedBy) (abilitiesByKey[enemyKey] ??= []).push(a.key)
  }
  for (const k of Object.keys(abilitiesByKey)) abilitiesByKey[k].sort()
}

// Enemy keys with a vendored portrait (U9) — set enemy.icon for these.
const iconDir = resolve(root, 'public/img/enemies')
const iconKeys = new Set(
  existsSync(iconDir)
    ? readdirSync(iconDir)
        .filter((f) => f.endsWith('.png'))
        .map((f) => f.slice(0, -'.png'.length))
    : [],
)

const { enemies, enemyStatKeys, report } = transformEnemies({
  parsed,
  damageTypes: constants.damageTypes ?? [],
  abilitiesByKey,
  iconKeys,
})

// Validate shape before writing anything — a malformed enemy fails the run rather
// than landing in the committed artifact. (Full referential integrity, including
// ability cross-refs and all-zero-column checks, runs in the gate — U5.)
const validated = z.array(Enemy).parse(enemies)
const seen = new Set<string>()
for (const e of validated) {
  if (seen.has(e.key)) throw new Error(`Duplicate enemy key "${e.key}" — writing nothing`)
  seen.add(e.key)
}

const reportPath = resolve(dataDir, 'bootstrap-report.json')
const existing = readJson(reportPath) as {
  counts: Record<string, number>
  notes: string[]
  warnings: { category: string; message: string }[]
}
const warnings = [
  ...existing.warnings.filter((w) => !w.category.startsWith('enemy-')),
  ...report.warnings,
]
const notes = [
  ...existing.notes.filter((n) => !n.startsWith('[enemies]')),
  ...report.notes.map((n) => `[enemies] ${n}`),
]

writeJson(resolve(dataDir, 'enemies.json'), validated)
writeJson(resolve(dataDir, 'constants.json'), { ...constants, enemyStatKeys })
writeJson(reportPath, {
  ...existing,
  counts: { ...existing.counts, enemies: validated.length, warnings: warnings.length },
  notes,
  warnings,
})

console.log(
  `Transformed ${validated.length} enemies (${report.counts.skipped} skipped) → src/data/enemies.json`,
)
console.log(
  `Enemy-stat vocabulary: ${enemyStatKeys.length} keys ` +
    `(${report.counts.damageKeys} damage, ${report.counts.resistanceKeys} resistance)`,
)
console.log(`Report: ${report.warnings.length} enemy warning(s), ${report.notes.length} note(s)`)
for (const w of report.warnings.slice(0, 10)) console.log(`  warning [${w.category}] ${w.message}`)
if (report.warnings.length > 10) console.log(`  … and ${report.warnings.length - 10} more`)
