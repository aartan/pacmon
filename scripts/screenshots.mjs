/**
 * Captures README screenshots of the built renderer with demo data.
 *
 * The Electron preload bridge doesn't exist in a plain browser, so a mock
 * `window.securityApp` is injected before the app boots, populated with demo
 * projects/findings. Requires `npm run build` first (serves out/renderer).
 *
 * Run: node scripts/screenshots.mjs
 */
import { createServer } from 'node:http'
import { readFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, resolve, extname, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import sharp from 'sharp'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const rendererDir = join(root, 'out', 'renderer')
const shotsDir = join(root, 'docs', 'screenshots')

const CHROMIUM_CANDIDATES = [
  join(process.env.HOME ?? '', '.cache', 'ms-playwright', 'chromium-1255', 'chrome-linux64', 'chrome'),
  join(process.env.HOME ?? '', '.cache', 'ms-playwright', 'chromium_headless_shell-1255', 'chrome-linux', 'headless_shell')
]

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.json': 'application/json'
}

function startStaticServer(dir, port = 0) {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost')
      const rel = decodeURIComponent(url.pathname.replace(/^\/+/, ''))
      let filePath = join(dir, rel || 'index.html')
      if (!filePath.startsWith(dir)) throw new Error('forbidden')
      if (!existsSync(filePath) || !rel) filePath = join(dir, 'index.html')
      const data = await readFile(filePath)
      res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] ?? 'application/octet-stream' })
      res.end(data)
    } catch {
      res.writeHead(404)
      res.end('not found')
    }
  })
  return new Promise((resolvePromise) => {
    server.listen(port, '127.0.0.1', () => {
      const { port: actualPort } = server.address()
      resolvePromise({ server, url: `http://127.0.0.1:${actualPort}` })
    })
  })
}

/* ------------------------------- demo data -------------------------------- */

const now = Date.now()
const iso = (minutesAgo) => new Date(now - minutesAgo * 60_000).toISOString()

const projects = [
  {
    id: 'web-storefront',
    name: 'web-storefront',
    path: '/home/dev/web-storefront',
    ecosystem: 'javascript',
    ecosystemLabel: 'JavaScript',
    packageManager: 'npm',
    lockfile: 'package-lock.json',
    lastScanAt: iso(12),
    lastScanSummary: { total: 12, critical: 2, high: 4, medium: 5, low: 1, informational: 0, affectedPackages: 7, fixable: 9 },
    lastRemediatedAt: null
  },
  {
    id: 'api-gateway',
    name: 'api-gateway',
    path: '/home/dev/api-gateway',
    ecosystem: 'javascript',
    ecosystemLabel: 'JavaScript',
    packageManager: 'pnpm',
    lockfile: 'pnpm-lock.yaml',
    lastScanAt: iso(45),
    lastScanSummary: { total: 0, critical: 0, high: 0, medium: 0, low: 0, informational: 0, affectedPackages: 0, fixable: 0 },
    lastRemediatedAt: iso(40)
  },
  {
    id: 'design-system',
    name: 'design-system',
    path: '/home/dev/design-system',
    ecosystem: 'javascript',
    ecosystemLabel: 'JavaScript',
    packageManager: 'yarn',
    lockfile: 'yarn.lock',
    lastScanAt: iso(200),
    lastScanSummary: { total: 4, critical: 0, high: 1, medium: 2, low: 1, informational: 0, affectedPackages: 3, fixable: 3 },
    lastRemediatedAt: null
  }
]

const history = [
  {
    id: 'scan-web-storefront-2',
    projectId: 'web-storefront',
    projectName: 'web-storefront',
    projectPath: '/home/dev/web-storefront',
    ecosystem: 'javascript',
    scannedAt: iso(12),
    durationMs: 8420,
    engineVersion: '1.42.0',
    summary: projects[0].lastScanSummary,
    remediationId: null
  },
  {
    id: 'scan-api-gateway-2',
    projectId: 'api-gateway',
    projectName: 'api-gateway',
    projectPath: '/home/dev/api-gateway',
    ecosystem: 'javascript',
    scannedAt: iso(45),
    durationMs: 6210,
    engineVersion: '1.42.0',
    summary: projects[1].lastScanSummary,
    remediationId: 'rem-1'
  },
  {
    id: 'scan-web-storefront-1',
    projectId: 'web-storefront',
    projectName: 'web-storefront',
    projectPath: '/home/dev/web-storefront',
    ecosystem: 'javascript',
    scannedAt: iso(2600),
    durationMs: 9030,
    engineVersion: '1.42.0',
    summary: { total: 14, critical: 3, high: 4, medium: 5, low: 2, informational: 0, affectedPackages: 8, fixable: 10 },
    remediationId: null
  },
  {
    id: 'scan-design-system-1',
    projectId: 'design-system',
    projectName: 'design-system',
    projectPath: '/home/dev/design-system',
    ecosystem: 'javascript',
    scannedAt: iso(200),
    durationMs: 5180,
    engineVersion: '1.42.0',
    summary: projects[2].lastScanSummary,
    remediationId: null
  }
]

