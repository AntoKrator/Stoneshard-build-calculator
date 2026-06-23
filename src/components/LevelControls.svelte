<script lang="ts">
  // Level adjustment + remaining points + the build order (the flat log interleaves
  // allocations between level-ups, so the order skills/attributes were taken is
  // reproducible and shown here).
  import type { Character, Ledger } from '../lib/build/character'

  let {
    character,
    entries,
    startingLevel,
    maxLevel,
    onLevelUp,
    onLevelDown,
  }: {
    character: Character
    entries: Ledger
    startingLevel: number
    maxLevel: number
    onLevelUp: () => void
    onLevelDown: () => void
  } = $props()

  const attrLeft = $derived(character.attributeBudget - character.attributesSpent)
  const skillLeft = $derived(character.skillBudget - character.skillsSpent)

  // Reconstruct the build order from the flat log.
  const order = $derived.by(() => {
    let lvl = startingLevel
    const steps: { lvl: number; text: string }[] = []
    for (const e of entries) {
      if (e.op === 'levelUp') lvl++
      else if (e.op === 'addAttribute') steps.push({ lvl, text: `+${e.attr}` })
      else if (e.op === 'addSkill') steps.push({ lvl, text: e.skill })
    }
    return steps
  })
</script>

<section class="panel">
  <div class="level-row">
    <button
      aria-label="Level down"
      disabled={character.level <= startingLevel}
      onclick={onLevelDown}>−</button
    >
    <div class="level">
      <span class="num">Lv {character.level}</span>
      <span class="cap">/ {maxLevel}</span>
    </div>
    <button aria-label="Level up" disabled={character.level >= maxLevel} onclick={onLevelUp}
      >+</button
    >
  </div>

  <div class="points">
    <span><strong>{attrLeft}</strong> attribute pts</span>
    <span><strong>{skillLeft}</strong> skill pts</span>
  </div>

  {#if order.length > 0}
    <details class="order">
      <summary>Build order ({order.length})</summary>
      <ol>
        {#each order as step, i (i)}
          <li><span class="lv">Lv{step.lvl}</span> {step.text}</li>
        {/each}
      </ol>
    </details>
  {/if}
</section>

<style>
  .panel {
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 1rem;
  }
  .level-row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1rem;
  }
  .level-row button {
    width: 2.2rem;
    font-size: 1.1rem;
  }
  .level .num {
    font-size: 1.3rem;
    font-weight: 700;
    color: var(--accent);
  }
  .level .cap {
    color: var(--text-dim);
    font-size: 0.85rem;
  }
  .points {
    display: flex;
    justify-content: space-around;
    margin-top: 0.75rem;
    font-size: 0.85rem;
    color: var(--text-dim);
  }
  .points strong {
    color: var(--text);
  }
  .order {
    margin-top: 0.75rem;
    font-size: 0.8rem;
  }
  .order summary {
    cursor: pointer;
    color: var(--text-dim);
  }
  .order ol {
    max-height: 9rem;
    overflow: auto;
    margin: 0.4rem 0 0;
    padding-left: 1.4rem;
  }
  .order .lv {
    color: var(--text-dim);
    margin-right: 0.3rem;
  }
</style>
