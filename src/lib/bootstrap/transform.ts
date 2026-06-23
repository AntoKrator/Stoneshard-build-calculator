/**
 * Pure transform: nstratos source (tooltips JSON + skill-keys + parsed topology)
 * -> our normalized {@link Dataset} shape, plus a warning report.
 *
 * No network, no filesystem — the orchestrator (`scripts/bootstrap-from-nstratos.ts`)
 * owns reading the vendored sources and writing `src/data/`. This keeps the hard
 * logic (joining, normalizing, topology) unit-testable.
 *
 * Fail-closed: structural problems that would silently corrupt the dataset
 * (parent/child edge drift, a skill key with no tooltip or no topology node)
 * throw. Soft gaps accumulate into the report for the `validate-data` gate.
 */
import { computeTierPosition, checkEdges, type TopoNode } from './topology'

interface RawSkill {
  key: string
  name: { english: string }
  tooltip?: { english: string }
  formulas?: Record<string, string>
  is_passive?: boolean
  attributes?: Record<string, string>
}
export type RawTooltips = Record<string, RawSkill[]>
export type SkillKeys = Record<string, string[]>

export interface BootstrapReport {
  source: string
  counts: { trees: number; skills: number; warnings: number }
  /** Informational, non-blocking resolutions. */
  notes: string[]
  /** Blocking unless individually allowlisted by the validate-data gate. */
  warnings: { category: string; message: string }[]
}

export interface TransformInput {
  tooltips: RawTooltips
  skillKeys: SkillKeys
  nodes: TopoNode[]
  source: string
  gameVersion: string
}

/** `AGL`/`PRC` are nstratos's codes for our canonical `AGI`/`PER`. */
const STAT_ALIASES: Record<string, string> = { AGL: 'AGI', PRC: 'PER' }
const ATTRIBUTES = ['STR', 'AGI', 'PER', 'VIT', 'WIL'] as const
const META_TO_CATEGORY: Record<string, string> = {
  weapon: 'weaponry',
  utility: 'utility',
  sorcery: 'sorcery',
}
/** Non-attribute identifiers a formula may legitimately reference. */
const KNOWN_IDENTIFIERS = new Set([
  // derived stats
  'Arcanistic_Power',
  'Block_Chance',
  'Block_PowerMax',
  'Body_DEF',
  'EVS',
  'Electromantic_Power',
  'Geomantic_Power',
  'HP',
  'Knockback_Chance',
  'Legs_DEF',
  'Magic_Power',
  'Mainhand_Efficiency',
  'Miracle_Chance',
  'Miracle_Power',
  'Miscast_Chance',
  'Offhand_Efficiency',
  'Pyromantic_Power',
  'Retaliation',
  'Shield_Block_Chance',
  'Spell_Hit_Chance',
  'Vitality',
  'max_hp',
  'max_mp',
  'open_weapon_one_hand_skills',
  'open_weapon_skills',
  'ranged_skill_learned',
  // functions
  'math_round',
  'max',
  'min',
  'floor',
  'ceil',
  'round',
  'abs',
])

/** Replace whole-token stat aliases (never a substring like `PRC_bonus`). */
function normalizeFormula(expr: string): string {
  return expr.replace(/[A-Za-z_][A-Za-z0-9_]*/g, (tok) => STAT_ALIASES[tok] ?? tok)
}

/** Identifiers in a normalized formula that are neither attribute nor known. */
function unknownTokens(expr: string): string[] {
  const out: string[] = []
  for (const tok of expr.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []) {
    if ((ATTRIBUTES as readonly string[]).includes(tok)) continue
    if (KNOWN_IDENTIFIERS.has(tok)) continue
    out.push(tok)
  }
  return out
}

/** Coerce a stringly attribute-bag value; '' -> drop, numeric -> number. */
function coerce(v: string): string | number | undefined {
  if (v === '') return undefined
  return /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v
}

function sortKeys<T>(obj: Record<string, T>): Record<string, T> {
  const out: Record<string, T> = {}
  for (const k of Object.keys(obj).sort()) out[k] = obj[k]
  return out
}

