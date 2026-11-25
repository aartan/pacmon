import { useEffect } from 'react'
import { Route, Routes } from 'react-router-dom'
import { Sidebar } from './components/layout/sidebar'
import { DashboardView } from './views/dashboard-view'
import { ProjectsView } from './views/projects-view'
import { ProjectDetailView } from './views/project-detail-view'
import { HistoryView } from './views/history-view'
import { SettingsView } from './views/settings-view'
import { useAppStore } from './state/app-store'

export default function App() {
  const init = useAppStore((s) => s.init)
  const ready = useAppStore((s) => s.ready)

  useEffect(() => {
    init().catch((e: unknown) => console.error('Failed to initialise app', e))
  }, [init])

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <div className="h-1 w-32 overflow-hidden bg-surface-2">
          <div className="progress-indeterminate h-full w-1/3 bg-foreground" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="flex-1 overflow-y-auto" id="main">
        <Routes>
          <Route path="/" element={<DashboardView />} />
          <Route path="/projects" element={<ProjectsView />} />
          <Route path="/projects/:projectId" element={<ProjectDetailView />} />
          <Route path="/history" element={<HistoryView />} />
          <Route path="/settings" element={<SettingsView />} />
        </Routes>
      </main>
    </div>
  )
}