function finding(partial) {
  return {
    advisoryIds: ['GHSA-demo'],
    cveIds: [],
    description: null,
    references: [],
    cvssVector: null,
    cvssScore: null,
    epssScore: null,
    epssPercentile: null,
    dependencyPaths: [],
    isDev: false,
    importedInSource: null,
    fixVersionPublishedAt: null,
    cooldownWarning: null,
    recommendedAction: null,
    runnableFixCommand: null,
    ...partial
  }
}

const report = {
  id: 'scan-web-storefront-2',
  projectId: 'web-storefront',
  projectName: 'web-storefront',
  projectPath: '/home/dev/web-storefront',
  ecosystem: 'javascript',
  packageManager: 'npm',
  lockfileSource: 'package-lock.json',
  mode: 'resolved-lockfile',
  scannedAt: iso(12),
  durationMs: 8420,
  engineVersion: '1.42.0',
  complete: true,
  diagnostics: [],
  warnings: [],
  notes: [],
  packageCount: 412,
  summary: projects[0].lastScanSummary,
  vulnerabilities: [
    finding({
      id: 'GHSA-2qv8-5mcp-qpwg:lodash@4.17.20',
      packageName: 'lodash',
      installedVersion: '4.17.20',
      fixedVersion: '4.17.21',
      validatedFixedVersion: '4.17.21',
      severity: 'critical',
      title: 'Command Injection in lodash',
      summary: 'Prototype pollution in lodash versions before 4.17.21 can lead to command injection via crafted templates.',
      cveIds: ['CVE-2021-23337'],
      cvssScore: 7.4,
      epssScore: 0.42,
      epssPercentile: 86,
      dependencyKind: 'transitive',
      dependencyPaths: [['web-storefront', '@shop/checkout', 'lodash']],
      recommendedAction: 'Override lodash@4.17.20 to 4.17.21 in package.json overrides.',
      remediation: { type: 'unavailable', targetVersion: null, breaking: false, autoFixable: false, reason: 'No safe parent update is available.' }
    }),
    finding({
      id: 'GHSA-xvch-5gv4-984h:minimist@1.2.5',
      packageName: 'minimist',
      installedVersion: '1.2.5',
      fixedVersion: '1.2.6',
      validatedFixedVersion: '1.2.6',
      severity: 'critical',
      title: 'Prototype Pollution in minimist',
      summary: 'minimist before 1.2.6 could be tricked into adding or modifying properties of Object.prototype.',
      cveIds: ['CVE-2021-44906'],
      cvssScore: 9.8,
      epssScore: 0.97,
      epssPercentile: 99,
      dependencyKind: 'direct',
      dependencyPaths: [['web-storefront', 'minimist']],
      recommendedAction: 'Upgrade minimist to 1.2.6.',
      runnableFixCommand: 'npm install minimist@1.2.6',
      remediation: { type: 'direct-upgrade', targetVersion: '1.2.6', breaking: false, autoFixable: true, reason: null }
    }),
    finding({
      id: 'GHSA-8cf7-32gw-wr33:jsonwebtoken@8.5.1',
      packageName: 'jsonwebtoken',
      installedVersion: '8.5.1',
      fixedVersion: '9.0.0',
      validatedFixedVersion: '9.0.0',
      severity: 'high',
      title: 'jsonwebtoken restricted key type vulnerability',
      summary: 'jsonwebtoken before 9.0.0 allows attackers to bypass the restricted key type checks.',
      cveIds: ['CVE-2022-23529'],
      cvssScore: 7.6,
      epssScore: 0.31,
      epssPercentile: 72,
      dependencyKind: 'transitive',
      dependencyPaths: [['web-storefront', 'passport', 'jsonwebtoken']],
      remediation: { type: 'transitive-update', targetVersion: '9.0.0', breaking: false, autoFixable: true, reason: null }
    }),
    finding({
      id: 'GHSA-r683-j2x4-v87g:node-fetch@2.6.7',
      packageName: 'node-fetch',
      installedVersion: '2.6.7',
      fixedVersion: '2.6.9',
      validatedFixedVersion: '2.6.9',
      severity: 'medium',
      title: 'node-fetch forwards secure headers to untrusted sites',
      summary: 'node-fetch before 2.6.9 and 3.1.1 forwards secure headers to untrusted redirect targets.',
      cveIds: ['CVE-2022-0235'],
      cvssScore: 6.1,
      epssScore: 0.24,
      epssPercentile: 61,
      dependencyKind: 'direct',
      dependencyPaths: [['web-storefront', 'node-fetch']],
      recommendedAction: 'Upgrade node-fetch to 2.6.9.',
      remediation: { type: 'direct-upgrade', targetVersion: '2.6.9', breaking: false, autoFixable: true, reason: null }
    }),
    finding({
      id: 'GHSA-c2qf-rxjj-qqgw:semver@7.3.8',
      packageName: 'semver',
      installedVersion: '7.3.8',
      fixedVersion: '7.5.2',
      validatedFixedVersion: '7.5.2',
      severity: 'low',
      title: 'semver vulnerable to regular expression denial of service',
      summary: 'Versions of semver before 7.5.2 are vulnerable to ReDoS when parsing certain ranges.',
      cveIds: ['CVE-2022-25883'],
      cvssScore: 5.3,
      epssScore: 0.19,
      epssPercentile: 48,
      dependencyKind: 'transitive',
      dependencyPaths: [['web-storefront', 'eslint', 'semver']],
      remediation: { type: 'unavailable', targetVersion: null, breaking: false, autoFixable: false, reason: 'No safe parent update is available.' }
    })
  ],
  remediationPlan: {
    packageManager: 'npm',
    coveredFindingCount: 3,
    totalFindingCount: 12,
    targets: [
      {
        id: 'direct:minimist@1.2.5->1.2.6:0',
        package: 'minimist',
        registryName: null,
        currentVersion: '1.2.5',
        targetVersion: '1.2.6',
        kind: 'direct',
        severity: 'critical',
        urgent: true,
        isDev: false,
        workspaces: [],
        childPackage: null,
        reason: 'Direct upgrade target for minimist@1.2.5.',
        adjustmentNote: null,
        fixVersionPublishedAt: '2022-03-22T02:50:30.352Z',
        breaking: false,
        safe: true,
        resolvesFindings: 1
      },
      {
        id: 'parent-update:passport@0.6.0->0.6.1:1',
        package: 'passport',
        registryName: null,
        currentVersion: '0.6.0',
        targetVersion: '0.6.1',
        kind: 'parent-update',
        severity: 'high',
        urgent: false,
        isDev: false,
        workspaces: [],
        childPackage: 'jsonwebtoken',
        reason: 'Refreshing passport picks up jsonwebtoken@9.0.0.',
        adjustmentNote: null,
        fixVersionPublishedAt: '2022-12-10T12:00:00.000Z',
        breaking: false,
        safe: true,
        resolvesFindings: 1
      },
      {
        id: 'direct:node-fetch@2.6.7->2.6.9:2',
        package: 'node-fetch',
        registryName: null,
        currentVersion: '2.6.7',
        targetVersion: '2.6.9',
        kind: 'direct',
        severity: 'medium',
        urgent: false,
        isDev: false,
        workspaces: [],
        childPackage: null,
        reason: 'Direct upgrade target for node-fetch@2.6.7.',
        adjustmentNote: null,
        fixVersionPublishedAt: '2022-01-19T10:00:00.000Z',
        breaking: false,
        safe: true,
        resolvesFindings: 1
      }
    ],
    unavailable: [
      { package: 'semver', version: '7.3.8', reason: 'No safe parent update is available.' },
      { package: 'lodash', version: '4.17.20', reason: 'No safe parent update is available.' }
    ]
  },
  scanOptions: { includeDev: true, timeoutSeconds: 300, minSeverity: null }
}

