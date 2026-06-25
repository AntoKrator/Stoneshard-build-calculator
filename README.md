# Stoneshard Build Calculator

Live version: https://antokrator.github.io/Stoneshard-build-calculator/

A complete, up-to-date **build** calculator for [Stoneshard](https://stoneshard.com/) — going
beyond skill-point allocation to model the whole character:

- **Attributes** (STR / AGI / PER / VIT / WIL) and the **full derived stat sheet**
- **Skill trees** (189 skills across Weaponry, Utility and Sorcery) with tiers & prerequisites
- **Equipment / gear** feeding the stat sheet
- **Enchantments & legendary items** (the _Ancient Echoes_ system)
- **DPS / survivability** estimates and **side-by-side build comparison**
- Shareable builds via a compact URL code

> ⚠️ Unofficial fan-made tool. Not affiliated with Ink Stains Games. All game data and assets are
> the property of their respective owners.

## Status

Early development. See the [roadmap](#roadmap) below. The app currently scaffolds a
Svelte + TypeScript + Vite project; the calculator UI is being built out in phases.

## Tech stack

- [Svelte 5](https://svelte.dev/) + TypeScript + [Vite](https://vite.dev/)
- [Vitest](https://vitest.dev/) for unit tests
- ESLint + Prettier
- [Zod](https://zod.dev/) for data-schema validation
- Deployed to GitHub Pages

## Development

```bash
npm install        # install dependencies
npm run dev        # start the dev server
npm run build      # production build (outputs to dist/)
npm run preview    # preview the production build
npm test           # run unit tests
npm run check      # type-check Svelte + TS
npm run lint       # lint
npm run format     # format with Prettier
```

## Game data

Game data lives in `src/data/` as normalized, validated JSON. Two sources keep it current:

1. **Bootstrap** — `npm run bootstrap` imports and transforms the already-extracted data from the
   [nstratos talent calculator](https://github.com/nstratos/stoneshard-talent-calculator) (skills,
   tooltips, formulas, unlock requirements, icons) into our schema, for a fast head start.
2. **Own extraction** — `tools/umt-exporter/` contains UndertaleModTool scripts that extract data
   (skills, items, enchantments, attribute→stat formulas) directly from the game's `data.win`, so
   the dataset can be refreshed independently on each patch. See `tools/README.md`.

`npm run validate-data` runs the Zod schema gate over the dataset (also enforced in CI). The
bootstrap reads a vendored, checksum-pinned snapshot under `vendor/nstratos/`, so it runs offline
and reproducibly.

## Deployment

CI (`.github/workflows/deploy.yml`) runs lint, type-check, tests, and `validate-data` on every push
and pull request. On a push to `main` that passes, it builds and deploys to GitHub Pages via the
artifact workflow (SHA-pinned actions; the OIDC deploy token is scoped to the deploy job only).

**One-time setup:** in the repo's **Settings → Pages**, set **Source** to **GitHub Actions**. The
workflow cannot do this itself; without it the deploy job has nowhere to publish.

## Roadmap

- **Phase 0** — Scaffold + data foundation (schema, validation, bootstrap, UMT skeleton, CI)
- **Phase 1** — Talents + attributes + formula engine + share codes (parity with the reference tool)
- **Phase 2** — Full derived stat sheet
- **Phase 3** — Equipment / gear
- **Phase 4** — Enchantments & legendaries
- **Phase 5** — DPS, survivability & build comparison
- **Phase 6** — Polish

## Credits

- The data-extraction approach and any reused **code** come from the
  [**nstratos/stoneshard-talent-calculator**](https://github.com/nstratos/stoneshard-talent-calculator),
  whose code is MIT licensed (© 2025 Stratos Neiros) — huge thanks for the open tooling and UMT
  exporter. Where we reuse their code, their MIT notice is preserved in [`NOTICE.md`](./NOTICE.md).
- The **game data and icons** are the property of [Ink Stains Games](https://stoneshard.com/) — they
  are _not_ MIT-licensed assets. We reuse them under the same non-commercial fair-use assumption
  nstratos documents, not a clean redistribution license. See [`NOTICE.md`](./NOTICE.md) and the
  in-app disclaimer. Stoneshard is developed by Ink Stains Games.

## License

[MIT](./LICENSE)
