import { describe, expect, it } from 'vitest'
import { normalizeScanJson, type CveLiteScanJson } from '@core/ecosystems/javascript/normalize'
import type { ScanOptions } from '@shared/models'

const scanOptions: ScanOptions = { includeDev: true, timeoutSeconds: 300, minSeverity: null }

function baseJson(overrides: Partial<CveLiteScanJson> = {}): CveLiteScanJson {
  return {
    projectPath: 'demo',
    mode: 'resolved-lockfile',
    source: 'package-lock',
    packageCount: 2,
    findingCount: 2,
    status: 'ok',
    complete: true,
    diagnostics: [],
    suggestedFixCommands: {
      command: 'npm install minimist@1.2.6',
      coveredFindingCount: 1,
      packageManager: 'npm',
      sections: [],
      skipped: [
        { package: 'lodash', version: '4.17.15', relationship: 'direct', reason: 'No safe upgrade known.' }
      ],
      sourceLabel: 'test',
      targets: [
        {
          package: 'minimist',
          currentVersion: '1.2.5',
          targetVersion: '1.2.6',
          scannedVersions: 1,
          knownVulnerableVersions: 0,
          advisoryVersion: '1.2.6',
          kind: 'direct',
          urgent: true,
          severity: 'critical',
          adjusted: false,
          adjustmentNote: null,
          reason: 'Direct upgrade target for minimist@1.2.5',
          usage: null,
          isDev: false,
          fixVersionPublishedAt: '2022-03-22T02:50:30.352Z'
        }
      ],
      totalFindingCount: 2
    },
    notes: [],
    warnings: [],
    skippedDependencies: [],
    findings: [
      {
        package: 'minimist',
        version: '1.2.5',
        severity: 'critical',
        relationship: 'direct',
        dev: false,
        firstFixedVersion: '1.2.6',
        validatedFirstFixedVersion: '1.2.6',
        fixVersionValidationNote: null,
        fixVersionPublishedAt: '2022-03-22T02:50:30.352Z',
        cooldownWarning: null,
        validatedTargetScannedVersions: 1,
        validatedTargetKnownVulnerableVersions: 0,
        recommendedAction: 'Upgrade minimist to 1.2.6+ in this project.',
        runnableFixCommand: 'npm install minimist@1.2.6',
        primaryParent: null,
        rootDependencies: [],
        recommendedParentUpgrade: null,
        parentUpgradeBlockers: null,
        recommendedNpmTransitiveRemediation: null,
        chainResolution: null,
        cves: ['CVE-2021-44906'],
        epssScores: [{ cve: 'CVE-2021-44906', epss: 0.04581, percentile: 0.91765 }],
        prioritySignal: 'fix_now',
        contextualSignals: null,
        dependencyPaths: [['project', 'minimist']],
        usage: null,
        maliciousUnverifiable: false,
        maliciousGitSource: false,
        maliciousGitSourcePinned: false,
        unresolvedAdvisoryIds: [],
        vulnerabilities: [
          {
            id: 'GHSA-xvch-5gv4-984h',
            aliases: ['CVE-2021-44906'],
            summary: 'Prototype Pollution in minimist',
            severity: 'critical',
            cvssScore: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H'
          }
        ]
      },
      {
        package: 'lodash',
        version: '4.17.15',
        severity: 'high',
        relationship: 'transitive',
        dev: false,
        firstFixedVersion: '4.17.21',
        validatedFirstFixedVersion: null,
        fixVersionValidationNote: 'Could not validate a fix version.',
        fixVersionPublishedAt: null,
        cooldownWarning: null,
        validatedTargetScannedVersions: null,
        validatedTargetKnownVulnerableVersions: null,
        recommendedAction: 'Upgrade the dependency that pulls in lodash.',
        runnableFixCommand: null,
        primaryParent: 'some-parent',
        rootDependencies: ['some-parent'],
        recommendedParentUpgrade: null,
        parentUpgradeBlockers: null,
        recommendedNpmTransitiveRemediation: null,
        chainResolution: null,
        cves: [],
        epssScores: null,
        prioritySignal: null,
        contextualSignals: null,
        dependencyPaths: [['project', 'some-parent', 'lodash']],
        usage: null,
        maliciousUnverifiable: false,
        maliciousGitSource: false,
        maliciousGitSourcePinned: false,
        unresolvedAdvisoryIds: [],
        vulnerabilities: [
          { id: 'GHSA-aaaa-bbbb-cccc', aliases: [], summary: 'Something in lodash', severity: 'high', cvssScore: null }
        ]
      }
    ],
    cliVersion: '1.42.0',
    scannedAt: '2026-11-24T20:00:00.000Z',
    ...overrides
  }
}

const options = {
  reportId: 'r1',
  projectId: 'p1',
  projectName: 'demo',
  projectPath: '/tmp/demo',
  scannedAt: '2026-11-24T20:00:00.000Z',
  durationMs: 1200,
  engineVersion: '1.42.0',
  scanOptions
}

