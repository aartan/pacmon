import { create } from 'zustand'
import type { AppSettings, ProjectInfo, ScanProgress, ScanRecord } from '@shared/models'
import type { AppInfo } from '@shared/ipc'
import { api } from '@renderer/lib/api'

interface AppState {
  ready: boolean
  appInfo: AppInfo | null
  settings: AppSettings
  projects: ProjectInfo[]
  history: ScanRecord[]
  scansInFlight: Record<string, ScanProgress>

  init(): Promise<void>
  refreshProjects(): Promise<void>
  refreshHistory(): Promise<void>
  saveSettings(settings: AppSettings): Promise<void>
  setScanProgress(progress: ScanProgress): void
  clearScanProgress(projectId: string): void
}

export const useAppStore = create<AppState>((set, get) => ({
  ready: false,
  appInfo: null,
  settings: {
    theme: 'system',
    defaultIncludeDev: true,
    defaultIgnoreLifecycleScripts: true,
    scanTimeoutSeconds: 300,
    backupRetentionDays: 14,
    minSeverity: null
  },
  projects: [],
  history: [],
  scansInFlight: {},

  async init() {
    const [appInfo, settings, projects, history] = await Promise.all([
      api.getAppInfo(),
      api.getSettings(),
      api.listProjects(),
      api.listHistory()
    ])
    set({ ready: true, appInfo, settings, projects: projects.projects, history: history.records })
    api.onScanProgress((progress) => get().setScanProgress(progress))
  },

  async refreshProjects() {
    const result = await api.listProjects()
    set({ projects: result.projects })
  },

  async refreshHistory() {
    const result = await api.listHistory()
    set({ history: result.records })
  },

  async saveSettings(settings) {
    const saved = await api.setSettings(settings)
    set({ settings: saved })
  },

  setScanProgress(progress) {
    set((state) => ({ scansInFlight: { ...state.scansInFlight, [progress.projectId]: progress } }))
  },

  clearScanProgress(projectId) {
    set((state) => {
      const next = { ...state.scansInFlight }
      delete next[projectId]
      return { scansInFlight: next }
    })
  }
}))
