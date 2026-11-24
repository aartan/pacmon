/**
 * Local mock of the OSV + npm-registry APIs for hermetic integration tests.
 * The cve-lite engine is pointed at this server via --osv-url and the
 * fixture project's .npmrc, so no external network is required.
 */
import { createServer as createHttpsServer, type Server } from 'node:https'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { AddressInfo } from 'node:net'

const certPath = resolve(__dirname, 'certs/test-cert.pem')
const keyPath = resolve(__dirname, 'certs/test-key.pem')

export interface MockAdvisory {
  id: string
  aliases: string[]
  summary: string
  details?: string
  severity?: Array<{ type: string; score: string }>
  database_specific?: Record<string, unknown>
  affected: Array<{
    package: { ecosystem: string; name: string }
    ranges: Array<{ type: string; events: Array<{ introduced?: string; fixed?: string; last_affected?: string }> }>
  }>
  references?: Array<{ type: string; url: string }>
  published: string
  modified: string
}

export interface MockPackage {
  name: string
  versions: Record<string, { name: string; version: string }>
  /** version -> published timestamp */
  time: Record<string, string>
}

export const MINIMIST_VULN: MockAdvisory = {
  id: 'GHSA-xvch-5gv4-984h',
  aliases: ['CVE-2021-44906'],
  summary: 'Prototype Pollution in minimist',
  details:
    'minimist before 1.2.6 could be tricked into adding or modifying properties of Object.prototype, leading to prototype pollution.',
  severity: [{ type: 'CVSS_V3', score: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H' }],
  database_specific: { severity: 'CRITICAL' },
  affected: [
    {
      package: { ecosystem: 'npm', name: 'minimist' },
      ranges: [{ type: 'SEMVER', events: [{ introduced: '0' }, { fixed: '1.2.6' }] }]
    }
  ],
  references: [
    { type: 'ADVISORY', url: 'https://github.com/substack/minimist/security/advisories/GHSA-xvch-5gv4-984h' }
  ],
  published: '2022-03-17T00:00:00Z',
  modified: '2022-03-21T00:00:00Z'
}

export const MINIMIST_PACKAGE: MockPackage = {
  name: 'minimist',
  versions: {
    '1.2.5': { name: 'minimist', version: '1.2.5' },
    '1.2.6': { name: 'minimist', version: '1.2.6' },
    '1.2.7': { name: 'minimist', version: '1.2.7' },
    '1.2.8': { name: 'minimist', version: '1.2.8' }
  },
  time: {
    '1.2.5': '2021-03-09T00:00:00Z',
    '1.2.6': '2022-03-21T18:00:00Z',
    '1.2.7': '2022-06-06T00:00:00Z',
    '1.2.8': '2023-02-08T00:00:00Z'
  }
}

function versionAffected(vuln: MockAdvisory, version: string): boolean {
  for (const affected of vuln.affected) {
    for (const range of affected.ranges) {
      const introduced = range.events.find((e) => e.introduced !== undefined)?.introduced
      const fixed = range.events.find((e) => e.fixed !== undefined)?.fixed
      if (introduced === undefined || fixed === undefined) continue
      if (compare(version, introduced) >= 0 && compare(version, fixed) < 0) return true
    }
  }
  return false
}

function compare(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10))
  const pb = b.split('.').map((n) => parseInt(n, 10))
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}

export interface MockServer {
  url: string
  close: () => Promise<void>
  /** Log of all requests, for assertions. */
  requests: Array<{ method: string; url: string }>
}

export async function startMockServer(
  advisories: MockAdvisory[] = [MINIMIST_VULN],
  packages: MockPackage[] = [MINIMIST_PACKAGE]
): Promise<MockServer> {
  const requests: Array<{ method: string; url: string }> = []
  const server: Server = createHttpsServer(
    { key: readFileSync(keyPath), cert: readFileSync(certPath) },
    async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    requests.push({ method: req.method ?? 'GET', url: req.url ?? '/' })

    if (req.method === 'POST' && url.pathname === '/v1/querybatch') {
      let body = ''
      for await (const chunk of req) body += chunk
      const parsed = JSON.parse(body) as {
        queries: Array<{ package: { name: string }; version: string }>
      }
      const results = parsed.queries.map((q) => {
        const matches = advisories.filter(
          (a) =>
            a.affected.some((af) => af.package.name === q.package.name) && versionAffected(a, q.version)
        )
        return { vulns: matches }
      })
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ results }))
      return
    }

    if (req.method === 'GET' && url.pathname.startsWith('/v1/vulns/')) {
      const id = decodeURIComponent(url.pathname.slice('/v1/vulns/'.length))
      const vuln = advisories.find((a) => a.id === id || a.aliases.includes(id))
      if (!vuln) {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ code: 404, message: 'Not found' }))
        return
      }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(vuln))
      return
    }

    // npm registry packument: GET /<package>
    if (req.method === 'GET') {
      const name = url.pathname.slice(1)
      const pkg = packages.find((p) => p.name === name)
      if (pkg) {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ name: pkg.name, versions: pkg.versions, time: pkg.time }))
        return
      }
    }

    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'not found' }))
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return {
    url: `https://127.0.0.1:${port}`,
    close: () => new Promise((resolve, reject) => server.close((e) => (e ? reject(e) : resolve()))),
    requests
  }
}
