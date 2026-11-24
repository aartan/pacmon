import { describe, expect, it } from 'vitest'
import { diffScans, vulnerabilityKey } from '@core/remediation/verifier'
import type { ScanReport, Vulnerability } from '@shared/models'

function vuln(id: string, packageName: string, version: string, advisoryIds: string[]): Vulnerability {
  return {
    id,
    advisoryIds,
    cveIds: [],
    packageName,
    installedVersion: version,
    fixedVersion: null,
    validatedFixedVersion: null,
    severity: 'high',
    title: `${packageName} issue`,
    summary: 'summary',
    description: null,
    references: [],
    cvssVector: null,
    cvssScore: null,
    epssScore: null,
    epssPercentile: null,
    dependencyKind: 'direct',
    dependencyPaths: [],
    isDev: false,
    importedInSource: null,
    fixVersionPublishedAt: null,
    cooldownWarning: null,
    recommendedAction: null,
    runnableFixCommand: null,
    remediation: { type: 'unavailable', targetVersion: null, breaking: false, autoFixable: false, reason: null }
  }
}

function report(vulns: Vulnerability[]): ScanReport {
  return {
    id: 'scan',
    projectId: 'p1',
    projectName: 'demo',
    projectPath: '/demo',
    ecosystem: 'javascript',
    packageManager: 'npm',
    lockfileSource: 'package-lock.json',
    mode: 'resolved-lockfile',
    scannedAt: '2026-01-01T00:00:00Z',
    durationMs: 1,
    engineVersion: '1.42.0',
    complete: true,
    diagnostics: [],
    warnings: [],
    notes: [],
    packageCount: 0,
    summary: { total: 0, critical: 0, high: 0, medium: 0, low: 0, informational: 0, affectedPackages: 0, fixable: 0 },
    vulnerabilities: vulns,
    remediationPlan: null,
    scanOptions: { includeDev: true, timeoutSeconds: 300, minSeverity: null }
  }
}

describe('vulnerabilityKey', () => {
  it('is stable across version changes', () => {
    const a = vuln('x', 'minimist', '1.2.5', ['GHSA-1'])
    const b = vuln('y', 'minimist', '1.2.6', ['GHSA-1'])
    expect(vulnerabilityKey(a)).toBe(vulnerabilityKey(b))
  })

  it('distinguishes packages and advisories', () => {
    expect(vulnerabilityKey(vuln('a', 'lodash', '1.0.0', ['GHSA-1']))).not.toBe(
      vulnerabilityKey(vuln('b', 'minimist', '1.0.0', ['GHSA-1']))
    )
  })
})

describe('diffScans', () => {
  it('reports resolved, remaining, and introduced findings', () => {
    const before = report([
      vuln('v1', 'minimist', '1.2.5', ['GHSA-minimist']),
      vuln('v2', 'lodash', '4.17.15', ['GHSA-lodash'])
    ])
    const after = report([
      vuln('v2b', 'lodash', '4.17.21', ['GHSA-lodash']),
      vuln('v3', 'express', '4.17.0', ['GHSA-express'])
    ])

    const diff = diffScans(before, after)
    expect(diff.resolvedIds).toEqual(['v1'])
    expect(diff.remainingIds).toEqual(['v2'])
    expect(diff.introducedIds).toEqual(['v3'])
  })

  it('reports nothing when scans are identical', () => {
    const before = report([vuln('v1', 'minimist', '1.2.5', ['GHSA-minimist'])])
    const after = report([vuln('v1b', 'minimist', '1.2.5', ['GHSA-minimist'])])
    const diff = diffScans(before, after)
    expect(diff.resolvedIds).toEqual([])
    expect(diff.remainingIds).toEqual(['v1'])
    expect(diff.introducedIds).toEqual([])
  })

  it('treats a fully cleared scan as resolving everything', () => {
    const before = report([vuln('v1', 'minimist', '1.2.5', ['GHSA-minimist'])])
    const after = report([])
    const diff = diffScans(before, after)
    expect(diff.resolvedIds).toEqual(['v1'])
    expect(diff.summaryAfter.total).toBe(0)
  })
})
