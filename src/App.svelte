<script lang="ts">
  // The Phase-1 build planner. Owns the reactive ledger and wires every panel to
  // it; all heavy logic lives in tested pure modules (KTD12), so this shell stays
  // thin: assemble components, route rank/attribute/level gestures to the ledger,
  // and hydrate any shared ?build= on mount.
  import { onMount } from 'svelte'
  import { APP_VERSION, TARGET_GAME_VERSION } from './lib/version'
  import { dataset, statModel } from './lib/data/load'
  import { BuildLedger } from './lib/build/ledger.svelte'
  import { buildScope } from './lib/formula/scope'
  import { hydrateLedger } from './lib/share/hydrate'
  import type { AttributeKey, EquipmentSlot } from './lib/types'

  import CharacterSelect from './components/CharacterSelect.svelte'
  import TreeSelector from './components/TreeSelector.svelte'
  import SkillTree from './components/SkillTree.svelte'
  import AttributePanel from './components/AttributePanel.svelte'
  import EquipmentPanel from './components/EquipmentPanel.svelte'
  import LevelControls from './components/LevelControls.svelte'
  import CharacterSheet from './components/CharacterSheet.svelte'
  import CombatPanel from './components/CombatPanel.svelte'
  import ShareBar from './components/ShareBar.svelte'
  import Notice from './components/Notice.svelte'

  const base = dataset.constants.baseAttributeValue
  const maxLevel = dataset.constants.maxLevel ?? 30
  const skillByKey = new Map(dataset.skills.map((s) => [s.key, s]))

  // Trees grouped weaponry → utility → sorcery, then by name, for a tidy selector.
  const CATEGORY_RANK: Record<string, number> = { weaponry: 0, utility: 1, sorcery: 2 }
  const sortedTrees = [...dataset.trees].sort(
    (a, b) => CATEGORY_RANK[a.category] - CATEGORY_RANK[b.category] || a.name.localeCompare(b.name),
  )
  // Day-one archetype (KTD16): default to a melee tree whose tooltips fully resolve.
  const defaultTreeId = (sortedTrees.find((t) => t.id === 'swords') ?? sortedTrees[0]).id

  const ledger = new BuildLedger(dataset)
  const character = $derived(ledger.character)
  const scope = $derived(buildScope(character.attributes, character.derived, statModel))

  // Several trees can be open at once (multi-tree view, U5). Held as an array used
  // as a set; reassigned on toggle so Svelte tracks it (no reactive-collection lint,
  // matching the ledger's plain-collection posture).
  let openTreeIds = $state<string[]>([defaultTreeId])
  const toggleTree = (id: string) =>
    (openTreeIds = openTreeIds.includes(id)
      ? openTreeIds.filter((x) => x !== id)
      : [...openTreeIds, id])
  const closeAllTrees = () => (openTreeIds = [])
  // Render in the selector's stable category/name order, independent of click order.
  const openTrees = $derived(
    sortedTrees
      .filter((t) => openTreeIds.includes(t.id))
      .map((t) => ({
        tree: t,
        skills: t.skills.map((k) => skillByKey.get(k)).filter((s) => s != null),
      })),
  )
  const isFresh = $derived(ledger.entries.length === 0)

  onMount(async () => {
    const res = await hydrateLedger(window.location.search)
    if (res.status === 'loaded') ledger.load(res.entries)
  })

  const onPick = (k: string) => ledger.addSkill(k)
  const onRefund = (k: string) => ledger.removeSkill(k)
  const onAdd = (a: AttributeKey) => ledger.addAttribute(a)
  const onRemoveAttr = (a: AttributeKey) => ledger.removeAttribute(a)
  const onLevelUp = () => ledger.levelUp()
  const onLevelDown = () => ledger.levelDown()
  const onImport = (entries: typeof ledger.entries) => ledger.load(entries)
  const onEquip = (slot: EquipmentSlot, key: string) => ledger.equip(slot, key)
  const onUnequip = (slot: EquipmentSlot) => ledger.unequip(slot)
  const onSelectCharacter = (id: string) => ledger.selectCharacter(id)
  const onClearCharacter = () => ledger.clearCharacter()
</script>

