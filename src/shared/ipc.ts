/**
 * IPC contract between the renderer and the main process.
 * Every invoke channel is validated with zod on both sides of the boundary
 * where possible; the bridge exposes a narrow, typed surface only.
 */
import { z } from 'zod'
import type {
  AdvisoryDetail,
  AppSettings,
  DetectionResult,
  ProjectInfo,
  RemediationApplyOptions,
  RemediationPreview,
  RemediationProgress,
  RemediationResult,
  ScanComparison,
  ScanOptions,
  ScanProgress,
  ScanRecord,
  ScanReport,
  Severity,
  VerificationResult
} from './models'

export const CHANNELS = {
  appInfo: 'app:info',
  projectsPick: 'projects:pick',
  projectsDetect: 'projects:detect',
  projectsRegister: 'projects:register',
  projectsList: 'projects:list',
  projectsRemove: 'projects:remove',
  scansStart: 'scans:start',
  scansCancel: 'scans:cancel',
  scansGet: 'scans:get',
  advisoriesGet: 'advisories:get',
  remediationPreview: 'remediation:preview',
  remediationApply: 'remediation:apply',
  remediationRollback: 'remediation:rollback',
  historyList: 'history:list',
  historyGet: 'history:get',
  historyCompare: 'history:compare',
  historyDelete: 'history:delete',
  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  exportJson: 'exports:json'
} as const

export const EVENTS = {
  scanProgress: 'scan:progress',
  remediationProgress: 'remediation:progress'
} as const

/** Envelope for every invoke result crossing the bridge. */
export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: string }

export const ok = <T>(data: T): IpcResult<T> => ({ ok: true, data })
export const err = (error: string): IpcResult<never> => ({ ok: false, error })

/* ------------------------------- zod schemas ------------------------------ */

export const severitySchema = z.enum(['critical', 'high', 'medium', 'low', 'informational'])

export const scanOptionsSchema = z.object({
  includeDev: z.boolean(),
  timeoutSeconds: z.number().int().min(10).max(3600),
  minSeverity: severitySchema.nullable()
})

export const remediationApplyOptionsSchema = z.object({
  targetIds: z.array(z.string()).min(1),
  ignoreLifecycleScripts: z.boolean(),
  includeBreaking: z.boolean()
})

export const settingsSchema = z.object({
  theme: z.enum(['system', 'light', 'dark']),
  defaultIncludeDev: z.boolean(),
  defaultIgnoreLifecycleScripts: z.boolean(),
  scanTimeoutSeconds: z.number().int().min(10).max(3600),
  backupRetentionDays: z.number().int().min(0).max(365),
  minSeverity: severitySchema.nullable()
})

export const projectIdSchema = z.string().min(1).max(256)
export const scanIdSchema = z.string().min(1).max(128)

/* ------------------------------ payload shapes ---------------------------- */

export interface AppInfo {
  name: string
  version: string
  engine: { name: string; version: string }
  node: string
  electron: string
  platform: NodeJS.Platform
}

export type PickProjectPayload = { cancelled: boolean; path: string | null }

export interface ProjectsListPayload {
  projects: ProjectInfo[]
}

export interface ScanStartPayload {
  projectId: string
  options: ScanOptions
}

export interface RemediationPreviewPayload {
  scanId: string
  targetIds: string[]
  options: Pick<RemediationApplyOptions, 'ignoreLifecycleScripts' | 'includeBreaking'>
}

export interface RemediationApplyPayload extends RemediationPreviewPayload {}

export interface HistoryListPayload {
  records: ScanRecord[]
}

export interface ComparePayload {
  beforeScanId: string
  afterScanId: string
}

/* ------------------------------ bridge surface ---------------------------- */

export interface SecurityAppApi {
  getAppInfo(): Promise<IpcResult<AppInfo>>
  pickProject(): Promise<IpcResult<PickProjectPayload>>
  detectProject(path: string): Promise<IpcResult<DetectionResult>>
  registerProject(path: string): Promise<IpcResult<ProjectInfo>>
  listProjects(): Promise<IpcResult<ProjectsListPayload>>
  removeProject(projectId: string): Promise<IpcResult<null>>
  startScan(payload: ScanStartPayload): Promise<IpcResult<ScanReport>>
  cancelScan(projectId: string): Promise<IpcResult<null>>
  getScan(scanId: string): Promise<IpcResult<ScanReport>>
  getAdvisory(advisoryId: string): Promise<IpcResult<AdvisoryDetail>>
  previewRemediation(payload: RemediationPreviewPayload): Promise<IpcResult<RemediationPreview>>
  applyRemediation(payload: RemediationApplyPayload): Promise<IpcResult<RemediationResult>>
  rollbackRemediation(remediationId: string): Promise<IpcResult<null>>
  listHistory(): Promise<IpcResult<HistoryListPayload>>
  getHistoryScan(scanId: string): Promise<IpcResult<ScanReport>>
  compareScans(payload: ComparePayload): Promise<IpcResult<ScanComparison>>
  deleteHistoryScan(scanId: string): Promise<IpcResult<null>>
  getSettings(): Promise<IpcResult<AppSettings>>
  setSettings(settings: AppSettings): Promise<IpcResult<AppSettings>>
  exportJson(scanId: string): Promise<IpcResult<{ path: string }>>
  onScanProgress(cb: (progress: ScanProgress) => void): () => void
  onRemediationProgress(cb: (progress: RemediationProgress) => void): () => void
}

/* ------------------------------ misc helpers ------------------------------ */

export type { Severity, VerificationResult }
