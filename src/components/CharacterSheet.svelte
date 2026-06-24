<script lang="ts">
  // The live partial derived-stat sheet. Values come straight from the tested
  // computeDerivedStats output on the character; this component only groups and
  // formats them. Only attribute-driven stats appear in Phase 1 (KTD9/KTD14);
  // gear/passive contributions arrive in later phases.
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
</script>

<section class="panel">
  <h2>Character Sheet</h2>
  <p class="note">Attribute-driven stats. Gear, enchantments and skill passives arrive later.</p>

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
</section>

<style>
  /* Frame comes from the shared global .panel treatment (U2). */
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
  h3 {
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--accent);
    border-bottom: 1px solid var(--border);
    padding-bottom: 0.25rem;
    margin-bottom: 0.4rem;
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
