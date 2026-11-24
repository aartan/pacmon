import { describe, expect, it } from 'vitest'
import {
  buildApplyCommands,
  commandPackageName,
  displayCommand,
  installPackageSpec
} from '@core/ecosystems/javascript/commands'
import type { RemediationTarget } from '@shared/models'

function target(overrides: Partial<RemediationTarget> = {}): RemediationTarget {
  return {
    id: 't1',
    package: 'minimist',
    registryName: null,
    currentVersion: '1.2.5',
    targetVersion: '1.2.6',
    kind: 'direct',
    severity: 'critical',
    urgent: true,
    isDev: false,
    workspaces: [],
    childPackage: null,
    reason: 'test',
    adjustmentNote: null,
    fixVersionPublishedAt: null,
    breaking: false,
    safe: true,
    resolvesFindings: 1,
    ...overrides
  }
}

describe('installPackageSpec', () => {
  it('builds a plain spec', () => {
    expect(installPackageSpec(target())).toBe('minimist@1.2.6')
  })

  it('preserves npm aliases via registryName', () => {
    expect(installPackageSpec(target({ package: 'my-lodash', registryName: 'lodash' }))).toBe(
      'my-lodash@npm:lodash@1.2.6'
    )
  })
})

describe('buildApplyCommands — direct installs', () => {
  it('npm', () => {
    expect(buildApplyCommands('npm', target(), { ignoreScripts: false })).toEqual([
      ['npm', 'install', 'minimist@1.2.6']
    ])
  })

  it('npm dev dependency', () => {
    expect(buildApplyCommands('npm', target({ isDev: true }), { ignoreScripts: false })).toEqual([
      ['npm', 'install', '-D', 'minimist@1.2.6']
    ])
  })

  it('npm with ignore-scripts', () => {
    expect(buildApplyCommands('npm', target(), { ignoreScripts: true })).toEqual([
      ['npm', 'install', '--ignore-scripts', 'minimist@1.2.6']
    ])
  })

  it('pnpm', () => {
    expect(buildApplyCommands('pnpm', target(), { ignoreScripts: false })).toEqual([
      ['pnpm', 'add', 'minimist@1.2.6']
    ])
  })

  it('pnpm workspace filter', () => {
    expect(buildApplyCommands('pnpm', target({ workspaces: ['packages/a'] }), { ignoreScripts: false })).toEqual([
      ['pnpm', '--filter', './packages/a', 'add', 'minimist@1.2.6']
    ])
  })

  it('yarn classic uses --ignore-scripts', () => {
    expect(buildApplyCommands('yarn', target(), { ignoreScripts: true, yarnMajor: 1 })).toEqual([
      ['yarn', 'add', '--ignore-scripts', 'minimist@1.2.6']
    ])
  })

  it('yarn berry uses --mode=skip-builds', () => {
    expect(buildApplyCommands('yarn', target(), { ignoreScripts: true, yarnMajor: 3 })).toEqual([
      ['yarn', 'add', '--mode=skip-builds', 'minimist@1.2.6']
    ])
  })

  it('yarn workspace form', () => {
    expect(buildApplyCommands('yarn', target({ workspaces: ['packages/a'] }), { ignoreScripts: false })).toEqual([
      ['yarn', 'workspace', 'packages/a', 'add', 'minimist@1.2.6']
    ])
  })

  it('bun', () => {
    expect(buildApplyCommands('bun', target(), { ignoreScripts: false })).toEqual([
      ['bun', 'add', 'minimist@1.2.6']
    ])
  })

  it('refuses option-shaped package names', () => {
    expect(buildApplyCommands('npm', target({ package: '-evil' }), { ignoreScripts: false })).toEqual([])
  })
})

describe('buildApplyCommands — parent updates', () => {
  const parent = target({ kind: 'parent-update', package: 'parent-pkg', childPackage: 'minimist', targetVersion: '1.0.0' })

  it('names the child package for npm update', () => {
    expect(commandPackageName(parent)).toBe('minimist')
    expect(buildApplyCommands('npm', parent, { ignoreScripts: false })).toEqual([['npm', 'update', 'minimist']])
  })

  it('pnpm recursive no-save update', () => {
    expect(buildApplyCommands('pnpm', parent, { ignoreScripts: false })).toEqual([
      ['pnpm', 'update', '--recursive', '--no-save', 'minimist']
    ])
  })

  it('yarn upgrade', () => {
    expect(buildApplyCommands('yarn', parent, { ignoreScripts: false })).toEqual([['yarn', 'upgrade', 'minimist']])
  })

  it('bun update', () => {
    expect(buildApplyCommands('bun', parent, { ignoreScripts: false })).toEqual([['bun', 'update', 'minimist']])
  })
})

describe('displayCommand', () => {
  it('renders a human-readable command', () => {
    expect(displayCommand('npm', target())).toBe('npm install minimist@1.2.6')
    expect(displayCommand('yarn', target())).toBe('yarn add minimist@1.2.6')
  })
})
