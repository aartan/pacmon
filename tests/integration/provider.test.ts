/**
 * Integration tests: the real cve-lite-cli engine (via its documented
 * `--json` interface) against fixture projects, with a local mock OSV +
 * registry server so no external network or registry is required.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { spawn } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type {
  CveLiteRunner,
  CommandExecutor,
  EngineRunResult
} from '@core/ecosystems/javascript/cve-lite-provider'
import { CveLiteProvider } from '@core/ecosystems/javascript/cve-lite-provider'
import { startMockServer, type MockServer } from '../helpers/mock-osv'
import type { ScanReport } from '@shared/models'

const cliEntry = resolve(__dirname, '../../node_modules/cve-lite-cli/dist/index.js')

/** Real subprocess runner on plain Node (tests run outside Electron). */
class NodeEngineRunner implements CveLiteRunner {
  version(): string {
    const pkg = JSON.parse(
      readFileSync(resolve(__dirname, '../../node_modules/cve-lite-cli/package.json'), 'utf8')
    ) as { version: string }
    return pkg.version
  }

  run(args: string[], opts: { cwd: string; timeoutMs: number }): Promise<EngineRunResult> {
    return new Promise((resolvePromise, reject) => {
      const child = spawn(process.execPath, [cliEntry, ...args], {
        cwd: opts.cwd,
        env: { ...process.env, NO_COLOR: '1' },
        stdio: ['ignore', 'pipe', 'pipe']
      })
      let stdout = ''
      let stderr = ''
      child.stdout.on('data', (c: Buffer) => (stdout += c.toString()))
      child.stderr.on('data', (c: Buffer) => (stderr += c.toString()))
      child.on('error', reject)
      child.on('close', (code) => resolvePromise({ exitCode: code ?? -1, stdout, stderr }))
    })
  }
}

let server: MockServer
let backupRoot: string
let provider: CveLiteProvider

beforeAll(async () => {
  server = await startMockServer()
  // The engine's fetches (OSV, registry) trust our self-signed test CA, and
  // NPM_CONFIG_REGISTRY is the supported way to point it at a local registry.
  process.env.NODE_EXTRA_CA_CERTS = resolve(__dirname, '../helpers/certs/test-cert.pem')
  process.env.NPM_CONFIG_REGISTRY = `${server.url}/`
  backupRoot = mkdtempSync(join(tmpdir(), 'pacmon-backups-'))
  provider = new CveLiteProvider({
    runner: new NodeEngineRunner(),
    executor: mockExecutor,
    getBackupRootDir: () => backupRoot,
    getPackageManagerInfo: async () => ({ available: true, version: '10.9.0' }),
    extraScanArgs: ['--osv-url', server.url, '--allow-private-osv-url', '--no-cache']
  })
})

afterAll(async () => {
  await server.close()
  rmSync(backupRoot, { recursive: true, force: true })
})

function copyFixture(name: string): string {
  const src = resolve(__dirname, '../fixtures', name)
  const dest = mkdtempSync(join(tmpdir(), `pacmon-${name}-`))
  cpSync(src, dest, { recursive: true })
  return dest
}

function scanOptions() {
  return { includeDev: true, timeoutSeconds: 120, minSeverity: null }
}

describe('CveLiteProvider.scan (real engine, mock OSV)', () => {
  it('finds the vulnerable minimist in an npm project', async () => {
    const project = copyFixture('npm-v2')
    const report = await provider.scan({
      projectId: 'p1',
      projectPath: project,
      projectName: 'fixture-npm',
      options: scanOptions()
    })
    expect(report.ecosystem).toBe('javascript')
    expect(report.packageManager).toBe('npm')
    expect(report.engineVersion).toBe('1.42.0')
    expect(report.complete).toBe(true)

    const minimist = report.vulnerabilities.find((v) => v.packageName === 'minimist')
    expect(minimist).toBeDefined()
    expect(minimist!.installedVersion).toBe('1.2.5')
    expect(minimist!.severity).toBe('critical')
    expect(minimist!.cveIds).toContain('CVE-2021-44906')
    expect(minimist!.fixedVersion).toBe('1.2.6')

    const plan = report.remediationPlan!
    expect(plan).not.toBeNull()
    const target = plan.targets.find((t) => t.package === 'minimist')
    expect(target).toBeDefined()
    expect(target!.targetVersion).toBe('1.2.6')
    expect(target!.safe).toBe(true)
    rmSync(project, { recursive: true, force: true })
  })

  it('scans a pnpm project', async () => {
    const project = copyFixture('pnpm-v9')
    const report = await provider.scan({
      projectId: 'p2',
      projectPath: project,
      projectName: 'fixture-pnpm',
      options: scanOptions()
    })
    expect(report.packageManager).toBe('pnpm')
    const minimist = report.vulnerabilities.find((v) => v.packageName === 'minimist')
    expect(minimist?.installedVersion).toBe('1.2.5')
    rmSync(project, { recursive: true, force: true })
  })

  it('scans a yarn classic project', async () => {
    const project = copyFixture('yarn-classic')
    const report = await provider.scan({
      projectId: 'p3',
      projectPath: project,
      projectName: 'fixture-yarn',
      options: scanOptions()
    })
    expect(report.packageManager).toBe('yarn')
    const minimist = report.vulnerabilities.find((v) => v.packageName === 'minimist')
    expect(minimist?.installedVersion).toBe('1.2.5')
    rmSync(project, { recursive: true, force: true })
  })

  it('errors cleanly on folders with nothing to scan', async () => {
    const project = copyFixture('non-js')
    await expect(
      provider.scan({ projectId: 'p4', projectPath: project, projectName: 'non-js', options: scanOptions() })
    ).rejects.toThrow(/Scan failed/)
    rmSync(project, { recursive: true, force: true })
  })
})

