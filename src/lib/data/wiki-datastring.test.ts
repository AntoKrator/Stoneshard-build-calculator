import { describe, it, expect } from 'vitest'
import { parseDatastring, DatastringError } from './wiki-datastring'

// A fixture slice in the real Weapon data shape: a <noinclude> block with a
// numeric-index row + named header, then the <includeonly> {{#switch}} with item
// cases. Blank fields are consecutive `;`; Description is free text, last.
const WEAPON_FIXTURE = `<noinclude>Page for all Stoneshard weapon data.

This data is edited with the parser.

 0;1;2;3;4
 Tier;ID;Type;Crushing Damage;Description

==Usage==
</noinclude><includeonly>{{#switch: {{{1}}}
<!--

----- WEAPONS -----

-->

|Arna's Sword=2;sword01;Sword;;A faded inscription.

|Broom=1;broom;;6;Forged by a commoner with a dream.
|#default = Data does not exist.}}</includeonly><noinclude>[[Category:Data]]</noinclude>`

// Armor's page omits the leading Tier label (its numeric index starts at 1), so
// rows carry one more cell than the named header. The caller restores `Tier`.
const ARMOR_FIXTURE = `<noinclude>Page for all Stoneshard armor data.

 1;2;3
 ID;Slot;Material

</noinclude><includeonly>{{#switch: {{{1}}}
|Board Shield=1;shield01;Shield;wood
|#default = Data does not exist.}}</includeonly>`

describe('parseDatastring', () => {
  it('parses weapon rows keyed by header label', () => {
    const { header, rows } = parseDatastring(WEAPON_FIXTURE)
    expect(header).toEqual(['Tier', 'ID', 'Type', 'Crushing Damage', 'Description'])
    expect(rows).toHaveLength(2) // #default is skipped

    const sword = rows.find((r) => r.name === "Arna's Sword")!
    expect(sword.fields.ID).toBe('sword01')
    expect(sword.fields.Type).toBe('Sword')
    expect(sword.fields['Crushing Damage']).toBe('') // blank field preserved as empty
    expect(sword.fields.Description).toBe('A faded inscription.')

    const broom = rows.find((r) => r.name === 'Broom')!
    expect(broom.fields.Type).toBe('') // empty Type column
    expect(broom.fields['Crushing Damage']).toBe('6')
  })

  it('restores an omitted leading column via leadingColumns (armor Tier)', () => {
    const { header, rows } = parseDatastring(ARMOR_FIXTURE, { leadingColumns: ['Tier'] })
    expect(header).toEqual(['Tier', 'ID', 'Slot', 'Material'])
    const shield = rows[0]
    expect(shield.fields.Tier).toBe('1')
    expect(shield.fields.ID).toBe('shield01') // aligns only because Tier was restored
    expect(shield.fields.Slot).toBe('Shield')
    expect(shield.fields.Material).toBe('wood')
  })

  it('fails loudly when a cell is dropped (column drift that misaligns fields)', () => {
    // Header says 5 columns; this row carries only 4 (a value was dropped).
    const drift = WEAPON_FIXTURE.replace(
      '|Broom=1;broom;;6;Forged by a commoner with a dream.',
      '|Broom=1;broom;;6',
    )
    expect(() => parseDatastring(drift)).toThrow(DatastringError)
    expect(() => parseDatastring(drift)).toThrow(/dropped cell/)
  })

  it('absorbs a semicolon in the free-text Description without misaligning fields', () => {
    // The last column is free text; an extra `;` in prose must not abort the parse.
    const prose = WEAPON_FIXTURE.replace(
      '|Broom=1;broom;;6;Forged by a commoner with a dream.',
      '|Broom=1;broom;;6;Light, yet sturdy; a commoner can dream.',
    )
    const { rows } = parseDatastring(prose)
    const broom = rows.find((r) => r.name === 'Broom')!
    expect(broom.fields['Crushing Damage']).toBe('6') // structured columns stay aligned
    expect(broom.fields.Description).toBe('Light, yet sturdy; a commoner can dream.')
  })

  it('tolerates a trailing semicolon without inventing a phantom column', () => {
    const trailing = ARMOR_FIXTURE.replace(
      '|Board Shield=1;shield01;Shield;wood',
      '|Board Shield=1;shield01;Shield;wood;',
    )
    const { rows } = parseDatastring(trailing, { leadingColumns: ['Tier'] })
    expect(rows[0].fields.Material).toBe('wood')
    expect(Object.keys(rows[0].fields)).toHaveLength(4)
  })

  it('de-duplicates repeated header labels so no column is collapsed', () => {
    const dupes = `<noinclude>
 0;1;2
 ID;Note;Note
</noinclude><includeonly>{{#switch: {{{1}}}
|Thing=t01;first;second
|#default = none}}</includeonly>`
    const { header, rows } = parseDatastring(dupes)
    expect(header).toEqual(['ID', 'Note', 'Note (2)'])
    expect(rows[0].fields['Note']).toBe('first')
    expect(rows[0].fields['Note (2)']).toBe('second')
  })

  it('throws when no numeric-index/header row is present', () => {
    expect(() => parseDatastring('<includeonly>{{#switch: {{{1}}}\n|X=1}}</includeonly>')).toThrow(
      /No numeric-index/,
    )
  })

  it('throws when the switch block has no item rows', () => {
    const empty = `<noinclude>\n 0;1\n A;B\n</noinclude><includeonly>{{#switch: {{{1}}}\n|#default = none}}</includeonly>`
    expect(() => parseDatastring(empty)).toThrow(/item rows/)
  })
})
