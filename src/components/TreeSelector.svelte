<script lang="ts">
  // Navigation among the 21 trees, with a per-tree count of taken skills surfaced
  // so progress is visible at a glance.
  import type { SkillTree } from '../lib/types'
  import type { Character } from '../lib/build/character'

  let {
    trees,
    character,
    activeId,
    onSelect,
  }: {
    trees: SkillTree[]
    character: Character
    activeId: string
    onSelect: (id: string) => void
  } = $props()

  const takenCount = (tree: SkillTree) => tree.skills.filter((k) => character.taken.has(k)).length
</script>

<nav class="tree-selector" aria-label="Skill trees">
  {#each trees as t (t.id)}
    {@const count = takenCount(t)}
    <button
      class="tab {t.category}"
      class:active={t.id === activeId}
      aria-current={t.id === activeId}
      onclick={() => onSelect(t.id)}
    >
      <span class="name">{t.name}</span>
      {#if count > 0}<span class="count">{count}</span>{/if}
    </button>
  {/each}
</nav>

<style>
  .tree-selector {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }
  .tab {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.35rem 0.65rem;
    font-size: 0.85rem;
    border-left-width: 3px;
  }
  .tab.active {
    border-color: var(--accent);
    background: var(--bg-panel-2);
  }
  /* A subtle category accent on the left edge: weaponry/utility ride the palette
     tokens; sorcery uses a desaturated arcane blue (no blue token in the core
     palette) tuned to sit in the grimdark theme. */
  .tab.weaponry {
    border-left-color: var(--danger);
  }
  .tab.utility {
    border-left-color: var(--ok);
  }
  .tab.sorcery {
    border-left-color: #5a87b0;
  }
  .count {
    min-width: 1.2em;
    padding: 0 0.3em;
    border-radius: 999px;
    background: var(--accent-dim);
    color: var(--bg);
    font-size: 0.75rem;
    font-weight: 700;
    text-align: center;
  }
</style>