<div class="layout">
  <header>
    <h1>Stoneshard Build Calculator</h1>
    <p class="tagline">
      Plan attributes and skills, see your sheet update live, and share the build.
    </p>
  </header>

  <Notice notes={character.notes} />

  <CharacterSelect
    presets={dataset.presets}
    trees={dataset.trees}
    {character}
    onSelect={onSelectCharacter}
    onClear={onClearCharacter}
  />

  {#if isFresh}
    <p class="hint">
      You have <strong>{character.skillBudget} skill points</strong> to spend. Open one or more skill
      trees below, pick skills, allocate attributes, and level up to earn more.
    </p>
  {/if}

  <main>
    <div class="trees">
      <TreeSelector
        trees={sortedTrees}
        {character}
        openIds={openTreeIds}
        onToggle={toggleTree}
        onCloseAll={closeAllTrees}
      />
      {#if openTrees.length === 0}
        <p class="empty-trees">No trees open — pick one or more above to start planning.</p>
      {:else}
        <!-- Each tree scrolls within its own card; a shorter per-tree viewport when
             several are open so they tile without one tree dominating the page. -->
        <div
          class="tree-grid"
          style="--grid-max-height: {openTreeIds.length > 1 ? '60vh' : 'calc(100vh - 230px)'}"
        >
          {#each openTrees as o (o.tree.id)}
            <section class="tree-card">
              <header class="tree-card-head">
                <h2>{o.tree.name}</h2>
                <button
                  class="close"
                  aria-label={`Close ${o.tree.name}`}
                  onclick={() => toggleTree(o.tree.id)}>×</button
                >
              </header>
              <SkillTree
                skills={o.skills}
                {character}
                {scope}
                baseAttributeValue={base}
                {onPick}
                {onRefund}
              />
            </section>
          {/each}
        </div>
      {/if}
    </div>

    <aside class="side">
      <LevelControls
        {character}
        entries={ledger.entries}
        startingLevel={dataset.constants.startingLevel}
        {maxLevel}
        {onLevelUp}
        {onLevelDown}
      />
      <AttributePanel attributes={dataset.attributes} {character} {onAdd} onRemove={onRemoveAttr} />
      <EquipmentPanel {character} items={dataset.items} {onEquip} {onUnequip} />
      <ShareBar entries={ledger.entries} {onImport} />
      <CharacterSheet {character} {statModel} />
      <CombatPanel {character} />
    </aside>
  </main>

  <footer>
    <p class="dim">
      Unofficial fan-made tool. Not affiliated with Ink Stains Games. Game data and assets are the
      property of their respective owners. App v{APP_VERSION} · targeting Stoneshard {TARGET_GAME_VERSION}.
    </p>
  </footer>
</div>

<style>
  .layout {
    max-width: 1280px;
    margin: 0 auto;
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    min-height: 100vh;
  }
  header {
    border-bottom: 1px solid var(--border);
    padding-bottom: 0.75rem;
    margin-bottom: 1rem;
  }
  h1 {
    color: var(--accent);
  }
  .tagline {
    color: var(--text-dim);
  }
  .hint {
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-left: 3px solid var(--accent);
    border-radius: 6px;
    padding: 0.6rem 0.85rem;
    margin-bottom: 1rem;
    font-size: 0.9rem;
  }
  main {
    flex: 1;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 320px;
    gap: 1.5rem;
    align-items: start;
  }
  /* Open trees tile in responsive columns (two-up on wide viewports, stacked on
     narrow); each card owns its own scroll. min-width:0 lets a track shrink below
     its content so a wide tree scrolls inside the card instead of overflowing. */
  .tree-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 0.75rem;
    margin-top: 0.75rem;
  }
  .tree-card {
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg-panel);
    padding: 0.5rem;
    min-width: 0;
  }
  .tree-card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0 0.25rem 0.3rem;
    border-bottom: 1px solid var(--border);
  }
  .tree-card-head h2 {
    margin: 0;
    font-size: 0.95rem;
    color: var(--accent);
  }
  .tree-card-head .close {
    padding: 0.1rem 0.45rem;
    line-height: 1;
  }
  .empty-trees {
    margin-top: 0.75rem;
    padding: 1.25rem;
    border: 1px dashed var(--border);
    border-radius: 6px;
    color: var(--text-dim);
    text-align: center;
  }
  .side {
    display: grid;
    gap: 1rem;
    position: sticky;
    top: 1rem;
  }
  footer {
    margin-top: 2rem;
    padding-top: 1rem;
    border-top: 1px solid var(--border);
  }
  .dim {
    color: var(--text-dim);
    font-size: 0.85rem;
  }

  /* Single column on narrow viewports. */
  @media (max-width: 880px) {
    main {
      grid-template-columns: 1fr;
    }
    .side {
      position: static;
    }
  }
</style>
