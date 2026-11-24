/**
 * Advisory detail enrichment from the OSV API, cached locally in the history
 * store with a 24h TTL. Only advisory IDs leave the machine — never project
 * contents.
 */
import type { AdvisoryDetail, Severity } from '../../shared/models'
import type { HistoryStore } from './history-store'
import { normalizeSeverity } from '../../core/utils/severity'

const OSV_VULNS_URL = 'https://api.osv.dev/v1/vulns'
const CACHE_TTL_MS = 24 * 60 * 60 * 1000

interface OsvVuln {
  id?: string
  aliases?: string[]
  summary?: string
  details?: string
  severity?: Array<{ type?: string; score?: string }>
  published?: string
  modified?: string
  references?: Array<{ type?: string; url?: string }>
  affected?: Array<{
    package?: { ecosystem?: string; name?: string }
    ranges?: Array<{ events?: Array<{ introduced?: string; fixed?: string; last_affected?: string }> }>
  }>
}

function toDetail(id: string, vuln: OsvVuln): AdvisoryDetail {
  const severityEntry = vuln.severity?.find((s) => s.type === 'CVSS_V3' || s.type === 'CVSS_V4')
  const cvssScore = severityEntry?.score ? parseFloat(severityEntry.score) : null
  return {
    id,
    aliases: vuln.aliases ?? [],
    summary: vuln.summary ?? '',
    description: vuln.details ?? null,
    references: (vuln.references ?? []).map((r) => r.url ?? '').filter(Boolean),
    severity: normalizeSeverity(null),
    cvssVector: severityEntry?.type === 'CVSS_V3' && severityEntry?.score ? severityEntry.score : null,
    cvssScore: cvssScore !== null && !Number.isNaN(cvssScore) ? cvssScore : null,
    published: vuln.published ?? null,
    modified: vuln.modified ?? null,
    affected: vuln.affected?.map((a) => ({
      package: { ecosystem: a.package?.ecosystem ?? '', name: a.package?.name ?? '' },
      ranges: (a.ranges ?? []).map((r) => ({
        events: (r.events ?? []).map((e) => ({
          introduced: e.introduced,
          fixed: e.fixed,
          lastAffected: e.last_affected
        }))
      }))
    }))
  }
}

export class AdvisoryService {
  constructor(private readonly history: HistoryStore) {}

  async getDetail(advisoryId: string): Promise<AdvisoryDetail | null> {
    const cached = this.history.getAdvisory(advisoryId)
    if (cached) {
      const age = Date.now() - new Date(cached.fetchedAt).getTime()
      if (age < CACHE_TTL_MS) {
        try {
          return toDetail(advisoryId, JSON.parse(cached.payload) as OsvVuln)
        } catch {
          /* fall through to refetch */
        }
      }
    }

    try {
      const response = await fetch(`${OSV_VULNS_URL}/${encodeURIComponent(advisoryId)}`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(15_000)
      })
      if (!response.ok) return null
      const payload = (await response.json()) as OsvVuln
      this.history.putAdvisory(advisoryId, JSON.stringify(payload), new Date().toISOString())
      return toDetail(advisoryId, payload)
    } catch {
      // Offline: fall back to the cache even if stale.
      const stale = this.history.getAdvisory(advisoryId)
      if (stale) {
        try {
          return toDetail(advisoryId, JSON.parse(stale.payload) as OsvVuln)
        } catch {
          return null
        }
      }
      return null
    }
  }
}

export type { Severity }