describe('normalizeScanJson', () => {
  it('maps findings into the shared model', () => {
    const report = normalizeScanJson(baseJson(), options)

    expect(report.id).toBe('r1')
    expect(report.ecosystem).toBe('javascript')
    expect(report.packageManager).toBe('npm')
    expect(report.lockfileSource).toBe('package-lock.json')
    expect(report.summary.total).toBe(2)
    expect(report.summary.critical).toBe(1)
    expect(report.summary.high).toBe(1)
    expect(report.summary.affectedPackages).toBe(2)

    const minimist = report.vulnerabilities.find((v) => v.packageName === 'minimist')!
    expect(minimist.severity).toBe('critical')
    expect(minimist.dependencyKind).toBe('direct')
    expect(minimist.cveIds).toEqual(['CVE-2021-44906'])
    expect(minimist.advisoryIds).toEqual(['GHSA-xvch-5gv4-984h'])
    expect(minimist.fixedVersion).toBe('1.2.6')
    expect(minimist.epssScore).toBeCloseTo(0.04581)
    expect(minimist.remediation.type).toBe('direct-upgrade')
    expect(minimist.remediation.autoFixable).toBe(true)
    expect(minimist.remediation.breaking).toBe(false)
    expect(minimist.dependencyPaths).toEqual([['project', 'minimist']])
  })

  it('maps transitive findings and their remediation state', () => {
    const report = normalizeScanJson(baseJson(), options)
    const lodash = report.vulnerabilities.find((v) => v.packageName === 'lodash')!
    expect(lodash.dependencyKind).toBe('transitive')
    // No plan target for lodash, but a fixed version exists: direct-upgrade hint, not auto-fixable.
    expect(lodash.remediation.type).toBe('direct-upgrade')
    expect(lodash.remediation.autoFixable).toBe(false)
  })

  it('builds the remediation plan with targets and unavailable entries', () => {
    const report = normalizeScanJson(baseJson(), options)
    expect(report.remediationPlan).not.toBeNull()
    const plan = report.remediationPlan!
    expect(plan.packageManager).toBe('npm')
    expect(plan.targets).toHaveLength(1)
    const target = plan.targets[0]!
    expect(target.package).toBe('minimist')
    expect(target.currentVersion).toBe('1.2.5')
    expect(target.targetVersion).toBe('1.2.6')
    expect(target.kind).toBe('direct')
    expect(target.safe).toBe(true)
    expect(target.breaking).toBe(false)
    expect(plan.unavailable).toHaveLength(1)
    expect(plan.unavailable[0]!.package).toBe('lodash')
  })

  it('handles scans without a fix plan', () => {
    const report = normalizeScanJson(baseJson({ suggestedFixCommands: null }), options)
    expect(report.remediationPlan).toBeNull()
    const minimist = report.vulnerabilities.find((v) => v.packageName === 'minimist')!
    expect(minimist.remediation.type).toBe('direct-upgrade')
  })

  it('handles empty scans', () => {
    const report = normalizeScanJson(
      baseJson({
        findings: [],
        findingCount: 0,
        packageCount: 0,
        suggestedFixCommands: null
      }),
      options
    )
    expect(report.summary.total).toBe(0)
    expect(report.vulnerabilities).toEqual([])
  })

  it('marks breaking parent-upgrade targets', () => {
    const json = baseJson()
    json.suggestedFixCommands!.targets = [
      {
        package: 'some-parent',
        currentVersion: '2.0.0',
        targetVersion: '3.0.0',
        childPackage: 'vulnerable-child',
        childTargetVersion: '1.5.0',
        scannedVersions: null,
        knownVulnerableVersions: null,
        advisoryVersion: null,
        kind: 'parent-upgrade',
        urgent: true,
        severity: 'high',
        adjusted: false,
        adjustmentNote: null,
        reason: 'Parent must be upgraded.',
        usage: null,
        isDev: false,
        fixVersionPublishedAt: null
      }
    ]
    const report = normalizeScanJson(json, options)
    const target = report.remediationPlan!.targets[0]!
    expect(target.kind).toBe('parent-upgrade')
    expect(target.breaking).toBe(true)
    expect(target.safe).toBe(false)
    expect(target.childPackage).toBe('vulnerable-child')
  })

  it('classifies parent-update (within-range refresh) targets as safe', () => {
    const json = baseJson()
    json.suggestedFixCommands!.targets = [
      {
        package: 'parent-pkg',
        currentVersion: '1.0.0',
        targetVersion: '1.0.0',
        childPackage: 'vulnerable-child',
        childTargetVersion: '1.5.0',
        scannedVersions: null,
        knownVulnerableVersions: null,
        advisoryVersion: null,
        kind: 'parent-update',
        urgent: false,
        severity: 'medium',
        adjusted: false,
        adjustmentNote: null,
        reason: 'Refresh within range.',
        usage: null,
        isDev: false,
        fixVersionPublishedAt: null
      }
    ]
    const report = normalizeScanJson(json, options)
    const target = report.remediationPlan!.targets[0]!
    expect(target.kind).toBe('parent-update')
    expect(target.safe).toBe(true)
    expect(target.breaking).toBe(false)
  })

  it('preserves scan options for later verification', () => {
    const report = normalizeScanJson(baseJson(), options)
    expect(report.scanOptions).toEqual(scanOptions)
  })
})