function humanize(id: string): string {
  return id
    .split(/[_-]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

export function transform(input: TransformInput): { dataset: unknown; report: BootstrapReport } {
  const { tooltips, skillKeys, nodes, source, gameVersion } = input
  const notes: string[] = []
  const warnings: { category: string; message: string }[] = []

  // Topology cross-check: a dangling parent reference is fatal (it would drop a
  // real prerequisite); missing-mirror asymmetries are non-fatal because parents
  // is authoritative for requires.
  const edges = checkEdges(nodes)
  if (edges.hard.length) {
    throw new Error(`Topology has dangling parent references:\n  ${edges.hard.join('\n  ')}`)
  }
  if (edges.soft.length) {
    notes.push(`${edges.soft.length} non-fatal edge asymmetry(ies) (parents is authoritative)`)
  }
  const tierPos = computeTierPosition(nodes)

  // Index tooltips by key (with its category), and resolve a key for every node
  // — falling back to label match for the handful of key-less elements.
  const tooltipByKey = new Map<string, { entry: RawSkill; category: string }>()
  for (const [category, arr] of Object.entries(tooltips)) {
    for (const entry of arr) tooltipByKey.set(entry.key, { entry, category })
  }
  const nameToKey = new Map<string, string>() // `${category}::${name}` -> key
  for (const [category, arr] of Object.entries(tooltips)) {
    for (const entry of arr) nameToKey.set(`${category}::${entry.name.english}`, entry.key)
  }
  const nodeByKey = new Map<string, TopoNode>()
  for (const node of nodes) {
    let key = node.key
    if (!key) {
      key = nameToKey.get(`${node.tree}::${node.label}`) ?? null
      if (key) {
        notes.push(`Key-less node "${node.id}" resolved to "${key}" by label "${node.label}"`)
      } else {
        throw new Error(`Topology node "${node.id}" has no key and no label match`)
      }
    }
    nodeByKey.set(key, node)
  }

  // Build skills + trees from the skill-keys membership map.
  const trees: unknown[] = []
  const skills: unknown[] = []
  for (const treeId of Object.keys(skillKeys).sort()) {
    const memberKeys = skillKeys[treeId]
    let metaCategory = ''
    for (const key of memberKeys) {
      const tt = tooltipByKey.get(key)
      if (!tt) throw new Error(`Skill "${key}" (tree "${treeId}") has no tooltip entry`)
      const node = nodeByKey.get(key)
      if (!node) throw new Error(`Skill "${key}" (tree "${treeId}") has no topology node`)
      metaCategory = metaCategory || (tt.entry.attributes?.meta_category ?? '')

      const tp = tierPos.get(node.id) ?? { tier: 1, position: 0 }
      const formulas = sortKeys(
        Object.fromEntries(
          Object.entries(tt.entry.formulas ?? {}).map(([n, f]) => {
            const norm = normalizeFormula(f)
            for (const u of unknownTokens(norm)) {
              warnings.push({
                category: 'unknown-formula-token',
                message: `Skill "${key}" formula "${n}" references unknown token "${u}"`,
              })
            }
            return [n, norm]
          }),
        ),
      )

      // Coerce the attribute bag: energy/cooldown -> typed fields, rest -> properties.
      const bag = tt.entry.attributes ?? {}
      const properties: Record<string, string | number | boolean> = {}
      for (const [k, v] of Object.entries(bag)) {
        if (k === 'energy' || k === 'cooldown') continue
        const c = coerce(v)
        if (c !== undefined) properties[k] = c
      }
      const energy = coerce(bag.energy ?? '')
      const cooldown = coerce(bag.cooldown ?? '')

      // requires: parent node ids -> skill keys.
      const requires = node.parents
        .map((pid) => nodes.find((n) => n.id === pid))
        .map((p) => (p ? (p.key ?? nameToKey.get(`${p.tree}::${p.label}`)) : undefined))
        .filter((k): k is string => Boolean(k))

      if (!node.icon) {
        warnings.push({ category: 'unmapped-icon', message: `Skill "${key}" has no icon` })
      }

      const skill: Record<string, unknown> = {
        key,
        treeId,
        name: { english: tt.entry.name.english },
        tier: tp.tier,
        position: tp.position,
        isPassive: tt.entry.is_passive ?? false,
        requires,
        formulas,
        properties: sortKeys(properties),
      }
      if (tt.entry.tooltip) skill.tooltip = { english: tt.entry.tooltip.english }
      if (typeof energy === 'number') skill.energy = energy
      if (typeof cooldown === 'number') skill.cooldown = cooldown
      if (node.icon) skill.icon = node.icon
      if (node.unlock) skill.unlock = node.unlock
      skills.push(skill)
    }

    trees.push({
      id: treeId,
      name: humanize(treeId),
      category: META_TO_CATEGORY[metaCategory] ?? 'utility',
      skills: [...memberKeys],
    })
  }

  notes.push('Constants are placeholders (point economy is sourced in a later phase, not nstratos)')

  const dataset = {
    meta: { gameVersion, source },
    attributes: [
      { key: 'STR', name: 'Strength' },
      { key: 'AGI', name: 'Agility' },
      { key: 'PER', name: 'Perception' },
      { key: 'VIT', name: 'Vitality' },
      { key: 'WIL', name: 'Willpower' },
    ],
    trees,
    skills,
    statFormulas: [],
    constants: {
      startingLevel: 1,
      startingAttributePoints: 0,
      attributePointsPerLevel: 0,
      skillPointsPerLevel: 0,
      damageTypes: [],
      values: {},
    },
    items: [],
    enchantments: [],
  }

  const report: BootstrapReport = {
    source,
    counts: { trees: trees.length, skills: skills.length, warnings: warnings.length },
    notes,
    warnings,
  }
  return { dataset, report }
}
