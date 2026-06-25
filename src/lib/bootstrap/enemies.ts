/**
 * Pure transform: parsed wiki `Enemy data` rows → normalized {@link Enemy}[] (M5 U3).
 *
 * No network, no filesystem — the orchestrator (`scripts/transform-enemies.ts`)
 * owns reading the checksum-verified vendored snapshot and writing
 * `src/data/enemies.json`. Mirrors `items.ts`: each source column is identity
 * (typed field), non-stat (verbatim `properties`), or a numeric `stats` entry.
 *
 * Two deltas from the item transform:
 *  - the four `Protection (Head/Body/Hands/Legs)` columns fold into the typed
 *    `protection` object, mapped onto the combat slot vocabulary (Body→chest,
 *    Hands→arms) so one canonical slot set flows through `mitigate` (KTD2);
 *  - special-ability damage is not in this datastring — `abilities` is populated
 *    from a curated linkage map (U4), defaulting to `[]` here.
 */
import type { Enemy, BodypartProtection } from '../types'
import type { ParsedDatastring } from '../data/wiki-datastring'
import { coerce, sortKeys } from './normalize'
import { snake, slug } from './items'

export interface EnemyWarning {
  category: string
  message: string
}

export interface EnemyTransformReport {
  counts: { enemies: number; skipped: number; damageKeys: number; resistanceKeys: number }
  notes: string[]
  warnings: EnemyWarning[]
}

export interface EnemyTransformInput {
  parsed: ParsedDatastring
  /** Recognized damage-type vocabulary (constants.damageTypes) for the basic-attack
   *  / resistance foreign-key check. */
  damageTypes: string[]
  /** Curated enemy-key → ability-key linkage (U4). Absent in U3 → all `[]`. */
  abilitiesByKey?: Record<string, string[]>
  /** Enemy keys with a vendored portrait under public/img/enemies/ (U9). */
  iconKeys?: ReadonlySet<string>
}

/** Columns folded into typed identity fields, handled before the stat/property split. */
const IDENTITY = new Set([
  'Tier',
  'Monster Type',
  'Faction',
  'Size',
  'Health',
  'Energy',
  'Protection (Head)',
  'Protection (Body)',
  'Protection (Hands)',
  'Protection (Legs)',
])

/** The four protection columns → canonical combat slots (Body→chest, Hands→arms). */
const PROTECTION_COLUMN: Record<string, keyof BodypartProtection> = {
  'Protection (Head)': 'head',
  'Protection (Body)': 'chest',
  'Protection (Hands)': 'arms',
  'Protection (Legs)': 'legs',
}

/** Fixed-name columns carried verbatim in `properties` — never combat stats. */
const NON_STAT = new Set([
  'ID',
  'AI pattern',
  'Weapon',
  'Armor Class',
  'Body type (matter)',
  'XP',
  'Vision',
  'Morale',
  'Swimming Cost',
  'canBlock',
  'canDisarm',
  'canSwim',
  'IP (?)',
  'Threat Time (?)',
  'Avoiding Chance (?)',
  'Alternative name (for wiki)',
  'Description',
])

/** `Amount of Heads`, `Amount of Left Legs`, … are body-part counts (metadata),
 *  not combat stats — match the family by pattern so a future variant stays out. */
function isNonStat(label: string): boolean {
  return NON_STAT.has(label) || /^Amount of /i.test(label)
}

/** A column is a combat stat iff it is neither identity nor a non-stat column. */
function isStatColumn(label: string): boolean {
  return !IDENTITY.has(label) && !isNonStat(label)
}

