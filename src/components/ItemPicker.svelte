<script lang="ts">
  // Per-slot item chooser: lists the items that fit one equipment slot, filterable
  // by name (731 items is too many to scan blind), and equips the picked one.
  import type { Item, EquipmentSlot } from '../lib/types'
  import Icon from './Icon.svelte'

  let {
    slot,
    slotLabel,
    items,
    equippedKey,
    onPick,
    onClose,
  }: {
    slot: EquipmentSlot
    slotLabel: string
    items: Item[]
    equippedKey?: string
    onPick: (key: string) => void
    onClose: () => void
  } = $props()

  let query = $state('')

  // Only items whose canonical slot is this one are equippable here; sort by tier
  // then name so the list reads like the in-game progression.
  const matches = $derived(
    items
      .filter((i) => i.slot === slot)
      .filter((i) => i.name.english.toLowerCase().includes(query.trim().toLowerCase()))
      .sort(
        (a, b) => (a.tier ?? 0) - (b.tier ?? 0) || a.name.english.localeCompare(b.name.english),
      ),
  )
</script>

<div class="picker">
  <div class="picker-head">
    <input
      class="search"
      type="text"
      placeholder={`Search ${slotLabel}…`}
      bind:value={query}
      aria-label={`Search ${slotLabel} items`}
    />
    <span class="count">{matches.length}</span>
    <button class="close" aria-label="Close picker" onclick={onClose}>×</button>
  </div>

  {#if matches.length === 0}
    <p class="empty">No matching items.</p>
  {:else}
    <ul class="list">
      {#each matches as item (item.key)}
        <li>
          <button
            class="option"
            class:current={item.key === equippedKey}
            onclick={() => onPick(item.key)}
          >
            <Icon icon={item.icon} alt={item.name.english} size={28} />
            <span class="name">{item.name.english}</span>
            <span class="meta">
              {#if item.tier}T{item.tier}{/if}
              {#if item.damageType}· {item.damageType}{:else if item.material}· {item.material}{/if}
            </span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .picker {
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg-panel-2, var(--bg-panel));
    margin: 0.35rem 0 0.5rem;
  }
  .picker-head {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.4rem;
    border-bottom: 1px solid var(--border);
  }
  .search {
    flex: 1;
    min-width: 0;
    padding: 0.3rem 0.45rem;
    font-size: 0.85rem;
  }
  .count {
    font-size: 0.75rem;
    color: var(--text-dim);
    font-variant-numeric: tabular-nums;
  }
  .close {
    padding: 0.15rem 0.5rem;
  }
  .empty {
    color: var(--text-dim);
    font-size: 0.85rem;
    padding: 0.5rem;
  }
  .list {
    list-style: none;
    margin: 0;
    padding: 0.25rem;
    max-height: 300px;
    overflow-y: auto;
    display: grid;
    gap: 0.15rem;
  }
  .option {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    text-align: left;
    padding: 0.25rem 0.4rem;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 4px;
  }
  .option:hover {
    background: var(--bg-panel);
    border-color: var(--border);
  }
  .option.current {
    border-color: var(--accent);
  }
  .name {
    font-size: 0.85rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .meta {
    font-size: 0.72rem;
    color: var(--text-dim);
    white-space: nowrap;
  }
</style>
