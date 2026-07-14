import { describe, it, expect } from 'vitest'
import { transformEnemies, type EnemyTransformInput } from './enemies'
import type { ParsedDatastring } from '../data/wiki-datastring'

const HEADER = [
  'Tier',
  'ID',
  'Monster Type',
  'Faction',
  'Size',
  'Health',
  'Energy',
  'Protection (Head)',
  'Protection (Body)',
  'Protection (Hands)',
  'Protection (Legs)',
  'Accuracy',
  'Crushing Damage',
  'Fire Damage',
  'Physical Resistance',
  'Fire Resistance',
  'Amount of Heads',
  'Description',
]

function row(
  name: string,
  cells: Partial<Record<string, string>>,
): { name: string; fields: Record<string, string> } {
  const fields: Record<string, string> = {}
  for (const h of HEADER) fields[h] = cells[h] ?? ''
  return { name, fields }
}

const parsed: ParsedDatastring = {
  header: HEADER,
  rows: [
    row('Restless', {
      Tier: '1',
      ID: 'o_zombie',
      'Monster Type': 'Undead',
      Faction: 'undead',
      Size: 'medium',
      Health: '80',
      'Protection (Head)': '3',
      'Protection (Body)': '7',
      'Protection (Hands)': '2',
      'Protection (Legs)': '5',
      Accuracy: '66',
      'Crushing Damage': '6',
      'Physical Resistance': '50',
      'Fire Resistance': '-50',
      'Amount of Heads': '1',
      Description: 'Raised by novices.',
    }),
    // No Health → skipped.
    row('Ghost', { ID: 'o_ghost', 'Monster Type': 'Undead' }),
  ],
}

const base: EnemyTransformInput = { parsed, damageTypes: ['crushing', 'fire', 'physical'] }

describe('transformEnemies (M5 U3)', () => {
  it('transforms rows into Enemy records with snake_case stats', () => {
    const { enemies, report } = transformEnemies(base)
    expect(enemies).toHaveLength(1) // Ghost skipped (no Health)
    expect(report.counts.skipped).toBe(1)
    const restless = enemies[0]
    expect(restless.key).toBe('restless')
    expect(restless.hp).toBe(80)
    expect(restless.type).toBe('Undead')
    expect(restless.stats.accuracy).toBe(66)
    expect(restless.stats.crushing_damage).toBe(6)
    expect(restless.stats.physical_resistance).toBe(50)
    expect(restless.stats.fire_resistance).toBe(-50)
  })

  it('maps the four protection columns to the canonical slots (Body→chest, Hands→arms) — F2', () => {
    const { enemies } = transformEnemies(base)
    expect(enemies[0].protection).toEqual({ head: 3, chest: 7, arms: 2, legs: 5 })
  })

  it('keeps Amount-of-bodypart and identity columns out of stats', () => {
    const { enemies } = transformEnemies(base)
    expect(enemies[0].stats).not.toHaveProperty('amount_of_heads')
    expect(enemies[0].properties).toHaveProperty('amount_of_heads', 1)
    expect(enemies[0].stats).not.toHaveProperty('health')
    expect(enemies[0].properties).toHaveProperty('description', 'Raised by novices.')
  })

  it('reports family counts for the damage/resistance columns — F5', () => {
    const { report } = transformEnemies(base)
    expect(report.counts.damageKeys).toBe(2) // crushing_damage, fire_damage
    expect(report.counts.resistanceKeys).toBe(2) // physical_resistance, fire_resistance
  })

  it('skips a missing-Health row with a warning', () => {
    const { report } = transformEnemies(base)
    expect(report.warnings.some((w) => w.category === 'enemy-missing-hp')).toBe(true)
  })

  it('de-dupes an exact-duplicate row with a note', () => {
    const dup: ParsedDatastring = { header: HEADER, rows: [parsed.rows[0], parsed.rows[0]] }
    const { enemies, report } = transformEnemies({ ...base, parsed: dup })
    expect(enemies).toHaveLength(1)
    expect(report.notes.some((n) => /duplicate/i.test(n))).toBe(true)
  })

  it('populates abilities from the curated linkage map', () => {
    const { enemies } = transformEnemies({
      ...base,
      abilitiesByKey: { restless: ['lunge', 'wail'] },
    })
    expect(enemies[0].abilities).toEqual(['lunge', 'wail'])
  })

  it('produces deterministic key-sorted output', () => {
    const a = JSON.stringify(transformEnemies(base).enemies)
    const b = JSON.stringify(transformEnemies(base).enemies)
    expect(a).toBe(b)
  })
})
