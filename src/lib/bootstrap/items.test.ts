import { describe, it, expect } from 'vitest'
import { transformItems, slug, snake } from './items'
import { Item } from '../types'
import type { ParsedDatastring } from '../data/wiki-datastring'
import type { WikiPage } from '../data/wiki-pages'

const WEAPON_PAGE: WikiPage = {
  title: 'Weapon data',
  file: 'weapon-data.wikitext',
  leadingColumns: [],
  defaultCategory: 'weapon',
}
const ARMOR_PAGE: WikiPage = {
  title: 'Armor data',
  file: 'armor-data.wikitext',
  leadingColumns: ['Tier'],
  defaultCategory: null,
}

function row(header: string[], name: string, values: string[]): ParsedDatastring['rows'][number] {
  const fields: Record<string, string> = {}
  header.forEach((h, i) => (fields[h] = values[i] ?? ''))
  return { name, fields }
}

const WEAPON_HEADER = [
  'Tier',
  'ID',
  'Type',
  'Rarity',
  'Material',
  'Slashing Damage',
  'Piercing Damage',
  'Crushing Damage',
  'Crit Chance',
  'Price',
  'Description',
]
const ARMOR_HEADER = [
  'Tier',
  'ID',
  'Slot',
  'Armor Class',
  'Rarity',
  'Material',
  'Block Chance',
  'Fire Resistance',
  'Description',
]

const DAMAGE_TYPES = ['slashing', 'piercing', 'crushing', 'fire']

function transform(extraDamageTypes = DAMAGE_TYPES) {
  const weapon: ParsedDatastring = {
    header: WEAPON_HEADER,
    rows: [
      // Sword: slashing 17 + a piercing splash → primary is slashing.
      row(WEAPON_HEADER, 'Footman Sword', [
        '3',
        'sword03',
        'Sword',
        'Common',
        'metal',
        '17',
        '5',
        '',
        '8',
        '1250',
        'For a fight in formation.',
      ]),
      // Broom: empty Type, crushing only.
      row(WEAPON_HEADER, 'Broom', ['1', 'broom', '', 'Common', 'wood', '', '', '6', '', '10', '']),
      // Shackles: no damage at all → skipped.
      row(WEAPON_HEADER, 'Shackles', [
        '1',
        'shackles',
        '',
        'Common',
        'metal',
        '',
        '',
        '',
        '',
        '5',
        '',
      ]),
    ],
  }
  const armor: ParsedDatastring = {
    header: ARMOR_HEADER,
    rows: [
      row(ARMOR_HEADER, 'Board Shield', [
        '1',
        'shield01',
        'Shield',
        'Light',
        'Common',
        'wood',
        '10',
        '',
        'A shield.',
      ]),
      row(ARMOR_HEADER, 'Iron Ring', [
        '2',
        'ring05',
        'Ring',
        '',
        'Common',
        'metal',
        '',
        '5',
        'A ring.',
      ]),
    ],
  }
  return transformItems({
    pages: [
      { page: WEAPON_PAGE, parsed: weapon },
      { page: ARMOR_PAGE, parsed: armor },
    ],
    damageTypes: extraDamageTypes,
  })
}

