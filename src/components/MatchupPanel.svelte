<script lang="ts">
  // The two-way matchup view (M5 U8). Reads the derived character.matchup; the
  // build's damage assumes the hit lands (KTD4) — the accuracy-vs-dodge figure is
  // shown separately and labelled approximate, never folded into the numbers.
  import type { Character } from '../lib/build/character'
  import type { EnemyAbility } from '../lib/types'

  let {
    character,
    enemyAbilities,
    onToggleAbility,
  }: {
    character: Character
    enemyAbilities: EnemyAbility[]
    onToggleAbility: (key: string) => void
  } = $props()

  const matchup = $derived(character.matchup)
  const abilityName = $derived(new Map(enemyAbilities.map((a) => [a.key, a.name.english])))
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))
</script>

<section class="panel">
  <header class="head"><h2>Matchup</h2></header>

  {#if !matchup}
    <p class="hint">Select an enemy above to see the two-way damage exchange.</p>
  {:else}
    <p class="vs">
      You vs <strong>{matchup.enemyName}</strong> <span class="dim">({matchup.enemyHp} HP)</span>
    </p>

    <!-- Build → enemy -->
    <div class="dir">
      <h3>You deal</h3>
      {#if !matchup.hasWeapon}
        <p class="marker dim">— no weapon equipped</p>
      {:else}
        <table>
          <tbody>
            {#each matchup.deal.rows as r (r.type)}
              <tr><td class="type">{r.type}</td><td class="num">{fmt(r.net)}</td></tr>
            {/each}
          </tbody>
          <tfoot>
            <tr>
              <td>per hit</td>
              <td class="num">{fmt(matchup.deal.total)}</td>
            </tr>
            <tr class="kills">
              <td>hits to kill</td>
              <td class="num">{matchup.deal.hits ?? '—'}</td>
            </tr>
          </tfoot>
        </table>
      {/if}
    </div>

    <!-- Enemy → build -->
    <div class="dir">
      <h3>Enemy deals</h3>
      <table>
        <tbody>
          {#each matchup.take.rows as r (r.type)}
            <tr><td class="type">{r.type}</td><td class="num">{fmt(r.net)}</td></tr>
          {/each}
        </tbody>
        <tfoot>
          <tr>
            <td>per hit</td>
            <td class="num">{fmt(matchup.take.total)}</td>
          </tr>
          <tr class="kills">
            <td>hits to down you</td>
            <td class="num">{matchup.take.hits ?? '—'}</td>
          </tr>
        </tfoot>
      </table>

      {#if character.enemy && character.enemy.abilities.length > 0}
        <div class="abilities">
          <span class="dim">Abilities:</span>
          {#each character.enemy.abilities as key (key)}
            <button
              class="toggle"
              class:on={matchup.enabledAbilities.includes(key)}
              onclick={() => onToggleAbility(key)}
            >
              {abilityName.get(key) ?? key}
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <p class="approx dim">
      Hit chance ≈ {matchup.approxHitChance.dealPct}% you → enemy ·
      {matchup.approxHitChance.takePct}% enemy → you.
      <em>Approximate</em> (accuracy vs. dodge; not applied to the damage above).
    </p>
  {/if}
</section>

<style>
  .head h2 {
    margin: 0;
  }
  .hint,
  .marker {
    font-size: 0.9rem;
  }
  .dim {
    color: var(--text-dim);
  }
  .vs {
    margin: 0.3rem 0 0.6rem;
  }
  .dir {
    margin-bottom: 0.7rem;
  }
  .dir h3 {
    margin: 0 0 0.2rem;
    font-size: 0.95rem;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.88rem;
  }
  td {
    padding: 0.1rem 0.2rem;
  }
  .type {
    text-transform: capitalize;
  }
  .num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  tfoot td {
    border-top: 1px solid var(--border);
    font-weight: 600;
  }
  tr.kills td {
    color: var(--accent);
  }
  .abilities {
    margin-top: 0.4rem;
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
    align-items: center;
    font-size: 0.85rem;
  }
  .toggle {
    padding: 0.15rem 0.45rem;
    font-size: 0.8rem;
    opacity: 0.6;
  }
  .toggle.on {
    opacity: 1;
    outline: 2px solid var(--accent);
  }
  .approx {
    margin: 0.5rem 0 0;
    font-size: 0.78rem;
    line-height: 1.3;
  }
</style>
