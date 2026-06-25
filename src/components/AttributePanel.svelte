<script lang="ts">
  // Allocate the five attributes within the per-level budget. All values come from
  // the recomputed character (tested seam); the +/− buttons forward to ledger ops.
  import type { AttributeDef, AttributeKey } from '../lib/types'
  import type { Character } from '../lib/build/character'

  let {
    attributes,
    character,
    maxAttributeValue,
    onAdd,
    onRemove,
  }: {
    attributes: AttributeDef[]
    character: Character
    maxAttributeValue: number
    onAdd: (attr: AttributeKey) => void
    onRemove: (attr: AttributeKey) => void
  } = $props()

  const available = $derived(character.attributeBudget - character.attributesSpent)
</script>

<section class="panel">
  <header class="head">
    <h2>Attributes</h2>
    <span class="budget" class:none={available === 0}>{available} pts</span>
  </header>

  <ul class="attrs">
    {#each attributes as a (a.key)}
      <li class="attr">
        <span class="label" title={a.description ?? ''}>{a.name}</span>
        <span class="value">
          {character.attributes[a.key]}
          {#if character.attributes[a.key] >= maxAttributeValue}<span
              class="cap"
              title={`Capped at ${maxAttributeValue}`}>max</span
            >{:else if character.invested[a.key] > 0}<span class="bonus"
              >+{character.invested[a.key]}</span
            >{/if}
        </span>
        <span class="controls">
          <button
            aria-label={`Remove ${a.name}`}
            disabled={character.invested[a.key] === 0}
            onclick={() => onRemove(a.key)}>−</button
          >
          <button
            aria-label={`Add ${a.name}`}
            disabled={available === 0 || character.attributes[a.key] >= maxAttributeValue}
            onclick={() => onAdd(a.key)}>+</button
          >
        </span>
      </li>
    {/each}
  </ul>
</section>

<style>
  /* Frame comes from the shared global .panel treatment (U2). */
  .head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
  }
  .budget {
    font-size: 0.8rem;
    color: var(--accent);
  }
  .budget.none {
    color: var(--text-dim);
  }
  .attrs {
    list-style: none;
    margin: 0.5rem 0 0;
    padding: 0;
    display: grid;
    gap: 0.4rem;
  }
  .attr {
    display: grid;
    grid-template-columns: 1fr auto auto;
    align-items: center;
    gap: 0.6rem;
  }
  .value {
    font-variant-numeric: tabular-nums;
    font-weight: 600;
  }
  .bonus {
    color: var(--ok);
    font-size: 0.8rem;
    margin-left: 0.2rem;
  }
  .cap {
    color: var(--text-dim);
    font-size: 0.7rem;
    font-variant: small-caps;
    margin-left: 0.2rem;
  }
  .controls button {
    width: 1.8rem;
    padding: 0.15rem 0;
  }
</style>
