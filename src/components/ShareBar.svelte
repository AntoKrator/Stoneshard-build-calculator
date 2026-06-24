<script lang="ts">
  // Share + import. Copy puts a ?build= URL on the clipboard (and reflects it in
  // the address bar so a reload restores the build); paste-import decodes a code or
  // URL through the fail-closed codec, replacing the build or showing an error.
  import { encode } from '../lib/share/codec'
  import { hydrateLedger } from '../lib/share/hydrate'
  import type { Ledger } from '../lib/build/character'

  let { entries, onImport }: { entries: Ledger; onImport: (entries: Ledger) => void } = $props()

  let copied = $state(false)
  let pasteValue = $state('')
  let importError = $state('')
  let copyTimer: ReturnType<typeof setTimeout> | undefined

  async function copy() {
    const code = await encode(entries)
    const url = `${location.origin}${location.pathname}?build=${code}`
    try {
      await navigator.clipboard.writeText(url)
      history.replaceState(null, '', url)
      copied = true
      clearTimeout(copyTimer)
      copyTimer = setTimeout(() => (copied = false), 1800)
    } catch {
      // Clipboard blocked (e.g. insecure context): still update the address bar so
      // the user can copy it manually.
      history.replaceState(null, '', url)
    }
  }

  async function importBuild() {
    importError = ''
    const res = await hydrateLedger(pasteValue)
    if (res.status === 'loaded') {
      onImport(res.entries)
      pasteValue = ''
    } else {
      importError = 'That build code could not be read.'
    }
  }
</script>

<section class="panel">
  <div class="row">
    <button class="share" onclick={copy}>{copied ? 'Copied!' : 'Copy build link'}</button>
  </div>
  <form
    class="import"
    onsubmit={(e) => {
      e.preventDefault()
      importBuild()
    }}
  >
    <input
      type="text"
      placeholder="Paste a build code or link…"
      bind:value={pasteValue}
      aria-label="Build code or link to import"
    />
    <button type="submit" disabled={!pasteValue.trim()}>Load</button>
  </form>
  {#if importError}<p class="err" role="alert">{importError}</p>{/if}
</section>

<style>
  /* Frame comes from the shared global .panel treatment (U2). */
  .share {
    width: 100%;
    border-color: var(--accent-dim);
  }
  .import {
    display: flex;
    gap: 0.4rem;
    margin-top: 0.6rem;
  }
  .import input {
    flex: 1;
    min-width: 0;
    padding: 0.4rem 0.5rem;
    background: var(--bg-panel-2);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text);
    font: inherit;
  }
  .err {
    color: var(--danger);
    font-size: 0.8rem;
    margin: 0.4rem 0 0;
  }
</style>