const advisory = {
  id: 'GHSA-xvch-5gv4-984h',
  aliases: ['CVE-2021-44906'],
  summary: 'Prototype Pollution in minimist',
  severity: 'critical',
  cvssVector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H',
  cvssScore: '9.8',
  description:
    'minimist before 1.2.6 could be tricked into adding or modifying properties of Object.prototype, leading to prototype pollution that may result in information disclosure, denial of service, or arbitrary code execution.',
  references: [
    'https://github.com/substack/minimist/security/advisories/GHSA-xvch-5gv4-984h',
    'https://nvd.nist.gov/vuln/detail/CVE-2021-44906'
  ],
  published: '2022-03-17T00:00:00Z',
  modified: '2022-03-21T00:00:00Z',
  affected: [
    {
      package: { ecosystem: 'npm', name: 'minimist' },
      ranges: [{ type: 'SEMVER', events: [{ introduced: '0' }, { fixed: '1.2.6' }] }]
    }
  ]
}

const settings = {
  theme: 'light',
  defaultIncludeDev: true,
  defaultIgnoreLifecycleScripts: true,
  scanTimeoutSeconds: 300,
  backupRetentionDays: 14,
  minSeverity: null,
  testCommand: 'npm test',
  branchNamePattern: 'fix/{project}-deps-{date}',
  commitMessagePattern: 'fix(deps): remediate vulnerable dependencies [pacmon]'
}

