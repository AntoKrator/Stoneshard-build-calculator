<script lang="ts">
  // Skill icon with a robust fallback. No gate verifies that every icon file
  // exists, so the onerror fallback to a glyph is the safety net (KTD12/U9).
  // Paths resolve through iconSrc under import.meta.env.BASE_URL so they work
  // under a GitHub Pages project path.
  import { iconSrc } from '../lib/icon'

  let { icon, alt = '', size = 40 }: { icon?: string; alt?: string; size?: number } = $props()

  let failed = $state(false)
  const src = $derived(icon ? iconSrc(icon, import.meta.env.BASE_URL) : '')

  // Reset the error state whenever the icon changes: a slot reuses one Icon
  // instance across item swaps, so a prior item's 404 must not stick to the next.
  $effect(() => {
    void icon
    failed = false
  })
</script>

{#if icon && !failed}
  <img
    class="icon"
    {src}
    {alt}
    width={size}
    height={size}
    loading="lazy"
    draggable="false"
    onerror={() => (failed = true)}
  />
{:else}
  <span class="icon fallback" style="width: {size}px; height: {size}px;" aria-label={alt}>
    {alt ? alt[0].toUpperCase() : '?'}
  </span>
{/if}

<style>
  .icon {
    display: inline-block;
    image-rendering: pixelated;
    vertical-align: middle;
  }

  .fallback {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--bg-panel-2);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text-dim);
    font-family: var(--font-display);
    font-weight: 700;
  }
</style>
