/**
 * Package-manager command construction for remediation.
 *
 * Builds argv arrays (never shell strings) that mirror cve-lite-cli's own
 * `--fix` command construction (pinned at 1.42.0), with one deliberate
 * addition: lifecycle scripts can be suppressed, which the engine's `--fix`
 * does not do. Keeping this in core makes it fully unit-testable and keeps
 * the engine isolated behind its runner.
 */
import type { PackageManager, RemediationTarget } from '../../../shared/models'

export interface BuildCommandOptions {
  /** Suppress dependency lifecycle scripts during installs. */
  ignoreScripts: boolean
  /** Yarn major version (1 = classic, 2+ = berry). Only used for script flags. */
  yarnMajor?: number
}

export function isOptionShapedName(name: string): boolean {
  return name.startsWith('-')
}

/** `lodash@4.18.1`, or `my-alias@npm:lodash@4.18.1` for npm aliases. */
export function installPackageSpec(target: RemediationTarget): string {
  const version = target.registryName ? `npm:${target.registryName}@${target.targetVersion}` : target.targetVersion
  return `${target.package}@${version}`
}

/**
 * The package a fix command names. For a parent-update the command names the
 * child being refreshed; otherwise it names the package itself.
 */
export function commandPackageName(target: RemediationTarget): string {
  return target.kind === 'parent-update' ? (target.childPackage ?? target.package) : target.package
}

/**
 * Human-readable command string for previews, e.g. `npm install minimist@1.2.6`.
 * Display only — execution always uses the argv form.
 */
export function displayCommand(packageManager: PackageManager, target: RemediationTarget): string {
  const argv = buildApplyCommands(packageManager, target, { ignoreScripts: false })[0]
  return argv ? argv.join(' ') : ''
}

function scriptFlag(packageManager: PackageManager, options: BuildCommandOptions): string[] {
  if (!options.ignoreScripts) return []
  switch (packageManager) {
    case 'npm':
    case 'pnpm':
      return ['--ignore-scripts']
    case 'yarn':
      // Berry replaced --ignore-scripts with --mode=skip-builds; classic uses --ignore-scripts.
      return options.yarnMajor !== undefined && options.yarnMajor >= 2 ? ['--mode=skip-builds'] : ['--ignore-scripts']
    case 'bun':
      return ['--ignore-scripts']
  }
}

function buildInstallApplyArgv(
  packageManager: PackageManager,
  target: RemediationTarget,
  options: BuildCommandOptions
): string[][] {
  const workspaces = target.workspaces ?? []
  const pkgArg = installPackageSpec(target)
  if (isOptionShapedName(pkgArg)) return []
  const isDev = Boolean(target.isDev)
  const flags = scriptFlag(packageManager, options)

  switch (packageManager) {
    case 'npm': {
      const args = ['install']
      if (isDev) args.push('-D')
      for (const ws of workspaces.filter((w) => w !== '.')) args.push('-w', ws)
      args.push(...flags, pkgArg)
      return [['npm', ...args]]
    }
    case 'pnpm': {
      const args: string[] = []
      for (const ws of workspaces.filter((w) => w !== '.')) args.push('--filter', `./${ws}`)
      args.push('add')
      if (isDev) args.push('-D')
      args.push(...flags, pkgArg)
      return [['pnpm', ...args]]
    }
    case 'yarn': {
      const nonRoot = workspaces.filter((w) => w !== '.')
      if (nonRoot.length === 0) {
        const args = ['add']
        if (isDev) args.push('-D')
        args.push(...flags, pkgArg)
        return [['yarn', ...args]]
      }
      return nonRoot.map((ws) => {
        const args = ['workspace', ws, 'add']
        if (isDev) args.push('-D')
        args.push(...flags, pkgArg)
        return ['yarn', ...args]
      })
    }
    case 'bun': {
      const hasRoot = workspaces.includes('.')
      const nonRoot = workspaces.filter((ws) => ws !== '.')
      const runs: string[][] = []
      if (hasRoot || nonRoot.length === 0) {
        const args = ['add']
        if (isDev) args.push('--dev')
        args.push(...flags, pkgArg)
        runs.push(['bun', ...args])
      }
      for (const ws of nonRoot) {
        const args = ['add']
        if (isDev) args.push('--dev')
        args.push(...flags, '--cwd', ws, pkgArg)
        runs.push(['bun', ...args])
      }
      return runs
    }
  }
}

function buildParentUpdateApplyArgv(
  packageManager: PackageManager,
  target: RemediationTarget,
  options: BuildCommandOptions
): string[][] {
  const updatePkg = commandPackageName(target)
  if (isOptionShapedName(updatePkg)) return []
  const workspaces = target.workspaces ?? []
  const nonRoot = workspaces.filter((w) => w !== '.')
  const flags = scriptFlag(packageManager, options)

  switch (packageManager) {
    case 'npm': {
      const args = ['update']
      if (nonRoot.length === 1) args.push(`--workspace=${nonRoot[0]}`)
      else if (nonRoot.length > 1) args.push('--workspaces')
      args.push(...flags, updatePkg)
      return [['npm', ...args]]
    }
    case 'pnpm': {
      if (workspaces.length === 0 || workspaces.length > 1) {
        return [['pnpm', 'update', '--recursive', '--no-save', ...flags, updatePkg]]
      }
      const workspace = workspaces[0]!
      if (workspace === '.') return [['pnpm', 'update', '--no-save', ...flags, updatePkg]]
      return [['pnpm', '--filter', `./${workspace}`, 'update', '--no-save', ...flags, updatePkg]]
    }
    case 'yarn': {
      if (nonRoot.length === 0) return [['yarn', 'upgrade', ...flags, updatePkg]]
      return nonRoot.map((ws) => ['yarn', 'workspace', ws, 'upgrade', ...flags, updatePkg])
    }
    case 'bun':
      return [['bun', 'update', ...flags, updatePkg]]
  }
}

/**
 * Build argv lists for applying a target, without round-tripping through a
 * shell string. Workspace paths and package tokens are whole argv elements,
 * so a directory name containing `&&` cannot become a second executable.
 */
export function buildApplyCommands(
  packageManager: PackageManager,
  target: RemediationTarget,
  options: BuildCommandOptions
): string[][] {
  if (target.kind === 'parent-update') {
    return buildParentUpdateApplyArgv(packageManager, target, options)
  }
  return buildInstallApplyArgv(packageManager, target, options)
}
