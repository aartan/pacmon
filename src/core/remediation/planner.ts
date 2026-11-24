/**
 * Remediation planning: turns an engine fix plan + user selection into a set
 * of concrete, classifiable actions. Pure and unit-testable.
 */
import type {
  RemediationApplyOptions,
  RemediationTarget,
  ScanReport,
  ScanSummary
} from '../../shared/models'
import { buildApplyCommands, displayCommand } from '../ecosystems/javascript/commands'
import { summarizeVulnerabilities } from '../ecosystems/javascript/normalize'
import type { PackageManager } from '../../shared/models'

export interface PlannedAction {
  targetId: string
  target: RemediationTarget
  package: string
  from: string
  to: string
  kind: RemediationTarget['kind']
  breaking: boolean
  safe: boolean
  isDev: boolean
  workspaces: string[]
  /** Display command, e.g. `npm install minimist@1.2.6` */
  command: string
  /** argv form used for execution (multiple runs for multi-workspace). */
  argv: string[][]
  resolvesFindings: number
}

export interface PlannedRemediation {
  actions: PlannedAction[]
  breakingCount: number
  safeCount: number
  resolvesFindings: number
  /** Findings (by id) expected to resolve once all actions apply. */
  expectedResolvedIds: string[]
  filesToBackup: string[]
  lifecycleScriptsIgnored: boolean
  packageManager: PackageManager
}

export class RemediationPlanningError extends Error {}

const LOCKFILE_NAMES = [
  'package-lock.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'yarn.lock',
  'bun.lock',
  'bun.lockb',
  '.npmrc',
  '.yarnrc',
  '.yarnrc.yml',
  'npm-shrinkwrap.json'
]

/** Files the remediation may legitimately touch; these get backed up. */
export function remediationFileCandidates(projectPath: string): string[] {
  // Only names that package managers actually rewrite. Deliberately NOT
  // node_modules or anything else outside this allowlist.
  return LOCKFILE_NAMES.map((n) => `${projectPath}/${n}`)
}

/**
 * Plan the selected targets. Breaking (parent-upgrade) targets are only
 * included when the user explicitly opted in.
 */
export function planRemediation(
  scan: ScanReport,
  options: RemediationApplyOptions,
  yarnMajor?: number
): PlannedRemediation {
  const plan = scan.remediationPlan
  if (!plan) throw new RemediationPlanningError('No remediation plan is available for this scan.')

  const selected = new Set(options.targetIds)
  const targets = plan.targets.filter((t) => selected.has(t.id))
  if (targets.length === 0) throw new RemediationPlanningError('No targets selected.')

  const breaking = targets.filter((t) => t.breaking)
  if (breaking.length > 0 && !options.includeBreaking) {
    throw new RemediationPlanningError(
      `The selection includes ${breaking.length} potentially breaking upgrade(s). Confirm the breaking changes to continue.`
    )
  }

  const actions: PlannedAction[] = targets.map((target) => {
    const argv = buildApplyCommands(plan.packageManager, target, {
      ignoreScripts: options.ignoreLifecycleScripts,
      yarnMajor
    })
    if (argv.length === 0) {
      throw new RemediationPlanningError(
        `No executable command could be built for ${target.package}@${target.currentVersion}.`
      )
    }
    return {
      targetId: target.id,
      target,
      package: target.package,
      from: target.currentVersion,
      to: target.targetVersion,
      kind: target.kind,
      breaking: target.breaking,
      safe: target.safe,
      isDev: target.isDev,
      workspaces: target.workspaces,
      command: displayCommand(plan.packageManager, target),
      argv,
      resolvesFindings: target.resolvesFindings
    }
  })

  // Findings expected to resolve: any finding whose package matches a
  // selected target and whose remediation points at that target's version.
  const expectedResolvedIds = scan.vulnerabilities
    .filter((v) => {
      const t = targets.find((x) => x.package === v.packageName)
      if (!t) return false
      return v.remediation.type !== 'unavailable' || v.fixedVersion !== null
    })
    .map((v) => v.id)

  const filesToBackup = remediationFileCandidates(scan.projectPath)

  return {
    actions,
    breakingCount: actions.filter((a) => a.breaking).length,
    safeCount: actions.filter((a) => a.safe).length,
    resolvesFindings: new Set(expectedResolvedIds).size,
    expectedResolvedIds,
    filesToBackup,
    lifecycleScriptsIgnored: options.ignoreLifecycleScripts,
    packageManager: plan.packageManager
  }
}

export type { ScanSummary }
export { summarizeVulnerabilities }
