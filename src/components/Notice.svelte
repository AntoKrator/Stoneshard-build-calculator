<script lang="ts">
  // Makes the "never silently break" guarantee visible: when a loaded build
  // referenced skills/trees that no longer exist, recompute skips them and records
  // notes — this banner names how many and which, and is dismissible.
  import type { RecomputeNote } from '../lib/build/character'

  let { notes }: { notes: RecomputeNote[] } = $props()

  let dismissed = $state(false)
  const visible = $derived(notes.length > 0 && !dismissed)
  const refs = $derived(notes.map((n) => n.ref).join(', '))
</script>

{#if visible}
  <div class="notice" role="status">
    <span>
      {notes.length}
      {notes.length === 1 ? 'item' : 'items'} from this shared build {notes.length === 1
        ? 'is'
        : 'are'} no longer in the game data and {notes.length === 1 ? 'was' : 'were'} skipped:
      <strong>{refs}</strong>. The rest of the build loaded normally.
    </span>
    <button class="dismiss" aria-label="Dismiss notice" onclick={() => (dismissed = true)}>×</button
    >
  </div>
{/if}

<style>
  .notice {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    padding: 0.6rem 0.85rem;
    margin-bottom: 1rem;
    background: color-mix(in srgb, var(--danger) 16%, transparent);
    border: 1px solid var(--danger);
    border-radius: 6px;
    font-size: 0.85rem;
  }
  .dismiss {
    margin-left: auto;
    border: none;
    background: none;
    color: var(--text-dim);
    font-size: 1.1rem;
    line-height: 1;
    padding: 0 0.2rem;
  }
</style>
