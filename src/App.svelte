<script lang="ts">
  // App shell. The real calculator UI (skill trees, attributes, equipment,
  // character sheet, share bar) is built out in Phase 1+. This shell loads the
  // validated dataset and shows a smoke summary, proving the data foundation works.
  import { APP_VERSION, TARGET_GAME_VERSION } from './lib/version'
  import { dataset } from './lib/data/load'

  const skillCount = dataset.skills.length
  const treeCount = dataset.trees.length
  const byCategory = dataset.trees.reduce<Record<string, number>>((acc, t) => {
    acc[t.category] = (acc[t.category] ?? 0) + 1
    return acc
  }, {})
</script>

<div class="layout">
  <header>
    <h1>Stoneshard Build Calculator</h1>
    <p class="tagline">
      Plan attributes, skills, gear and enchantments — and see the full character sheet.
    </p>
  </header>

  <main>
    <section class="panel">
      <h2>Dataset loaded</h2>
      <p>
        <strong>{skillCount}</strong> skills across <strong>{treeCount}</strong> skill trees ({byCategory.weaponry}
        weaponry · {byCategory.utility} utility · {byCategory.sorcery} sorcery). The calculator UI is
        under construction.
      </p>
      <p class="dim">App v{APP_VERSION} · targeting Stoneshard {TARGET_GAME_VERSION}</p>
    </section>
  </main>

  <footer>
    <p class="dim">
      Unofficial fan-made tool. Not affiliated with Ink Stains Games. Game data and assets are the
      property of their respective owners.
    </p>
  </footer>
</div>

<style>
  .layout {
    max-width: 1200px;
    margin: 0 auto;
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    min-height: 100vh;
  }

  header {
    border-bottom: 1px solid var(--border);
    padding-bottom: 1rem;
    margin-bottom: 1.5rem;
  }

  h1 {
    color: var(--accent);
  }

  .tagline {
    color: var(--text-dim);
  }

  main {
    flex: 1;
  }

  .panel {
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 1.25rem;
  }

  .dim {
    color: var(--text-dim);
    font-size: 0.9rem;
  }

  footer {
    margin-top: 2rem;
    padding-top: 1rem;
    border-top: 1px solid var(--border);
  }
</style>
