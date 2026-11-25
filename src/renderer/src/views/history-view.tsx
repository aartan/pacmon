import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeftRight, Download, History, Trash2 } from 'lucide-react'
import { PageBody, PageHeader } from '@renderer/components/layout/page-header'
import { Button, EmptyState, MicroLabel } from '@renderer/components/ui/ui'
import { SeverityDot } from '@renderer/components/severity/severity'
import { VulnerabilityRow } from '@renderer/components/scan/vulnerability'
import { api } from '@renderer/lib/api'
import { formatDate, formatDuration } from '@renderer/lib/utils'
import { useAppStore } from '@renderer/state/app-store'
import type { ScanComparison, ScanRecord, ScanSummary, Severity, Vulnerability } from '@shared/models'
import { cn } from '@renderer/lib/utils'

const SEVERITY_KEYS: Array<keyof ScanSummary> = ['critical', 'high', 'medium', 'low', 'informational']

function severityChips(summary: ScanSummary): React.ReactNode {
  return (
    <div className="flex items-center gap-1.5">
      {SEVERITY_KEYS.filter((k) => summary[k] > 0).map((k) => (
        <span key={k} className="flex items-center gap-1 font-mono text-[11px] text-muted">
          <SeverityDot severity={k as Severity} />
          {summary[k]}
        </span>
      ))}
      {summary.total === 0 && <span className="text-[11px] text-ok">clean</span>}
    </div>
  )
}

function DiffList({ title, vulns, tone }: { title: string; vulns: Vulnerability[]; tone: 'ok' | 'warn' | 'critical' }) {
  const [selected, setSelected] = useState<Vulnerability | null>(null)
  return (
    <div>
      <div className="mb-3 flex items-baseline gap-2">
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
        <span
          className={cn(
            'font-mono text-[11px]',
            tone === 'ok' ? 'text-ok' : tone === 'warn' ? 'text-warn' : 'text-critical'
          )}
        >
          {vulns.length}
        </span>
      </div>
      {vulns.length === 0 ? (
        <p className="rounded-none border border-dashed border-hairline px-4 py-6 text-center text-xs text-faint">None</p>
      ) : (
        <div className="divide-y divide-hairline rounded-none border border-hairline bg-surface">
          {vulns.map((v) => (
            <VulnerabilityRow key={v.id} vuln={v} selected={selected?.id === v.id} onSelect={setSelected} />
          ))}
        </div>
      )}
    </div>
  )
}

