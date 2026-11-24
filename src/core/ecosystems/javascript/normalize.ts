/**
 * Normalisation from the cve-lite-cli `--json` output into the shared,
 * ecosystem-agnostic domain models. This file is the only place that knows
 * about cve-lite's raw shape.
 */
import type {
  DependencyKind,
  PackageManager,
  RemediationPlan,
  RemediationTarget,
  RemediationTargetKind,
  ScanOptions,
  ScanReport,
  ScanSummary,
  Severity,
  UnavailableRemediation,
  Vulnerability
} from '../../../shared/models'
import { isBreakingUpgrade } from '../../utils/versions'
import { normalizeSeverity } from '../../utils/severity'

/* ------------------------------ raw cve-lite ------------------------------ */

export interface CveLiteFinding {
  package: string
  registryPackage?: string
  version: string
  severity: string
  relationship: string
  dev: boolean
  firstFixedVersion: string | null
  validatedFirstFixedVersion: string | null
  fixVersionValidationNote: string | null
  fixVersionPublishedAt: string | null
  cooldownWarning: string | null
  validatedTargetScannedVersions: number | null
  validatedTargetKnownVulnerableVersions: number | null
  recommendedAction: string | null
  runnableFixCommand: string | null
  primaryParent: string | null
  rootDependencies: string[]
  recommendedParentUpgrade: unknown
  parentUpgradeBlockers: unknown
  recommendedNpmTransitiveRemediation: unknown
  chainResolution: unknown
  cves: string[]
  epssScores: Array<{ cve: string; epss: number; percentile: number }> | null
  prioritySignal: string | null
  contextualSignals: Record<string, unknown> | null
  dependencyPaths: string[][]
  usage: { imported?: boolean } | null
  maliciousUnverifiable: boolean
  maliciousGitSource: boolean
  maliciousGitSourcePinned: boolean
  unresolvedAdvisoryIds: string[]
  vulnerabilities: Array<{
    id: string
    aliases: string[]
    summary: string
    severity: string
    cvssScore: string | null
  }>
}

export interface CveLiteTarget {
  package: string
  registryName?: string
  currentVersion: string
  targetVersion: string
  childPackage?: string
  childTargetVersion?: string
  scannedVersions: number | null
  knownVulnerableVersions: number | null
  advisoryVersion: string | null
  kind: string
  urgent: boolean
  severity: string
  adjusted: boolean
  adjustmentNote: string | null
  reason: string
  usage: unknown
  workspaces?: string[]
  isDev: boolean
  fixVersionPublishedAt: string | null
  command?: string
}

export interface CveLiteSkipped {
  package: string
  version: string
  relationship: string
  reason: string
  optionShapedName?: boolean
}

export interface CveLitePlan {
  command: string | null
  coveredFindingCount: number
  packageManager: string
  sections: unknown[]
  skipped: CveLiteSkipped[]
  sourceLabel: string
  targets: CveLiteTarget[]
  totalFindingCount: number
}

export interface CveLiteScanJson {
  projectPath: string
  mode: string
  source: string
  packageCount: number
  findingCount: number
  status: string
  complete: boolean
  diagnostics: Array<{ message: string } | string>
  suggestedFixCommands: CveLitePlan | null
  notes: string[]
  warnings: string[]
  skippedDependencies: unknown[]
  findings: CveLiteFinding[]
  cliVersion?: string
  scannedAt?: string
  multiFolder?: boolean
}

/* -------------------------------- mapping --------------------------------- */

function toDependencyKind(relationship: string): DependencyKind {
  if (relationship === 'direct') return 'direct'
  if (relationship === 'transitive') return 'transitive'
  return 'unknown'
}

function toPackageManager(value: string | null | undefined): PackageManager | null {
  if (value === 'npm' || value === 'pnpm' || value === 'yarn' || value === 'bun') return value
  return null
}

function toTargetKind(kind: string): RemediationTargetKind {
  if (kind === 'direct' || kind === 'parent-update' || kind === 'parent-upgrade') return kind
  return 'direct'
}

const SOURCE_LABELS: Record<string, string> = {
  'package-lock': 'package-lock.json',
  'pnpm-lock': 'pnpm-lock.yaml',
  'yarn-lock': 'yarn.lock',
  'bun-lock': 'bun.lock',
  'package-json': 'package.json (exact pins)'
}

const ECOSYSTEM = 'javascript'

interface NormalizeOptions {
  reportId: string
  projectId: string
  projectName: string
  projectPath: string
  scannedAt: string
  durationMs: number
  engineVersion: string
  scanOptions: ScanOptions
}

/** cve-lite severity strings are already in the canonical set. */
function toSeverity(value: string): Severity {
  return normalizeSeverity(value)
}

/** A finding's remediation shape, derived from its fields + the plan. */
function remediationForFinding(
  finding: CveLiteFinding,
  target: CveLiteTarget | null
): Vulnerability['remediation'] {
  if (target) {
    const breaking = isBreakingUpgrade(target.currentVersion, target.targetVersion)
    const kind = toTargetKind(target.kind)
    return {
      type: kind === 'direct' ? 'direct-upgrade' : kind === 'parent-update' ? 'transitive-update' : 'parent-upgrade',
      targetVersion: target.targetVersion,
      breaking,
      autoFixable: kind === 'direct' || kind === 'parent-update',
      reason: target.reason
    }
  }
  const fixed = finding.validatedFirstFixedVersion ?? finding.firstFixedVersion
  if (fixed) {
    return {
      type: 'direct-upgrade',
      targetVersion: fixed,
      breaking: isBreakingUpgrade(finding.version, fixed),
      autoFixable: finding.relationship === 'direct',
      reason: null
    }
  }
  return { type: 'unavailable', targetVersion: null, breaking: false, autoFixable: false, reason: null }
}

