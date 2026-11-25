import { useNavigate } from 'react-router-dom'
import { FolderPlus, FolderSearch, ShieldCheck, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { PageBody, PageHeader } from '@renderer/components/layout/page-header'
import { Button, EmptyState } from '@renderer/components/ui/ui'
import { SeverityDot } from '@renderer/components/severity/severity'
import { api } from '@renderer/lib/api'
import { formatRelative } from '@renderer/lib/utils'
import { useAppStore } from '@renderer/state/app-store'
import type { ScanSummary, Severity } from '@shared/models'

const SEVERITY_KEYS: Array<keyof ScanSummary> = ['critical', 'high', 'medium', 'low', 'informational']

export function ProjectsView() {
  const navigate = useNavigate()
  const projects = useAppStore((s) => s.projects)
  const refreshProjects = useAppStore((s) => s.refreshProjects)
  const [picking, setPicking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const addProject = async () => {
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

  const removeProject = async (id: string, name: string) => {
    if (!window.confirm(`Remove "${name}" from Guardrail? Scan history for this project will also be deleted.`)) return
    await api.removeProject(id)
    await refreshProjects()
  }

  return (
    <>
      <PageHeader
        label="Projects"
        title="Projects"
        description="Folders you scan with Guardrail. Detection runs locally against the project files."
        actions={
          <Button variant="primary" loading={picking} onClick={addProject}>
            <FolderPlus className="h-4 w-4" />
            Add project
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
            icon={<FolderSearch className="h-8 w-8" />}
            title="No projects"
            description="Add a JavaScript project folder to get started."
            action={
              <Button variant="primary" onClick={addProject}>
                <FolderPlus className="h-4 w-4" />
                Add project
              </Button>
            }
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {projects.map((p) => (
              <div
                key={p.id}
                className="group flex flex-col rounded-none border border-hairline bg-surface p-5 transition-colors hover:border-accent/40"
              >
                <button
                  type="button"
                  onClick={() => navigate(`/projects/${p.id}`)}
                  className="flex-1 text-left"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-base font-semibold tracking-tight transition-colors group-hover:text-accent">
                        {p.name}
                      </h3>
                      <p className="mt-1 truncate font-mono text-[11px] text-faint">{p.path}</p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-1.5">
                    <span className="rounded-none border border-hairline bg-surface-2 px-2 py-0.5 font-mono text-[11px] text-muted">
                      {p.ecosystemLabel}
                    </span>
                    {p.packageManager && (
                      <span className="rounded-none border border-hairline bg-surface-2 px-2 py-0.5 font-mono text-[11px] text-muted">
                        {p.packageManager}
                      </span>
                    )}
                    {p.lockfile && (
                      <span className="rounded-none border border-hairline bg-surface-2 px-2 py-0.5 font-mono text-[11px] text-muted">
                        {p.lockfile}
                      </span>
                    )}
                  </div>
                </button>

                <div className="mt-5 flex items-center justify-between border-t border-hairline pt-3.5">
                  {p.lastScanAt ? (
                    <div className="flex items-center gap-2.5">
                      <span className="font-mono text-[11px] text-faint">{formatRelative(p.lastScanAt)}</span>
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
                          <ShieldCheck className="h-3.5 w-3.5" /> clean
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-[11px] text-faint">Never scanned</span>
                  )}
                  <button
                    type="button"
                    onClick={() => removeProject(p.id, p.name)}
                    aria-label={`Remove ${p.name}`}
                    title="Remove project"
                    className="flex h-7 w-7 items-center justify-center rounded-none text-faint transition-colors hover:bg-critical-soft hover:text-critical"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </PageBody>
    </>
  )
}
