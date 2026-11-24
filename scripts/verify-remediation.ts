/* One-off: full remediation flow against a real npm project, using the real
   package manager. Validates command construction + verification end-to-end. */
import { spawn } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { CveLiteProvider, type CveLiteRunner, type EngineRunResult } from '../src/core/ecosystems/javascript/cve-lite-provider'
import { restoreBackup } from '../src/core/fs-safety/backup'

class NodeEngineRunner implements CveLiteRunner {
  version() {
    return JSON.parse(readFileSync('node_modules/cve-lite-cli/package.json', 'utf8')).version
  }
  run(args: string[], opts: { cwd: string; timeoutMs: number }): Promise<EngineRunResult> {
    return new Promise((res, rej) => {
      const child = spawn(process.execPath, [resolve('node_modules/cve-lite-cli/dist/index.js'), ...args], {
        cwd: opts.cwd,
        stdio: ['ignore', 'pipe', 'pipe']
      })
      let stdout = ''
      let stderr = ''
      child.stdout.on('data', (c: Buffer) => (stdout += c))
      child.stderr.on('data', (c: Buffer) => (stderr += c))
      child.on('error', rej)
      child.on('close', (code) => res({ exitCode: code ?? -1, stdout, stderr }))
    })
  }
}

function realExecutor() {
  return {
    run: (argv: string[], opts: { cwd: string; timeoutMs: number }) =>
      new Promise<{ exitCode: number | null; stdout: string; stderr: string; error: string | null }>((res) => {
        const child = spawn(argv[0]!, argv.slice(1), { cwd: opts.cwd, stdio: ['ignore', 'pipe', 'pipe'] })
        let stdout = ''
        let stderr = ''
        child.stdout.on('data', (c: Buffer) => (stdout += c))
        child.stderr.on('data', (c: Buffer) => (stderr += c))
        child.on('error', (e) => res({ exitCode: null, stdout, stderr, error: String(e) }))
        child.on('close', (code) => res({ exitCode: code, stdout, stderr, error: null }))
      })
  }
}

async function main(): Promise<void> {
  const dest = mkdtempSync(join(tmpdir(), 'guardrail-real-'))
  cpSync('tests/fixtures/npm-v2', dest, { recursive: true })
  const backups = mkdtempSync(join(tmpdir(), 'guardrail-real-backups-'))

  const provider = new CveLiteProvider({
    runner: new NodeEngineRunner(),
    executor: realExecutor(),
    getBackupRootDir: () => backups,
    getPackageManagerInfo: async () => ({ available: true, version: '10.9.0' })
  })

  const report = await provider.scan({
    projectId: 'real',
    projectPath: dest,
    projectName: 'fixture-npm',
    options: { includeDev: true, timeoutSeconds: 300, minSeverity: null }
  })
  console.log('SCAN:', report.summary.total, 'findings; targets:', report.remediationPlan?.targets.map((t) => `${t.package}->${t.targetVersion}`))

  const safe = report.remediationPlan!.targets.filter((t) => t.safe)
  const result = await provider.remediate({
    scan: report,
    options: { targetIds: safe.map((t) => t.id), ignoreLifecycleScripts: true, includeBreaking: false }
  })
  console.log('STATE:', result.state)
  console.log('APPLIED:', result.applied.map((a) => `${a.package} ${a.from}->${a.to} ok=${a.ok}`))
  const ver = result.verification
  console.log('VERIFY: resolved', ver?.resolvedIds.length, 'remaining', ver?.remainingIds.length, 'introduced', ver?.introducedIds.length)
  console.log('AFTER SCAN total:', ver?.afterScan.summary.total)

  // Roll back
  const out = await restoreBackup(result.backupDir, dest)
  console.log('ROLLBACK restored:', out.restored.length, 'skipped:', out.skipped.length)
  const pkg = JSON.parse(readFileSync(join(dest, 'package.json'), 'utf8'))
  console.log('pkg.minimist after rollback:', pkg.dependencies.minimist)

  rmSync(dest, { recursive: true, force: true })
  rmSync(backups, { recursive: true, force: true })
  console.log('DONE')
}

main().catch((e) => {
  console.error('FAIL', e)
  process.exit(1)
})
