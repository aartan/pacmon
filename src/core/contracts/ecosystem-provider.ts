/**
 * Contract every ecosystem integration implements. The application core never
 * contains ecosystem-specific scanning or remediation logic; it talks to
 * providers through this interface only.
 */
import type {
  DetectionResult,
  RemediationPlan,
  RemediationResult,
  RemediationApplyOptions,
  ScanOptions,
  ScanReport,
  VerificationResult
} from '../../shared/models'

export interface EcosystemProviderMetadata {
  id: string
  label: string
  description: string
  version: string
  /** Engine (advisory source) behind this provider, e.g. "cve-lite-cli 1.42.0 / OSV". */
  engine: string
}

export interface ScanContext {
  projectId: string
  projectPath: string
  projectName: string
  options: ScanOptions
  /** Emit coarse progress as the scan runs. */
  onProgress?: (message: string) => void
  /** Polled by the caller to decide whether to abort the scan. */
  signal?: AbortSignal
}

export interface RemediateContext {
  scan: ScanReport
  options: RemediationApplyOptions
  onProgress?: (message: string) => void
  signal?: AbortSignal
}

export interface EcosystemProvider {
  metadata(): EcosystemProviderMetadata

  /** Identify whether (and how) a project belongs to this ecosystem. */
  detect(projectPath: string): Promise<DetectionResult>

  /** Scan the project for vulnerabilities. */
  scan(context: ScanContext): Promise<ScanReport>

  /** Build a remediation plan for a scan report (targets + unavailable fixes). */
  getRemediations(scan: ScanReport): RemediationPlan

  /**
   * Preview the concrete actions for a selection of targets: which commands
   * will run, which files will be backed up, and what they resolve.
   */
  previewRemediation(
    scan: ScanReport,
    options: RemediationApplyOptions
  ): Promise<Pick<RemediationResult, 'state' | 'backupDir'> & {
    actions: Array<{
      targetId: string
      package: string
      from: string
      to: string
      kind: 'direct' | 'parent-update' | 'parent-upgrade'
      breaking: boolean
      isDev: boolean
      workspaces: string[]
      command: string
    }>
    resolvesFindings: number
    breakingCount: number
    filesToBackup: string[]
    lifecycleScriptsIgnored: boolean
    packageManagerAvailable: boolean
    packageManagerVersion: string | null
  }>

  /**
   * Apply the selected fixes. Implementations must back up touched files,
   * execute package-manager commands, then re-scan and verify before
   * reporting anything as resolved.
   */
  remediate(context: RemediateContext): Promise<RemediationResult>

  /** Re-scan and diff against a previous report. */
  verify(projectPath: string, previous: ScanReport): Promise<VerificationResult>
}
