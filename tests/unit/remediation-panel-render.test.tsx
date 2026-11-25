// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import { RemediationPanel } from '@renderer/components/remediation/remediation-panel'
import type { ProjectInfo, ScanReport, Severity, Vulnerability } from '@shared/models'

const project: ProjectInfo = {
  id: 'p1',
  name: 'demo-app',
  path: '/demo',
  ecosystem: 'javascript',
  ecosystemLabel: 'JavaScript',
  packageManager: 'npm',
  lockfile: 'package-lock.json',
  lastScanAt: null,
  lastScanSummary: null,
  lastRemediatedAt: null
}

function transitiveFinding(pkg: string, installed: string, fixed: string): Vulnerability {
  return {
    id: `GHSA-x:${pkg}@${installed}`,
    advisoryIds: ['GHSA-x'],
    cveIds: [],
    packageName: pkg,
    installedVersion: installed,
    fixedVersion: fixed,
    validatedFixedVersion: fixed,
    severity: 'high',
    title: 't',
    summary: 's',
    description: null,
    references: [],
    cvssVector: null,
    cvssScore: null,
    epssScore: null,
    epssPercentile: null,
    dependencyKind: 'transitive',
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

function scan(vulns: Vulnerability[]): ScanReport {
  return {
    id: 'scan-1',
    projectId: 'p1',
    projectName: 'demo-app',
    projectPath: '/demo',
    ecosystem: 'javascript',
    packageManager: 'npm',
    lockfileSource: null,
    mode: null,
    scannedAt: '2026-11-24T00:00:00Z',
    durationMs: 10,
    engineVersion: '1.42.0',
    complete: true,
    diagnostics: [],
    warnings: [],
    notes: [],
    packageCount: 4,
    summary: {
      total: vulns.length,
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      informational: 0,
      affectedPackages: 1,
      fixable: 0
    },
    vulnerabilities: vulns,
    remediationPlan: {
      packageManager: 'npm',
      targets: [],
      unavailable: [],
      coveredFindingCount: 0,
      totalFindingCount: vulns.length
    },
    scanOptions: { includeDev: true, timeoutSeconds: 300, minSeverity: null as Severity | null }
  }
}

describe('RemediationPanel', () => {
  it('offers the transitive override toggle as soon as the scan has transitive findings', () => {
    const html = renderToString(
      <RemediationPanel
        report={scan([transitiveFinding('lodash', '4.17.20', '4.17.21')])}
        project={project}
        defaultIgnoreScripts
        onCompleted={() => {}}
      />
    )
    expect(html).toContain('Include transitive dependencies in fix')
    expect(html).toContain('npm install')
    expect(html).toContain('Verify with tests')
    expect(html).toContain('Commit to a new branch')
  })

  it('keeps the override option for scans without a remediation plan', () => {
    const report = scan([transitiveFinding('minimist', '1.2.5', '1.2.6')])
    report.remediationPlan = null
    const html = renderToString(
      <RemediationPanel report={report} project={project} defaultIgnoreScripts onCompleted={() => {}} />
    )
    expect(html).toContain('Include transitive dependencies in fix')
  })

  it('hides the override option when there are no transitive findings', () => {
    const direct = {
      ...transitiveFinding('express', '4.0.0', '4.1.0'),
      dependencyKind: 'direct' as const
    }
    const html = renderToString(
      <RemediationPanel report={scan([direct])} project={project} defaultIgnoreScripts onCompleted={() => {}} />
    )
    expect(html).not.toContain('Include transitive dependencies in fix')
  })
})
