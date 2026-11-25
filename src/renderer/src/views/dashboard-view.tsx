import { useNavigate } from 'react-router-dom'
import { FolderSearch, Layers, ScanSearch, Sparkles, Wrench } from 'lucide-react'
import { useState } from 'react'
import { PageBody, PageHeader } from '@renderer/components/layout/page-header'
import { Button, Card, EmptyState, Led, MicroLabel } from '@renderer/components/ui/ui'
import { SeverityBadge, SeverityDot } from '@renderer/components/severity/severity'
import { api } from '@renderer/lib/api'
import { formatRelative } from '@renderer/lib/utils'
import { useAppStore } from '@renderer/state/app-store'
import type { ScanSummary, Severity } from '@shared/models'

const SEVERITY_KEYS: Array<keyof ScanSummary> = ['critical', 'high', 'medium', 'low', 'informational']

function Metric({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className={`font-mono text-2xl font-semibold tracking-tight ${accent ?? 'text-foreground'}`}>{value}</span>
      <span className="text-xs font-medium">{label}</span>
    </div>
  )
}

function BulkPanel({ projects }: { projects: Array<{ id: string; name: string; path: string }> }) {
  const settings = useAppStore((s) => s.settings)
  const bulk = useAppStore((s) => s.bulk)
  const bulkResults = useAppStore((s) => s.bulkResults)
  const setBulkResults = useAppStore((s) => s.setBulkResults)
  const clearBulkProgress = useAppStore((s) => s.clearBulkProgress)
  const refreshProjects = useAppStore((s) => s.refreshProjects)
  const refreshHistory = useAppStore((s) => s.refreshHistory)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)

  const busy = bulk.active || running
  const scannedAll = bulkResults && 'results' in bulkResults && bulkResults.results.some((r) => r.ok && (r as { summary?: ScanSummary }).summary)

  const scanAll = async () => {
    if (running) return
    setRunning(true)
    setError(null)
    setBulkResults(null)
    try {
      const result = await api.scanAll({
        options: {
          includeDev: settings.defaultIncludeDev,
          timeoutSeconds: settings.scanTimeoutSeconds,
          minSeverity: settings.minSeverity
        }
      })
      setBulkResults(result)
      await Promise.all([refreshProjects(), refreshHistory()])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setRunning(false)
      clearBulkProgress()
    }
  }

  const fixAll = async () => {
    if (running) return
    setRunning(true)
    setError(null)
    setBulkResults(null)
    try {
      const result = await api.remediateAll({
        ignoreLifecycleScripts: settings.defaultIgnoreLifecycleScripts
      })
      setBulkResults(result)
      await Promise.all([refreshProjects(), refreshHistory()])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setRunning(false)
      clearBulkProgress()
    }
  }

  return (
    <Card>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Layers className="h-4 w-4 text-accent" />
          <MicroLabel>Bulk operations</MicroLabel>
        </div>
        {bulk.active && bulk.progress && (
          <span className="flex items-center gap-2 font-mono text-[11px] text-muted">
            <Led tone="accent" blink />
            {bulk.progress.index}/{bulk.progress.total} · {bulk.progress.message}
          </span>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button variant="primary" size="sm" loading={busy} disabled={busy || projects.length === 0} onClick={scanAll}>
          <ScanSearch className="h-3.5 w-3.5" />
          Scan all projects
        </Button>
        <Button size="sm" loading={busy} disabled={busy || !scannedAll} onClick={fixAll}>
          <Wrench className="h-3.5 w-3.5" />
          Fix all (safe fixes)
        </Button>
        <span className="text-[11px] leading-relaxed text-faint">
          {projects.length} registered project{projects.length === 1 ? '' : 's'} · transitive dependency overrides are applied per project
        </span>
      </div>

      {error && (
        <p className="mt-3 rounded-none border border-critical/30 bg-critical-soft px-3 py-2 text-sm text-critical">
          {error}
        </p>
      )}

      {bulkResults && (
        <div className="mt-4 divide-y divide-hairline rounded-none border border-hairline">
          {('results' in bulkResults ? bulkResults.results : []).map((r) => {
            const summary = 'summary' in r ? (r.summary as ScanSummary | null) : null
            const remediated = 'resolved' in r
            return (
              <div key={r.projectId} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{r.projectName}</p>
                  {r.error && <p className="mt-0.5 truncate font-mono text-[10px] text-faint">{r.error}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {r.ok ? (
                    <>
                      {summary && (
                        <div className="flex items-center gap-1.5">
                          {SEVERITY_KEYS.filter((k) => summary[k] > 0).map((k) => (
                            <span key={k} className="flex items-center gap-1 font-mono text-[11px] text-muted">
                              <SeverityDot severity={k as Severity} />
                              {summary[k]}
                            </span>
                          ))}
                          {summary.total === 0 && <span className="font-mono text-[11px] text-ok">clean</span>}
                        </div>
                      )}
                      {remediated && (
                        <span className="font-mono text-[11px] text-muted">
                          {(r as { resolved: number }).resolved} resolved · {(r as { remaining: number }).remaining} remaining
                        </span>
                      )}
                      <Led tone="ok" />
                    </>
                  ) : (
                    <Led tone="warn" />
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}

export function DashboardView() {
  const navigate = useNavigate()
  const projects = useAppStore((s) => s.projects)
  const history = useAppStore((s) => s.history)
  const refreshProjects = useAppStore((s) => s.refreshProjects)
  const refreshHistory = useAppStore((s) => s.refreshHistory)
  const [picking, setPicking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pickAndRegister = async () => {
    setPicking(true)
    setError(null)
    try {
      const picked = await api.pickProject()
      if (picked.cancelled || !picked.path) return
      const project = await api.registerProject(picked.path)
      await refreshProjects()
      navigate(`/projects/${project.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPicking(false)
    }
  }

  // Aggregate posture from each project's latest scan.
  const posture = { total: 0, critical: 0, high: 0, medium: 0, low: 0, informational: 0, affected: 0 }
  for (const p of projects) {
    if (!p.lastScanSummary) continue
    posture.total += p.lastScanSummary.total
    posture.critical += p.lastScanSummary.critical
    posture.high += p.lastScanSummary.high
    posture.medium += p.lastScanSummary.medium
    posture.low += p.lastScanSummary.low
    posture.informational += p.lastScanSummary.informational
    posture.affected += 1
  }

  const scannedProjects = projects.filter((p) => p.lastScanAt)
  const recentScans = history.slice(0, 5)
  const cleanProjects = scannedProjects.filter((p) => (p.lastScanSummary?.total ?? 0) === 0)

  return (
    <>
      <PageHeader
        label="Overview"
        title="Security posture"
        description="A local-first look at the projects you scan with Guardrail. Nothing leaves this machine except dependency names and versions, queried against public advisory databases."
        actions={
          <Button variant="primary" loading={picking} onClick={pickAndRegister}>
            <FolderSearch className="h-4 w-4" />
            Scan a project
          </Button>
        }
      />
      <PageBody>
        {error && (
          <p className="mb-6 rounded-none border border-critical/30 bg-critical-soft px-3 py-2 text-sm text-critical">
            {error}
          </p>
        )}

        {projects.length === 0 ? (
          <EmptyState
            icon={<ScanSearch className="h-8 w-8" />}
            title="No projects yet"
            description="Open a JavaScript project to scan its dependencies for known vulnerabilities and get a one-click fix plan."
            action={
              <Button variant="primary" onClick={pickAndRegister}>
                <FolderSearch className="h-4 w-4" />
                Select a project folder
              </Button>
            }
          />
        ) : (
          <div className="space-y-8">
            <BulkPanel projects={projects} />

            <Card>
              <MicroLabel>Outstanding</MicroLabel>
              <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-4">
                <Metric label="Total vulnerabilities" value={posture.total} />
                <Metric label="Critical" value={posture.critical} accent="text-critical" />
                <Metric label="High" value={posture.high} accent="text-high" />
                <Metric label="Affected projects" value={`${posture.affected}/${projects.length}`} />
              </div>
              <div className="mt-8 border-t border-hairline pt-6">
                <div className="flex items-center gap-2 text-sm">
                  {posture.total === 0 ? (
                    <>
                      <Led tone="ok" />
                      <span className="text-ok">No known vulnerabilities across your projects.</span>
                    </>
                  ) : (
                    <>
                      <Led tone="warn" />
                      {cleanProjects.length > 0 && (
                        <span className="text-muted">
                          {cleanProjects.length} project{cleanProjects.length === 1 ? '' : 's'} clean.
                        </span>
                      )}
                    </>
                  )}
                </div>
              </div>
            </Card>

            <section>
              <div className="mb-4 flex items-baseline justify-between">
                <h2 className="text-sm font-semibold tracking-tight">Recent projects</h2>
                <button
                  type="button"
                  onClick={() => navigate('/projects')}
                  className="text-sm text-muted transition-colors hover:text-accent"
                >
                  View all
                </button>
              </div>
              <div className="divide-y divide-hairline rounded-none border border-hairline bg-surface">
                {scannedProjects.slice(0, 5).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => navigate(`/projects/${p.id}`)}
                    className="group flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-surface-2/60"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium tracking-tight group-hover:text-accent">{p.name}</p>
                      <p className="mt-0.5 truncate font-mono text-[11px] text-faint">{p.path}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="font-mono text-[11px] text-faint">{formatRelative(p.lastScanAt!)}</span>
                      {p.lastScanSummary && p.lastScanSummary.total > 0 ? (
                        <div className="flex items-center gap-1.5">
                          {SEVERITY_KEYS.filter((k) => p.lastScanSummary![k] > 0).map((k) => (
                            <span key={k} className="flex items-center gap-1 font-mono text-[11px] text-muted">
                              <SeverityDot severity={k as Severity} />
                              {p.lastScanSummary![k]}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="flex items-center gap-1 text-[11px] text-ok">
                          <Led tone="ok" /> clean
                        </span>
                      )}
                    </div>
                  </button>
                ))}
                {scannedProjects.length === 0 && (
                  <p className="px-5 py-6 text-sm text-muted">Scan a project to see results here.</p>
                )}
              </div>
            </section>

            <section>
              <div className="mb-4 flex items-baseline justify-between">
                <h2 className="text-sm font-semibold tracking-tight">Recent scans</h2>
                <button
                  type="button"
                  onClick={() => navigate('/history')}
                  className="text-sm text-muted transition-colors hover:text-accent"
                >
                  Full history
                </button>
              </div>
              {recentScans.length === 0 ? (
                <p className="text-sm text-muted">No scans recorded yet.</p>
              ) : (
                <div className="divide-y divide-hairline rounded-none border border-hairline bg-surface">
                  {recentScans.map((s) => (
                    <div key={s.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{s.projectName}</p>
                        <p className="mt-0.5 font-mono text-[11px] text-faint">
                          {formatRelative(s.scannedAt)} · cve-lite {s.engineVersion}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {s.summary.critical > 0 && <SeverityBadge severity="critical" />}
                        {s.summary.high > 0 && <SeverityBadge severity="high" />}
                        {s.summary.total === 0 && (
                          <span className="flex items-center gap-1 text-[11px] text-ok">
                            <Led tone="ok" /> clean
                          </span>
                        )}
                        {s.remediationId && (
                          <span className="flex items-center gap-1 rounded-none border border-ok/30 bg-ok-soft px-2 py-0.5 font-mono text-[10px] text-ok">
                            <Sparkles className="h-3 w-3" /> remediated
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </PageBody>
    </>
  )
}
