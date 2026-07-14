/**
 * The vendored wiki Data pages and how to parse each.
 *
 * Shared by the dev-time fetch (`tools/wiki-extractor/fetch.ts`) and the transform
 * (`scripts/transform-items.ts`) so both agree on the source set, the vendored
 * filenames, and any header correction — a page added or renamed is changed once.
 */
import type { ItemCategory } from '../types'

export interface WikiPage {
  /** MediaWiki page title (for the `?action=raw` URL). */
  title: string
  /** Vendored filename under `vendor/stoneshard-wiki/`. */
  file: string
  /** Labels the page's named-header row omits, prepended on parse (KTD5). */
  leadingColumns: string[]
  /**
   * Coarse family for every row on this page. Armor and accessories share the
   * Armor data page, split by the per-row `Slot`; weapons are all from Weapon
   * data. `null` means "derive per row" (the Armor data case).
   */
  defaultCategory: ItemCategory | null
}

export const WIKI_PAGES: WikiPage[] = [
  {
    title: 'Weapon data',
    file: 'weapon-data.wikitext',
    leadingColumns: [],
    defaultCategory: 'weapon',
  },
  {
    title: 'Armor data',
    file: 'armor-data.wikitext',
    leadingColumns: ['Tier'],
    defaultCategory: null,
  },
]

/**
 * The Enemy data page (M5). Unlike the item pages it documents its columns as a
 * single named legend line inside `<noinclude>` (no numeric-index row), so the
 * parser is pointed at that line by its `headerLinePrefix`. ~101 columns, the
 * last of which is the free-text Description (safe `;`-overflow target).
 */
export const ENEMY_PAGE = {
  title: 'Enemy data',
  file: 'enemy-data.wikitext',
  headerLinePrefix: 'Tier;ID;',
} as const
