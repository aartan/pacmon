// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
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

const report: ScanReport = {
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
  summary: { total: 1, critical: 0, high: 1, medium: 0, low: 0, informational: 0, affectedPackages: 1, fixable: 0 },
  vulnerabilities: [transitiveFinding('lodash', '4.17.20', '4.17.21')],
  remediationPlan: null,
  scanOptions: { includeDev: true, timeoutSeconds: 300, minSeverity: null as Severity | null }
}

const ok = (data: unknown) => ({ ok: true as const, data })

describe('RemediationPanel override pipeline', () => {
  let root: Root
  let calls: string[]

  beforeAll(() => {
    Object.defineProperty(window, 'securityApp', {
      value: {
        getAppInfo: () => Promise.resolve(ok({ name: 'Pacmon', version: '0.1.0', engine: { name: 'x', version: '1' }, node: '24', electron: '45', platform: 'linux' })),
        pickProject: () => Promise.resolve(ok({ cancelled: true, path: null })),
        detectProject: () => Promise.resolve(ok(null)),
        registerProject: () => Promise.resolve(ok(null)),
        listProjects: () => Promise.resolve(ok({ projects: [] })),
        removeProject: () => Promise.resolve(ok(null)),
        startScan: () => Promise.resolve(ok(null)),
        cancelScan: () => Promise.resolve(ok(null)),
        getScan: () => Promise.resolve(ok(null)),
        getAdvisory: () => Promise.resolve(ok(null)),
        previewRemediation: () => Promise.resolve(ok(null)),
        applyRemediation: () => {
          calls.push('applyRemediation')
          return Promise.resolve(
            ok({
              id: 'r0',
              scanId: 'scan-1',
              projectId: 'p1',
              startedAt: 't',
              finishedAt: 't',
              state: 'complete',
              backupDir: '/tmp/b',
              applied: [{ targetId: 't0', package: 'express', from: '4.0.0', to: '4.1.0', ok: true, error: null }],
              verification: null,
              error: null
            })
          )
        },
        rollbackRemediation: () => Promise.resolve(ok(null)),
        previewOverrides: () => {
          calls.push('previewOverrides')
          return Promise.resolve(
            ok({
              scanId: 'scan-1',
              packageManager: 'npm',
              field: 'overrides',
              entries: [{ package: 'lodash', from: '4.17.20', to: '4.17.21', severity: 'high', resolvesFindings: 1 }],
              manifestPath: '/demo/package.json',
              filesToBackup: ['/demo/package.json'],
              packageManagerAvailable: true,
              packageManagerVersion: '10.9.0',
              installCommand: 'npm install',
              preservesExisting: 0
            })
          )
        },
        applyOverrides: () => {
          calls.push('applyOverrides')
          return Promise.resolve(
            ok({
              id: 'r1',
              scanId: 'scan-1',
              projectId: 'p1',
              startedAt: 't',
              finishedAt: 't',
              state: 'complete',
              backupDir: '/tmp/b',
              entries: [{ package: 'lodash', from: '4.17.20', to: '4.17.21', severity: 'high', resolvesFindings: 1 }],
              verification: null,
              error: null
            })
          )
        },
        detectTests: () =>
          Promise.resolve(ok({ projectId: 'p1', command: 'npm test', scriptName: 'test', runnable: true, reason: null })),
        runTests: () => {
          calls.push('runTests')
          return Promise.resolve(ok({ projectId: 'p1', command: 'npm test', exitCode: 0, passed: true, output: 'ok', durationMs: 1, error: null }))
        },
        verifyInstalledVersions: () => {
          calls.push('verifyInstalledVersions')
          return Promise.resolve(
            ok({
              results: [
                { package: 'lodash', from: '4.17.20', to: '4.17.21', ok: true, stillInstalled: false, targetInstalled: true, output: '', error: null }
              ]
            })
          )
        },
        scanAll: () => Promise.resolve(ok(null)),
        remediateAll: () => Promise.resolve(ok(null)),
        previewGitCommit: () => Promise.resolve(ok(null)),
        commitChanges: () => Promise.resolve(ok(null)),
        listHistory: () => Promise.resolve(ok({ records: [] })),
        getHistoryScan: () => Promise.resolve(ok(null)),
        compareScans: () => Promise.resolve(ok(null)),
        deleteHistoryScan: () => Promise.resolve(ok(null)),
        getSettings: () => Promise.resolve(ok({})),
        setSettings: (s: unknown) => Promise.resolve(ok(s)),
        exportJson: () => Promise.resolve(ok({ path: '' })),
        onScanProgress: () => () => {},
        onRemediationProgress: () => () => {},
        onBulkProgress: () => () => {},
        onTestOutput: () => () => {}
      },
      configurable: true
    })
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false
    })) as unknown as typeof window.matchMedia
    document.body.innerHTML = '<div id="root"></div>'
  })

  it('applies overrides and then automatically runs the tests', async () => {
    calls = []
    const container = document.getElementById('root')!
    root = createRoot(container)
    const onScanUpdated = vi.fn()
    await act(async () => {
      root.render(
        <RemediationPanel report={report} project={project} defaultIgnoreScripts onCompleted={() => {}} onScanUpdated={onScanUpdated} />
      )
    })
    await act(async () => {})

    // Tick the transitive override option.
    const tick = container.querySelector('input[type="checkbox"]') as HTMLInputElement
    expect(tick).not.toBeNull()
    await act(async () => {
      tick.click()
    })
    await act(async () => {})
    expect(calls).toEqual(['previewOverrides'])

    // Apply the overrides — install + verify happen in main, tests run after.
    const applyButton = [...container.querySelectorAll('button')].find((b) =>
      (b.textContent ?? '').includes('Apply 1 override')
    ) as HTMLButtonElement
    expect(applyButton).not.toBeNull()
    await act(async () => {
      applyButton.click()
    })
    await act(async () => {})
    await act(async () => {})

    expect(calls).toEqual(['previewOverrides', 'applyOverrides', 'runTests', 'verifyInstalledVersions'])
    root.unmount()
  })

  it('applies the selected main fixes first when the override button is used', async () => {
    calls = []
    const planReport: ScanReport = {
      ...report,
      vulnerabilities: [
        {
          ...transitiveFinding('express', '4.0.0', '4.1.0'),
          id: 'GHSA-y:express@4.0.0',
          dependencyKind: 'direct',
          packageName: 'express'
        },
        report.vulnerabilities[0]!
      ],
      remediationPlan: {
        packageManager: 'npm',
        targets: [
          {
            id: 't0',
            package: 'express',
            registryName: null,
            currentVersion: '4.0.0',
            targetVersion: '4.1.0',
            kind: 'direct',
            severity: 'high',
            urgent: false,
            isDev: false,
            workspaces: [],
            childPackage: null,
            reason: 'fix',
            adjustmentNote: null,
            fixVersionPublishedAt: null,
            breaking: false,
            safe: true,
            resolvesFindings: 1
          }
        ],
        unavailable: [],
        coveredFindingCount: 1,
        totalFindingCount: 2
      }
    }

    const container = document.getElementById('root')!
    root = createRoot(container)
    await act(async () => {
      root.render(
        <RemediationPanel report={planReport} project={project} defaultIgnoreScripts onCompleted={() => {}} />
      )
    })
    await act(async () => {})

    // Tick "Include transitive dependencies in fix".
    const tick = [...container.querySelectorAll('input[type="checkbox"]')].find((i) =>
      (i.closest('label')?.textContent ?? '').includes('Include transitive')
    ) as HTMLInputElement
    expect(tick).not.toBeNull()
    await act(async () => {
      tick.click()
    })
    await act(async () => {})
    expect(calls).toEqual(['previewOverrides'])

    // The override button now applies main fixes first, then overrides, then tests.
    const applyButton = [...container.querySelectorAll('button')].find((b) =>
      (b.textContent ?? '').includes('Apply fixes + 1 override')
    ) as HTMLButtonElement
    expect(applyButton).not.toBeNull()
    await act(async () => {
      applyButton.click()
    })
    await act(async () => {})
    await act(async () => {})

    expect(calls).toEqual(['previewOverrides', 'applyRemediation', 'applyOverrides', 'runTests', 'verifyInstalledVersions'])
    root.unmount()
  })

  it('enables Apply fixes with overrides ticked even before previewing', async () => {
    calls = []
    const planReport: ScanReport = {
      ...report,
      vulnerabilities: [
        {
          ...transitiveFinding('express', '4.0.0', '4.1.0'),
          id: 'GHSA-y:express@4.0.0',
          dependencyKind: 'direct',
          packageName: 'express'
        },
        report.vulnerabilities[0]!
      ],
      remediationPlan: {
        packageManager: 'npm',
        targets: [
          {
            id: 't0',
            package: 'express',
            registryName: null,
            currentVersion: '4.0.0',
            targetVersion: '4.1.0',
            kind: 'direct',
            severity: 'high',
            urgent: false,
            isDev: false,
            workspaces: [],
            childPackage: null,
            reason: 'fix',
            adjustmentNote: null,
            fixVersionPublishedAt: null,
            breaking: false,
            safe: true,
            resolvesFindings: 1
          }
        ],
        unavailable: [],
        coveredFindingCount: 1,
        totalFindingCount: 2
      }
    }

    const container = document.getElementById('root')!
    root = createRoot(container)
    await act(async () => {
      root.render(
        <RemediationPanel report={planReport} project={project} defaultIgnoreScripts onCompleted={() => {}} />
      )
    })
    await act(async () => {})

    const applyFixes = [...container.querySelectorAll('button')].find((b) =>
      (b.textContent ?? '').includes('Apply fixes')
    ) as HTMLButtonElement
    // No preview yet: disabled.
    expect(applyFixes.disabled).toBe(true)

    const tick = [...container.querySelectorAll('input[type="checkbox"]')].find((i) =>
      (i.closest('label')?.textContent ?? '').includes('Include transitive')
    ) as HTMLInputElement
    await act(async () => {
      tick.click()
    })
    await act(async () => {})
    // With overrides included, Apply fixes becomes available without a preview.
    expect(applyFixes.disabled).toBe(false)
    root.unmount()
  })
})
