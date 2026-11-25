/**
 * Transitive dependency override planning for JavaScript projects.
 *
 * When the normal remediation flow cannot safely move a transitive package,
 * a version-scoped override redirects exactly the vulnerable installed
 * version to a fixed one, leaving every other version of that package
 * untouched (npm `overrides`, yarn `resolutions`, pnpm `pnpm.overrides`).
 *
 * Pure and unit-testable: nothing here touches the filesystem or shells out.
 */
import type {
  OverrideEntry,
  OverrideField,
  PackageManager,
  ScanReport,
  Severity
} from '../../shared/models'

/** Which package.json field each manager reads for transitive overrides. */
export function overrideFieldFor(packageManager: PackageManager): OverrideField {
  switch (packageManager) {
    case 'npm':
    case 'bun':
      return 'overrides'
    case 'yarn':
      return 'resolutions'
    case 'pnpm':
      return 'pnpm.overrides'
  }
}

/**
 * Build the version-scoped override entries for a (post-remediation) scan:
 * one entry per distinct vulnerable installed version of a transitive
 * package, mapped to its validated fixed version.
 */
export function collectOverrideEntries(scan: ScanReport): OverrideEntry[] {
  const entries = new Map<string, OverrideEntry>()
  for (const v of scan.vulnerabilities) {
    if (v.dependencyKind !== 'transitive') continue
    const fixed = v.validatedFixedVersion ?? v.fixedVersion
    if (!fixed) continue
    // Nothing to do when the fixed version equals what is installed.
    if (fixed === v.installedVersion) continue

    const key = `${v.packageName}@${v.installedVersion}`
    const existing = entries.get(key)
    if (existing) {
      existing.resolvesFindings += 1
      if (severityRank(v.severity) < severityRank(existing.severity)) {
        existing.severity = v.severity
      }
      continue
    }
    entries.set(key, {
      package: v.packageName,
      from: v.installedVersion,
      to: fixed,
      severity: v.severity,
      resolvesFindings: 1
    })
  }
  return [...entries.values()].sort((a, b) =>
    a.package === b.package ? compareVersions(a.from, b.from) : a.package.localeCompare(b.package)
  )
}

const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  informational: 4
}

function severityRank(severity: Severity): number {
  return SEVERITY_ORDER[severity]
}

/** Best-effort semver-ish comparison for stable ordering (not semantics). */
function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10))
  const pb = b.split('.').map((n) => parseInt(n, 10))
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = Number.isNaN(pa[i]) ? -1 : (pa[i] ?? 0)
    const y = Number.isNaN(pb[i]) ? -1 : (pb[i] ?? 0)
    if (x !== y) return x - y
  }
  return 0
}

/**
 * Render an entry into the concrete key/value structure for a field. All
 * managers use the flat version-scoped key form, e.g.
 * `"lodash@4.17.20": "4.17.21"` — only that exact version is redirected.
 */
export function overrideKeyValues(
  entry: OverrideEntry,
  field: OverrideField
): { keys: string[]; value: string } {
  return { keys: [`${entry.package}@${entry.from}`], value: entry.to }
}

const OVERRIDE_PATHS: Record<OverrideField, string[]> = {
  overrides: ['overrides'],
  resolutions: ['resolutions'],
  'pnpm.overrides': ['pnpm', 'overrides']
}

export interface ManifestOverridePatch {
  field: OverrideField
  /** Entries added or updated by this patch. */
  entries: OverrideEntry[]
  /** Number of pre-existing entries for the affected packages preserved. */
  preservesExisting: number
  /** The full parsed manifest with the patch applied. */
  manifest: Record<string, unknown>
}

/**
 * Merge override entries into a parsed package.json as flat `pkg@version`
 * keys, preserving existing entries (including pre-existing version-scoped
 * keys and any other shapes) untouched.
 */
export function applyOverridesToManifest(
  manifest: Record<string, unknown>,
  entries: OverrideEntry[],
  field: OverrideField
): ManifestOverridePatch {
  const result = JSON.parse(JSON.stringify(manifest)) as Record<string, unknown>
  const path = OVERRIDE_PATHS[field]
  let container = result
  for (const segment of path.slice(0, -1)) {
    const next = container[segment]
    if (typeof next !== 'object' || next === null || Array.isArray(next)) {
      container[segment] = {}
    }
    container = container[segment] as Record<string, unknown>
  }
  const leaf = path[path.length - 1]!
  const current = container[leaf]
  const table: Record<string, unknown> =
    typeof current === 'object' && current !== null && !Array.isArray(current)
      ? (current as Record<string, unknown>)
      : {}

  let preservesExisting = 0
  const applied: OverrideEntry[] = []
  for (const entry of entries) {
    const { keys, value } = overrideKeyValues(entry, field)
    const key = keys[0]!
    if (key in table) preservesExisting += 1
    table[key] = value
    applied.push(entry)
  }

  container[leaf] = table
  return { field, entries: applied, preservesExisting, manifest: result }
}

/** Serialise a parsed manifest back to package.json text (2-space indent). */
export function stringifyManifest(manifest: Record<string, unknown>): string {
  return `${JSON.stringify(manifest, null, 2)}\n`
}