describe('CveLiteProvider.remediate (mocked executor, real verification)', () => {
  it('backs up, applies, verifies, and rolls back', async () => {
    const project = copyFixture('npm-v2')
    const scan = await provider.scan({
      projectId: 'p1',
      projectPath: project,
      projectName: 'fixture-npm',
      options: scanOptions()
    })
    const target = scan.remediationPlan!.targets.find((t) => t.package === 'minimist')!
    expect(target).toBeDefined()

    // Capture what the executor is asked to run.
    const commandsRun: string[][] = []
    provider = new CveLiteProvider({
      runner: new NodeEngineRunner(),
      executor: {
        run: async (argv) => {
          commandsRun.push(argv)
          simulateNpmInstall(project, 'minimist', '1.2.6')
          return { exitCode: 0, stdout: '', stderr: '', error: null }
        }
      },
      getBackupRootDir: () => backupRoot,
      getPackageManagerInfo: async () => ({ available: true, version: '10.9.0' }),
      extraScanArgs: ['--osv-url', server.url, '--allow-private-osv-url', '--no-cache']
    })

    const result = await provider.remediate({
      scan,
      options: { targetIds: [target.id], ignoreLifecycleScripts: true, includeBreaking: false }
    })

    expect(result.state).toBe('complete')
    expect(result.error).toBeNull()
    expect(commandsRun).toEqual([['npm', 'install', '--ignore-scripts', 'minimist@1.2.6']])
    expect(result.applied[0]?.ok).toBe(true)

    // Verification must come from a fresh scan.
    const ver = result.verification!
    expect(ver).not.toBeNull()
    expect(ver.resolvedIds.length).toBeGreaterThan(0)
    expect(ver.afterScan).not.toBeNull()
    const stillThere = ver.afterScan!.vulnerabilities.find((v) => v.packageName === 'minimist')
    expect(stillThere).toBeUndefined()

    // The project files really changed.
    const pkg = JSON.parse(readFileSync(join(project, 'package.json'), 'utf8')) as Record<string, unknown>
    expect((pkg.dependencies as Record<string, string>).minimist).toBe('1.2.6')

    // Rollback restores the original state.
    const restored = await restoreFromBackup(result.backupDir, project)
    expect(restored).toContain('package.json')
    rmSync(project, { recursive: true, force: true })
  })

  it('fails safely and rolls back when a command fails', async () => {
    const project = copyFixture('npm-v2')
    const scan = await provider.scan({
      projectId: 'p1',
      projectPath: project,
      projectName: 'fixture-npm',
      options: scanOptions()
    })
    const target = scan.remediationPlan!.targets.find((t) => t.package === 'minimist')!

    provider = new CveLiteProvider({
      runner: new NodeEngineRunner(),
      executor: {
        run: async (argv) => {
          simulateNpmInstall(project, 'minimist', '1.2.6')
          return { exitCode: 1, stdout: '', stderr: 'npm ERR! something broke', error: null }
        }
      },
      getBackupRootDir: () => backupRoot,
      getPackageManagerInfo: async () => ({ available: true, version: '10.9.0' }),
      extraScanArgs: ['--osv-url', server.url, '--allow-private-osv-url', '--no-cache']
    })

    const result = await provider.remediate({
      scan,
      options: { targetIds: [target.id], ignoreLifecycleScripts: true, includeBreaking: false }
    })

    expect(result.state).toBe('failed')
    expect(result.error).toContain('something broke')
    expect(result.verification).toBeNull()

    // Automatic rollback: package.json restored to the original content.
    const pkg = JSON.parse(readFileSync(join(project, 'package.json'), 'utf8')) as Record<string, unknown>
    expect((pkg.dependencies as Record<string, string>).minimist).toBe('1.2.5')
    rmSync(project, { recursive: true, force: true })
  })
})

