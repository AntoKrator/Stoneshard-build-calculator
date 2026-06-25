<script lang="ts">
  // The derived combat view (M4): self damage output ("deal") and mitigation
  // ("take"). Pure presentation of character.combat — all math lives in the tested
  // combat.ts module. Two sides: a per-type Damage table (base → modified →
  // expected-with-crit) and a Defense block (per-bodypart Protection + per-type
  // Resistance / effective-HP). No enemy yet, so "expected" is conditional on the
  // hit landing and Protection is shown beside resistance-based effective-HP rather
  // than folded into one number (M5 owns enemy-vs-build resolution).
  import type { Character } from '../lib/build/character'

  let { character }: { character: Character } = $props()
  const combat = $derived(character.combat)

  const POOLS = [
    ['head', 'Head'],
    ['chest', 'Chest'],
    ['arms', 'Arms'],
    ['legs', 'Legs'],
  ] as const

  // Only surface resistances the build actually has — 13 zero rows are noise.
  const resisted = $derived(combat.defense.filter((d) => d.resistance > 0))

  function num(v: number): string {
    return Number.isInteger(v) ? `${v}` : `${Number(v.toFixed(1))}`
  }
  function cap(s: string): string {
    return s ? s[0].toUpperCase() + s.slice(1) : s
  }
</script>

<section class="panel">
  <h2>Combat</h2>

  <h3>Damage <span class="dim">per hit</span></h3>
  {#if combat.hasWeapon && combat.damage.length > 0}
    <div class="dmg">
      <div class="dmg-row head">
        <span class="label">Type</span>
        <span>Base</span>
        <span>Modified</span>
        <span>Expected</span>
      </div>
      {#each combat.damage as d (d.type)}
        <div class="dmg-row">
          <span class="label">{cap(d.type)}</span>
          <span>{num(d.base)}</span>
          <span>{num(d.modified)}</span>
          <span>{num(d.expected)}</span>
        </div>
      {/each}
    </div>
    <p class="note">
      Expected = crit-weighted, on a landing hit. Hit chance vs. an enemy is later (M5).
    </p>
  {:else}
    <p class="empty">Equip a weapon to see damage output.</p>
  {/if}

  <h3 class="defense-head">Defense</h3>
  <div class="groups">
    <div class="group">
      <h4>Protection</h4>
      {#if combat.hasArmor}
        <dl>
          {#each POOLS as [key, label] (key)}
            <div class="stat">
              <dt>{label}</dt>
              <dd>{num(combat.protection[key])}</dd>
            </div>
          {/each}
          <div class="stat avg">
            <dt>Average</dt>
            <dd>{num(combat.avgProtection)}</dd>
          </div>
        </dl>
      {:else}
        <p class="empty">Equip armor to see protection.</p>
      {/if}
    </div>

    <div class="group">
      <h4>Resistance · Eff. HP</h4>
      {#if resisted.length > 0}
        <dl>
          {#each resisted as d (d.type)}
            <div class="stat">
              <dt>{cap(d.type)}</dt>
              <dd>{num(d.resistance * 100)}% · {num(d.effectiveHp)}</dd>
            </div>
          {/each}
        </dl>
      {:else}
        <p class="empty">No resistances — effective HP is {num(combat.maxHp)} vs. every type.</p>
      {/if}
    </div>
  </div>
</section>

<style>
  .panel {
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 1rem;
  }
  h3 {
    font-size: 0.85rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--accent);
    border-bottom: 1px solid var(--border);
    padding-bottom: 0.2rem;
    margin-bottom: 0.4rem;
  }
  .defense-head {
    margin-top: 0.9rem;
  }
  h4 {
    font-size: 0.78rem;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: var(--text-dim);
    margin: 0 0 0.3rem;
  }
  .dim {
    color: var(--text-dim);
    text-transform: none;
    letter-spacing: 0;
    font-weight: 400;
  }
  .note {
    color: var(--text-dim);
    font-size: 0.72rem;
    margin: 0.35rem 0 0;
  }
  .empty {
    color: var(--text-dim);
    font-size: 0.82rem;
    font-style: italic;
    margin: 0.1rem 0;
  }
  .dmg {
    display: grid;
    gap: 0.05rem;
  }
  .dmg-row {
    display: grid;
    grid-template-columns: 1fr auto auto auto;
    gap: 0.6rem;
    font-size: 0.85rem;
    padding: 0.1rem 0;
    align-items: baseline;
  }
  .dmg-row span:not(.label) {
    text-align: right;
    font-variant-numeric: tabular-nums;
    min-width: 2.6rem;
    font-weight: 600;
  }
  .dmg-row .label {
    color: var(--text-dim);
  }
  .dmg-row.head {
    color: var(--text-dim);
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .dmg-row.head span:not(.label) {
    font-weight: 400;
  }
  .groups {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 0.75rem 1.25rem;
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
  .stat.avg {
    border-top: 1px solid var(--border);
    margin-top: 0.15rem;
    padding-top: 0.25rem;
  }
</style>
