import { describe, expect, it } from 'vitest'
import { diffLevel, isBreakingUpgrade, isUpgrade } from '@core/utils/versions'

describe('isBreakingUpgrade', () => {
  it('flags major bumps as breaking', () => {
    expect(isBreakingUpgrade('1.2.5', '2.0.0')).toBe(true)
    expect(isBreakingUpgrade('4.17.15', '5.0.0')).toBe(true)
  })

  it('treats patch and minor bumps as safe', () => {
    expect(isBreakingUpgrade('1.2.5', '1.2.6')).toBe(false)
    expect(isBreakingUpgrade('1.2.5', '1.3.0')).toBe(false)
    expect(isBreakingUpgrade('1.2.5', '1.2.5')).toBe(false)
  })

  it('treats 0.x minor bumps as breaking (caret semantics)', () => {
    expect(isBreakingUpgrade('0.21.1', '0.22.0')).toBe(true)
    expect(isBreakingUpgrade('0.21.1', '0.21.9')).toBe(false)
  })

  it('treats 0.0.x patch bumps as breaking', () => {
    expect(isBreakingUpgrade('0.0.3', '0.0.4')).toBe(true)
    expect(isBreakingUpgrade('0.0.3', '0.0.3')).toBe(false)
  })

  it('handles non-semver versions defensively', () => {
    expect(isBreakingUpgrade('abc', 'def')).toBe(false)
    expect(isBreakingUpgrade('1.0.0', 'not-a-version')).toBe(false)
    expect(isBreakingUpgrade('2.0.0', '1.0.0')).toBe(false) // downgrade: not breaking
  })

  it('handles prerelease and build metadata via semver coercion', () => {
    expect(isBreakingUpgrade('1.0.0-beta.1', '1.0.0')).toBe(false)
    expect(isBreakingUpgrade('1.0.0', '2.0.0-rc.1')).toBe(true)
  })
})

describe('isUpgrade', () => {
  it('compares semantic versions', () => {
    expect(isUpgrade('1.2.5', '1.2.6')).toBe(true)
    expect(isUpgrade('1.2.5', '1.2.5')).toBe(false)
    expect(isUpgrade('1.2.6', '1.2.5')).toBe(false)
  })
})

describe('diffLevel', () => {
  it('classifies version jumps', () => {
    expect(diffLevel('1.2.5', '1.2.6')).toBe('patch')
    expect(diffLevel('1.2.5', '1.9.0')).toBe('minor')
    expect(diffLevel('1.2.5', '2.0.0')).toBe('major')
    expect(diffLevel('git', 'other')).toBe('unknown')
  })
})
