/**
 * Dev-time vendoring of item icons from the official wiki (M3 U6).
 *
 * Each item's display name resolves to a sprite via the MediaWiki `Special:FilePath`
 * endpoint (`Special:FilePath/<Item Name>.png`, name-keyed — item names are unique,
 * the basis for `item.key = slug(name)`). This fetches one per item, vendors the
 * present ones under `public/img/items/<key>.png`, and writes a provenance
 * manifest. Items with no wiki art (404) are simply omitted — `Icon.svelte` renders
 * its glyph fallback, the same posture as the ability icons.
 *
 * Run with: `npm run vendor:item-icons`. Network, dev-only, not in CI. The
 * transform (`scripts/transform-items.ts`) then sets `item.icon` for every key
 * whose file landed here.
 */
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const outDir = resolve(root, 'public/img/items')
const itemsPath = resolve(root, 'src/data/items.json')

const UA = 'StoneshardBuildCalculator/0.1 (item icons; https://github.com/AntoKrator)'
const CONCURRENCY = 8

interface ItemRef {
  key: string
  name: { english: string }
}
const items = JSON.parse(readFileSync(itemsPath, 'utf8')) as ItemRef[]

mkdirSync(outDir, { recursive: true })

/** Fetch one icon; returns the key if vendored, null on 404/non-image. */
async function fetchIcon(item: ItemRef): Promise<string | null> {
  const url = `https://stoneshard.com/wiki/Special:FilePath/${encodeURIComponent(item.name.english)}.png`
  const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' })
  if (!res.ok) return null
  if (!(res.headers.get('content-type') ?? '').includes('image')) return null
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length === 0) return null
  writeFileSync(resolve(outDir, `${item.key}.png`), buf)
  return item.key
}

// Bounded-concurrency sweep over all items.
const have: string[] = []
const missing: string[] = []
let next = 0
async function worker(): Promise<void> {
  while (next < items.length) {
    const item = items[next++]
    try {
      const key = await fetchIcon(item)
      if (key) have.push(key)
      else missing.push(item.key)
    } catch {
      missing.push(item.key)
    }
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker))

have.sort()
missing.sort()
const manifest = {
  source: 'stoneshard.com/wiki Special:FilePath',
  retrievedAt: new Date().toISOString().slice(0, 10),
  note: 'Item icons vendored from the official wiki by display name. Items absent here have no wiki art and fall back to the Icon glyph. Refresh with `npm run vendor:item-icons`; then `npm run transform-items` to set item.icon. Game art is Ink Stains Games IP under fair use — see /NOTICE.md.',
  count: have.length,
  missingCount: missing.length,
  missing,
}
writeFileSync(
  resolve(root, 'vendor/stoneshard-wiki/item-icons-manifest.json'),
  JSON.stringify(manifest, null, 2) + '\n',
)

console.log(`Vendored ${have.length}/${items.length} item icons → public/img/items/`)
if (missing.length) console.log(`  ${missing.length} item(s) without wiki art (fallback glyph)`)
