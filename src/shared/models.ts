/**
 * Shared domain models used across the main process, preload bridge, and
 * renderer. Ecosystem-agnostic: the cve-lite / JavaScript specifics live in
 * core providers and are normalised into these shapes before leaving core.
 */

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'informational'

export type DependencyKind = 'direct' | 'transitive' | 'unknown'

export type PackageManager = 'npm' | 'yarn' | 'pnpm' | 'bun'

export type RemediationType =
  | 'direct-upgrade' // safe: direct dependency bumped to a validated fixed version
  | 'transitive-update' // safe: in-range transitive refresh via parent update
  | 'parent-upgrade' // review: requires upgrading a parent dependency (may break)
  | 'unavailable' // no automatic remediation known

export const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  informational: 4
}

export const SEVERITIES: Severity[] = ['critical', 'high', 'medium', 'low', 'informational']

/** A single advisory (GHSA / CVE / etc.) attached to a vulnerability. */
export interface AdvisoryRef {
  id: string
  aliases: string[]
  summary: string
  severity: Severity
  cvssVector: string | null
  cvssScore: number | null
}

/** Full advisory detail, enriched on demand from OSV. */
export interface AdvisoryDetail extends AdvisoryRef {
  description: string | null
  references: string[]
  published: string | null
  modified: string | null
  affected?: Array<{
    package: { ecosystem: string; name: string }
    ranges: Array<{ events: Array<{ introduced?: string; fixed?: string; lastAffected?: string }> }>
  }>
}

/** How a vulnerability can be remediated, per finding. */
export interface RemediationInfo {
  type: RemediationType
  targetVersion: string | null
  breaking: boolean
  autoFixable: boolean
  reason: string | null
}

/** A normalised vulnerability finding. */
export interface Vulnerability {
  /** Stable id: `${advisoryId}:${packageName}@${installedVersion}` */
  id: string
  advisoryIds: string[]
  cveIds: string[]
  packageName: string
  installedVersion: string
  fixedVersion: string | null
  validatedFixedVersion: string | null
  severity: Severity
  title: string
  summary: string
  description: string | null
  references: string[]
  cvssVector: string | null
  cvssScore: number | null
  epssScore: number | null
  epssPercentile: number | null
  dependencyKind: DependencyKind
  dependencyPaths: string[][]
  isDev: boolean
  importedInSource: boolean | null
  fixVersionPublishedAt: string | null
  cooldownWarning: string | null
  recommendedAction: string | null
  runnableFixCommand: string | null
  remediation: RemediationInfo
}

export interface ScanSummary {
  total: number
  critical: number
  high: number
  medium: number
  low: number
  informational: number
  affectedPackages: number
  fixable: number
}

export type RemediationTargetKind = 'direct' | 'parent-update' | 'parent-upgrade'

/** One remediation target from the engine's fix plan. */
export interface RemediationTarget {
  id: string
  package: string
  /** Real registry package name when `package` is an npm alias. */
  registryName: string | null
  currentVersion: string
  targetVersion: string
  kind: RemediationTargetKind
  severity: Severity
  urgent: boolean
  isDev: boolean
  workspaces: string[]
  childPackage: string | null
  reason: string
  adjustmentNote: string | null
  fixVersionPublishedAt: string | null
  /** Semver classification: is this a potentially breaking change? */
  breaking: boolean
  /** Safe to apply automatically without review. */
  safe: boolean
  /** How many findings this target is expected to resolve. */
  resolvesFindings: number
}

export interface UnavailableRemediation {
  package: string
  version: string
  reason: string
}

export interface RemediationPlan {
  packageManager: PackageManager
  targets: RemediationTarget[]
  unavailable: UnavailableRemediation[]
  coveredFindingCount: number
  totalFindingCount: number
}

