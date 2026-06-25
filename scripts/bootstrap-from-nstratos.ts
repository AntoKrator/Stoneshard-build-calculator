/**
 * Bootstrap `src/data/` from the vendored nstratos snapshot.
 *
 * Reads the integrity-checked vendor sources, runs the pure transform, validates
 * shape + referential integrity, and only then writes `src/data/`. Any failure
 * (checksum mismatch, edge drift, missing data, integrity issue) throws before a
 * single file is written, so a broken run never leaves a half-generated dataset.
 *
 * Run with: `npm run bootstrap`. Output is committed; CI does not run this.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseAbilityPicks } from '../src/lib/bootstrap/topology'
import { transform } from '../src/lib/bootstrap/transform'
import { validateDataset } from '../src/lib/validate'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const vendorDir = resolve(root, 'vendor/nstratos')
const outDir = resolve(root, 'src/data')

interface Manifest {
  repo: string
  ref: string
  retrievedAt: string
  checksums: Record<string, string>
}

/** Read a vendored file and fail closed if its checksum drifts from the manifest. */
function readVerified(name: string, expected: string): string {
  const buf = readFileSync(resolve(vendorDir, name))
  const got = 'sha256:' + createHash('sha256').update(buf).digest('hex')
  if (got !== expected) {
    throw new Error(`Checksum mismatch for ${name}\n  expected ${expected}\n  got      ${got}`)
  }
  return buf.toString('utf8')
}

const manifest = JSON.parse(readFileSync(resolve(vendorDir, 'manifest.json'), 'utf8')) as Manifest
const tooltips = JSON.parse(readVerified('tooltips.json', manifest.checksums['tooltips.json']))
const skillKeys = JSON.parse(readVerified('skill-keys.json', manifest.checksums['skill-keys.json']))
const html = readVerified('index.html', manifest.checksums['index.html'])

const nodes = parseAbilityPicks(html)
const source = `${manifest.repo}@${manifest.ref} (vendored ${manifest.retrievedAt})`
const { dataset, report } = transform({
  tooltips,
  skillKeys,
  nodes,
  source,
  gameVersion: '0.9.4.x',
})

// Validate shape + integrity BEFORE writing anything.
const { dataset: parsed, issues } = validateDataset(dataset)
if (issues.length) {
  const lines = issues.map((i) => `[${i.kind}] ${i.message}`).join('\n  ')
  throw new Error(`Integrity check failed — writing nothing:\n  ${lines}`)
}

mkdirSync(outDir, { recursive: true })
const write = (name: string, value: unknown) =>
  writeFileSync(resolve(outDir, name), JSON.stringify(value, null, 2) + '\n')

write('meta.json', parsed.meta)
write('attributes.json', parsed.attributes)
write('trees.json', parsed.trees)
write('skills.json', parsed.skills)
// Constants are curated beyond what this transform produces — the Phase-1 point
// economy, the damage-type vocabulary, and M2's item-stat vocabulary all live in
// the committed constants.json that the transform only stubs. Preserve the
// committed file verbatim on a re-run rather than clobbering that curation; only
// on a fresh clone (no committed file) is the stub written.
const constantsPath = resolve(outDir, 'constants.json')
const constants = existsSync(constantsPath)
  ? JSON.parse(readFileSync(constantsPath, 'utf8'))
  : parsed.constants
write('constants.json', constants)
write('bootstrap-report.json', report)

console.log(
  `Bootstrapped ${parsed.skills.length} skills across ${parsed.trees.length} trees → src/data/`,
)
console.log(`Report: ${report.warnings.length} warning(s), ${report.notes.length} note(s)`)
for (const w of report.warnings) console.log(`  warning [${w.category}] ${w.message}`)
