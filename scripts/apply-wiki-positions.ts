/**
 * Apply wiki-measured node positions to skills.json.
 *
 * The game (and wiki) center skills between their prerequisites on a
 * quarter-column grid; our extracted data had left-packed integer columns.
 * `tools/wiki-extractor/wiki-positions.json` holds fractional grid columns
 * measured pixel-wise from the official wiki tree images (see its _provenance).
 * This script maps each tier's skills — ordered by their current position —
 * onto the measured columns for that tier and rewrites `skill.position`.
 *
 * Fails loudly on any tier whose node count doesn't match the measurement, so
 * a future dataset refresh can't silently mis-place skills.
 *
 * Run with: `npm run apply-wiki-positions` (idempotent).
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const skillsPath = resolve(root, 'src/data/skills.json')
const positionsPath = resolve(root, 'tools/wiki-extractor/wiki-positions.json')

interface SkillRow {
  key: string
  treeId: string
  tier: number
  position: number
  [rest: string]: unknown
}

const skills = JSON.parse(readFileSync(skillsPath, 'utf8')) as SkillRow[]
const measured = JSON.parse(readFileSync(positionsPath, 'utf8')) as Record<string, number[][]>

const byTree: Record<string, SkillRow[]> = {}
for (const s of skills) (byTree[s.treeId] ??= []).push(s)

let changed = 0
for (const [treeId, rows] of Object.entries(measured)) {
  if (treeId.startsWith('_')) continue
  const treeSkills = byTree[treeId]
  if (!treeSkills) throw new Error(`No skills for measured tree "${treeId}"`)
  const tiers = [...new Set(treeSkills.map((s) => s.tier))].sort((a, b) => a - b)
  if (tiers.length !== rows.length)
    throw new Error(`${treeId}: ${tiers.length} tiers in data vs ${rows.length} measured rows`)
  tiers.forEach((tier, i) => {
    const nodes = treeSkills.filter((s) => s.tier === tier).sort((a, b) => a.position - b.position)
    const cols = rows[i]
    if (nodes.length !== cols.length)
      throw new Error(`${treeId} t${tier}: ${nodes.length} skills vs ${cols.length} measured`)
    nodes.forEach((n, j) => {
      if (n.position !== cols[j]) {
        n.position = cols[j]
        changed++
      }
    })
  })
}

writeFileSync(skillsPath, JSON.stringify(skills, null, 2) + '\n')
console.log(`applied wiki positions: ${changed} skills moved`)
