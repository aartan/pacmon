import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeftRight,
  Check,
  FlaskConical,
  GitBranch,
  Info,
  PackageCheck,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  TriangleAlert,
  X
} from 'lucide-react'
import type {
  GitCommitResult,
  GitPreview,
  OverrideApplyResult,
  OverridePreview,
  ProjectInfo,
  RemediationResult,
  RemediationTarget,
  ScanReport,
  TestDetectResult,
  TestRunResult,
  VersionCheckResult
} from '@shared/models'
import { Button, Led, MicroLabel, TextInput } from '@renderer/components/ui/ui'
import { SeverityDot } from '@renderer/components/severity/severity'
import { api } from '@renderer/lib/api'
import { useAppStore } from '@renderer/state/app-store'
import { cn } from '@renderer/lib/utils'
import { diffLevel } from './version-diff'
import { expandPattern, validateBranchName, validateCommitMessage } from '@core/git/naming'

type Busy = 'preview' | 'apply' | 'rollback' | 'test' | 'versions' | 'git' | null

function TargetRow({
  target,
  selected,
  disabled,
  onToggle
}: {
  target: RemediationTarget
  selected: boolean
  disabled: boolean
  onToggle: (id: string, checked: boolean) => void
}) {
  const level = diffLevel(target.currentVersion, target.targetVersion)
  return (
    <label
      className={cn(
        'flex cursor-pointer items-center gap-3 rounded-none border px-3 py-2.5 transition-colors',
        selected ? 'border-foreground/40 bg-accent-soft' : 'border-hairline hover:border-hairline-strong',
        disabled && 'cursor-not-allowed opacity-50'
      )}
    >
      <input
        type="checkbox"
        checked={selected}
        disabled={disabled}
        onChange={(e) => onToggle(target.id, e.target.checked)}
        className="h-3.5 w-3.5 accent-[var(--foreground)]"
      />
      <div className="min-w-0 flex-1">
        <p className="flex items-baseline gap-2 font-mono text-xs">
          <span className="font-medium">{target.package}</span>
          <span className="text-faint">
            {target.currentVersion} → <span className="text-foreground">{target.targetVersion}</span>
          </span>
        </p>
        {target.childPackage && (
          <p className="mt-0.5 text-[11px] text-faint">refreshes {target.childPackage}</p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {target.kind === 'parent-update' && (
          <span className="rounded-none border border-hairline bg-surface-2 px-2 py-0.5 font-mono text-[10px] text-muted">
            transitive
          </span>
        )}
        <span
          className={cn(
            'rounded-none border px-2 py-0.5 font-mono text-[10px]',
            level === 'major' ? 'border-warn/30 bg-warn-soft text-warn' : 'border-hairline bg-surface-2 text-muted'
          )}
        >
          {level}
        </span>
        <SeverityDot severity={target.severity} />
      </div>
    </label>
  )
}

export function RemediationPanel({
  report,
  project,
  defaultIgnoreScripts,
  onCompleted,
  onScanUpdated
}: {
  report: ScanReport
  project: ProjectInfo
  defaultIgnoreScripts: boolean
  onCompleted: (result: RemediationResult) => void
  /** Called when the override flow produces a fresher verification scan. */
  onScanUpdated?: (scan: ScanReport) => void
}) {
  const settings = useAppStore((s) => s.settings)
  const plan = report.remediationPlan
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [ignoreScripts, setIgnoreScripts] = useState(defaultIgnoreScripts)
  const [includeBreaking, setIncludeBreaking] = useState(false)
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof api.previewRemediation>> | null>(null)
  const [result, setResult] = useState<RemediationResult | null>(null)
  const [busy, setBusy] = useState<Busy>(null)
  const [progressMessage, setProgressMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Transitive overrides — available as soon as the scan shows them.
  const [includeTransitive, setIncludeTransitive] = useState(false)
  const [overridePreview, setOverridePreview] = useState<OverridePreview | null>(null)
  const [overrideResult, setOverrideResult] = useState<OverrideApplyResult | null>(null)
  const [overridePreviewing, setOverridePreviewing] = useState(false)

  // Tests
  const [testDetect, setTestDetect] = useState<TestDetectResult | null>(null)
  const [testOutput, setTestOutput] = useState('')
  const [testResult, setTestResult] = useState<TestRunResult | null>(null)
  const outputRef = useRef<HTMLPreElement | null>(null)

  // Installed-version verification after overrides (npm ls equivalent)
  const [versionChecks, setVersionChecks] = useState<VersionCheckResult[] | null>(null)

  // Git commit
  const [commitOpen, setCommitOpen] = useState(false)
  const [branch, setBranch] = useState('')
  const [message, setMessage] = useState('')
  const [gitPreview, setGitPreview] = useState<GitPreview | null>(null)
  const [commitResult, setCommitResult] = useState<GitCommitResult | null>(null)

  const safeTargets = useMemo(() => (plan?.targets ?? []).filter((t) => t.safe && !t.breaking), [plan])
  const breakingTargets = useMemo(() => (plan?.targets ?? []).filter((t) => t.breaking), [plan])

  const hasTransitiveFindings = useMemo(
    () =>
      report.vulnerabilities.some(
        (v) => v.dependencyKind === 'transitive' && (v.validatedFixedVersion ?? v.fixedVersion) !== null
      ),
    [report]
  )

  const overridesApplied = overrideResult?.state === 'complete'
  const testsPassed = testResult?.passed === true
  const commitGated = overridesApplied && !testsPassed

  /** The freshest scan available: post-remediation verification, else report. */
  const baseScan = result?.verification?.afterScan ?? report
  const appliedPackages = [
    ...(result?.applied ?? []).map((a) => a.package),
    ...(overrideResult?.entries ?? []).map((e) => e.package)
  ]
  const branchError = useMemo(() => validateBranchName(branch), [branch])
  const messageError = useMemo(() => validateCommitMessage(message), [message])

  // Default-select all safe targets when the report changes.
  useEffect(() => {
    setSelectedIds(new Set((plan?.targets ?? []).filter((t) => t.safe && !t.breaking).map((t) => t.id)))
    setPreview(null)
    setResult(null)
    setError(null)
    setOverrideResult(null)
    setOverridePreview(null)
    setTestResult(null)
    setTestOutput('')
    setCommitResult(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan])

  useEffect(() => {
    return api.onRemediationProgress((progress) => setProgressMessage(progress.message))
  }, [])

  // Detect the test script availability for this project.
  useEffect(() => {
    let cancelled = false
    api
      .detectTests(project.id)
      .then((d) => {
        if (!cancelled) setTestDetect(d)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [project.id])

  // Stream test output for this project.
  useEffect(() => {
    return api.onTestOutput((chunk) => {
      if (chunk.projectId === project.id) {
        setTestOutput((current) => `${current}${chunk.text}`.slice(-64 * 1024))
        requestAnimationFrame(() => {
          outputRef.current?.scrollTo({ top: outputRef.current.scrollHeight })
        })
      }
    })
  }, [project.id])

  // Default branch/message whenever the commit editor opens.
  useEffect(() => {
    if (!commitOpen) return
    const ctx = { projectName: project.name, packages: appliedPackages }
    const nextBranch = expandPattern(settings.branchNamePattern, ctx)
    setBranch(nextBranch)
    setMessage(expandPattern(settings.commitMessagePattern, { ...ctx, branch: nextBranch }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commitOpen])

  if (!plan && !hasTransitiveFindings) {
    return (
      <p className="rounded-none border border-hairline px-4 py-6 text-center text-sm text-muted">
        No remediation plan is available for this scan.
      </p>
    )
  }

  const effectiveSelection = [...selectedIds].filter((id) =>
    (plan?.targets ?? []).some((t) => t.id === id && (t.safe || includeBreaking))
  )

  const toggle = (id: string, checked: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
    setPreview(null)
  }

  const runPreview = async () => {
    setError(null)
    setBusy('preview')
    try {
      const p = await api.previewRemediation({
        scanId: report.id,
        targetIds: effectiveSelection,
        options: { ignoreLifecycleScripts: ignoreScripts, includeBreaking }
      })
      setPreview(p)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  /**
   * The full remediation pipeline. Main selected fixes always apply first;
   * when "Include transitive dependencies" is ticked, overrides are then
   * written, installed, verified, and the test suite runs automatically.
   */
  const apply = async () => {
    if (busy !== null) return
    setError(null)
    setBusy('apply')
    setProgressMessage(null)
    let remediation: RemediationResult | null = null
    let overrides: OverrideApplyResult | null = null
    try {
      if (effectiveSelection.length > 0) {
        remediation = await api.applyRemediation({
          scanId: report.id,
          targetIds: effectiveSelection,
          options: { ignoreLifecycleScripts: ignoreScripts, includeBreaking }
        })
        setResult(remediation)
        if (remediation.state === 'complete') {
          // The selection is consumed — prevent re-applying applied fixes.
          setSelectedIds(new Set())
        }
        onCompleted(remediation)
      }
      if (includeTransitive && (remediation === null || remediation.state === 'complete')) {
        overrides = await applyOverridesInternal(remediation?.verification?.afterScan ?? report)
      }
      if (overrides?.verification?.afterScan) onScanUpdated?.(overrides.verification.afterScan)
      // Overrides applied: the install already ran — now the test suite must
      // prove the app still works, and `npm ls` must prove the vulnerable
      // versions are gone and the targets are installed.
      if (overrides && overrides.state === 'complete') {
        if (testDetect?.runnable) {
          await runTestsInternal()
        }
        await verifyVersionsInternal(overrides)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPreview(null)
      setBusy(null)
    }
  }

  const applyOverridesInternal = async (scan: ScanReport): Promise<OverrideApplyResult | null> => {
    try {
      const r = await api.applyOverrides({ scanId: scan.id, ignoreLifecycleScripts: ignoreScripts })
      setOverrideResult(r)
      if (r.state !== 'complete' && r.error) setError(r.error)
      return r
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return null
    }
  }

  const toggleOverrides = async (checked: boolean) => {
    setIncludeTransitive(checked)
    setError(null)
    setOverridePreview(null)
    if (!checked) return
    setOverridePreviewing(true)
    try {
      setOverridePreview(await api.previewOverrides({ scanId: baseScan.id, ignoreLifecycleScripts: ignoreScripts }))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setOverridePreviewing(false)
    }
  }

  const runTestsInternal = async () => {
    setBusy('test')
    setTestOutput('')
    setTestResult(null)
    try {
      setTestResult(await api.runTests({ projectId: project.id, command: settings.testCommand }))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  /**
   * Verify installed versions with the package manager's `npm ls`-equivalent:
   * the vulnerable version must be gone and the target version installed.
   */
  const verifyVersionsInternal = async (overrides: OverrideApplyResult) => {
    setBusy('versions')
    setVersionChecks(null)
    try {
      const { results } = await api.verifyInstalledVersions({
        scanId: overrides.verification?.afterScan?.id ?? report.id,
        entries: overrides.entries.map((e) => ({ package: e.package, from: e.from, to: e.to }))
      })
      setVersionChecks(results)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  const rollback = async () => {
    if (!result) return
    setError(null)
    setBusy('rollback')
    try {
      await api.rollbackRemediation(result.id)
      setResult(null)
      setSelectedIds(new Set())
      setProgressMessage('Changes rolled back. Run a new scan to confirm the project state.')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  const previewCommit = async () => {
    setError(null)
    setGitPreview(null)
    setCommitResult(null)
    setBusy('git')
    try {
      setGitPreview(await api.previewGitCommit({ projectId: project.id, branch, message }))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  const commit = async () => {
    setError(null)
    setCommitResult(null)
    setBusy('git')
    try {
      const r = await api.commitChanges({ projectId: project.id, branch, message })
      setCommitResult(r)
      if (r.error) setError(r.error)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  const ver = result?.verification
  const overrideEntries = overridePreview?.entries ?? []
  const showPostSections = Boolean(result || overrideResult || hasTransitiveFindings)

  const testsSection = (
    <section className="rounded-none border border-hairline bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-medium">
            <FlaskConical className="h-3.5 w-3.5" />
            Verify with tests
          </p>
          <p className="mt-0.5 text-[11px] text-faint">
            Command: <code className="font-mono">{settings.testCommand}</code>
            {testDetect?.scriptName ? ` → script "${testDetect.scriptName}" in package.json` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {testResult && (
            <span
              className={cn(
                'flex items-center gap-1.5 font-mono text-[11px]',
                testResult.passed ? 'text-ok' : 'text-critical'
              )}
            >
              {testResult.passed ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
              {testResult.passed ? 'passed' : `failed (exit ${testResult.exitCode ?? '—'})`}
            </span>
          )}
          <Button
            size="sm"
            loading={busy === 'test'}
            disabled={busy !== null && busy !== 'test' || !testDetect?.runnable}
            title={testDetect?.runnable ? undefined : (testDetect?.reason ?? 'No test script detected')}
            onClick={() => runTestsInternal()}
          >
            <TerminalSquare className="h-3.5 w-3.5" />
            Run tests
          </Button>
        </div>
      </div>
      {!testDetect?.runnable && (
        <p className="mt-2 text-[11px] text-faint">
          {testDetect?.reason ?? 'Detecting the test script…'} Configure the command in Settings.
        </p>
      )}
      {(testOutput || busy === 'test') && (
        <pre
          ref={outputRef}
          className="mt-2 max-h-48 overflow-y-auto rounded-none border border-hairline bg-code-bg p-3 font-mono text-[11px] leading-relaxed text-muted"
        >
          {testOutput || 'Running…'}
        </pre>
      )}
    </section>
  )

  const commitSection = (
    <section className="rounded-none border border-hairline bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-medium">
            <GitBranch className="h-3.5 w-3.5" />
            Commit to a new branch
          </p>
          <p className="mt-0.5 text-[11px] text-faint">
            Creates a branch, stages only package.json and lockfiles, and commits.
          </p>
        </div>
        <Button
          size="sm"
          disabled={(busy !== null && busy !== 'git') || commitGated}
          title={commitGated ? 'Run the test suite first — overrides were applied.' : undefined}
          onClick={() => setCommitOpen((v) => !v)}
        >
          <GitBranch className="h-3.5 w-3.5" />
          {commitOpen ? 'Hide' : 'Create branch & commit'}
        </Button>
      </div>

      {commitGated && (
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-warn">
          <AlertTriangle className="h-3.5 w-3.5" />
          Transitive overrides were applied — the test suite must pass before committing.
        </p>
      )}

      {commitOpen && (
        <div className="mt-3 space-y-3 rounded-none border border-hairline bg-surface-2/50 p-4">
          <div>
            <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-faint">Branch name</p>
            <TextInput value={branch} spellCheck={false} onChange={(e) => setBranch(e.target.value)} />
            {branchError && <p className="mt-1 font-mono text-[10px] text-critical">{branchError}</p>}
          </div>
          <div>
            <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-faint">Commit message</p>
            <TextInput value={message} spellCheck={false} onChange={(e) => setMessage(e.target.value)} />
            {messageError && <p className="mt-1 font-mono text-[10px] text-critical">{messageError}</p>}
          </div>

          {gitPreview && (
            <div className="rounded-none border border-hairline bg-code-bg px-3 py-2.5 font-mono text-[11px] text-muted">
              {!gitPreview.isRepo ? (
                <p className="text-warn">Not a git repository — commit is unavailable.</p>
              ) : (
                <>
                  <p>
                    branch <span className="text-foreground">{gitPreview.currentBranch ?? '(detached)'}</span> →{' '}
                    <span className="text-foreground">{gitPreview.branch}</span>
                  </p>
                  <p className="mt-1">files to stage:</p>
                  {gitPreview.filesToCommit.map((f) => (
                    <p key={f} className="text-ok">
                      + {f}
                    </p>
                  ))}
                  {gitPreview.dirtyPaths.length > 0 && (
                    <p className="mt-1 text-faint">
                      working tree has {gitPreview.dirtyPaths.length} other change(s) — only the files above are staged.
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {commitResult && commitResult.commit && (
            <div className="rounded-none border border-ok/30 bg-ok-soft px-3 py-2.5">
              <p className="flex items-center gap-2 text-sm text-ok">
                <Check className="h-4 w-4" />
                Committed on <code className="font-mono text-xs">{commitResult.branch}</code>
              </p>
              <p className="mt-1 font-mono text-[11px] text-muted">{commitResult.commit}</p>
            </div>
          )}

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              loading={busy === 'git'}
              disabled={busy !== null && busy !== 'git' || branchError !== null || messageError !== null}
              onClick={previewCommit}
            >
              Preview
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={busy !== null && busy !== 'git' || !gitPreview?.isRepo || branchError !== null || messageError !== null}
              onClick={commit}
            >
              <GitBranch className="h-3.5 w-3.5" />
              Commit
            </Button>
          </div>
        </div>
      )}
    </section>
  )

  const overrideSection = (
    <section className="rounded-none border border-hairline bg-surface p-4">
      <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
        <input
          type="checkbox"
          checked={includeTransitive}
          onChange={(e) => toggleOverrides(e.target.checked)}
          className="h-3.5 w-3.5 accent-[var(--foreground)]"
        />
        Include transitive dependencies in fix
      </label>
      <p className="mt-1 text-[11px] leading-relaxed text-faint">
        Adds version-scoped overrides for transitive packages the normal plan cannot move — only the exact vulnerable
        version is redirected. When included in “Apply fixes”, overrides are written, <code className="font-mono">npm install</code> runs
        to resolve them, a fresh scan verifies, and the test suite runs automatically.
      </p>

      {includeTransitive && !overridePreview && !overridePreviewing && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-faint">
          <Info className="h-3.5 w-3.5" />
          No transitive findings with a known fixed version remain in this scan.
        </p>
      )}

      {includeTransitive && overridePreviewing && (
        <p className="mt-2 flex items-center gap-1.5 font-mono text-[11px] text-faint">
          <Info className="h-3.5 w-3.5" />
          Loading override preview…
        </p>
      )}

      {includeTransitive && overridePreview && (
        <div className="mt-3 space-y-3">
          <div className="rounded-none border border-warn/30 bg-warn-soft px-3 py-2.5 text-xs leading-relaxed text-foreground">
            <p className="flex items-start gap-1.5">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" />
              <span>
                Overrides force nested dependencies to a different version than their parents expect, in the{' '}
                <code className="font-mono text-[11px]">{overridePreview.field}</code> field of package.json. Only the
                exact vulnerable versions listed below are redirected — every other version is left untouched.
                Overrides can break resolution or runtime behaviour, so the changes <strong>must be tested</strong>.
              </span>
            </p>
          </div>

          <div className="rounded-none border border-hairline bg-code-bg px-3 py-2.5">
            <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
              {overridePreview.manifestPath} · {overridePreview.field}
            </p>
            <ul className="space-y-1">
              {overrideEntries.map((entry) => (
                <li key={`${entry.package}@${entry.from}`} className="flex items-center gap-2 font-mono text-[11px]">
                  <SeverityDot severity={entry.severity} />
                  <span className="text-foreground">{entry.package}</span>
                  <span className="text-faint">
                    {entry.from} → <span className="text-foreground">{entry.to}</span>
                  </span>
                  <span className="text-faint">({entry.resolvesFindings} finding{entry.resolvesFindings === 1 ? '' : 's'})</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-faint">
              Applying runs <code className="font-mono">{overridePreview.installCommand}</code> and verifies with a
              fresh scan. {overridePreview.filesToBackup.length} file{overridePreview.filesToBackup.length === 1 ? '' : 's'} will
              be backed up for rollback.
              {overridePreview.preservesExisting > 0 &&
                ` ${overridePreview.preservesExisting} existing override${overridePreview.preservesExisting === 1 ? '' : 's'} preserved.`}
            </p>
          </div>

          {!overridePreview.packageManagerAvailable && (
            <p className="flex items-start gap-1.5 text-xs text-critical">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Package manager “{overridePreview.packageManager}” was not found on this machine.
            </p>
          )}

          {effectiveSelection.length > 0 && (
            <p className="text-[11px] text-faint">
              {effectiveSelection.length} selected main fix{effectiveSelection.length === 1 ? '' : 'es'} will be applied
              first, then these overrides, then the test suite.
            </p>
          )}

          <Button
            size="sm"
            loading={busy === 'apply'}
            disabled={
              busy !== null ||
              overridePreviewing ||
              overrideEntries.length === 0 ||
              !overridePreview.packageManagerAvailable
            }
            onClick={apply}
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            {effectiveSelection.length > 0
              ? `Apply fixes + ${overrideEntries.length} override${overrideEntries.length === 1 ? '' : 's'}`
              : `Apply ${overrideEntries.length} override${overrideEntries.length === 1 ? '' : 's'} now`}
          </Button>
        </div>
      )}
    </section>
  )

  return (
    <div className="space-y-5">
      {error && (
        <p className="rounded-none border border-critical/30 bg-critical-soft px-3 py-2 text-sm text-critical">{error}</p>
      )}

      {result && ver ? (
        <>
          <div className="rounded-none border border-hairline bg-surface p-5">
            <MicroLabel>Verification</MicroLabel>
            <div className="mt-3 grid grid-cols-3 gap-4">
              <div className="rounded-none border border-ok/30 bg-ok-soft p-3">
                <p className="font-mono text-2xl font-semibold text-ok">{ver.resolvedIds.length}</p>
                <p className="mt-0.5 text-xs font-medium">Resolved</p>
              </div>
              <div className="rounded-none border border-warn/30 bg-warn-soft p-3">
                <p className="font-mono text-2xl font-semibold text-warn">{ver.remainingIds.length}</p>
                <p className="mt-0.5 text-xs font-medium">Remaining</p>
              </div>
              <div className="rounded-none border border-critical/30 bg-critical-soft p-3">
                <p className="font-mono text-2xl font-semibold text-critical">{ver.introducedIds.length}</p>
                <p className="mt-0.5 text-xs font-medium">Newly introduced</p>
              </div>
            </div>
            <div className="mt-4 border-t border-hairline pt-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-faint">Applied changes</p>
              <ul className="mt-2 space-y-1.5">
                {result.applied.map((a, i) => (
                  <li key={i} className="flex items-center gap-2 text-xs">
                    {a.ok ? <Check className="h-3.5 w-3.5 text-ok" /> : <X className="h-3.5 w-3.5 text-critical" />}
                    <span className="font-mono">
                      {a.package} {a.from} → {a.to}
                    </span>
                    {!a.ok && a.error && <span className="text-critical">{a.error}</span>}
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs leading-relaxed text-muted">
                {ver.resolvedIds.length > 0
                  ? `Verified: ${ver.resolvedIds.length} finding${ver.resolvedIds.length === 1 ? '' : 's'} resolved by a fresh scan.`
                  : 'No findings were resolved by these changes.'}
                {ver.remainingIds.length > 0 && ` ${ver.remainingIds.length} remain and need attention.`}
                {ver.introducedIds.length > 0 && ` ${ver.introducedIds.length} new finding${ver.introducedIds.length === 1 ? '' : 's'} appeared.`}
              </p>
              <div className="mt-4 flex items-center gap-2">
                <Button size="sm" variant="ghost" loading={busy === 'rollback'} onClick={rollback}>
                  <ArrowLeftRight className="h-3.5 w-3.5" />
                  Roll back
                </Button>
                <span className="text-[11px] text-faint">Restores the files changed by this remediation from the local backup.</span>
              </div>
            </div>
          </div>
          {hasTransitiveFindings && overrideSection}
          {overrideResult && (
            <section className="rounded-none border border-hairline bg-surface-2/50 p-4">
              <div className="flex items-center justify-between">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <Led tone={overrideResult.state === 'complete' ? 'ok' : 'critical'} />
                  Transitive overrides {overrideResult.state === 'complete' ? 'applied' : 'failed'}
                </p>
                {overrideResult.verification && (
                  <span className="font-mono text-[11px] text-muted">
                    {overrideResult.verification.resolvedIds.length} resolved · {overrideResult.verification.remainingIds.length} remaining
                  </span>
                )}
              </div>
              <ul className="mt-2 space-y-1">
                {overrideResult.entries.map((entry) => (
                  <li key={`${entry.package}@${entry.from}`} className="flex items-center gap-2 font-mono text-[11px] text-muted">
                    <Check className="h-3 w-3 text-ok" />
                    {entry.package} {entry.from} → {entry.to}
                  </li>
                ))}
              </ul>
              {busy === 'versions' && (
                <p className="mt-2 font-mono text-[11px] text-muted">
                  <span className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse bg-foreground align-middle" />
                  Verifying installed versions (npm ls)…
                </p>
              )}
              {versionChecks && (
                <div className="mt-3 border-t border-hairline pt-3">
                  <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint">Installed versions</p>
                  <ul className="mt-2 space-y-1">
                    {versionChecks.map((check) => (
                      <li key={`${check.package}@${check.from}`} className="flex items-center gap-2 font-mono text-[11px]">
                        {check.ok ? (
                          <Check className="h-3.5 w-3.5 shrink-0 text-ok" />
                        ) : (
                          <X className="h-3.5 w-3.5 shrink-0 text-critical" />
                        )}
                        <span className="text-foreground">{check.package}</span>
                        <span className="text-faint">
                          {check.from} → <span className="text-foreground">{check.to}</span>
                        </span>
                        {check.error ? (
                          <span className="text-critical">{check.error}</span>
                        ) : check.ok ? (
                          <span className="text-ok">installed</span>
                        ) : (
                          <span className="text-critical">
                            {check.stillInstalled
                              ? `${check.from} still installed`
                              : `${check.to} not found in the tree`}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}
          {testsSection}
          {commitSection}
        </>
      ) : (
        <>
          {plan && (
            <>
              {safeTargets.length === 0 && breakingTargets.length === 0 ? (
                <div className="rounded-none border border-dashed border-hairline px-5 py-8 text-center">
                  <PackageCheck className="mx-auto h-7 w-7 text-ok" />
                  <p className="mt-3 font-display text-base font-medium">No automatic fixes available</p>
                  <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted">
                    {plan.unavailable.length > 0
                      ? `The engine could not produce a safe fix for ${plan.unavailable.length} vulnerable package${plan.unavailable.length === 1 ? '' : 's'}. See the findings for details.`
                      : 'The remaining findings have no known fix.'}
                  </p>
                </div>
              ) : (
                <>
                  {safeTargets.length > 0 && (
                    <section>
                      <MicroLabel>Safe fixes</MicroLabel>
                      <div className="mt-2 space-y-1.5">
                        {safeTargets.map((t) => (
                          <TargetRow key={t.id} target={t} selected={selectedIds.has(t.id)} disabled={false} onToggle={toggle} />
                        ))}
                      </div>
                    </section>
                  )}

                  {breakingTargets.length > 0 && (
                    <section>
                      <div className="flex items-center justify-between">
                        <MicroLabel className="text-warn">Needs review — breaking</MicroLabel>
                        <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
                          <input
                            type="checkbox"
                            checked={includeBreaking}
                            onChange={(e) => {
                              setIncludeBreaking(e.target.checked)
                              setPreview(null)
                            }}
                            className="h-3.5 w-3.5 accent-[var(--foreground)]"
                          />
                          Include breaking upgrades
                        </label>
                      </div>
                      <div className="mt-2 space-y-1.5">
                        {breakingTargets.map((t) => (
                          <TargetRow
                            key={t.id}
                            target={t}
                            selected={includeBreaking && selectedIds.has(t.id)}
                            disabled={!includeBreaking}
                            onToggle={toggle}
                          />
                        ))}
                      </div>
                      <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-warn">
                        <TriangleAlert className="h-3.5 w-3.5" />
                        Major version upgrades may break your code. Review before applying.
                      </p>
                    </section>
                  )}
                </>
              )}

              {plan.unavailable.length > 0 && (
                <section>
                  <MicroLabel>No automatic fix</MicroLabel>
                  <ul className="mt-2 space-y-1.5">
                    {plan.unavailable.slice(0, 10).map((u, i) => (
                      <li key={i} className="flex items-baseline gap-2 rounded-none border border-hairline px-3 py-2 text-xs">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-faint" />
                        <span className="font-mono">{u.package}@{u.version}</span>
                        <span className="text-faint">{u.reason}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={ignoreScripts}
                  onChange={(e) => {
                    setIgnoreScripts(e.target.checked)
                    setPreview(null)
                  }}
                  className="h-3.5 w-3.5 accent-[var(--foreground)]"
                />
                Ignore package lifecycle scripts during installs
              </label>

              {preview && (
                <div className="rounded-none border border-hairline bg-surface-2/60 p-4">
                  <MicroLabel>Preview</MicroLabel>
                  <ul className="mt-2 space-y-1">
                    {preview.actions.map((a) => (
                      <li key={a.targetId} className="flex items-baseline justify-between gap-3 text-xs">
                        <span className="font-mono">{a.command}</span>
                        {a.breaking && <span className="shrink-0 text-warn">breaking</span>}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 text-[11px] leading-relaxed text-faint">
                    Expected to resolve {preview.resolvesFindings} finding{preview.resolvesFindings === 1 ? '' : 's'}.
                    {preview.breakingCount > 0 && ` Includes ${preview.breakingCount} breaking upgrade${preview.breakingCount === 1 ? '' : 's'}.`}
                    {' '}Before applying, Guardrail will back up {preview.filesToBackup.length} file
                    {preview.filesToBackup.length === 1 ? '' : 's'} for rollback.
                    {preview.lifecycleScriptsIgnored
                      ? ' Lifecycle scripts will not run.'
                      : ' Lifecycle scripts WILL run — only proceed if you trust these packages.'}
                  </p>
                  {!preview.packageManagerAvailable && (
                    <p className="mt-2 flex items-start gap-1.5 text-xs text-critical">
                      <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>
                        Package manager “{plan.packageManager}” was not found. Guardrail searches your PATH
                        plus common Node version-manager locations (nvm, fnm, volta, mise, asdf). Install{' '}
                        {plan.packageManager} or make sure it is on your shell PATH, then try again.
                      </span>
                    </p>
                  )}
                </div>
              )}

              {progressMessage && busy === 'apply' && (
                <p className="flex items-center gap-2 font-mono text-[11px] text-muted">
                  <Sparkles className="h-3.5 w-3.5 animate-pulse" />
                  {progressMessage}
                </p>
              )}

              <div className="flex items-center gap-2 border-t border-hairline pt-4">
                <Button
                  size="sm"
                  variant="ghost"
                  loading={busy === 'preview'}
                  onClick={runPreview}
                  disabled={busy !== null || effectiveSelection.length === 0}
                >
                  Preview changes
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  loading={busy === 'apply'}
                  onClick={apply}
                  disabled={
                    busy !== null ||
                    effectiveSelection.length === 0 ||
                    (!preview && !includeTransitive)
                  }
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Apply fixes
                </Button>
                <span className="text-[11px] text-faint">
                  {effectiveSelection.length} selected
                  {includeTransitive && ' · overrides included'}
                </span>
              </div>
            </>
          )}
          {hasTransitiveFindings && overrideSection}
          {showPostSections && !result && (
            <>
              {testsSection}
              {commitSection}
            </>
          )}
        </>
      )}
    </div>
  )
}