export interface ScanReport {
  id: string
  projectId: string
  projectName: string
  projectPath: string
  ecosystem: string
  packageManager: PackageManager | null
  lockfileSource: string | null
  mode: string | null
  scannedAt: string
  durationMs: number
  engineVersion: string
  complete: boolean
  diagnostics: string[]
  warnings: string[]
  notes: string[]
  packageCount: number
  summary: ScanSummary
  vulnerabilities: Vulnerability[]
  remediationPlan: RemediationPlan | null
  /** Options the scan was produced with; verification rescans reuse them. */
  scanOptions: ScanOptions
}

export interface DetectionResult {
  ecosystem: string | null
  ecosystemLabel: string
  packageManager: PackageManager | null
  lockfile: string | null
  manifests: string[]
  isJavaScriptProject: boolean
}

export interface ProjectInfo {
  id: string
  name: string
  path: string
  ecosystem: string | null
  ecosystemLabel: string
  packageManager: PackageManager | null
  lockfile: string | null
  lastScanAt: string | null
  lastScanSummary: ScanSummary | null
  lastRemediatedAt: string | null
}

export type RemediationState =
  | 'preview'
  | 'backing-up'
  | 'applying'
  | 'verifying'
  | 'complete'
  | 'failed'
  | 'rolled-back'

export interface RemediationActionPreview {
  targetId: string
  package: string
  from: string
  to: string
  kind: RemediationTargetKind
  breaking: boolean
  isDev: boolean
  workspaces: string[]
  /** Display command, e.g. `npm install minimist@1.2.6` */
  command: string
}

export interface RemediationPreview {
  scanId: string
  actions: RemediationActionPreview[]
  resolvesFindings: number
  breakingCount: number
  /** Backups that will be created before anything is applied. */
  filesToBackup: string[]
  backupDir: string
  lifecycleScriptsIgnored: boolean
  packageManagerAvailable: boolean
  packageManagerVersion: string | null
}

export interface AppliedChange {
  targetId: string
  package: string
  from: string
  to: string
  ok: boolean
  error: string | null
}

export interface VerificationResult {
  resolvedIds: string[]
  remainingIds: string[]
  introducedIds: string[]
  summaryBefore: ScanSummary
  summaryAfter: ScanSummary
  /** The fresh post-remediation scan, when produced during remediation. */
  afterScan: ScanReport | null
}

export interface RemediationResult {
  id: string
  scanId: string
  projectId: string
  startedAt: string
  finishedAt: string
  state: RemediationState
  backupDir: string
  applied: AppliedChange[]
  verification: VerificationResult | null
  error: string | null
}

export interface ScanRecord {
  id: string
  projectId: string
  projectName: string
  projectPath: string
  ecosystem: string
  scannedAt: string
  durationMs: number
  engineVersion: string
  summary: ScanSummary
  remediationId: string | null
}

export interface ScanComparison {
  before: ScanRecord
  after: ScanRecord
  resolved: Vulnerability[]
  remaining: Vulnerability[]
  introduced: Vulnerability[]
}

export interface ScanProgress {
  projectId: string
  phase: 'detecting' | 'scanning' | 'planning' | 'finalising'
  message: string
  elapsedMs: number
}

export interface RemediationProgress {
  projectId: string
  phase: RemediationState
  message: string
  current: number
  total: number
}

export interface ScanOptions {
  includeDev: boolean
  /** Fail-safe window: network timeout for the engine, in seconds. */
  timeoutSeconds: number
  /** Passed to the engine; severity below this is filtered out of the report. */
  minSeverity: Severity | null
}

export interface RemediationApplyOptions {
  targetIds: string[]
  /** Ignore package lifecycle scripts during install (default true). */
  ignoreLifecycleScripts: boolean
  /** Also apply breaking parent upgrades (requires explicit opt-in). */
  includeBreaking: boolean
}

export interface AppSettings {
  theme: 'system' | 'light' | 'dark'
  defaultIncludeDev: boolean
  defaultIgnoreLifecycleScripts: boolean
  scanTimeoutSeconds: number
  backupRetentionDays: number
  minSeverity: Severity | null
}