export function transformEnemies(input: EnemyTransformInput): {
  enemies: Enemy[]
  enemyStatKeys: string[]
  report: EnemyTransformReport
} {
  const { parsed, damageTypes, abilitiesByKey, iconKeys } = input
  const notes: string[] = []
  const warnings: EnemyWarning[] = []
  const byKey = new Map<string, Enemy>()
  const statKeys = new Set<string>()
  let skipped = 0

  // The stat vocabulary is every stat-kind column on the page, whether or not any
  // row fills it — so an enemy stat outside the set is genuinely unknown.
  for (const label of parsed.header) if (isStatColumn(label)) statKeys.add(snake(label))

  const damageTypeSet = new Set(damageTypes)

  for (const row of parsed.rows) {
    const f = row.fields
    const name = row.name

    // Health is required (schema: hp positive). A row without it isn't modeled.
    const hpRaw = coerce(f['Health'] ?? '')
    if (typeof hpRaw !== 'number' || hpRaw <= 0) {
      warnings.push({
        category: 'enemy-missing-hp',
        message: `Enemy "${name}" has no positive Health ("${f['Health'] ?? ''}") — skipped`,
      })
      skipped++
      continue
    }

    // Four-slot protection (default 0 for an empty cell).
    const protection: BodypartProtection = { head: 0, chest: 0, arms: 0, legs: 0 }
    for (const [col, slotKey] of Object.entries(PROTECTION_COLUMN)) {
      const v = coerce(f[col] ?? '')
      protection[slotKey] = typeof v === 'number' ? v : 0
    }

    // Build stats + properties from the remaining columns.
    const stats: Record<string, number> = {}
    const properties: Record<string, string | number | boolean> = {}
    for (const [label, raw] of Object.entries(f)) {
      if (IDENTITY.has(label)) continue
      const value = coerce(raw)
      if (value === undefined) continue
      if (isNonStat(label)) {
        properties[snake(label)] = value
      } else if (typeof value === 'number') {
        stats[snake(label)] = value
      } else {
        // A stat-kind column carrying non-numeric text: keep it (don't lose data)
        // but flag it — signals a misclassified or drifted column.
        properties[snake(label)] = value
        warnings.push({
          category: 'enemy-nonnumeric-stat',
          message: `Enemy "${name}" stat column "${label}" is non-numeric ("${raw}") — kept in properties`,
        })
      }
    }

    // Sanity-check the per-type basic-attack damage keys against the vocabulary.
    for (const key of Object.keys(stats)) {
      const m = /^(.+)_damage$/.exec(key)
      if (m && !damageTypeSet.has(m[1]) && m[1] !== 'armor' && m[1] !== 'bodypart') {
        warnings.push({
          category: 'enemy-unknown-damage-type',
          message: `Enemy "${name}" damage stat "${key}" is not a known damage type`,
        })
      }
    }

    const key = slug(name)
    const enemy: Enemy = {
      key,
      name: { english: name },
      ...(f['Tier'] && /^\d+$/.test(f['Tier']) ? { tier: Number(f['Tier']) } : {}),
      ...(f['Monster Type'] ? { type: f['Monster Type'] } : {}),
      ...(f['Faction'] ? { faction: f['Faction'] } : {}),
      ...(f['Size'] ? { size: f['Size'] } : {}),
      hp: hpRaw,
      ...(typeof coerce(f['Energy'] ?? '') === 'number'
        ? { energy: coerce(f['Energy'] ?? '') as number }
        : {}),
      protection,
      stats: sortKeys(stats),
      abilities: abilitiesByKey?.[key] ?? [],
      properties: sortKeys(properties),
      ...(iconKeys?.has(key) ? { icon: `img/enemies/${key}.png` } : {}),
    }

    // The wiki occasionally lists a switch case twice (e.g. an exact-duplicate
    // Mallard). De-dupe by key: an identical row is skipped with a note; a real
    // collision (same name, different stats) is flagged and the first kept.
    const prior = byKey.get(key)
    if (prior) {
      if (JSON.stringify(prior) === JSON.stringify(enemy)) {
        notes.push(`Dropped exact-duplicate enemy row "${name}"`)
      } else {
        warnings.push({
          category: 'enemy-key-collision',
          message: `Two enemies slug to "${key}" with different stats ("${name}") — kept the first`,
        })
      }
      skipped++
      continue
    }
    byKey.set(key, enemy)
  }

  // Deterministic output: sort by key.
  const enemies = [...byKey.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))

  // A stat column zero/absent across the WHOLE bestiary is the offset class the
  // cell-count parser can't see (plan F3). Emit it as an allowlistable warning,
  // not a hard error — a few columns (rare stats) are legitimately empty, while a
  // NEW all-zero on a should-have-data column surfaces as an un-allowlisted warning.
  if (enemies.length > 5) {
    for (const key of statKeys) {
      if (!enemies.some((e) => (e.stats[key] ?? 0) !== 0)) {
        warnings.push({
          category: 'enemy-all-zero-stat-column',
          message: `Enemy stat "${key}" is zero/absent across the whole bestiary`,
        })
      }
    }
  }

  const damageKeys = [...statKeys].filter((k) => /_damage$/.test(k)).length
  const resistanceKeys = [...statKeys].filter((k) => /_resistance$/.test(k)).length

  return {
    enemies,
    enemyStatKeys: [...statKeys].sort(),
    report: {
      counts: { enemies: enemies.length, skipped, damageKeys, resistanceKeys },
      notes,
      warnings,
    },
  }
}
