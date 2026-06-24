import { defineConfig } from 'vitest/config'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// https://vite.dev/config/
export default defineConfig({
  // Relative base so the build works under a GitHub Pages project path
  // (https://<user>.github.io/<repo>/) without hardcoding the repo name.
  base: './',
  plugins: [svelte()],
  test: {
    // Pure logic (formula engine, codec, ledger) runs in node; component
    // tests opt into jsdom with a `// @vitest-environment jsdom` header.
    environment: 'node',
    globals: true,
    // Pure logic + components live in src/; dev-pipeline helpers (checksum,
    // item transform) live in scripts/ and are unit-tested there too.
    include: ['src/**/*.{test,spec}.{ts,js}', 'scripts/**/*.{test,spec}.{ts,js}'],
  },
})