/* ----------------------------- bridge injection ---------------------------- */

const mockBridge = `
;(() => {
  const ok = (data) => ({ ok: true, data })
  const noop = () => () => {}
  const appInfo = { name: 'Pacmon', version: '0.1.0', engine: { name: 'cve-lite-cli', version: '1.42.0 / OSV' }, node: '24.2.0', electron: '45.4.1', platform: 'linux' }
  const projects = ${JSON.stringify(projects)}
  const history = ${JSON.stringify(history)}
  const report = ${JSON.stringify(report)}
  const advisory = ${JSON.stringify(advisory)}
  const settings = ${JSON.stringify(settings)}
  const bridge = {
    getAppInfo: () => Promise.resolve(ok(appInfo)),
    pickProject: () => Promise.resolve(ok({ cancelled: true, path: null })),
    detectProject: () => Promise.resolve(ok(null)),
    registerProject: () => Promise.resolve(ok(null)),
    listProjects: () => Promise.resolve(ok({ projects })),
    removeProject: () => Promise.resolve(ok(null)),
    startScan: () => Promise.resolve(ok(report)),
    cancelScan: () => Promise.resolve(ok(null)),
    getScan: () => Promise.resolve(ok(report)),
    getAdvisory: () => Promise.resolve(ok(advisory)),
    previewRemediation: () => Promise.resolve(ok({
      scanId: report.id,
      actions: [
        { targetId: 'direct:minimist@1.2.5->1.2.6:0', package: 'minimist', from: '1.2.5', to: '1.2.6', kind: 'direct', breaking: false, isDev: false, workspaces: [], command: 'npm install minimist@1.2.6' },
        { targetId: 'parent-update:passport@0.6.0->0.6.1:1', package: 'passport', from: '0.6.0', to: '0.6.1', kind: 'parent-update', breaking: false, isDev: false, workspaces: [], command: 'npm update passport' },
        { targetId: 'direct:node-fetch@2.6.7->2.6.9:2', package: 'node-fetch', from: '2.6.7', to: '2.6.9', kind: 'direct', breaking: false, isDev: false, workspaces: [], command: 'npm install node-fetch@2.6.9' }
      ],
      resolvesFindings: 3,
      breakingCount: 0,
      filesToBackup: ['package.json', 'package-lock.json'],
      backupDir: '/home/dev/.config/pacmon/backups',
      lifecycleScriptsIgnored: true,
      packageManagerAvailable: true,
      packageManagerVersion: '10.9.0'
    })),
    applyRemediation: () => Promise.resolve(ok(null)),
    rollbackRemediation: () => Promise.resolve(ok(null)),
    previewOverrides: () => Promise.resolve(ok({
      scanId: report.id,
      packageManager: 'npm',
      field: 'overrides',
      entries: [
        { package: 'lodash', from: '4.17.20', to: '4.17.21', severity: 'critical', resolvesFindings: 1 },
        { package: 'semver', from: '7.3.8', to: '7.5.2', severity: 'low', resolvesFindings: 1 }
      ],
      manifestPath: '/home/dev/web-storefront/package.json',
      filesToBackup: ['package.json', 'package-lock.json'],
      packageManagerAvailable: true,
      packageManagerVersion: '10.9.0',
      installCommand: 'npm install',
      preservesExisting: 0
    })),
    applyOverrides: () => Promise.resolve(ok(null)),
    verifyInstalledVersions: () => Promise.resolve(ok({ results: [] })),
    detectTests: () => Promise.resolve(ok({ projectId: 'web-storefront', command: 'npm test', scriptName: 'test', runnable: true, reason: null })),
    runTests: () => Promise.resolve(ok(null)),
    scanAll: () => Promise.resolve(ok(null)),
    remediateAll: () => Promise.resolve(ok(null)),
    previewGitCommit: () => Promise.resolve(ok(null)),
    commitChanges: () => Promise.resolve(ok(null)),
    listHistory: () => Promise.resolve(ok({ records: history })),
    getHistoryScan: () => Promise.resolve(ok(report)),
    compareScans: () => Promise.resolve(ok(null)),
    deleteHistoryScan: () => Promise.resolve(ok(null)),
    getSettings: () => Promise.resolve(ok(settings)),
    setSettings: (s) => Promise.resolve(ok(s)),
    exportJson: () => Promise.resolve(ok({ path: '' })),
    onScanProgress: noop,
    onRemediationProgress: noop,
    onBulkProgress: noop,
    onTestOutput: noop
  }
  localStorage.setItem('pacmon-theme', 'light')
  Object.defineProperty(window, 'securityApp', { value: bridge, configurable: true })
})();
`

