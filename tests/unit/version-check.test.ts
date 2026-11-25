import { describe, expect, it } from 'vitest'
import {
  analyzeVersionCheckOutput,
  buildVersionCheckCommand
} from '@core/ecosystems/javascript/version-check'

describe('buildVersionCheckCommand', () => {
  it('builds the npm ls equivalent per package manager', () => {
    expect(buildVersionCheckCommand('npm', 'lodash')).toEqual(['npm', 'ls', 'lodash'])
    expect(buildVersionCheckCommand('pnpm', 'lodash')).toEqual(['pnpm', 'ls', 'lodash'])
    expect(buildVersionCheckCommand('yarn', 'lodash')).toEqual(['yarn', 'why', 'lodash'])
    expect(buildVersionCheckCommand('bun', 'lodash')).toEqual(['bun', 'pm', 'ls'])
  })
})

describe('analyzeVersionCheckOutput', () => {
  it('detects the target version in npm ls trees', () => {
    const output = [
      'fixture-npm@1.0.0 /fixture',
      '`-- minimist@1.2.6',
      ''
    ].join('\n')
    expect(analyzeVersionCheckOutput('npm', 'minimist', '1.2.5', '1.2.6', output)).toEqual({
      stillInstalled: false,
      targetInstalled: true
    })
  })

  it('flags the vulnerable version still being installed', () => {
    const output = ['project@1.0.0', '`-- some-parent@2.0.0', '    `-- minimist@1.2.5', ''].join('\n')
    const analysis = analyzeVersionCheckOutput('npm', 'minimist', '1.2.5', '1.2.6', output)
    expect(analysis.stillInstalled).toBe(true)
    expect(analysis.targetInstalled).toBe(false)
  })

  it('does not confuse other packages sharing a version number', () => {
    const output = ['project@1.0.0', '`-- minimist@1.2.6', '`-- other-pkg@1.2.5', ''].join('\n')
    const analysis = analyzeVersionCheckOutput('npm', 'minimist', '1.2.5', '1.2.6', output)
    expect(analysis).toEqual({ stillInstalled: false, targetInstalled: true })
  })

  it('reads pnpm ls name version output', () => {
    const output = ['dependencies:', 'minimist 1.2.6', ''].join('\n')
    expect(analyzeVersionCheckOutput('pnpm', 'minimist', '1.2.5', '1.2.6', output)).toEqual({
      stillInstalled: false,
      targetInstalled: true
    })
  })

  it('reads yarn why output', () => {
    const output = ['=> Found "minimist@1.2.6"', 'info Reasons this module exists', ''].join('\n')
    expect(analyzeVersionCheckOutput('yarn', 'minimist', '1.2.5', '1.2.6', output)).toEqual({
      stillInstalled: false,
      targetInstalled: true
    })
  })

  it('handles scoped package names', () => {
    const output = ['`-- @scope/pkg@2.0.0', ''].join('\n')
    expect(analyzeVersionCheckOutput('npm', '@scope/pkg', '1.0.0', '2.0.0', output)).toEqual({
      stillInstalled: false,
      targetInstalled: true
    })
  })

  it('reports empty output as neither version present', () => {
    expect(analyzeVersionCheckOutput('npm', 'lodash', '4.17.20', '4.17.21', '')).toEqual({
      stillInstalled: false,
      targetInstalled: false
    })
  })
})
