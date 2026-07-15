<script lang="ts">
  // Prerequisite lines behind the nodes, routed game/wiki-style. All routing
  // logic (bowties for M×N cross-connections, per-edge elbows otherwise,
  // junction-dot placement) lives in computeTreeShapes — tested in
  // node-state.test.ts. An edge is "active" when both endpoints are taken;
  // active edges draw as gold elbows on top of the purple lattice.
  import { computeTreeShapes, railYOf, type LayoutEdge } from '../lib/build/node-state'

  let {
    edges,
    width,
    height,
    taken,
  }: { edges: LayoutEdge[]; width: number; height: number; taken: Set<string> } = $props()

  const isActive = (e: LayoutEdge) => taken.has(e.from) && taken.has(e.to)
  const elbow = (e: LayoutEdge, y: number) => `M ${e.x1} ${e.y1} V ${y} H ${e.x2} V ${e.y2}`

  const shapes = $derived(computeTreeShapes(edges))
  // The active (gold) overlay follows the same staggered rail as its base edge;
  // bowtie-member edges fall back to the midpoint rail, crossing the junction.
  const railYByEdge = $derived.by(() => {
    const m: Record<string, number> = {}
    for (const p of shapes.plain) m[`${p.edge.from}->${p.edge.to}`] = p.railY
    return m
  })
  const activeEdges = $derived(edges.filter(isActive))
</script>

<svg class="lines" {width} {height} viewBox="0 0 {width} {height}" aria-hidden="true">
  {#each shapes.plain as p, i (i)}
    <path d={elbow(p.edge, p.railY)} />
  {/each}
  {#each shapes.bowties as b, i (i)}
    <path d={b.d} />
  {/each}
  <!-- Active path drawn last so shared segments can't overdraw the highlight. -->
  {#each activeEdges as e, i (i)}
    <path d={elbow(e, railYByEdge[`${e.from}->${e.to}`] ?? railYOf(e))} class="active" />
  {/each}
  {#each [...shapes.diamonds, ...shapes.bowties.map((b) => ({ x: b.cx, y: b.cy }))] as d, i (i)}
    <rect
      class="junction"
      x={d.x - 3.5}
      y={d.y - 3.5}
      width="7"
      height="7"
      transform="rotate(45 {d.x} {d.y})"
    />
  {/each}
</svg>

<style>
  .lines {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
  path {
    fill: none;
    /* Muted violet like the game's tree connectors; deliberately outside the
       bronze palette so the lattice reads as background structure. */
    stroke: #6a5b9e;
    stroke-width: 2;
    shape-rendering: crispEdges;
  }
  path.active {
    stroke: var(--accent);
    stroke-width: 3;
  }
  .junction {
    fill: #6a5b9e;
  }
</style>
