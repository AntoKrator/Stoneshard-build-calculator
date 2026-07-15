/**
 * Dev-time vendoring of character preset portraits from the official wiki
 * (https://stoneshard.com/wiki/Characters).
 *
 * Mirrors the enemy-portrait flow (`fetch-enemy-icons.ts`): each preset's name
 * resolves via the MediaWiki `Special:FilePath/<Name>.png` endpoint and lands in
 * `public/img/characters/<id>.png`. Successes get `icon` written back onto the
 * preset in `src/data/presets.json` (9 presets — no separate transform step);
 * misses keep the `Icon.svelte` glyph fallback.
 *
 * Run with: `npm run vendor:character-icons`. Network, dev-only, not in CI.
 */
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const outDir = resolve(root, 'public/img/characters')
const presetsPath = resolve(root, 'src/data/presets.json')

const UA = 'StoneshardBuildCalculator/0.1 (character icons; https://github.com/AntoKrator)'

interface PresetRef {
  id: string
  name: string
  icon?: string
  [rest: string]: unknown
}
const presets = JSON.parse(readFileSync(presetsPath, 'utf8')) as PresetRef[]

mkdirSync(outDir, { recursive: true })

async function tryFetch(name: string): Promise<Buffer | null> {
  const url = `https://stoneshard.com/wiki/Special:FilePath/${encodeURIComponent(name)}.png`
  const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' })
  if (!res.ok) return null
  if (!(res.headers.get('content-type') ?? '').includes('image')) return null
  const buf = Buffer.from(await res.arrayBuffer())
  return buf.length > 0 ? buf : null
}

const have: string[] = []
const missing: string[] = []
for (const p of presets) {
  const buf = await tryFetch(p.name)
  if (buf) {
    writeFileSync(resolve(outDir, `${p.id}.png`), buf)
    p.icon = `img/characters/${p.id}.png`
    have.push(p.id)
  } else {
    delete p.icon
    missing.push(p.id)
  }
}

writeFileSync(presetsPath, JSON.stringify(presets, null, 2) + '\n')
console.log(
  `vendored ${have.length}/${presets.length} character portraits to public/img/characters/`,
)
if (missing.length) console.log('missing (glyph fallback):', missing.join(', '))