describe('CveLiteProvider.applyOverrides (mocked executor, real verification)', () => {
  it('writes version-scoped overrides, installs, verifies, and rolls back', async () => {
    const project = copyFixture('npm-v2')
    const real = await provider.scan({
      projectId: 'p1',
      projectPath: project,
      projectName: 'fixture-npm',
      options: scanOptions()
    })

    // Simulate a post-remediation scan where minimist remains as a transitive
    // finding the normal flow could not move.
    const scan: ScanReport = {
      ...real,
      vulnerabilities: real.vulnerabilities.map((v) =>
        v.packageName === 'minimist'
          ? {
              ...v,
              dependencyKind: 'transitive',
              remediation: {
                type: 'unavailable',
                targetVersion: null,
                breaking: false,
                autoFixable: false,
                reason: null
              }
            }
          : v
      ),
      remediationPlan: real.remediationPlan
        ? { ...real.remediationPlan, targets: [], unavailable: [] }
        : null
    }

    const commandsRun: string[][] = []
    provider = new CveLiteProvider({
      runner: new NodeEngineRunner(),
      executor: {
        run: async (argv) => {
          commandsRun.push(argv)
          if (argv[0] === 'npm' && argv[1] === 'ls') {
            // Simulate the installed tree after the override took effect.
            return {
              exitCode: 0,
              stdout: 'fixture-npm@1.0.0 /fixture\n`-- minimist@1.2.6\n',
              stderr: '',
              error: null
            }
          }
          simulateOverrideInstall(project)
          return { exitCode: 0, stdout: '', stderr: '', error: null }
        }
      },
      getBackupRootDir: () => backupRoot,
      getPackageManagerInfo: async () => ({ available: true, version: '10.9.0' }),
      extraScanArgs: ['--osv-url', server.url, '--allow-private-osv-url', '--no-cache']
    })

    const result = await provider.applyOverrides({ scan, ignoreLifecycleScripts: true })

    expect(result.state).toBe('complete')
    expect(result.error).toBeNull()
    expect(result.entries).toEqual([
      expect.objectContaining({ package: 'minimist', from: '1.2.5', to: '1.2.6' })
    ])
    expect(commandsRun).toEqual([['npm', 'install', '--ignore-scripts']])

    // package.json got the flat version-scoped override for exactly that version.
    const pkg = JSON.parse(readFileSync(join(project, 'package.json'), 'utf8')) as Record<string, unknown>
    expect(pkg.overrides).toEqual({ 'minimist@1.2.5': '1.2.6' })

    // Verification ran a fresh scan that sees the overridden version.
    expect(result.verification).not.toBeNull()
    expect(result.verification!.resolvedIds.length).toBeGreaterThan(0)

    // The npm-ls equivalent confirms the vulnerable version is gone.
    const checks = await provider.verifyInstalledVersions(scan, [
      { package: 'minimist', from: '1.2.5', to: '1.2.6' }
    ])
    expect(checks).toHaveLength(1)
    expect(checks[0]).toMatchObject({ ok: true, stillInstalled: false, targetInstalled: true })
    expect(commandsRun).toContainEqual(['npm', 'ls', 'minimist'])

    // Rollback restores the pre-override files.
    const restored = await restoreFromBackup(result.backupDir, project)
    expect(restored).toContain('package.json')
    const rolledBack = JSON.parse(readFileSync(join(project, 'package.json'), 'utf8')) as Record<string, unknown>
    expect(rolledBack.overrides).toBeUndefined()
    rmSync(project, { recursive: true, force: true })
  })
})

/* ------------------------------ helpers ---------------------------------- */

const mockExecutor: CommandExecutor = {
  run: async () => ({ exitCode: 0, stdout: '', stderr: '', error: null })
}

/** Simulate what `npm install minimist@1.2.6` does to the fixture files. */
function simulateNpmInstall(project: string, name: string, version: string): void {
  const pkgPath = join(project, 'package.json')
  const lockPath = join(project, 'package-lock.json')
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
    dependencies: Record<string, string>
  }
  pkg.dependencies[name] = version
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2))
  const lock = JSON.parse(readFileSync(lockPath, 'utf8')) as {
    packages: Record<string, { version?: string }>
    dependencies: Record<string, { version?: string }>
  }
  lock.packages['node_modules/minimist'] = { version }
  lock.dependencies['minimist'] = { version }
  writeFileSync(lockPath, JSON.stringify(lock, null, 2))
}

/**
 * Simulate what `npm install` does after `overrides` were written to
 * package.json: the lockfile now records the overridden (fixed) version.
 */
function simulateOverrideInstall(project: string): void {
  const lockPath = join(project, 'package-lock.json')
  const lock = JSON.parse(readFileSync(lockPath, 'utf8')) as {
    packages: Record<string, { version?: string }>
    dependencies: Record<string, { version?: string }>
  }
  lock.packages['node_modules/minimist'] = { version: '1.2.6' }
  lock.dependencies['minimist'] = { version: '1.2.6' }
  writeFileSync(lockPath, JSON.stringify(lock, null, 2))
}

async function restoreFromBackup(backupDir: string, project: string): Promise<string[]> {
  const { restoreBackup } = await import('@core/fs-safety/backup')
  const outcome = await restoreBackup(backupDir, project)
  return outcome.restored
}
