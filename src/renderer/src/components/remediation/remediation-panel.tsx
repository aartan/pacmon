import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowLeftRight, Check, PackageCheck, Sparkles, TriangleAlert, X } from 'lucide-react'
import type { RemediationResult, RemediationTarget, ScanReport } from '@shared/models'
import { Button, MicroLabel } from '@renderer/components/ui/ui'
import { SeverityDot } from '@renderer/components/severity/severity'
import { api } from '@renderer/lib/api'
import { cn } from '@renderer/lib/utils'
import { diffLevel } from './version-diff'

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
        'flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors',
        selected ? 'border-accent/40 bg-accent-soft' : 'border-hairline hover:border-accent/30',
        disabled && 'cursor-not-allowed opacity-50'
      )}
    >
      <input
        type="checkbox"
        checked={selected}
        disabled={disabled}
        onChange={(e) => onToggle(target.id, e.target.checked)}
        className="h-3.5 w-3.5 accent-[var(--accent)]"
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
          <span className="rounded-full border border-hairline bg-surface-2 px-2 py-0.5 font-mono text-[10px] text-muted">
            transitive
          </span>
        )}
        <span
          className={cn(
            'rounded-full border px-2 py-0.5 font-mono text-[10px]',
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
  defaultIgnoreScripts,
  onCompleted
}: {
  report: ScanReport
  defaultIgnoreScripts: boolean
  onCompleted: (result: RemediationResult) => void
}) {
  const plan = report.remediationPlan
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [ignoreScripts, setIgnoreScripts] = useState(defaultIgnoreScripts)
  const [includeBreaking, setIncludeBreaking] = useState(false)
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof api.previewRemediation>> | null>(null)
  const [result, setResult] = useState<RemediationResult | null>(null)
  const [busy, setBusy] = useState<'preview' | 'apply' | 'rollback' | null>(null)
  const [progressMessage, setProgressMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const safeTargets = useMemo(() => (plan?.targets ?? []).filter((t) => t.safe && !t.breaking), [plan])
  const breakingTargets = useMemo(() => (plan?.targets ?? []).filter((t) => t.breaking), [plan])

  // Default-select all safe targets when the report changes.
  useEffect(() => {
    setSelectedIds(new Set((plan?.targets ?? []).filter((t) => t.safe && !t.breaking).map((t) => t.id)))
    setPreview(null)
    setResult(null)
    setError(null)
  }, [plan])

  useEffect(() => {
    return api.onRemediationProgress((progress) => setProgressMessage(progress.message))
  }, [])

  if (!plan) {
    return (
      <p className="rounded-lg border border-hairline px-4 py-6 text-center text-sm text-muted">
        No remediation plan is available for this scan.
      </p>
    )
  }

  const effectiveSelection = [...selectedIds].filter((id) =>
    (plan.targets ?? []).some((t) => t.id === id && (t.safe || includeBreaking))
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

  const apply = async () => {
    setError(null)
    setBusy('apply')
    setProgressMessage(null)
    try {
      const r = await api.applyRemediation({
        scanId: report.id,
        targetIds: effectiveSelection,
        options: { ignoreLifecycleScripts: ignoreScripts, includeBreaking }
      })
      setResult(r)
      setPreview(null)
      onCompleted(r)
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

  const ver = result?.verification

  return (
    <div className="space-y-5">
      {error && (
        <p className="rounded-md border border-critical/30 bg-critical-soft px-3 py-2 text-sm text-critical">{error}</p>
      )}

      {result && ver ? (
        <div className="rounded-xl border border-hairline bg-surface p-5 shadow-sm">
          <MicroLabel>Verification</MicroLabel>
          <div className="mt-3 grid grid-cols-3 gap-4">
            <div className="rounded-lg border border-ok/30 bg-ok-soft p-3">
              <p className="font-mono text-2xl font-semibold text-ok">{ver.resolvedIds.length}</p>
              <p className="mt-0.5 text-xs font-medium">Resolved</p>
            </div>
            <div className="rounded-lg border border-warn/30 bg-warn-soft p-3">
              <p className="font-mono text-2xl font-semibold text-warn">{ver.remainingIds.length}</p>
              <p className="mt-0.5 text-xs font-medium">Remaining</p>
            </div>
            <div className="rounded-lg border border-critical/30 bg-critical-soft p-3">
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
      ) : (
        <>
          {safeTargets.length === 0 && breakingTargets.length === 0 ? (
            <div className="rounded-xl border border-dashed border-hairline px-5 py-8 text-center">
              <PackageCheck className="mx-auto h-7 w-7 text-ok" />
              <p className="mt-3 text-sm font-medium">No automatic fixes available</p>
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
                        className="h-3.5 w-3.5 accent-[var(--accent)]"
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

              {plan.unavailable.length > 0 && (
                <section>
                  <MicroLabel>No automatic fix</MicroLabel>
                  <ul className="mt-2 space-y-1.5">
                    {plan.unavailable.slice(0, 10).map((u, i) => (
                      <li key={i} className="flex items-baseline gap-2 rounded-lg border border-hairline px-3 py-2 text-xs">
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
                  className="h-3.5 w-3.5 accent-[var(--accent)]"
                />
                Ignore package lifecycle scripts during installs
              </label>

              {preview && (
                <div className="rounded-xl border border-hairline bg-surface-2/60 p-4">
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
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-critical">
                      <TriangleAlert className="h-3.5 w-3.5" />
                      Package manager “{plan.packageManager}” was not found on this machine.
                    </p>
                  )}
                </div>
              )}

              {progressMessage && busy === 'apply' && (
                <p className="flex items-center gap-2 font-mono text-[11px] text-muted">
                  <Sparkles className="h-3.5 w-3.5 animate-pulse text-accent" />
                  {progressMessage}
                </p>
              )}

              <div className="flex items-center gap-2 border-t border-hairline pt-4">
                <Button size="sm" variant="ghost" loading={busy === 'preview'} onClick={runPreview} disabled={effectiveSelection.length === 0}>
                  Preview changes
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  loading={busy === 'apply'}
                  onClick={apply}
                  disabled={effectiveSelection.length === 0 || !preview}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Apply fixes
                </Button>
                <span className="text-[11px] text-faint">{effectiveSelection.length} selected</span>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
