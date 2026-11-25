/**
 * Installed-version verification after overrides ("npm ls" equivalents).
 *
 * After an override is applied and installed, Pacmon runs the package
 * manager's tree-listing command per overridden package and checks that the
 * vulnerable version is no longer present and the target version is. Pure
 * command construction + output analysis — no process spawning here.
 */
import type { PackageManager } from '../../../shared/models'

/** Build the argv that lists where a package is installed. */
export function buildVersionCheckCommand(pm: PackageManager, pkg: string): string[] {
  switch (pm) {
    case 'npm':
      return ['npm', 'ls', pkg]
    case 'pnpm':
      return ['pnpm', 'ls', pkg]
    case 'yarn':
      return ['yarn', 'why', pkg]
    case 'bun':
      // bun has no per-package tree listing; list everything and filter below.
      return ['bun', 'pm', 'ls']
  }
}

/** Escape a package name (possibly scoped) for use in a RegExp. */
function escapePackage(name: string): string {
  return name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export interface VersionCheckAnalysis {
  stillInstalled: boolean
  targetInstalled: boolean
}

/**
 * Analyse the package manager's listing output for a package: does the
 * vulnerable `from` version still appear, and does the target `to` version?
 * Handles the `pkg@version` form (npm/yarn/bun) and pnpm's `pkg version` form.
 */
export function analyzeVersionCheckOutput(
  pm: PackageManager,
  pkg: string,
  from: string,
  to: string,
  output: string
): VersionCheckAnalysis {
  const escaped = escapePackage(pkg)
  if (pm === 'pnpm') {
    // pnpm ls prints `name version` lines, e.g. `minimist 1.2.6`.
    const at = new RegExp(`${escaped}\\s+(${escapeVersion(from)})(?=\\s|$)`)
    const toRe = new RegExp(`${escaped}\\s+(${escapeVersion(to)})(?=\\s|$)`)
    return { stillInstalled: at.test(output), targetInstalled: toRe.test(output) }
  }
  // npm ls / yarn why / bun pm ls all print `pkg@version` tokens.
  const at = new RegExp(`${escaped}@${escapeVersion(from)}(?![\\w.-])`)
  const toRe = new RegExp(`${escaped}@${escapeVersion(to)}(?![\\w.-])`)
  return { stillInstalled: at.test(output), targetInstalled: toRe.test(output) }
}

function escapeVersion(version: string): string {
  return version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
