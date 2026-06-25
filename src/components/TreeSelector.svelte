<script lang="ts">
  // Multi-select navigation among the 21 trees: toggle any number open at once,
  // with a per-tree count of taken skills surfaced so progress is visible. A small
  // toolbar shows how many trees are open and offers a close-all shortcut.
  import type { SkillTree } from '../lib/types'
  import type { Character } from '../lib/build/character'

  let {
    trees,
    character,
    openIds,
    onToggle,
    onCloseAll,
  }: {
    trees: SkillTree[]
    character: Character
    openIds: string[]
    onToggle: (id: string) => void
    onCloseAll: () => void
  } = $props()

  const takenCount = (tree: SkillTree) => tree.skills.filter((k) => character.taken.has(k)).length
  const isOpen = (id: string) => openIds.includes(id)
</script>

<nav class="tree-selector" aria-label="Skill trees">
  <div class="bar">
    <span class="open-count">
      {openIds.length}
      {openIds.length === 1 ? 'tree' : 'trees'} open
    </span>
    <button class="close-all" disabled={openIds.length === 0} onclick={() => onCloseAll()}>
      Close all
    </button>
  </div>
  <div class="tabs">
    {#each trees as t (t.id)}
      {@const count = takenCount(t)}
      <button
        class="tab {t.category}"
        class:active={isOpen(t.id)}
        aria-pressed={isOpen(t.id)}
        onclick={() => onToggle(t.id)}
      >
        <span class="name">{t.name}</span>
        {#if count > 0}<span class="count">{count}</span>{/if}
      </button>
    {/each}
  </div>
</nav>

<style>
  .tree-selector {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }
  .open-count {
    font-size: 0.8rem;
    color: var(--text-dim);
  }
  .close-all {
    font-size: 0.78rem;
    padding: 0.2rem 0.55rem;
  }
  .tabs {
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
