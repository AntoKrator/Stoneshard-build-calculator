import { describe, it, expect } from 'vitest'
import { iconSrc } from './icon'

describe('iconSrc — base-path resolution (R9)', () => {
  it('joins a repo-relative icon under the dev base', () => {
    expect(iconSrc('img/abilities/swords/Cleaving_Strike.png', './')).toBe(
      './img/abilities/swords/Cleaving_Strike.png',
    )
  })

  it('joins under a GitHub Pages project base, never as an absolute path', () => {
    expect(iconSrc('img/abilities/maces/Crush.png', '/stoneshard-calc/')).toBe(
      '/stoneshard-calc/img/abilities/maces/Crush.png',
    )
  })

  it('strips a leading slash so the icon never escapes the base', () => {
    expect(iconSrc('/img/abilities/x.png', '/repo/')).toBe('/repo/img/abilities/x.png')
  })

  it('tolerates a base without a trailing slash', () => {
    expect(iconSrc('img/x.png', '/repo')).toBe('/repo/img/x.png')
  })
})
