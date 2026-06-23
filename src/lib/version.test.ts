import { describe, it, expect } from 'vitest'
import { APP_VERSION, TARGET_GAME_VERSION } from './version'

describe('version', () => {
  it('exposes a semver-ish app version', () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it('exposes a target game version', () => {
    expect(TARGET_GAME_VERSION).toBeTruthy()
  })
})
