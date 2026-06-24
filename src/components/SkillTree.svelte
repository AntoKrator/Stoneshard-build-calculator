<script lang="ts">
  // One tree's grid: connection lines behind absolutely-positioned nodes. All the
  // placement + state logic comes from the tested node-state seam; this component
  // just lays it out and forwards rank gestures.
  //
  // The hovered skill is tracked here (not in the node) so the tooltip can render
  // as a single panel pinned to the right of the viewport — in front of, and
  // outside, the scrolling grid, so it is never clipped or stacked behind nodes.
  import { computeTreeLayout, nodeState } from '../lib/build/node-state'
  import AbilityNode from './AbilityNode.svelte'
  import ConnectionLines from './ConnectionLines.svelte'
  import Tooltip from './Tooltip.svelte'
  import type { Skill } from '../lib/types'
  import type { Character } from '../lib/build/character'
  import type { Scope } from '../lib/formula/eval'

  let {
    skills,
    character,
    scope,
    baseAttributeValue,
    onPick,
    onRefund,
  }: {
    skills: Skill[]
    character: Character
    scope: Scope
    baseAttributeValue: number
    onPick: (key: string) => void
    onRefund: (key: string) => void
  } = $props()

  const layout = $derived(computeTreeLayout(skills))

  let hovered = $state<Skill | null>(null)
  // Clear only if the leaving node is still the hovered one, so moving between two
  // adjacent nodes doesn't blank the tooltip on the wrong event order.
  function setHover(skill: Skill, entering: boolean) {
    if (entering) hovered = skill
    else if (hovered?.key === skill.key) hovered = null
  }
</script>

<div class="tree-area">
  <div class="grid-scroll">
    <div class="skill-tree" style="width: {layout.width}px; height: {layout.height}px;">
      <ConnectionLines
        edges={layout.edges}
        width={layout.width}
        height={layout.height}
        taken={character.taken}
      />
      {#each layout.nodes as n (n.key)}
        <div class="node-pos" style="left: {n.cx}px; top: {n.cy}px;">
          <AbilityNode
            skill={n.skill}
            status={nodeState(n.skill, character, baseAttributeValue)}
            {onPick}
            {onRefund}
            onHover={setHover}
          />
        </div>
      {/each}
    </div>
  </div>

  {#if hovered}
    <aside class="tooltip-panel">
      <strong class="tt-name">{hovered.name.english}</strong>
      {#if hovered.tooltip?.english}
        <Tooltip tooltip={hovered.tooltip.english} formulas={hovered.formulas} {scope} bare />
      {:else}
        <p class="tt-empty">No description.</p>
      {/if}
    </aside>
  {/if}
</div>

<style>
  .tree-area {
    position: relative;
  }
  /* The grid scrolls within a bounded viewport; the tooltip panel lives outside it. */
  .grid-scroll {
    overflow: auto;
    max-height: calc(100vh - 230px);
  }
  .skill-tree {
    position: relative;
    margin: 1rem auto;
  }
  .node-pos {
    position: absolute;
    transform: translate(-50%, -50%);
  }

  .tooltip-panel {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    z-index: 50;
    width: min(20rem, 80%);
    max-height: calc(100% - 1rem);
    overflow-y: auto;
    padding: 0.7rem 0.85rem;
    background: var(--bg-panel-2);
    border: 1px solid var(--accent-dim);
    border-radius: 6px;
    box-shadow: var(--frame-shadow), var(--shadow-float);
    pointer-events: none;
  }
  .tt-name {
    display: block;
    margin-bottom: 0.35rem;
    font-family: var(--font-display);
    font-size: 1.05rem;
    color: var(--accent);
  }
  .tt-empty {
    margin: 0;
    color: var(--text-dim);
    font-size: 0.85rem;
  }
</style>
