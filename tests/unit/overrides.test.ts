import { describe, expect, it } from 'vitest'
import {
  applyOverridesToManifest,
  collectOverrideEntries,
  overrideFieldFor,
  overrideKeyValues,
  stringifyManifest
} from '@core/remediation/overrides'
import type { ScanReport, Vulnerability } from '@shared/models'

function finding(partial: Partial<Vulnerability>): Vulnerability {
  return {
    ...partial,
    id: `${partial.packageName}@${partial.installedVersion}`,
    advisoryIds: ['GHSA-test'],
    cveIds: [],
    packageName: partial.packageName ?? 'pkg',
    installedVersion: partial.installedVersion ?? '1.0.0',
    fixedVersion: partial.fixedVersion ?? null,
    validatedFixedVersion: partial.validatedFixedVersion ?? null,
    severity: partial.severity ?? 'high',
    title: 't',
    summary: 's',
    description: null,
    references: [],
    cvssVector: null,
    cvssScore: null,
    epssScore: null,
    epssPercentile: null,
    dependencyKind: partial.dependencyKind ?? 'transitive',
    dependencyPaths: [],
    isDev: false,
    importedInSource: null,
    fixVersionPublishedAt: null,
    cooldownWarning: null,
    recommendedAction: null,
    runnableFixCommand: null,
    remediation: partial.remediation ?? {
      type: 'unavailable',
      targetVersion: null,
      breaking: false,
      autoFixable: false,
      reason: null
    }
  }
}

function scan(vulns: Vulnerability[]): ScanReport {
  return {
    id: 'scan-1',
    projectId: 'p1',
    projectName: 'proj',
    projectPath: '/proj',
    ecosystem: 'javascript',
    packageManager: 'npm',
    lockfileSource: null,
    mode: null,
    scannedAt: new Date().toISOString(),
    durationMs: 1,
    engineVersion: 'x',
    complete: true,
    diagnostics: [],
    warnings: [],
    notes: [],
    packageCount: 1,
    summary: { total: vulns.length, critical: 0, high: 0, medium: 0, low: 0, informational: 0, affectedPackages: 1, fixable: 0 },
    vulnerabilities: vulns,
    remediationPlan: null,
    scanOptions: { includeDev: true, timeoutSeconds: 300, minSeverity: null }
  }
}

describe('overrideFieldFor', () => {
  it('maps package managers to their override field', () => {
    expect(overrideFieldFor('npm')).toBe('overrides')
    expect(overrideFieldFor('bun')).toBe('overrides')
    expect(overrideFieldFor('yarn')).toBe('resolutions')
    expect(overrideFieldFor('pnpm')).toBe('pnpm.overrides')
  })
})

describe('collectOverrideEntries', () => {
  it('collects only transitive findings with a fixed version', () => {
    const vulns = [
      finding({ packageName: 'lodash', installedVersion: '4.17.20', validatedFixedVersion: '4.17.21' }),
      finding({ packageName: 'lodash', installedVersion: '4.17.19', validatedFixedVersion: '4.17.21', severity: 'critical' }),
      finding({ packageName: 'minimist', installedVersion: '1.2.5', validatedFixedVersion: '1.2.6' }),
      // direct dependency: handled by the normal flow
      finding({ packageName: 'express', installedVersion: '4.0.0', validatedFixedVersion: '4.1.0', dependencyKind: 'direct' }),
      // transitive with an in-range fix path: override still offered if it remains
      finding({
        packageName: 'brace-expansion',
        installedVersion: '1.1.0',
        validatedFixedVersion: '2.0.0',
        remediation: { type: 'transitive-update', targetVersion: '2.0.0', breaking: false, autoFixable: true, reason: null }
      }),
      // transitive without a fixed version: nothing to override
      finding({ packageName: 'mystery', installedVersion: '0.1.0', validatedFixedVersion: null, fixedVersion: null }),
      // already at the fixed version
      finding({ packageName: 'ok-pkg', installedVersion: '2.0.0', validatedFixedVersion: '2.0.0' })
    ]

    const entries = collectOverrideEntries(scan(vulns))
    expect(entries.map((e) => `${e.package}@${e.from}`)).toEqual([
      'brace-expansion@1.1.0',
      'lodash@4.17.19',
      'lodash@4.17.20',
      'minimist@1.2.5'
    ])
    expect(entries.find((e) => e.package === 'lodash' && e.from === '4.17.19')!.to).toBe('4.17.21')
  })

  it('leaves other versions of the same package untouched', () => {
    const vulns = [finding({ packageName: 'lodash', installedVersion: '4.17.20', validatedFixedVersion: '4.17.21' })]
    const entries = collectOverrideEntries(scan(vulns))
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ package: 'lodash', from: '4.17.20', to: '4.17.21' })
  })
})