export function HistoryView() {
  const navigate = useNavigate()
  const history = useAppStore((s) => s.history)
  const refreshHistory = useAppStore((s) => s.refreshHistory)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [comparison, setComparison] = useState<ScanComparison | null>(null)
  const [error, setError] = useState<string | null>(null)

  const recordsByProject = useMemo(() => {
    const map = new Map<string, ScanRecord[]>()
    for (const r of history) {
      const list = map.get(r.projectId) ?? []
      list.push(r)
      map.set(r.projectId, list)
    }
    return map
  }, [history])

  const toggleSelect = (id: string) => {
    setSelectedIds((current) => {
      if (current.includes(id)) return current.filter((x) => x !== id)
      if (current.length >= 2) return [current[1]!, id]
      return [...current, id]
    })
    setComparison(null)
  }

  const compare = async () => {
    setError(null)
    if (selectedIds.length !== 2) return
    try {
      const [a, b] = selectedIds
      const result = await api.compareScans({ beforeScanId: a!, afterScanId: b! })
      setComparison(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const remove = async (id: string) => {
    await api.deleteHistoryScan(id)
    setSelectedIds((current) => current.filter((x) => x !== id))
    setComparison(null)
    await refreshHistory()
  }

  const exportScan = async (id: string) => {
    const result = await api.exportJson(id)
    if (result.path) setError('')
  }

  const selected = history.filter((r) => selectedIds.includes(r.id))

  return (
    <>
      <PageHeader
        label="Archive"
        title="Scan history"
        description="Every scan is kept locally. Select two scans to compare how the project's exposure changed."
        actions={
          <Button onClick={compare} disabled={selectedIds.length !== 2}>
            <ArrowLeftRight className="h-4 w-4" />
            Compare selected
          </Button>
        }
      />
      <PageBody>
        {error && (
          <p className="mb-6 rounded-none border border-critical/30 bg-critical-soft px-3 py-2 text-sm text-critical">
            {error}
          </p>
        )}

        {comparison ? (
          <div className="mb-8 rounded-none border border-hairline bg-surface p-5">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <MicroLabel>Comparison</MicroLabel>
                <p className="mt-1 text-sm font-medium tracking-tight">
                  {comparison.before?.projectName ?? 'Project'}
                  <span className="mx-2 text-faint">→</span>
                  <span className="font-mono text-xs text-muted">{formatDate(comparison.before?.scannedAt ?? '')}</span>
                  <span className="mx-2 text-faint">→</span>
                  <span className="font-mono text-xs text-muted">{formatDate(comparison.after?.scannedAt ?? '')}</span>
                </p>
              </div>
              <Button size="sm" onClick={() => setComparison(null)}>
                Close
              </Button>
            </div>
            <div className="space-y-8">
              <DiffList title="Resolved" vulns={comparison.resolved} tone="ok" />
              <DiffList title="Remaining" vulns={comparison.remaining} tone="warn" />
              <DiffList title="Newly introduced" vulns={comparison.introduced} tone="critical" />
            </div>
          </div>
        ) : (
          selected.length > 0 && (
            <p className="mb-6 text-xs text-muted">
              {selected.length === 1 ? 'Select one more scan to compare.' : 'Ready — press “Compare selected”.'}
            </p>
          )
        )}

        {history.length === 0 ? (
          <EmptyState
            icon={<History className="h-8 w-8" />}
            title="No scans yet"
            description="Scan history will appear here once you run your first scan."
          />
        ) : (
          <div className="space-y-8">
            {[...recordsByProject.entries()].map(([projectId, records]) => {
              const name = records[0]?.projectName ?? projectId
              const path = records[0]?.projectPath ?? ''
              return (
                <section key={projectId}>
                  <div className="mb-3 flex items-baseline justify-between">
                    <h2 className="text-sm font-semibold tracking-tight">{name}</h2>
                    <button
                      type="button"
                      onClick={() => navigate(`/projects/${projectId}`)}
                      className="text-xs text-muted transition-colors hover:text-accent"
                    >
                      Open project
                    </button>
                  </div>
                  <p className="mb-2 font-mono text-[11px] text-faint">{path}</p>
                  <div className="divide-y divide-hairline rounded-none border border-hairline bg-surface">
                    {records.map((r) => {
                      const isSelected = selectedIds.includes(r.id)
                      return (
                        <div
                          key={r.id}
                          className={cn(
                            'flex items-center gap-3 px-4 py-3',
                            isSelected && 'bg-accent-soft'
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(r.id)}
                            aria-label={`Select scan from ${formatDate(r.scannedAt)}`}
                            className="h-3.5 w-3.5 accent-[var(--accent)]"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="font-mono text-xs text-foreground">{formatDate(r.scannedAt)}</p>
                            <p className="mt-0.5 font-mono text-[10px] text-faint">
                              cve-lite {r.engineVersion} · {formatDuration(r.durationMs)}
                              {r.remediationId ? ' · after remediation' : ''}
                            </p>
                          </div>
                          {severityChips(r.summary)}
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => exportScan(r.id)}
                              title="Export as JSON"
                              aria-label="Export as JSON"
                              className="flex h-7 w-7 items-center justify-center rounded-none text-faint transition-colors hover:bg-surface-2 hover:text-foreground"
                            >
                              <Download className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => remove(r.id)}
                              title="Delete scan"
                              aria-label="Delete scan"
                              className="flex h-7 w-7 items-center justify-center rounded-none text-faint transition-colors hover:bg-critical-soft hover:text-critical"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </section>
              )
            })}
          </div>
        )}
      </PageBody>
    </>
  )
}
