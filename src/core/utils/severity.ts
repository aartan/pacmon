import type { Severity } from '../../shared/models'
import { SEVERITY_ORDER, SEVERITIES } from '../../shared/models'

/** Map any engine severity string to the canonical set. */
export function normalizeSeverity(value: string | null | undefined): Severity {
  if (value && value in SEVERITY_ORDER && value !== 'informational') {
    return value as Severity
  }
  if (value === 'informational') return 'informational'
  return 'informational'
}

/** Highest severity wins; used when merging several advisories per finding. */
export function maxSeverity(severities: Severity[]): Severity {
  if (severities.length === 0) return 'informational'
  return [...severities].sort((a, b) => SEVERITY_ORDER[a] - SEVERITY_ORDER[b])[0]!
}

export function severityOrder(a: Severity, b: Severity): number {
  return SEVERITY_ORDER[a] - SEVERITY_ORDER[b]
}

export { SEVERITY_ORDER, SEVERITIES }