describe('overrideKeyValues', () => {
  const entry = { package: 'lodash', from: '4.17.20', to: '4.17.21', severity: 'high' as const, resolvesFindings: 1 }

  it('renders the flat pkg@version key for every manager', () => {
    expect(overrideKeyValues(entry, 'overrides')).toEqual({ keys: ['lodash@4.17.20'], value: '4.17.21' })
    expect(overrideKeyValues(entry, 'resolutions')).toEqual({ keys: ['lodash@4.17.20'], value: '4.17.21' })
    expect(overrideKeyValues(entry, 'pnpm.overrides')).toEqual({ keys: ['lodash@4.17.20'], value: '4.17.21' })
  })
})

describe('applyOverridesToManifest', () => {
  it('writes npm overrides as flat version-scoped keys', () => {
    const manifest = { name: 'demo', dependencies: { lodash: '^4.0.0' } }
    const patch = applyOverridesToManifest(
      manifest,
      [{ package: 'lodash', from: '4.17.20', to: '4.17.21', severity: 'high', resolvesFindings: 1 }],
      'overrides'
    )
    expect(patch.manifest.overrides).toEqual({ 'lodash@4.17.20': '4.17.21' })
  })

  it('preserves existing overrides and adds new version-scoped keys', () => {
    const manifest = {
      overrides: { lodash: '4.17.21', 'left-pad': '1.1.0' }
    }
    const patch = applyOverridesToManifest(
      manifest,
      [{ package: 'lodash', from: '4.17.20', to: '4.17.21', severity: 'high', resolvesFindings: 1 }],
      'overrides'
    )
    expect(patch.manifest.overrides).toEqual({
      lodash: '4.17.21',
      'left-pad': '1.1.0',
      'lodash@4.17.20': '4.17.21'
    })
    expect(patch.preservesExisting).toBe(0)
  })

  it('updates an existing version-scoped key in place', () => {
    const manifest = { overrides: { 'lodash@4.17.20': '4.17.20' } }
    const patch = applyOverridesToManifest(
      manifest,
      [{ package: 'lodash', from: '4.17.20', to: '4.17.21', severity: 'high', resolvesFindings: 1 }],
      'overrides'
    )
    expect(patch.manifest.overrides).toEqual({ 'lodash@4.17.20': '4.17.21' })
    expect(patch.preservesExisting).toBe(1)
  })

  it('writes pnpm overrides under pnpm.overrides with flat keys', () => {
    const manifest = { name: 'demo' }
    const patch = applyOverridesToManifest(
      manifest,
      [{ package: 'lodash', from: '4.17.20', to: '4.17.21', severity: 'high', resolvesFindings: 1 }],
      'pnpm.overrides'
    )
    expect(patch.manifest.pnpm).toEqual({ overrides: { 'lodash@4.17.20': '4.17.21' } })
  })

  it('writes yarn resolutions with flat keys', () => {
    const manifest = { name: 'demo' }
    const patch = applyOverridesToManifest(
      manifest,
      [{ package: 'lodash', from: '4.17.20', to: '4.17.21', severity: 'high', resolvesFindings: 1 }],
      'resolutions'
    )
    expect(patch.manifest.resolutions).toEqual({ 'lodash@4.17.20': '4.17.21' })
  })

  it('serialises with 2-space indentation and trailing newline', () => {
    const manifest = { name: 'demo' }
    const patch = applyOverridesToManifest(manifest, [], 'overrides')
    const text = stringifyManifest(patch.manifest)
    expect(text).toBe('{\n  "name": "demo",\n  "overrides": {}\n}\n')
  })
})
