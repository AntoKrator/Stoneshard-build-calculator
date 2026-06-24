<script lang="ts">
  // Presentational tooltip body. All logic lives in the tested render.ts seam
  // (KTD12); this component only maps segments to escaped, safely-colored spans.
  // Critically: text is rendered via `{seg.text}` interpolation (escaped by
  // Svelte), never `{@html}`, and span colors come from a FIXED map keyed by the
  // game's color codes — so untrusted game text can inject neither markup nor CSS
  // (KTD8).
  import { renderTooltip } from '../lib/tooltip/render'
  import type { Scope } from '../lib/formula/eval'

  let {
    tooltip,
    formulas = {},
    scope,
    bare = false,
  }: { tooltip: string; formulas?: Record<string, string>; scope: Scope; bare?: boolean } = $props()

  // Stoneshard color codes -> fixed CSS values, retuned (M1) to sit on the
  // bronze/parchment palette while staying recognizably their semantic hues.
  // FIXED map keyed by the game's codes — never attacker-influenced (KTD8).
  const COLORS: Record<string, string> = {
    r: '#d96f5f', // red
    w: '#ece0bd', // white / parchment highlight
    p: '#b48ead', // arcane purple
    bl: '#6c9fcf', // blue
    lg: '#93b85a', // light green
    g: '#93b85a', // green
    y: '#d9b64a', // yellow / brass
  }
  const colorOf = (c: string | null): string => (c && COLORS[c]) || 'inherit'

  const segments = $derived(renderTooltip(tooltip, formulas, scope))
</script>

<div class="tooltip" class:boxed={!bare} role="tooltip">
  {#each segments as seg, i (i)}
    {#if seg.kind === 'break'}
      {#if seg.paragraph}<span class="pbreak"></span>{:else}<br />{/if}
    {:else}
      <span
        style="color: {colorOf(seg.color)}"
        class:value={seg.resolved === 'value'}
        class:marker={seg.resolved === 'marker'}>{seg.text}</span
      >
    {/if}
  {/each}
</div>

<style>
  .tooltip {
    font-size: 0.85rem;
    line-height: 1.45;
    color: var(--text);
  }
  /* Standalone box; omitted when rendered inside a host panel (bare). */
  .tooltip.boxed {
    max-width: 22rem;
    padding: 0.6rem 0.75rem;
    background: var(--bg-panel-2);
    border: 1px solid var(--border);
    border-radius: 6px;
    box-shadow:
      var(--frame-shadow),
      0 6px 20px rgba(0, 0, 0, 0.45);
  }

  /* A paragraph break: force a new line with extra spacing above. */
  .pbreak {
    display: block;
    height: 0.5rem;
  }

  .value {
    font-weight: 600;
  }

  .marker {
    color: var(--text-dim);
  }
</style>
