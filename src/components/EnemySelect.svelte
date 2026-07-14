<script lang="ts">
  // Searchable enemy picker for the matchup (M5 U8). Mirrors CharacterSelect +
  // ItemPicker's name-search; ~300 enemies, so a simple filter + faction grouping.
  import type { Enemy } from '../lib/types'
  import type { Character } from '../lib/build/character'
  import Icon from './Icon.svelte'

  let {
    enemies,
    character,
    onSelect,
    onClear,
  }: {
    enemies: Enemy[]
    character: Character
    onSelect: (id: string) => void
    onClear: () => void
  } = $props()

  let query = $state('')
  const selectedKey = $derived(character.enemy?.key ?? null)

  const matches = $derived.by(() => {
    const q = query.trim().toLowerCase()
    const list = q
      ? enemies.filter(
          (e) =>
            e.name.english.toLowerCase().includes(q) || (e.faction ?? '').toLowerCase().includes(q),
        )
      : enemies
    return [...list].sort((a, b) => a.name.english.localeCompare(b.name.english)).slice(0, 60)
  })
</script>

<section class="panel">
  <header class="head">
    <h2>Enemy matchup</h2>
    {#if selectedKey}
      <button class="clear" onclick={() => onClear()}>Clear</button>
    {/if}
  </header>

  {#if character.enemy}
    <p class="selected">
      <Icon icon={character.enemy.icon} alt={character.enemy.name.english} size={28} />
      Fighting <strong>{character.enemy.name.english}</strong>
      <span class="dim"
        >· {character.enemy.hp} HP{character.enemy.faction
          ? ` · ${character.enemy.faction}`
          : ''}</span
      >
    </p>
  {/if}

  <input
    class="search"
    type="search"
    placeholder="Search {enemies.length} enemies…"
    bind:value={query}
  />

  <ul class="list">
    {#each matches as e (e.key)}
      <li>
        <button class="row" class:active={e.key === selectedKey} onclick={() => onSelect(e.key)}>
          <Icon icon={e.icon} alt={e.name.english} size={28} />
          <span class="name">{e.name.english}</span>
          <span class="meta dim">{e.hp} HP{e.tier != null ? ` · T${e.tier}` : ''}</span>
        </button>
      </li>
    {/each}
    {#if matches.length === 0}
      <li class="empty dim">No enemies match “{query}”.</li>
    {/if}
  </ul>
</section>

<style>
  .head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
  }
  .clear {
    font-size: 0.8rem;
  }
  .selected {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin: 0.3rem 0;
    font-size: 0.9rem;
  }
  .dim {
    color: var(--text-dim);
  }
  .search {
    width: 100%;
    margin: 0.4rem 0;
    padding: 0.35rem 0.5rem;
    box-sizing: border-box;
  }
  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 16rem;
    overflow-y: auto;
    display: grid;
    gap: 0.15rem;
  }
  .row {
    width: 100%;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
    text-align: left;
    padding: 0.3rem 0.5rem;
  }
  .name {
    flex: 1;
  }
  .row.active {
    outline: 2px solid var(--accent);
  }
  .meta {
    font-size: 0.8rem;
    white-space: nowrap;
  }
  .empty {
    padding: 0.5rem;
    font-size: 0.85rem;
  }
</style>
