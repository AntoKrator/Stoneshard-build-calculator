/**
 * Pure transform: parsed wiki datastring rows → normalized {@link Item}[].
 *
 * No network, no filesystem — the orchestrator (`scripts/transform-items.ts`)
 * owns reading the checksum-verified vendored snapshot and writing
 * `src/data/items.json`. This keeps the column→field mapping unit-testable.
 *
 * Each source column is one of three kinds:
 *  - **identity** → a typed field (tier, type, rarity, material, and the slot /
 *    category derived from the weapon Type or armor Slot);
 *  - **non-stat** → carried verbatim in `properties` (economy, text, crafting
 *    fragments, wiki-only columns);
 *  - **stat** → a numeric `stats` entry keyed by the snake_case column label.
 * A new patch column falls through to stat-or-property, so the data widens
 * without code changes (KTD4); only a misaligned row count fails the parse (U2).
 */
import type { Item, ItemCategory, EquipmentSlot } from '../types'
import type { ParsedDatastring } from '../data/wiki-datastring'
import type { WikiPage } from '../data/wiki-pages'
import { coerce, sortKeys } from './normalize'

export interface ItemWarning {
  category: string
  message: string
}

export interface ItemTransformReport {
  counts: {
    items: number
    weapons: number
    armor: number
    accessories: number
    skipped: number
  }
  notes: string[]
  warnings: ItemWarning[]
}

export interface ItemTransformInput {
  pages: { page: WikiPage; parsed: ParsedDatastring }[]
  /** Recognized damage-type vocabulary (constants.damageTypes) for the weapon
   *  damageType foreign-key check. */
  damageTypes: string[]
}

/** Columns mapped to typed identity fields, handled before the stat/property split. */
const IDENTITY = new Set(['Tier', 'Type', 'Slot', 'Rarity', 'Material'])

/** Columns carried verbatim in `properties` — never character stats. */
const NON_STAT = new Set([
  'ID',
  'Armor Class',
  'Durability',
  'Markup',
  'Price',
  'Range',
  'Tags',
  'Obtainability',
  'Description',
  'Total damage (of all types)',
  'Balance (???)',
  'IsOpen',
  'NoDrop',
  'fragment_cloth01',
  'fragment_cloth02',
  'fragment_cloth03',
  'fragment_cloth04',
  'fragment_leather01',
  'fragment_leather02',
  'fragment_leather03',
  'fragment_leather04',
  'fragment_metal01',
  'fragment_metal02',
  'fragment_metal03',
  'fragment_metal04',
  'fragment_gold',
  'Alternative images (for wiki)',
  'Alternative images (for wiki) (2)',
  'Alternative images (for wiki) (3)',
  'Alternative name (for wiki)',
])

/** Armor `Slot` label → (category, EquipmentSlot). */
const ARMOR_SLOT: Record<string, { category: ItemCategory; slot: EquipmentSlot }> = {
  Shield: { category: 'armor', slot: 'off_hand' },
  Headgear: { category: 'armor', slot: 'head' },
  Chestpiece: { category: 'armor', slot: 'body' },
  Gloves: { category: 'armor', slot: 'gloves' },
  Boots: { category: 'armor', slot: 'boots' },
  Cloak: { category: 'armor', slot: 'cloak' },
  Belt: { category: 'accessory', slot: 'belt' },
  Ring: { category: 'accessory', slot: 'ring' },
  Amulet: { category: 'accessory', slot: 'amulet' },
}

/** A column is a character stat iff it is neither identity nor an explicit non-stat. */
function isStatColumn(label: string): boolean {
  return !IDENTITY.has(label) && !NON_STAT.has(label)
}

