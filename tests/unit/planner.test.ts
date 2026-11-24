import { describe, expect, it } from 'vitest'
import { planRemediation, remediationFileCandidates } from '@core/remediation/planner'
import type { RemediationApplyOptions, ScanReport, ScanSummary } from '@shared/models'

function summary(total: number): ScanSummary {
  return { total, critical: 0, high: 0, medium: 0, low: 0, informational: 0, affectedPackages: 0, fixable: 0 }
}

function report(targets: ScanReport['remediationPlan'], vulnIds: string[] = []): ScanReport {
  return {
    id: 'scan1',
    projectId: 'p1',
    projectName: 'demo',
    projectPath: '/tmp/demo',
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
    summary: summary(vulnIds.length),
    vulnerabilities: vulnIds.map((id) => ({
      id,
      advisoryIds: [id],
      cveIds: [],
      packageName: id.split(':')[0]!,
      installedVersion: '1.0.0',
      fixedVersion: null,
      validatedFixedVersion: null,
      severity: 'high',
      title: id,
      summary: id,
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
    })),
    remediationPlan: targets,
    scanOptions: { includeDev: true, timeoutSeconds: 300, minSeverity: null }
  }
}

const options: RemediationApplyOptions = {
  targetIds: ['t1'],
  ignoreLifecycleScripts: true,
  includeBreaking: false
}

describe('planRemediation', () => {
  it('plans selected safe targets', () => {
    const scan = report({
      packageManager: 'npm',
      targets: [
        {
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
          reason: 'x',
          adjustmentNote: null,
          fixVersionPublishedAt: null,
          breaking: false,
          safe: true,
          resolvesFindings: 1
        }
      ],
      unavailable: [],
      coveredFindingCount: 1,
      totalFindingCount: 1
    })

    const plan = planRemediation(scan, options)
    expect(plan.actions).toHaveLength(1)
    expect(plan.actions[0]!.command).toBe('npm install minimist@1.2.6')
    expect(plan.actions[0]!.argv).toEqual([['npm', 'install', '--ignore-scripts', 'minimist@1.2.6']])
    expect(plan.breakingCount).toBe(0)
    expect(plan.filesToBackup).toContain('/tmp/demo/package.json')
    expect(plan.filesToBackup).toContain('/tmp/demo/package-lock.json')
  })

  it('refuses breaking targets without explicit opt-in', () => {
    const scan = report({
      packageManager: 'npm',
      targets: [
        {
          id: 't1',
          package: 'parent',
          registryName: null,
          currentVersion: '2.0.0',
          targetVersion: '3.0.0',
          kind: 'parent-upgrade',
          severity: 'high',
          urgent: true,
          isDev: false,
          workspaces: [],
          childPackage: null,
          reason: 'x',
          adjustmentNote: null,
          fixVersionPublishedAt: null,
          breaking: true,
          safe: false,
          resolvesFindings: 1
        }
      ],
      unavailable: [],
      coveredFindingCount: 1,
      totalFindingCount: 1
    })

    expect(() => planRemediation(scan, options)).toThrow(/breaking/i)
    expect(() => planRemediation(scan, { ...options, includeBreaking: true })).not.toThrow()
  })

  it('rejects empty selections', () => {
    const scan = report({
      packageManager: 'npm',
      targets: [],
      unavailable: [],
      coveredFindingCount: 0,
      totalFindingCount: 0
    })
    expect(() => planRemediation(scan, { ...options, targetIds: [] })).toThrow(/No targets selected/)
  })

  it('rejects unknown target ids', () => {
    const scan = report({
      packageManager: 'npm',
      targets: [],
      unavailable: [],
      coveredFindingCount: 0,
      totalFindingCount: 0
    })
    expect(() => planRemediation(scan, { ...options, targetIds: ['does-not-exist'] })).toThrow(/No targets selected/)
  })

  it('throws when no plan exists', () => {
    const scan = report(null)
    expect(() => planRemediation(scan, options)).toThrow(/No remediation plan/)
  })

  it('throws when a command cannot be built', () => {
    const scan = report({
      packageManager: 'npm',
      targets: [
        {
          id: 't1',
          package: '-weird',
          registryName: null,
          currentVersion: '1.0.0',
          targetVersion: '1.0.1',
          kind: 'direct',
          severity: 'high',
          urgent: true,
          isDev: false,
          workspaces: [],
          childPackage: null,
          reason: 'x',
          adjustmentNote: null,
          fixVersionPublishedAt: null,
          breaking: false,
          safe: true,
          resolvesFindings: 1
        }
      ],
      unavailable: [],
      coveredFindingCount: 1,
      totalFindingCount: 1
    })
    expect(() => planRemediation(scan, options)).toThrow(/No executable command/)
  })
})

describe('remediationFileCandidates', () => {
  it('covers all package manager state files', () => {
    const files = remediationFileCandidates('/proj')
    expect(files).toContain('/proj/package.json')
    expect(files).toContain('/proj/package-lock.json')
    expect(files).toContain('/proj/pnpm-lock.yaml')
    expect(files).toContain('/proj/yarn.lock')
    expect(files).toContain('/proj/.npmrc')
  })
})
