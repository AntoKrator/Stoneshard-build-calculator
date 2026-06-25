<script lang="ts">
  // One tree's grid: connection lines behind absolutely-positioned nodes. All the
  // placement + state logic comes from the tested node-state seam; this component
  // just lays it out and forwards rank + hover gestures.
  //
  // Hover is emitted upward (not drawn here): with several trees open, App renders
  // ONE shared tooltip panel pinned to the viewport so it is never clipped by a
  // tree card's scroll nor crowded into a narrow column (U6).
  import { computeTreeLayout, nodeState } from '../lib/build/node-state'
  import AbilityNode from './AbilityNode.svelte'
  import ConnectionLines from './ConnectionLines.svelte'
  import type { Skill } from '../lib/types'
  import type { Character } from '../lib/build/character'

  let {
    skills,
    character,
    baseAttributeValue,
    onPick,
    onRefund,
    onHover,
  }: {
    skills: Skill[]
    character: Character
    baseAttributeValue: number
    onPick: (key: string) => void
    onRefund: (key: string) => void
    onHover: (skill: Skill, entering: boolean) => void
  } = $props()

  const layout = $derived(computeTreeLayout(skills))
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
            {onHover}
          />
        </div>
      {/each}
    </div>
  </div>
</div>

<style>
  .tree-area {
    position: relative;
  }
  /* The grid scrolls within a bounded viewport; the tooltip panel lives outside it.
     The height is set by the host (App) via --grid-max-height so several open trees
     get a shorter per-tree viewport and tile without one dominating the page (U5). */
  .grid-scroll {
    overflow: auto;
    max-height: var(--grid-max-height, calc(100vh - 230px));
  }
  .skill-tree {
    position: relative;
    margin: 1rem auto;
  }
  .node-pos {
    position: absolute;
    transform: translate(-50%, -50%);
  }
</style>
