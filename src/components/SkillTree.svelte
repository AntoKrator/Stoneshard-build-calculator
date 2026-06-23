<script lang="ts">
  // One tree's grid: connection lines behind absolutely-positioned nodes. All the
  // placement + state logic comes from the tested node-state seam; this component
  // just lays it out and forwards rank gestures.
  import { computeTreeLayout, nodeState } from '../lib/build/node-state'
  import AbilityNode from './AbilityNode.svelte'
  import ConnectionLines from './ConnectionLines.svelte'
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
</script>

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
        {scope}
        {onPick}
        {onRefund}
      />
    </div>
  {/each}
</div>

<style>
  .skill-tree {
    position: relative;
    margin: 1rem auto;
  }
  .node-pos {
    position: absolute;
    transform: translate(-50%, -50%);
  }
</style>
