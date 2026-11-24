/**
 * Remediation verification: diff two scan reports and report resolved,
 * remaining, and newly-introduced vulnerabilities. A vulnerability is only
 * ever "resolved" when it is gone from a fresh scan of the same project.
 */
import type { ScanReport, VerificationResult, Vulnerability } from '../../shared/models'

/** Stable diff key: advisories + package name, independent of installed version. */
export function vulnerabilityKey(v: Vulnerability): string {
  return `${[...v.advisoryIds].sort().join('+')}|${v.packageName}`
}

export function diffScans(before: ScanReport, after: ScanReport): VerificationResult {
  const beforeById = new Map(before.vulnerabilities.map((v) => [v.id, v]))
  const afterById = new Map(after.vulnerabilities.map((v) => [v.id, v]))

  const beforeKeys = new Map<string, Vulnerability>()
  for (const v of before.vulnerabilities) beforeKeys.set(vulnerabilityKey(v), v)
  const afterKeys = new Map<string, Vulnerability>()
  for (const v of after.vulnerabilities) afterKeys.set(vulnerabilityKey(v), v)

  const resolvedIds: string[] = []
  const remainingIds: string[] = []
  for (const [key, v] of beforeKeys) {
    if (afterKeys.has(key)) remainingIds.push(v.id)
    else resolvedIds.push(v.id)
  }

  const introducedIds: string[] = []
  for (const [key, v] of afterKeys) {
    if (!beforeKeys.has(key)) introducedIds.push(v.id)
  }

  return {
    resolvedIds: resolvedIds.sort(),
    remainingIds: remainingIds.sort(),
    introducedIds: introducedIds.sort(),
    summaryBefore: before.summary,
    summaryAfter: after.summary,
    afterScan: null
  }
}

export interface DiffedVulnerability {
  before: Vulnerability
  after: Vulnerability | null
}

/** Pair up resolved findings with their new (fixed) state for display. */
export function resolvedPairs(before: ScanReport, after: ScanReport): DiffedVulnerability[] {
  const pairs: DiffedVulnerability[] = []
  const afterKeys = new Map(after.vulnerabilities.map((v) => [vulnerabilityKey(v), v]))
  for (const v of before.vulnerabilities) {
    const afterVuln = afterKeys.get(vulnerabilityKey(v)) ?? null
    if (afterVuln === null) pairs.push({ before: v, after: null })
  }
  return pairs
}