describe('transformItems', () => {
  it('normalizes a weapon row: category, slot, primary damage type, stats (R3)', () => {
    const { items } = transform()
    const sword = items.find((i) => i.key === 'footman-sword')!
    expect(sword.category).toBe('weapon')
    expect(sword.slot).toBe('main_hand')
    expect(sword.type).toBe('Sword')
    expect(sword.tier).toBe(3)
    expect(sword.material).toBe('metal')
    expect(sword.damageType).toBe('slashing') // highest of the per-type columns
    expect(sword.stats.slashing_damage).toBe(17)
    expect(sword.stats.piercing_damage).toBe(5)
    expect(sword.stats.crit_chance).toBe(8)
    // Economy/text columns are carried verbatim, not as stats.
    expect(sword.properties.price).toBe(1250)
    expect(sword.properties.id).toBe('sword03')
    expect(sword.stats.price).toBeUndefined()
    // Every produced item satisfies the schema.
    expect(() => Item.parse(sword)).not.toThrow()
  })

  it('categorizes armor and accessories from the Slot column', () => {
    const { items, report } = transform()
    const shield = items.find((i) => i.key === 'board-shield')!
    expect(shield.category).toBe('armor')
    expect(shield.slot).toBe('off_hand')
    expect(shield.type).toBe('Shield')
    expect(shield.stats.block_chance).toBe(10)

    const ring = items.find((i) => i.key === 'iron-ring')!
    expect(ring.category).toBe('accessory')
    expect(ring.slot).toBe('ring')
    expect(ring.stats.fire_resistance).toBe(5)

    expect(report.counts).toMatchObject({ weapons: 2, armor: 1, accessories: 1 })
  })

  it('skips a non-damage weapon with a note rather than emitting it', () => {
    const { items, report } = transform()
    expect(items.find((i) => i.key === 'shackles')).toBeUndefined()
    expect(report.counts.skipped).toBe(1)
    expect(report.notes.some((n) => n.includes('Shackles'))).toBe(true)
  })

  it('derives the item-stat vocabulary from the headers (not just used keys)', () => {
    const { itemStatKeys } = transform()
    // Present as columns even where no sampled row fills them.
    expect(itemStatKeys).toContain('slashing_damage')
    expect(itemStatKeys).toContain('block_chance')
    expect(itemStatKeys).toContain('fire_resistance')
    // Identity / non-stat columns never enter the vocabulary.
    expect(itemStatKeys).not.toContain('price')
    expect(itemStatKeys).not.toContain('description')
    expect(itemStatKeys).not.toContain('material')
    // Sorted + de-duped.
    expect(itemStatKeys).toEqual([...itemStatKeys].sort())
  })

  it('warns when a weapon primary damage type is outside the vocabulary (FK check)', () => {
    // A weapon whose damage column has no matching constants.damageTypes entry:
    // the column is detected structurally, so the unresolved type is flagged.
    const header = ['Tier', 'ID', 'Type', 'Rarity', 'Material', 'Void Damage', 'Description']
    const parsed: ParsedDatastring = {
      header,
      rows: [
        row(header, 'Cursed Blade', ['5', 'sword99', 'Sword', 'Unique', 'metal', '12', 'Eerie.']),
      ],
    }
    const { items, report } = transformItems({
      pages: [{ page: WEAPON_PAGE, parsed }],
      damageTypes: ['slashing', 'piercing', 'crushing'], // no 'void'
    })
    expect(items[0].damageType).toBe('void')
    expect(report.warnings.some((w) => w.category === 'item-unknown-damage-type')).toBe(true)
  })

  it('emits items sorted by key for deterministic output', () => {
    const keys = transform().items.map((i) => i.key)
    expect(keys).toEqual([...keys].sort())
  })

  it('sets item.icon only for keys with a vendored icon (M3 U6)', () => {
    const header = ['Tier', 'ID', 'Type', 'Rarity', 'Material', 'Crushing Damage', 'Description']
    const parsed: ParsedDatastring = {
      header,
      rows: [
        row(header, 'Footman Sword', [
          '3',
          'sword03',
          'Sword',
          'Common',
          'metal',
          '21',
          'A sword.',
        ]),
        row(header, 'Broom', ['1', 'broom', '', 'Common', 'wood', '6', 'A broom.']),
      ],
    }
    const { items } = transformItems({
      pages: [{ page: WEAPON_PAGE, parsed }],
      damageTypes: ['crushing'],
      iconKeys: new Set(['footman-sword']), // broom has no vendored art
    })
    expect(items.find((i) => i.key === 'footman-sword')?.icon).toBe('img/items/footman-sword.png')
    expect(items.find((i) => i.key === 'broom')?.icon).toBeUndefined()
  })

  it('keeps future numbered fragment/wiki-art columns out of stats (KTD4)', () => {
    // A patch that adds fragment_metal05 or a 4th alt-image column must not have
    // it misread as a character stat — the denylist matches these by pattern.
    const header = [
      'Tier',
      'ID',
      'Type',
      'Crushing Damage',
      'fragment_metal05',
      'Alternative images (for wiki) (4)',
      'Description',
    ]
    const parsed: ParsedDatastring = {
      header,
      rows: [row(header, 'Oddity', ['1', 'x01', 'Mace', '6', '3', 'foo.png', 'desc'])],
    }
    const { items, itemStatKeys } = transformItems({
      pages: [{ page: WEAPON_PAGE, parsed }],
      damageTypes: ['crushing'],
    })
    expect(items[0].stats.crushing_damage).toBe(6)
    expect(items[0].stats.fragment_metal05).toBeUndefined()
    expect(items[0].properties.fragment_metal05).toBe(3)
    expect(itemStatKeys).not.toContain('fragment_metal05')
    expect(itemStatKeys).not.toContain('alternative_images_for_wiki_4')
  })
})

describe('key + label helpers', () => {
  it('slug builds a stable kebab key from the name', () => {
    expect(slug("Arna's Sword")).toBe('arnas-sword')
    expect(slug('Visored Sallet (Open)')).toBe('visored-sallet-open')
  })
  it('snake builds a stat key from a column label', () => {
    expect(snake('Crit Chance')).toBe('crit_chance')
    expect(snake('Balance (???)')).toBe('balance')
  })
})