/* ------------------------------- screenshots ------------------------------- */

const SHOTS = [
  { name: 'dashboard', hash: '#/', wait: 'Security posture', viewport: { width: 1440, height: 940 } },
  {
    name: 'project-findings',
    hash: '#/projects/web-storefront',
    wait: 'Remediation',
    viewport: { width: 1440, height: 1600 },
    before: async (page) => {
      await page.locator('#main button', { hasText: 'minimist' }).first().click()
      await page.waitForSelector('text=Dependency path')
    }
  },
  {
    name: 'remediation',
    hash: '#/projects/web-storefront',
    wait: 'Remediation',
    viewport: { width: 1440, height: 1300 },
    before: async (page) => {
      await page.getByText('Include transitive dependencies in fix').click()
      await page.waitForSelector('text=Apply fixes + 2 overrides')
      await page.evaluate(() => {
        const main = document.getElementById('main')
        if (main) main.scrollTop = main.scrollHeight
      })
      await page.waitForTimeout(300)
    }
  },
  { name: 'settings', hash: '#/settings', wait: 'Git integration', viewport: { width: 1440, height: 1200 } },
  { name: 'history', hash: '#/history', wait: 'Scan history', viewport: { width: 1440, height: 940 } }
]

async function main() {
  if (!existsSync(join(rendererDir, 'index.html'))) {
    console.error('out/renderer is missing — run `npm run build` first.')
    process.exit(1)
  }
  await mkdir(shotsDir, { recursive: true })

  const executablePath = CHROMIUM_CANDIDATES.find((p) => existsSync(p))
  if (!executablePath) {
    console.error('No cached Playwright Chromium found. Install with `npx playwright install chromium`.')
    process.exit(1)
  }

  const { server, url } = await startStaticServer(rendererDir)
  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  })

  try {
    for (const shot of SHOTS) {
      const page = await browser.newPage({ viewport: shot.viewport, deviceScaleFactor: 2 })
      await page.addInitScript(mockBridge)
      await page.goto(`${url}/${shot.hash}`, { waitUntil: 'load' })
      await page.waitForSelector(`text=${shot.wait}`, { timeout: 15000 })
      await page.evaluate(() => document.fonts.ready)
      if (shot.before) await shot.before(page)
      await page.waitForTimeout(200)
      const png = await page.screenshot({ type: 'png' })
      const out = join(shotsDir, `${shot.name}.webp`)
      await sharp(png).webp({ quality: 86 }).toFile(out)
      console.log(`wrote ${out}`)
      await page.close()
    }
  } finally {
    await browser.close()
    server.close()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
