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

  import TreeSelector from './components/TreeSelector.svelte'
  import SkillTree from './components/SkillTree.svelte'
  import AttributePanel from './components/AttributePanel.svelte'
  import EquipmentPanel from './components/EquipmentPanel.svelte'
  import LevelControls from './components/LevelControls.svelte'
  import CharacterSheet from './components/CharacterSheet.svelte'
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

  let activeTreeId = $state(defaultTreeId)
  const activeTree = $derived(dataset.trees.find((t) => t.id === activeTreeId) ?? dataset.trees[0])
  const activeSkills = $derived(
    activeTree.skills.map((k) => skillByKey.get(k)).filter((s) => s != null),
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
</script>

<div class="layout">
  <header>
    <h1>Stoneshard Build Calculator</h1>
    <p class="tagline">
      Plan attributes and skills, see your sheet update live, and share the build.
    </p>
  </header>

  <Notice notes={character.notes} />

  {#if isFresh}
    <p class="hint">
      You have <strong>{character.skillBudget} skill points</strong> to spend. Pick skills in the
      <strong>{activeTree.name}</strong> tree below, allocate attributes, and level up to earn more.
    </p>
  {/if}

  <main>
    <div class="trees">
      <TreeSelector
        trees={sortedTrees}
        {character}
        activeId={activeTreeId}
        onSelect={(id) => (activeTreeId = id)}
      />
      <div class="tree-scroll">
        <SkillTree
          skills={activeSkills}
          {character}
          {scope}
          baseAttributeValue={base}
          {onPick}
          {onRefund}
        />
      </div>
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
  .tree-scroll {
    /* SkillTree owns the scrolling viewport now; this frame must not clip the
       tooltip panel that floats over the right edge. */
    overflow: visible;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg-panel);
    margin-top: 0.75rem;
    padding: 0.5rem;
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