function emptySummary(): ScanSummary {
  return {
    total: 0,
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    informational: 0,
    affectedPackages: 0,
    fixable: 0
  }
}

export function summarizeVulnerabilities(vulns: Vulnerability[]): ScanSummary {
  const summary = emptySummary()
  const packages = new Set<string>()
  for (const v of vulns) {
    summary.total += 1
    summary[v.severity] += 1
    packages.add(v.packageName)
    if (v.remediation.autoFixable || (v.remediation.type !== 'unavailable' && !v.remediation.breaking)) {
      summary.fixable += 1
    }
  }
  summary.affectedPackages = packages.size
  return summary
}

function targetId(target: CveLiteTarget, index: number): string {
  return `${target.kind}:${target.package}@${target.currentVersion}->${target.targetVersion}:${index}`
}

export function normalizeScanJson(raw: CveLiteScanJson, options: NormalizeOptions): ScanReport {
  const plan = raw.suggestedFixCommands
  const targetsByPackage = new Map<string, CveLiteTarget>()
  for (const t of plan?.targets ?? []) {
    // A target maps back to findings through the same package name.
    targetsByPackage.set(t.package, t)
  }

  const vulnerabilities: Vulnerability[] = raw.findings.map((finding) => {
    const severity = toSeverity(finding.severity)
    const target = targetsByPackage.get(finding.package) ?? null
    const vuln = finding.vulnerabilities[0]
    const epss = finding.epssScores?.[0] ?? null
    const advisoryIds = finding.vulnerabilities.map((v) => v.id)
    const cveIds = finding.cves.filter((c) => c.startsWith('CVE-'))
    return {
      id: `${advisoryIds.join('+')}:${finding.package}@${finding.version}`,
      advisoryIds,
      cveIds,
      packageName: finding.package,
      installedVersion: finding.version,
      fixedVersion: finding.firstFixedVersion,
      validatedFixedVersion: finding.validatedFirstFixedVersion,
      severity,
      title: vuln?.summary ?? `Vulnerability in ${finding.package}`,
      summary: vuln?.summary ?? finding.recommendedAction ?? '',
      description: null,
      references: [],
      cvssVector: vuln?.cvssScore ?? null,
      cvssScore: null,
      epssScore: epss?.epss ?? null,
      epssPercentile: epss?.percentile ?? null,
      dependencyKind: toDependencyKind(finding.relationship),
      dependencyPaths: finding.dependencyPaths ?? [],
      isDev: finding.dev,
      importedInSource: finding.usage?.imported === true ? true : finding.usage === null ? null : false,
      fixVersionPublishedAt: finding.fixVersionPublishedAt,
      cooldownWarning: finding.cooldownWarning,
      recommendedAction: finding.recommendedAction,
      runnableFixCommand: finding.runnableFixCommand,
      remediation: remediationForFinding(finding, target)
    }
  })

  const summary = summarizeVulnerabilities(vulnerabilities)

  const normalizedTargets: RemediationTarget[] = (plan?.targets ?? []).map((t, index) => {
    const kind = toTargetKind(t.kind)
    const breaking = isBreakingUpgrade(t.currentVersion, t.targetVersion)
    const safe = kind === 'direct' || kind === 'parent-update'
    // Findings this target resolves: same package + a fix path through it.
    const resolvesFindings = vulnerabilities.filter(
      (v) => v.packageName === t.package && v.remediation.type !== 'unavailable'
    ).length
    return {
      id: targetId(t, index),
      package: t.package,
      registryName: t.registryName ?? null,
      currentVersion: t.currentVersion,
      targetVersion: t.targetVersion,
      kind,
      severity: toSeverity(t.severity),
      urgent: t.urgent,
      isDev: t.isDev,
      workspaces: t.workspaces ?? [],
      childPackage: t.childPackage ?? null,
      reason: t.reason,
      adjustmentNote: t.adjustmentNote,
      fixVersionPublishedAt: t.fixVersionPublishedAt,
      breaking,
      safe,
      resolvesFindings
    }
  })

  const unavailable: UnavailableRemediation[] = (plan?.skipped ?? []).map((s) => ({
    package: s.package,
    version: s.version,
    reason: s.reason
  }))

  const packageManager = toPackageManager(plan?.packageManager)

  const remediationPlan: RemediationPlan | null = plan
    ? {
        packageManager: packageManager ?? 'npm',
        targets: normalizedTargets,
        unavailable,
        coveredFindingCount: plan.coveredFindingCount,
        totalFindingCount: plan.totalFindingCount
      }
    : null

  const diagnostics = (raw.diagnostics ?? []).map((d) => (typeof d === 'string' ? d : d.message))

  return {
    id: options.reportId,
    projectId: options.projectId,
    projectName: options.projectName,
    projectPath: options.projectPath,
    ecosystem: ECOSYSTEM,
    packageManager,
    lockfileSource: SOURCE_LABELS[raw.source] ?? raw.source,
    mode: raw.mode,
    scannedAt: options.scannedAt,
    durationMs: options.durationMs,
    engineVersion: options.engineVersion,
    complete: raw.complete !== false && raw.status === 'ok',
    diagnostics,
    warnings: raw.warnings ?? [],
    notes: raw.notes ?? [],
    packageCount: raw.packageCount,
    summary,
    vulnerabilities,
    remediationPlan,
    scanOptions: options.scanOptions
  }
}
