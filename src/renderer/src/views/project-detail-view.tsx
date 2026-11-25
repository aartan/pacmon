import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ScanSearch, ShieldCheck, Sparkles, X } from 'lucide-react'
import { PageBody } from '@renderer/components/layout/page-header'
import { Button, Card, EmptyState, MicroLabel } from '@renderer/components/ui/ui'
import { SeverityDot } from '@renderer/components/severity/severity'
import { VulnerabilityDetail, VulnerabilityRow } from '@renderer/components/scan/vulnerability'
import { RemediationPanel } from '@renderer/components/remediation/remediation-panel'
import { api } from '@renderer/lib/api'
import { cn, formatDuration, formatRelative } from '@renderer/lib/utils'
import { useAppStore } from '@renderer/state/app-store'
import type { ScanReport, Severity, Vulnerability } from '@shared/models'
import { SEVERITIES } from '@shared/models'

type SortKey = 'severity' | 'cvss' | 'package'

const FILTER_SEVERITIES: Severity[] = ['critical', 'high', 'medium', 'low', 'informational']

function SummaryCard({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-none border border-hairline bg-surface p-4">
      <p className={`font-mono text-2xl font-semibold tracking-tight ${tone ?? 'text-foreground'}`}>{value}</p>
      <p className="mt-0.5 text-xs font-medium">{label}</p>
    </div>
  )
}

