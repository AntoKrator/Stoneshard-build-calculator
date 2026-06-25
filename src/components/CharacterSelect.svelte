<script lang="ts">
  // Seed the build from a Stoneshard character preset: its starting attributes and
  // innate abilities (seeded OUTSIDE the point budget by recompute, U2). Trait and
  // affinities are display-only (KTD6). Selecting/clearing forwards to the ledger;
  // the seeded values then show through the normal attribute panel + sheet, and a
  // shared build that referenced an unknown preset surfaces via the Notice banner.
  import type { Preset, SkillTree } from '../lib/types'
  import type { Character } from '../lib/build/character'

  let {
    presets,
    trees,
    character,
    onSelect,
    onClear,
  }: {
    presets: Preset[]
    trees: SkillTree[]
    character: Character
    onSelect: (id: string) => void
    onClear: () => void
  } = $props()

  const treeName = (id: string) => trees.find((t) => t.id === id)?.name ?? id
  const selected = $derived(presets.find((p) => p.id === character.presetId) ?? null)
</script>

<section class="panel character-select">
  <header class="head">
    <h2>Character</h2>
    <span class="identity">
      {#if selected}
        <strong>{selected.name}</strong> · {selected.trait}
      {:else}
        Custom build
      {/if}
    </span>
  </header>

  <div class="roster" role="group" aria-label="Character preset">
    <button
      class="char custom"
      class:active={character.presetId === null}
      aria-pressed={character.presetId === null}
      onclick={() => onClear()}
    >
      <span class="char-name">Custom</span>
      <span class="char-sub">blank slate</span>
    </button>
    {#each presets as p (p.id)}
      <button
        class="char"
        class:active={character.presetId === p.id}
        aria-pressed={character.presetId === p.id}
        title={p.affinities.length
          ? `${p.trait} · ${p.affinities.map(treeName).join(', ')}`
          : p.trait}
        onclick={() => onSelect(p.id)}
      >
        <span class="char-name">
          {p.name}{#if p.dlc}<span class="dlc" title="Character Pack DLC">DLC</span>{/if}
        </span>
        <span class="char-sub">{p.trait}</span>
      </button>
    {/each}
  </div>

  {#if selected}
    <p class="seed-note">
      Starting attributes and innate abilities are seeded as <em>innate</em> — they don't spend your point
      budget and aren't refundable.
    </p>
    {#if selected.affinities.length}
      <div class="affinities">
        <span class="aff-label">Affinities</span>
        {#each selected.affinities as a (a)}
          <span class="aff">{treeName(a)}</span>
        {/each}
      </div>
    {/if}
  {/if}
</section>

<style>
  .panel {
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 1rem;
    margin-bottom: 1rem;
  }
  .head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.75rem;
    flex-wrap: wrap;
  }
  .identity {
    font-size: 0.9rem;
    color: var(--text-dim);
  }
  .identity strong {
    color: var(--accent);
  }
  .roster {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin-top: 0.5rem;
  }
  .char {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.1rem;
    min-width: 7.5rem;
    padding: 0.4rem 0.6rem;
    text-align: left;
    border-left-width: 3px;
    border-left-color: var(--border);
  }
  .char.active {
    border-color: var(--accent);
    background: var(--bg-panel-2);
  }
  .char.custom {
    border-left-color: var(--accent-dim);
  }
  .char-name {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    font-weight: 600;
    font-size: 0.9rem;
  }
  .char-sub {
    font-size: 0.72rem;
    color: var(--text-dim);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 9rem;
  }
  .dlc {
    font-size: 0.6rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    padding: 0 0.25em;
    border-radius: 3px;
    background: var(--accent-dim);
    color: var(--bg);
  }
  .seed-note {
    margin: 0.6rem 0 0;
    font-size: 0.78rem;
    color: var(--text-dim);
  }
  .affinities {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.3rem;
    margin-top: 0.5rem;
  }
  .aff-label {
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: var(--text-dim);
  }
  .aff {
    font-size: 0.75rem;
    padding: 0.1rem 0.4rem;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--bg-panel-2);
  }
</style>
