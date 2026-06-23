<script lang="ts">
  // Prerequisite lines behind the nodes. An edge is "active" when both endpoints
  // are taken, so the path the build actually walks is highlighted.
  import type { LayoutEdge } from '../lib/build/node-state'

  let {
    edges,
    width,
    height,
    taken,
  }: { edges: LayoutEdge[]; width: number; height: number; taken: Set<string> } = $props()

  const isActive = (e: LayoutEdge) => taken.has(e.from) && taken.has(e.to)
</script>

<svg class="lines" {width} {height} viewBox="0 0 {width} {height}" aria-hidden="true">
  {#each edges as e, i (i)}
    <line x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} class:active={isActive(e)} />
  {/each}
</svg>

<style>
  .lines {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
  line {
    stroke: var(--border);
    stroke-width: 2;
  }
  line.active {
    stroke: var(--accent-dim);
    stroke-width: 3;
  }
</style>
