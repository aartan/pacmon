import { create } from 'zustand'
import type {
  AppSettings,
  BulkProgress,
  BulkRemediateResult,
  BulkScanResult,
  ProjectInfo,
  ScanProgress,
  ScanRecord
} from '@shared/models'
import type { AppInfo } from '@shared/ipc'
import { api } from '@renderer/lib/api'

export interface BulkState {
  active: boolean
  kind: 'scan' | 'remediate' | null
  progress: BulkProgress | null
}

interface AppState {
  ready: boolean
  appInfo: AppInfo | null
  settings: AppSettings
  projects: ProjectInfo[]
  history: ScanRecord[]
  scansInFlight: Record<string, ScanProgress>
  bulk: BulkState
  bulkResults: BulkScanResult | BulkRemediateResult | null

  init(): Promise<void>
  refreshProjects(): Promise<void>
  refreshHistory(): Promise<void>
  saveSettings(settings: AppSettings): Promise<void>
  setScanProgress(progress: ScanProgress): void
  clearScanProgress(projectId: string): void
  setBulkProgress(progress: BulkProgress): void
  clearBulkProgress(): void
  setBulkResults(results: BulkScanResult | BulkRemediateResult | null): void
}

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  defaultIncludeDev: true,
  defaultIgnoreLifecycleScripts: true,
  scanTimeoutSeconds: 300,
  backupRetentionDays: 14,
  minSeverity: null,
  testCommand: 'npm test',
  branchNamePattern: 'fix/{project}-deps-{date}',
  commitMessagePattern: 'fix(deps): remediate vulnerable dependencies [guardrail]'
}

export const useAppStore = create<AppState>((set, get) => ({
  ready: false,
  appInfo: null,
  settings: DEFAULT_SETTINGS,
  projects: [],
  history: [],
  scansInFlight: {},
  bulk: { active: false, kind: null, progress: null },
  bulkResults: null,

  async init() {
    if (get().ready) return
    const [appInfo, settings, projects, history] = await Promise.all([
      api.getAppInfo(),
      api.getSettings(),
      api.listProjects(),
      api.listHistory()
    ])
    set({ ready: true, appInfo, settings, projects: projects.projects, history: history.records })
    api.onScanProgress((progress) => get().setScanProgress(progress))
    api.onBulkProgress((progress) => get().setBulkProgress(progress))
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
  },

  setBulkProgress(progress) {
    set({ bulk: { active: true, kind: progress.kind, progress } })
  },

  clearBulkProgress() {
    set({ bulk: { active: false, kind: null, progress: null } })
  },

  setBulkResults(results) {
    set({ bulkResults: results })
  }
}))
