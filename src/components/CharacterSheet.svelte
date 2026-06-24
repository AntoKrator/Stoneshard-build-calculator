<script lang="ts">
  // The live derived-stat sheet. Enumerated attribute-driven stats now also carry
  // any equipped-gear contribution (recompute merges gear into character.derived,
  // M3 U3), so a stat gear supplies shows its combined value. Gear stats with no
  // formula identifier (per-type resistances, raw weapon damage, …) are surfaced
  // separately from character.gearStats. Skill passives still arrive later.
  import type { Character } from '../lib/build/character'
  import type { StatModel } from '../lib/types'

  let { character, statModel }: { character: Character; statModel: StatModel } = $props()

  const CATEGORY_ORDER = ['offense', 'defense', 'survival', 'resistances', 'magic', 'utility']
  const CATEGORY_LABELS: Record<string, string> = {
    offense: 'Offense',
    defense: 'Defense',
    survival: 'Survival',
    resistances: 'Resistances',
    magic: 'Magic',
    utility: 'Utility',
  }

  type Row = { name: string; value: number; unit?: string }
  const groups = $derived.by(() => {
    const byCat: Record<string, Row[]> = {}
    for (const def of statModel.derivedStats) {
      const value = character.derived[def.key] ?? def.base
      ;(byCat[def.category] ??= []).push({ name: def.name, value, unit: def.unit })
    }
    return CATEGORY_ORDER.filter((c) => byCat[c]).map((c) => [c, byCat[c]] as const)
  })

  function fmt(v: number, unit: string | undefined): string {
    const n = Number.isInteger(v) ? v : Number(v.toFixed(1))
    return unit === '%' ? `${n}%` : `${n}`
  }

  function humanize(key: string): string {
    return key
      .split('_')
      .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
      .join(' ')
  }

  // Gear stats without a formula identifier, split resistances vs. the rest, each
  // sorted by name. Rendered only when something is equipped that carries them.
  const gearGroups = $derived.by(() => {
    const res: Row[] = []
    const other: Row[] = []
    for (const [key, value] of Object.entries(character.gearStats)) {
      ;(key.endsWith('_resistance') ? res : other).push({ name: humanize(key), value })
    }
    const sort = (rows: Row[]) => rows.sort((a, b) => a.name.localeCompare(b.name))
    return [['Resistances', sort(res)] as const, ['Other Gear', sort(other)] as const].filter(
      ([, rows]) => rows.length > 0,
    )
  })
</script>

<section class="panel">
  <h2>Character Sheet</h2>
  <p class="note">Attribute- and gear-driven stats. Skill passives arrive later.</p>

  <div class="groups">
    {#each groups as [category, stats] (category)}
      <div class="group">
        <h3>{CATEGORY_LABELS[category] ?? category}</h3>
        <dl>
          {#each stats as s (s.name)}
            <div class="stat">
              <dt>{s.name}</dt>
              <dd>{fmt(s.value, s.unit)}</dd>
            </div>
          {/each}
        </dl>
      </div>
    {/each}
  </div>

  {#if gearGroups.length > 0}
    <h3 class="gear-head">From Gear</h3>
    <div class="groups">
      {#each gearGroups as [label, stats] (label)}
        <div class="group">
          <h3>{label}</h3>
          <dl>
            {#each stats as s (s.name)}
              <div class="stat">
                <dt>{s.name}</dt>
                <dd>{fmt(s.value, undefined)}</dd>
              </div>
            {/each}
          </dl>
        </div>
      {/each}
    </div>
  {/if}
</section>

<style>
  .panel {
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 1rem;
  }
  .note {
    color: var(--text-dim);
    font-size: 0.8rem;
    margin-top: -0.2rem;
  }
  .groups {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 0.75rem 1.25rem;
  }
  .gear-head {
    margin-top: 0.85rem;
    margin-bottom: 0.5rem;
    padding-top: 0.6rem;
    border-top: 1px solid var(--border);
    border-bottom: none;
  }
  h3 {
    font-size: 0.85rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--accent);
    border-bottom: 1px solid var(--border);
    padding-bottom: 0.2rem;
    margin-bottom: 0.35rem;
  }
  dl {
    margin: 0;
  }
  .stat {
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
    font-size: 0.85rem;
    padding: 0.1rem 0;
  }
  .stat dt {
    color: var(--text-dim);
  }
  .stat dd {
    margin: 0;
    font-variant-numeric: tabular-nums;
    font-weight: 600;
  }
</style>
