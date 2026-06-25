/**
 * `npm run validate-data` — the data gate (also run in CI).
 *
 * Loads the committed `src/data/`, runs shape + hardened referential-integrity
 * checks, and enforces the bootstrap warning policy (zero un-allowlisted
 * warnings). Exits non-zero on any failure so CI blocks a bad dataset.
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gateDataset, type BootstrapWarning } from '../src/lib/data/gate'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dataDir = resolve(root, 'src/data')
const readJson = (path: string) => JSON.parse(readFileSync(path, 'utf8'))

function loadComposed(): unknown {
  try {
    return {
      meta: readJson(resolve(dataDir, 'meta.json')),
      attributes: readJson(resolve(dataDir, 'attributes.json')),
      trees: readJson(resolve(dataDir, 'trees.json')),
      skills: readJson(resolve(dataDir, 'skills.json')),
      constants: readJson(resolve(dataDir, 'constants.json')),
      statModel: readJson(resolve(dataDir, 'stat-model.json')),
      items: readJson(resolve(dataDir, 'items.json')),
      // Explicitly read presets.json: the Dataset schema defaults `presets` to
      // `[]`, so an unread file would validate as empty and silently skip the
      // checkPresets cross-check (dual-loader parity, KTD10).
      presets: readJson(resolve(dataDir, 'presets.json')),
    }
  } catch (e) {
    console.error(
      `Could not read src/data — run \`npm run bootstrap\` first.\n${(e as Error).message}`,
    )
    process.exit(1)
  }
}

const composed = loadComposed()

const reportPath = resolve(dataDir, 'bootstrap-report.json')
if (!existsSync(reportPath)) {
  console.error(
    'bootstrap-report.json is missing — run `npm run bootstrap`. The warning gate cannot run without it.',
  )
  process.exit(1)
}
const warnings: BootstrapWarning[] = readJson(reportPath).warnings ?? []
const allowlistPath = resolve(root, 'scripts/warning-allowlist.json')
const allowlist: string[] = existsSync(allowlistPath) ? readJson(allowlistPath) : []

const result = gateDataset(composed, warnings, allowlist)
if (!result.ok) {
  console.error(`validate-data failed (${result.errors.length} issue(s)):`)
  for (const e of result.errors) console.error(`  ${e}`)
  process.exit(1)
}

// Per-tree counts so an empty or thin tree is obvious at a glance.
const { trees, skills } = composed as {
  trees: { id: string; category: string }[]
  skills: { treeId: string }[]
}
const counts = new Map<string, number>()
for (const s of skills) counts.set(s.treeId, (counts.get(s.treeId) ?? 0) + 1)

console.log(
  `✓ ${result.skillCount} skills across ${result.treeCount} trees + ${result.itemCount} items + ${result.presetCount} presets — schema + integrity clean, 0 blocking warnings.`,
)
for (const t of trees) console.log(`  ${t.id} (${t.category}): ${counts.get(t.id) ?? 0}`)

// Item counts by category so a thin or empty item dataset is obvious at a glance.
const { items } = composed as { items: { category: string }[] }
const itemCounts = new Map<string, number>()
for (const it of items) itemCounts.set(it.category, (itemCounts.get(it.category) ?? 0) + 1)
for (const [category, n] of [...itemCounts].sort()) console.log(`  items/${category}: ${n}`)
