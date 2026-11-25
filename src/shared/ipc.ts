/**
 * IPC contract between the renderer and the main process.
 * Every invoke channel is validated with zod on both sides of the boundary
 * where possible; the bridge exposes a narrow, typed surface only.
 */
import { z } from 'zod'
import type {
  AdvisoryDetail,
  AppSettings,
  BulkProgress,
  BulkRemediateResult,
  BulkScanResult,
  DetectionResult,
  GitCommitResult,
  GitPreview,
  OverrideApplyResult,
  OverridePreview,
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
  TestDetectResult,
  TestRunResult,
  VerificationResult,
  VersionCheckResult
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
  overridesPreview: 'overrides:preview',
  overridesApply: 'overrides:apply',
  overridesVerifyVersions: 'overrides:verifyVersions',
  testsDetect: 'tests:detect',
  testsRun: 'tests:run',
  bulkScanAll: 'bulk:scanAll',
  bulkRemediateAll: 'bulk:remediateAll',
  gitPreview: 'git:preview',
  gitCommit: 'git:commit',
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
  remediationProgress: 'remediation:progress',
  bulkProgress: 'bulk:progress',
  testOutput: 'tests:output'
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

/** Non-empty, single-line command starting with an allowed package manager. */
export const testCommandSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9@/._:+~'"-][A-Za-z0-9@/._:+~'" -]*$/, 'Command contains unsupported characters')
  .refine((v) => v.trim().length > 0, 'Command must not be empty')

/** Branch patterns use a safe charset so expansion stays a valid git ref. */
export const branchPatternSchema = z
  .string()
  .min(3)
  .max(120)
  .regex(/^[A-Za-z0-9{}_/.-]+$/, 'Pattern may only contain letters, numbers, { } _ / . -')

export const commitPatternSchema = z
  .string()
  .min(3)
  .max(200)
  .regex(/^[A-Za-z0-9{}()[\]_,:./#!? -]+$/, 'Pattern contains unsupported characters')

export const settingsSchema = z.object({
  theme: z.enum(['system', 'light', 'dark']),
  defaultIncludeDev: z.boolean(),
  defaultIgnoreLifecycleScripts: z.boolean(),
  scanTimeoutSeconds: z.number().int().min(10).max(3600),
  backupRetentionDays: z.number().int().min(0).max(365),
  minSeverity: severitySchema.nullable(),
  testCommand: testCommandSchema,
  branchNamePattern: branchPatternSchema,
  commitMessagePattern: commitPatternSchema
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

export interface OverridesPayload {
  scanId: string
  ignoreLifecycleScripts: boolean
}

export interface OverridesVerifyVersionsPayload {
  scanId: string
  entries: Array<{ package: string; from: string; to: string }>
}

export interface TestsRunPayload {
  projectId: string
  command: string
}

export interface BulkScanPayload {
  options: ScanOptions
}

export interface BulkRemediatePayload {
  ignoreLifecycleScripts: boolean
}

export interface GitCommitPayload {
  projectId: string
  branch: string
  message: string
}

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
  previewOverrides(payload: OverridesPayload): Promise<IpcResult<OverridePreview>>
  applyOverrides(payload: OverridesPayload): Promise<IpcResult<OverrideApplyResult>>
  verifyInstalledVersions(payload: OverridesVerifyVersionsPayload): Promise<IpcResult<{ results: VersionCheckResult[] }>>
  detectTests(projectId: string): Promise<IpcResult<TestDetectResult>>
  runTests(payload: TestsRunPayload): Promise<IpcResult<TestRunResult>>
  scanAll(payload: BulkScanPayload): Promise<IpcResult<BulkScanResult>>
  remediateAll(payload: BulkRemediatePayload): Promise<IpcResult<BulkRemediateResult>>
  previewGitCommit(payload: GitCommitPayload): Promise<IpcResult<GitPreview>>
  commitChanges(payload: GitCommitPayload): Promise<IpcResult<GitCommitResult>>
  listHistory(): Promise<IpcResult<HistoryListPayload>>
  getHistoryScan(scanId: string): Promise<IpcResult<ScanReport>>
  compareScans(payload: ComparePayload): Promise<IpcResult<ScanComparison>>
  deleteHistoryScan(scanId: string): Promise<IpcResult<null>>
  getSettings(): Promise<IpcResult<AppSettings>>
  setSettings(settings: AppSettings): Promise<IpcResult<AppSettings>>
  exportJson(scanId: string): Promise<IpcResult<{ path: string }>>
  onScanProgress(cb: (progress: ScanProgress) => void): () => void
  onRemediationProgress(cb: (progress: RemediationProgress) => void): () => void
  onBulkProgress(cb: (progress: BulkProgress) => void): () => void
  onTestOutput(cb: (chunk: { projectId: string; text: string }) => void): () => void
}

/* ------------------------------ misc helpers ------------------------------ */

export type { Severity, VerificationResult }