/** `Crit Chance` → `crit_chance`, `fragment_gold` → `fragment_gold`. */
export function snake(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

/** `Arna's Sword` → `arnas-sword`. Stable, unique key (names are unique per page).
 *  Apostrophes are dropped (not split on) so `King's` → `kings`, not `king-s`. */
export function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Per-type damage columns (`<Type> Damage`), detected structurally from the
 *  header — not from the vocabulary — so a new/foreign damage type still surfaces
 *  (and is then checked against constants.damageTypes). `Armor`/`Bodypart Damage`
 *  are weapon stats, not damage types. */
function damageColumns(header: string[]): { label: string; type: string }[] {
  const excluded = new Set(['Armor Damage', 'Bodypart Damage'])
  return header
    .filter((h) => h.endsWith(' Damage') && !excluded.has(h))
    .map((h) => ({ label: h, type: h.replace(/ Damage$/, '').toLowerCase() }))
}

export function transformItems(input: ItemTransformInput): {
  items: Item[]
  itemStatKeys: string[]
  report: ItemTransformReport
} {
  const { pages, damageTypes } = input
  const notes: string[] = []
  const warnings: ItemWarning[] = []
  const items: Item[] = []
  const statKeys = new Set<string>()
  let weapons = 0
  let armor = 0
  let accessories = 0
  let skipped = 0

  for (const { page, parsed } of pages) {
    // The stat vocabulary is every stat-kind column on the page, whether or not
    // any row fills it — so an item stat outside the set is genuinely unknown.
    for (const label of parsed.header) if (isStatColumn(label)) statKeys.add(snake(label))
    const dmgCols = damageColumns(parsed.header)

    for (const row of parsed.rows) {
      const f = row.fields
      const name = row.name

      // Resolve category + slot.
      let category: ItemCategory
      let slot: EquipmentSlot
      let type: string | undefined
      if (page.defaultCategory === 'weapon') {
        category = 'weapon'
        slot = 'main_hand'
        type = f.Type || undefined
      } else {
        const mapped = ARMOR_SLOT[f.Slot]
        if (!mapped) {
          warnings.push({
            category: 'item-unknown-slot',
            message: `Item "${name}" has unrecognized slot "${f.Slot}" — skipped`,
          })
          skipped++
          continue
        }
        category = mapped.category
        slot = mapped.slot
        type = f.Slot
      }

      // Build stats + properties from the remaining columns.
      const stats: Record<string, number> = {}
      const properties: Record<string, string | number | boolean> = {}
      for (const [label, raw] of Object.entries(f)) {
        if (IDENTITY.has(label)) continue
        const value = coerce(raw)
        if (value === undefined) continue
        if (NON_STAT.has(label)) {
          properties[snake(label)] = value
        } else if (typeof value === 'number') {
          stats[snake(label)] = value
        } else {
          // A stat-kind column carrying non-numeric text: keep it (don't lose data)
          // but flag it, since it signals a misclassified or drifted column.
          properties[snake(label)] = value
          warnings.push({
            category: 'item-nonnumeric-stat',
            message: `Item "${name}" stat column "${label}" is non-numeric ("${raw}") — kept in properties`,
          })
        }
      }

      // Weapons: the primary damage type is the highest of the per-type damage
      // columns. A weapon with no damage at all is not modeled gear (e.g.
      // Shackles) — skip it with a note rather than emit a damage-less weapon.
      let damageType: string | undefined
      if (category === 'weapon') {
        let best = 0
        for (const { label, type: t } of dmgCols) {
          const v = coerce(f[label] ?? '')
          if (typeof v === 'number' && v > best) {
            best = v
            damageType = t
          }
        }
        if (!damageType) {
          notes.push(`Skipped non-damage weapon "${name}" (${f.ID || 'no id'})`)
          skipped++
          continue
        }
        if (!damageTypes.includes(damageType)) {
          warnings.push({
            category: 'item-unknown-damage-type',
            message: `Weapon "${name}" primary damage type "${damageType}" is not in constants.damageTypes`,
          })
        }
      }

      const item: Item = {
        key: slug(name),
        name: { english: name },
        category,
        slot,
        ...(type ? { type } : {}),
        ...(f.Tier && /^-?\d+$/.test(f.Tier) ? { tier: Number(f.Tier) } : {}),
        ...(f.Rarity ? { rarity: f.Rarity } : {}),
        ...(f.Material ? { material: f.Material } : {}),
        ...(damageType ? { damageType } : {}),
        stats: sortKeys(stats),
        properties: sortKeys(properties),
      }
      items.push(item)
      if (category === 'weapon') weapons++
      else if (category === 'armor') armor++
      else accessories++
    }
  }

  // Deterministic output: sort by key.
  items.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))

  return {
    items,
    itemStatKeys: [...statKeys].sort(),
    report: {
      counts: { items: items.length, weapons, armor, accessories, skipped },
      notes,
      warnings,
    },
  }
}
