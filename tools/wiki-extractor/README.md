# Wiki extractor (`tools/wiki-extractor/`)

Dev-time refresh of the vendored item snapshot under
[`vendor/stoneshard-wiki/`](../../vendor/stoneshard-wiki/). This is the **primary**
item-data source (KTD1): the official [Stoneshard wiki](https://stoneshard.com/wiki)
publishes parser-generated, machine-readable "datastrings" for weapons and armor,
generated from the game files and bulk-refreshed each patch — game-file fidelity
that, unlike the UMT pipeline in [`../umt-exporter/`](../umt-exporter/), needs no
Windows/Steam/UndertaleModTool and is runnable here.

> **Network, dev-only.** Like `npm run bootstrap`, this fetches once at refresh
> time and pins the result. Builds and CI read the committed snapshot, never the
> live network (KTD3). Re-run per patch when the wiki updates.

## Running

```bash
npm run vendor:wiki        # fetch + vendor the raw datastrings + manifest
npm run vendor:item-icons  # fetch + vendor item icons → public/img/items/ (M3 U6)
npm run transform-items    # vendored snapshot → src/data/items.json (sets item.icon)
npm run validate-data      # gate the result
```

`fetch-icons.ts` resolves each item's sprite by display name via the MediaWiki
`Special:FilePath/<Item Name>.png` endpoint (name-keyed; item names are unique),
vendors the present ones under `public/img/items/<key>.png`, and writes a
provenance manifest. Items with no wiki art are omitted and fall back to the
`Icon.svelte` glyph — the same posture as the ability icons. `transform-items`
then sets `item.icon` for every key whose file landed in `public/img/items/`.

`fetch.ts` pulls each [Data page](https://stoneshard.com/wiki/Data) via the
MediaWiki `?action=raw` endpoint (the REST `api.php` is disabled on this wiki),
records the page's current revision id + timestamp from `Special:Export` for exact
provenance, sanity-parses each blob so a malformed fetch fails before it is
written, and writes `vendor/stoneshard-wiki/*.wikitext` plus a checksum
`manifest.json`.

## Datastring format

Each page is a MediaWiki template (see
[`src/lib/data/wiki-datastring.ts`](../../src/lib/data/wiki-datastring.ts) for the
parser):

- A `<noinclude>` block documents the column order: a numeric-index row followed
  by a named-header row.
- An `<includeonly>{{#switch: {{{1}}} … }}` block holds one case per item:
  `|<Item Name>=v0;v1;…;<Description>`, `;`-delimited and positional, empty cells
  as consecutive `;`, free-text Description last, `|#default=…` closing the switch.

We map every cell to its header **label**, never by blind position, and **fail
loudly on any header/column-count mismatch** so a patch that adds or reorders
columns surfaces as a hard error instead of silently misaligning fields (KTD5).
The Armor data page omits the leading `Tier` label (its numeric index starts at
1), so its rows carry one more cell than the named header; the parser restores
`Tier` explicitly (`leadingColumns`), and fails loudly if the wiki ever fixes the
header upstream.

## Fallback

The wiki is bulk-updated by one maintainer and can trail a patch (KTD2). When a
column looks suspect or stale, regenerate the same items from the game files via
the UMT / ModShardLauncher path documented in [`../README.md`](../README.md) and
diff. No UMT code is wired here — it is the documented tiebreaker, not a build
dependency.

## Pages vendored

Defined in [`src/lib/data/wiki-pages.ts`](../../src/lib/data/wiki-pages.ts):

- **Weapon data** — 70 columns; every row is a `weapon`.
- **Armor data** — 94 columns (after the `Tier` restore); split per-row `Slot`
  into `armor` (shields, headgear, chestpieces, gloves, boots, cloaks) and
  `accessory` (amulets, rings, belts).

Jewelry has no separate page (it lives in Armor data); consumables, books, enemy,
and the skill-data pages are out of scope for M2.