export function ProjectDetailView() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const project = useAppStore((s) => s.projects.find((p) => p.id === projectId))
  const settings = useAppStore((s) => s.settings)
  const scanProgress = useAppStore((s) => (projectId ? s.scansInFlight[projectId] : undefined))
  const refreshHistory = useAppStore((s) => s.refreshHistory)
  const refreshProjects = useAppStore((s) => s.refreshProjects)

  const [report, setReport] = useState<ScanReport | null>(null)
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)
  const [includeDev, setIncludeDev] = useState(settings.defaultIncludeDev)
  const [pendingAfterScan, setPendingAfterScan] = useState<ScanReport | null>(null)

  // Filters & selection
  const [severityFilter, setSeverityFilter] = useState<Set<Severity>>(new Set())
  const [fixableOnly, setFixableOnly] = useState(false)
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('severity')
  const [selected, setSelected] = useState<Vulnerability | null>(null)

  // Load the latest scan for this project on mount.
  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    api
      .listHistory()
      .then((h) => {
        const latest = h.records.find((r) => r.projectId === projectId)
        if (cancelled || !latest) return
        return api.getScan(latest.id)
      })
      .then((scan) => {
        if (cancelled && !scan) return
        if (!cancelled && scan) setReport(scan)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [projectId])

  const runScan = async () => {
    if (!project || scanning) return
    setScanning(true)
    setScanError(null)
    setSelected(null)
    try {
      const scan = await api.startScan({
        projectId: project.id,
        options: {
          includeDev,
          timeoutSeconds: settings.scanTimeoutSeconds,
          minSeverity: settings.minSeverity
        }
      })
      setReport(scan)
      setPendingAfterScan(null)
      await Promise.all([refreshHistory(), refreshProjects()])
    } catch (e) {
      setScanError(e instanceof Error ? e.message : String(e))
    } finally {
      setScanning(false)
    }
  }

  const cancel = async () => {
    if (!project) return
    await api.cancelScan(project.id)
  }

  const filtered = useMemo(() => {
    if (!report) return []
    let list = [...report.vulnerabilities]
    if (severityFilter.size > 0) list = list.filter((v) => severityFilter.has(v.severity))
    if (fixableOnly) list = list.filter((v) => v.remediation.type !== 'unavailable' || v.fixedVersion !== null)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(
        (v) => v.packageName.toLowerCase().includes(q) || v.cveIds.some((c) => c.toLowerCase().includes(q))
      )
    }
    list.sort((a, b) => {
      if (sortKey === 'package') return a.packageName.localeCompare(b.packageName)
      if (sortKey === 'cvss') {
        const av = a.cvssScore ?? (a.epssScore !== null ? a.epssScore * 10 : -1)
        const bv = b.cvssScore ?? (b.epssScore !== null ? b.epssScore * 10 : -1)
        return bv - av
      }
      const order: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3, informational: 4 }
      return order[a.severity] - order[b.severity]
    })
    return list
  }, [report, severityFilter, fixableOnly, search, sortKey])

  if (!project) {
    return (
      <PageBody>
        <EmptyState
          title="Project not found"
          description="This project is not registered in Guardrail."
          action={<Button onClick={() => navigate('/projects')}>Back to projects</Button>}
        />
      </PageBody>
    )
  }

  const s = report?.summary

  return (
    <>
      <div className="border-b border-hairline">
        <div className="mx-auto max-w-6xl px-6 py-6">
          <button
            type="button"
            onClick={() => navigate('/projects')}
            className="mb-4 flex items-center gap-1 text-xs text-muted transition-colors hover:text-accent"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Projects
          </button>

          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <MicroLabel>{project.ecosystemLabel} project</MicroLabel>
              <h1 className="mt-1.5 text-2xl font-semibold tracking-tight">{project.name}</h1>
              <p className="mt-1 font-mono text-[11px] text-faint">{project.path}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {project.packageManager && (
                  <span className="rounded-none border border-hairline bg-surface-2 px-2 py-0.5 font-mono text-[11px] text-muted">
                    {project.packageManager}
                  </span>
                )}
                {project.lockfile && (
                  <span className="rounded-none border border-hairline bg-surface-2 px-2 py-0.5 font-mono text-[11px] text-muted">
                    {project.lockfile}
                  </span>
                )}
                {report && (
                  <span className="rounded-none border border-hairline bg-surface-2 px-2 py-0.5 font-mono text-[11px] text-muted">
                    scanned {formatRelative(report.scannedAt)}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <label className="mr-1 flex cursor-pointer items-center gap-1.5 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={includeDev}
                  onChange={(e) => setIncludeDev(e.target.checked)}
                  className="h-3.5 w-3.5 accent-[var(--accent)]"
                />
                dev dependencies
              </label>
              {scanning ? (
                <Button variant="ghost" onClick={cancel}>
                  <X className="h-4 w-4" />
                  Cancel
                </Button>
              ) : (
                <Button variant="primary" onClick={runScan}>
                  <ScanSearch className="h-4 w-4" />
                  {report ? 'Rescan' : 'Scan'}
                </Button>
              )}
            </div>
          </div>

          {scanning && (
            <div className="mt-4 rounded-none border border-hairline bg-surface p-3">
              <div className="mb-2 flex items-center justify-between font-mono text-[11px] text-muted">
                <span className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
                  {scanProgress?.message ?? 'Scanning…'}
                </span>
                <span className="tabular-nums">
                  {scanProgress ? `${(scanProgress.elapsedMs / 1000).toFixed(0)}s` : ''}
                </span>
              </div>
              <div className="h-1 overflow-hidden bg-surface-2">
                <div className="progress-indeterminate h-full w-1/3 bg-foreground" />
              </div>
            </div>
          )}

          {scanError && (
            <p className="mt-4 rounded-none border border-critical/30 bg-critical-soft px-3 py-2 text-sm text-critical">
              {scanError}
            </p>
          )}
        </div>
      </div>

      <PageBody>
        {!report ? (
          <EmptyState
            icon={<ScanSearch className="h-8 w-8" />}
            title={scanning ? 'Scanning…' : 'No scan yet'}
            description={
              scanning
                ? 'Querying advisory data for the dependencies in this project.'
                : 'Run a scan to check this project for known vulnerabilities.'
            }
            action={
              !scanning ? (
                <Button variant="primary" onClick={runScan}>
                  <ScanSearch className="h-4 w-4" />
                  Scan project
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="space-y-6">
            {pendingAfterScan && (
              <div className="flex items-center justify-between gap-4 rounded-none border border-ok/30 bg-ok-soft px-4 py-3">
                <p className="text-sm text-foreground">
                  A fresh post-remediation scan is available.
                </p>
                <Button
                  size="sm"
                  onClick={() => {
                    setReport(pendingAfterScan)
                    setPendingAfterScan(null)
                    setSelected(null)
                    refreshHistory()
                  }}
                >
                  Load updated results
                </Button>
              </div>
            )}

            {/* Summary */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <SummaryCard label="Total" value={s!.total} />
              <SummaryCard label="Critical" value={s!.critical} tone="text-critical" />
              <SummaryCard label="High" value={s!.high} tone="text-high" />
              <SummaryCard label="Medium" value={s!.medium} tone="text-medium" />
              <SummaryCard label="Low" value={s!.low} tone="text-low" />
              <SummaryCard label="Packages" value={s!.affectedPackages} />
            </div>

            {report.vulnerabilities.length === 0 ? (
              <Card className="flex items-center gap-3">
                <ShieldCheck className="h-5 w-5 text-ok" />
                <div>
                  <p className="text-sm font-medium">No known vulnerabilities</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {report.packageCount} packages checked · cve-lite {report.engineVersion} ·{' '}
                    {formatDuration(report.durationMs)}
                  </p>
                </div>
              </Card>
            ) : (
              <>
                {/* Filters */}
                <div className="flex flex-wrap items-center gap-2">
                  {FILTER_SEVERITIES.map((sev) => {
                    const active = severityFilter.has(sev)
                    const count = (s?.[sev] ?? 0)
                    return (
                      <button
                        key={sev}
                        type="button"
                        onClick={() => {
                          setSeverityFilter((current) => {
                            const next = new Set(current)
                            if (next.has(sev)) next.delete(sev)
                            else next.add(sev)
                            return next
                          })
                        }}
                        className={cn(
                          'flex items-center gap-1.5 rounded-none border px-2.5 py-1 font-mono text-[11px] transition-colors',
                          active
                            ? 'border-accent/40 bg-accent-soft text-foreground'
                            : 'border-hairline bg-surface text-muted hover:text-foreground'
                        )}
                      >
                        <SeverityDot severity={sev} />
                        {sev}
                        <span className="text-faint">{count}</span>
                      </button>
                    )
                  })}
                  <span className="mx-1 h-4 w-px bg-hairline" />
                  <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted">
                    <input
                      type="checkbox"
                      checked={fixableOnly}
                      onChange={(e) => setFixableOnly(e.target.checked)}
                      className="h-3.5 w-3.5 accent-[var(--accent)]"
                    />
                    fixable only
                  </label>
                  <input
                    type="search"
                    placeholder="Filter by package or CVE…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="h-8 w-52 rounded-none border border-hairline bg-surface px-2.5 text-xs outline-none transition-colors placeholder:text-faint focus:border-accent/50"
                  />
                  <select
                    value={sortKey}
                    onChange={(e) => setSortKey(e.target.value as SortKey)}
                    className="ml-auto h-8 rounded-none border border-hairline bg-surface px-2 text-xs text-muted outline-none focus:border-accent/50"
                  >
                    <option value="severity">Sort: severity</option>
                    <option value="cvss">Sort: CVSS</option>
                    <option value="package">Sort: package</option>
                  </select>
                </div>

                {/* List + detail */}
                <div className={cn('grid gap-4', selected && 'lg:grid-cols-[1fr_400px]')}>
                  <div className="divide-y divide-hairline overflow-hidden rounded-none border border-hairline bg-surface">
                    {filtered.map((v) => (
                      <VulnerabilityRow key={v.id} vuln={v} selected={selected?.id === v.id} onSelect={setSelected} />
                    ))}
                    {filtered.length === 0 && (
                      <p className="px-4 py-8 text-center text-sm text-muted">No findings match the current filters.</p>
                    )}
                  </div>
                  {selected && (
                    <div className="overflow-hidden rounded-none border border-hairline bg-surface lg:sticky lg:top-6 lg:h-[560px]">
                      <VulnerabilityDetail vuln={selected} onClose={() => setSelected(null)} />
                    </div>
                  )}
                </div>

                {/* Remediation */}
                <section className="rounded-none border border-hairline bg-surface p-5">
                  <div className="mb-4 flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-accent" />
                    <h2 className="text-sm font-semibold tracking-tight">Remediation</h2>
                    <span className="text-xs text-muted">
                      {s!.fixable} of {s!.total} findings have a known fix path
                    </span>
                  </div>
                  <RemediationPanel
                    key={report.id}
                    report={report}
                    project={project}
                    defaultIgnoreScripts={settings.defaultIgnoreLifecycleScripts}
                    onCompleted={(result) => {
                      if (result.verification?.afterScan) setPendingAfterScan(result.verification.afterScan)
                      refreshHistory()
                      refreshProjects()
                    }}
                    onScanUpdated={(scan) => {
                      setPendingAfterScan(scan)
                      refreshHistory()
                      refreshProjects()
                    }}
                  />
                </section>
              </>
            )}
          </div>
        )}
      </PageBody>
    </>
  )
}
