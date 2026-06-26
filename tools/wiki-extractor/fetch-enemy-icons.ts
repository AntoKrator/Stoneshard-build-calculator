/**
 * Dev-time vendoring of enemy portraits from the official wiki (M5 U9).
 *
 * Mirrors the item-icon flow (`fetch-icons.ts`): each enemy's display name
 * resolves to a sprite via the MediaWiki `Special:FilePath` endpoint
 * (`Special:FilePath/<Enemy Name>.png`, name-keyed — names are unique, the basis
 * for `enemy.key = slug(name)`). Many enemies are weapon/variant rows
 * ("Adept (Dagger)", "Restless Soldier (Axe)") that share one base portrait, so
 * a 404 on the exact name retries the base name before the slot of " (…)". The
 * present ones are vendored under `public/img/enemies/<key>.png`; the rest fall
 * back to `Icon.svelte`'s glyph — the matchup math is unaffected either way.
 *
 * Run with: `npm run vendor:enemy-icons`. Network, dev-only, not in CI. The
 * transform (`scripts/transform-enemies.ts`) then sets `enemy.icon` for every
 * key whose file landed here.
 */
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const outDir = resolve(root, 'public/img/enemies')
const enemiesPath = resolve(root, 'src/data/enemies.json')

const UA = 'StoneshardBuildCalculator/0.1 (enemy icons; https://github.com/AntoKrator)'
const CONCURRENCY = 8

interface EnemyRef {
  key: string
  name: { english: string }
}
const enemies = JSON.parse(readFileSync(enemiesPath, 'utf8')) as EnemyRef[]

mkdirSync(outDir, { recursive: true })

/** Fetch the portrait at `Special:FilePath/<name>.png`; null on 404/non-image. */
async function tryFetch(name: string): Promise<Buffer | null> {
  const url = `https://stoneshard.com/wiki/Special:FilePath/${encodeURIComponent(name)}.png`
  const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' })
  if (!res.ok) return null
  if (!(res.headers.get('content-type') ?? '').includes('image')) return null
  const buf = Buffer.from(await res.arrayBuffer())
  return buf.length > 0 ? buf : null
}

/** Fetch one enemy's portrait by exact name, then by base name (pre-" ("). */
async function fetchIcon(enemy: EnemyRef): Promise<string | null> {
  const name = enemy.name.english
  let buf = await tryFetch(name)
  if (!buf) {
    const base = name.replace(/\s*\(.*$/, '').trim()
    if (base && base !== name) buf = await tryFetch(base)
  }
  if (!buf) return null
  writeFileSync(resolve(outDir, `${enemy.key}.png`), buf)
  return enemy.key
}

// Bounded-concurrency sweep over all enemies.
const have: string[] = []
const missing: string[] = []
let next = 0
async function worker(): Promise<void> {
  while (next < enemies.length) {
    const enemy = enemies[next++]
    try {
      const key = await fetchIcon(enemy)
      if (key) have.push(key)
      else missing.push(enemy.key)
    } catch {
      missing.push(enemy.key)
    }
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker))

have.sort()
missing.sort()
const manifest = {
  source: 'stoneshard.com/wiki Special:FilePath',
  retrievedAt: new Date().toISOString().slice(0, 10),
  note: 'Enemy portraits vendored from the official wiki by display name (with a base-name retry for weapon/variant rows). Enemies absent here have no wiki art and fall back to the Icon glyph. Refresh with `npm run vendor:enemy-icons`; then `npm run transform-enemies` to set enemy.icon. Game art is Ink Stains Games IP under fair use — see /NOTICE.md.',
  count: have.length,
  missingCount: missing.length,
  missing,
}
writeFileSync(
  resolve(root, 'vendor/stoneshard-wiki/enemy-icons-manifest.json'),
  JSON.stringify(manifest, null, 2) + '\n',
)

console.log(`Vendored ${have.length}/${enemies.length} enemy portraits → public/img/enemies/`)
if (missing.length) console.log(`  ${missing.length} enemy(ies) without wiki art (fallback glyph)`)
