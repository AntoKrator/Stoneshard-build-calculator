<script lang="ts">
  // The equipment slots: what's equipped where, with an inline per-slot picker.
  // Equipped items come from the recomputed character (tested seam); equip/unequip
  // gestures forward to the ledger.
  import type { Item, EquipmentSlot } from '../lib/types'
  import type { Character } from '../lib/build/character'
  import Icon from './Icon.svelte'
  import ItemPicker from './ItemPicker.svelte'

  let {
    character,
    items,
    onEquip,
    onUnequip,
  }: {
    character: Character
    items: Item[]
    onEquip: (slot: EquipmentSlot, key: string) => void
    onUnequip: (slot: EquipmentSlot) => void
  } = $props()

  // In-game slot order, top to bottom.
  const SLOTS: { slot: EquipmentSlot; label: string }[] = [
    { slot: 'main_hand', label: 'Main Hand' },
    { slot: 'off_hand', label: 'Off Hand' },
    { slot: 'head', label: 'Head' },
    { slot: 'body', label: 'Body' },
    { slot: 'gloves', label: 'Gloves' },
    { slot: 'boots', label: 'Boots' },
    { slot: 'belt', label: 'Belt' },
    { slot: 'cloak', label: 'Cloak' },
    { slot: 'amulet', label: 'Amulet' },
    { slot: 'ring', label: 'Ring' },
  ]

  let activeSlot = $state<EquipmentSlot | null>(null)
  const toggle = (slot: EquipmentSlot) => (activeSlot = activeSlot === slot ? null : slot)
</script>

<section class="panel">
  <h2>Equipment</h2>

  <ul class="slots">
    {#each SLOTS as { slot, label } (slot)}
      {@const equipped = character.equipped[slot]}
      <li class="slot">
        <button
          class="slot-btn"
          class:filled={!!equipped}
          aria-expanded={activeSlot === slot}
          onclick={() => toggle(slot)}
        >
          <Icon icon={equipped?.icon} alt={equipped?.name.english ?? label} size={32} />
          <span class="text">
            <span class="slot-label">{label}</span>
            <span class="slot-item" class:empty={!equipped}>
              {equipped ? equipped.name.english : 'empty'}
            </span>
          </span>
        </button>
        {#if equipped}
          <button class="unequip" aria-label={`Unequip ${label}`} onclick={() => onUnequip(slot)}>
            ×
          </button>
        {/if}
      </li>
      {#if activeSlot === slot}
        <li class="picker-row">
          <ItemPicker
            {slot}
            slotLabel={label}
            {items}
            equippedKey={equipped?.key}
            onPick={(key) => {
              onEquip(slot, key)
              activeSlot = null
            }}
            onClose={() => (activeSlot = null)}
          />
        </li>
      {/if}
    {/each}
  </ul>
</section>

<style>
  .panel {
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 1rem;
  }
  .slots {
    list-style: none;
    margin: 0.5rem 0 0;
    padding: 0;
    display: grid;
    gap: 0.25rem;
  }
  .slot {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    gap: 0.3rem;
  }
  .slot-btn {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    text-align: left;
    padding: 0.3rem 0.4rem;
    background: transparent;
    border: 1px solid var(--border);
    border-radius: 4px;
  }
  .slot-btn.filled {
    border-color: var(--accent);
  }
  .text {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .slot-label {
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: var(--text-dim);
  }
  .slot-item {
    font-size: 0.85rem;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .slot-item.empty {
    color: var(--text-dim);
    font-weight: 400;
    font-style: italic;
  }
  .unequip {
    padding: 0.15rem 0.5rem;
  }
  .picker-row {
    display: block;
  }
</style>
