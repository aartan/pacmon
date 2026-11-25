/**
 * IPC surface. Every handler validates its payload with zod, resolves
 * projects through the registry, and enforces path containment. The renderer
 * can only ever trigger operations against registered project paths, with
 * package-manager execution restricted to the fixed allowlist in exec-service.
 */
import { app, dialog, ipcMain, type BrowserWindow } from 'electron'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { z } from 'zod'
import { CHANNELS, EVENTS, err, ok, type IpcResult } from '../../shared/ipc'
import {
  projectIdSchema,
  remediationApplyOptionsSchema,
  scanIdSchema,
  scanOptionsSchema,
  settingsSchema,
  testCommandSchema
} from '../../shared/ipc'
import type {
  AppSettings,
  BulkRemediateProjectResult,
  BulkScanProjectResult,
  OverrideApplyResult,
  ProjectInfo,
  RemediationProgress,
  RemediationResult,
  ScanProgress
} from '../../shared/models'
import type { HistoryStore } from '../services/history-store'
import type { ProjectRegistry, StoredProject } from '../services/project-registry'
import type { SettingsStore } from '../services/settings-store'
import type { AdvisoryService } from '../services/advisory-service'
import type { GitService } from '../services/git-service'
import { gitCandidateFiles } from '../services/git-service'
import type { ProjectTestRunner } from '../services/exec-service'
import { getJavaScriptProvider } from '../../core/ecosystems/registry'
import { detectProject, resolveProjectName } from '../../core/detection/detect'
import { containPath } from '../../core/fs-safety/containment'
import { pruneBackups, restoreBackup } from '../../core/fs-safety/backup'
import { diffScans } from '../../core/remediation/verifier'
import { parseTestCommand } from '../../core/ecosystems/javascript/test-command'

export interface IpcDeps {
  getWindow: () => BrowserWindow | null
  registry: ProjectRegistry
  history: HistoryStore
  settings: SettingsStore
  advisories: AdvisoryService
  git: GitService
  testRunner: ProjectTestRunner
  backupRootDir: string
}

const activeScans = new Map<string, AbortController>()

function toProjectInfo(stored: StoredProject, history: HistoryStore): ProjectInfo {
  const last = history.latestForProject(stored.id)
  const lastRemediation = history.latestRemediationForProject(stored.id)
  return {
    id: stored.id,
    name: stored.name,
    path: stored.path,
    ecosystem: stored.ecosystem,
    ecosystemLabel: stored.ecosystemLabel,
    packageManager: (stored.packageManager as ProjectInfo['packageManager']) ?? null,
    lockfile: stored.lockfile,
    lastScanAt: last?.scannedAt ?? null,
    lastScanSummary: last?.summary ?? null,
    lastRemediatedAt:
      lastRemediation && lastRemediation.state === 'complete' ? lastRemediation.finishedAt : null
  }
}

/**
 * Wraps every handler so validation errors and unexpected throws resolve to a
 * structured err() result instead of rejecting across the bridge.
 */
function handle(
  channel: string,
  fn: (...args: unknown[]) => Promise<IpcResult<unknown>> | IpcResult<unknown>
): void {
  ipcMain.handle(channel, async (_event, ...args: unknown[]) => {
    try {
      return await fn(...args)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      return err(message.startsWith('Invalid') ? `Invalid request: ${message}` : message)
    }
  })
}

const stringPayload = (value: unknown, max = 4096): string => {
  if (typeof value !== 'string' || value.length === 0 || value.length > max) {
    throw new Error(`expected a string of 1-${max} characters`)
  }
  return value
}

/**
 * Persist override applications through the remediation table so the
 * existing rollback channel works for them unchanged.
 */
function overrideResultAsRemediation(result: OverrideApplyResult): RemediationResult {
  return {
    id: result.id,
    scanId: result.scanId,
    projectId: result.projectId,
    startedAt: result.startedAt,
    finishedAt: result.finishedAt,
    state: result.state,
    backupDir: result.backupDir,
    applied: result.entries.map((entry) => ({
      targetId: `override:${entry.package}@${entry.from}`,
      package: entry.package,
      from: entry.from,
      to: entry.to,
      ok: true,
      error: null
    })),
    verification: result.verification,
    error: result.error
  }
}

export function registerIpc(deps: IpcDeps): void {
  const { getWindow, registry, history, settings, advisories, git, testRunner } = deps

  handle(CHANNELS.appInfo, () => {
    const provider = getJavaScriptProvider()
    return ok({
      name: 'Guardrail',
      version: '0.1.0',
      engine: { name: 'cve-lite-cli', version: provider?.metadata().engine ?? 'unavailable' },
      node: process.versions.node,
      electron: process.versions.electron,
      platform: process.platform
    })
  })

  /* -------------------------------- projects ------------------------------- */

  handle(CHANNELS.projectsPick, async () => {
    const win = getWindow()
    if (!win) return err('No application window')
    const result = await dialog.showOpenDialog(win, {
      title: 'Select a project folder',
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) {
      return ok({ cancelled: true, path: null })
    }
    return ok({ cancelled: false, path: result.filePaths[0]! })
  })

  handle(CHANNELS.projectsDetect, async (path) => {
    const parsed = stringPayload(path)
    return ok(await detectProject(parsed))
  })

  handle(CHANNELS.projectsRegister, async (path) => {
    const parsed = stringPayload(path)
    const detection = await detectProject(parsed)
    const name = await resolveProjectName(parsed)
    const project = registry.register(parsed, name, detection)
    return ok(toProjectInfo(project, history))
  })

  handle(CHANNELS.projectsList, () => {
    return ok({ projects: registry.list().map((p) => toProjectInfo(p, history)) })
  })

  handle(CHANNELS.projectsRemove, (projectId) => {
    const parsed = projectIdSchema.parse(projectId)
    const removed = registry.remove(parsed)
    if (removed) history.deleteForProject(parsed)
    return ok(null)
  })

  /* --------------------------------- scans --------------------------------- */

  handle(CHANNELS.scansStart, async (payload) => {
    const parsed = z.object({ projectId: projectIdSchema, options: scanOptionsSchema }).parse(payload)
    const win = getWindow()
    const provider = getJavaScriptProvider()
    if (!provider) return err('JavaScript ecosystem provider is not available')
    const project = registry.get(parsed.projectId)
    if (!project) return err('Unknown project.')

    if (activeScans.has(project.id)) return err('A scan is already running for this project.')

    const controller = new AbortController()
    activeScans.set(project.id, controller)
    const started = Date.now()

    try {
      // Defense in depth: registered paths are still containment-checked.
      await containPath(project.path, project.path)
      const report = await provider.scan({
        projectId: project.id,
        projectPath: project.path,
        projectName: project.name,
        options: parsed.options,
        signal: controller.signal,
        onProgress: (message) => {
          const elapsed = Date.now() - started
          const progress: ScanProgress = {
            projectId: project.id,
            phase: elapsed < 500 ? 'detecting' : 'scanning',
            message,
            elapsedMs: elapsed
          }
          win?.webContents.send(EVENTS.scanProgress, progress)
        }
      })
      history.insert(report)
      pruneBackups(deps.backupRootDir, settings.get().backupRetentionDays).catch(() => {})
      return ok(report)
    } catch (e) {
      return err(e instanceof Error ? e.message : String(e))
    } finally {
      activeScans.delete(project.id)
    }
  })

  handle(CHANNELS.scansCancel, (projectId) => {
    const parsed = projectIdSchema.parse(projectId)
    activeScans.get(parsed)?.abort()
    return ok(null)
  })

  handle(CHANNELS.scansGet, (scanId) => {
    const parsed = scanIdSchema.parse(scanId)
    const report = history.getReport(parsed)
    if (!report) return err('Scan not found.')
    return ok(report)
  })

  /* ------------------------------- advisories ------------------------------ */

  handle(CHANNELS.advisoriesGet, async (advisoryId) => {
    const parsed = stringPayload(advisoryId, 128)
    const detail = await advisories.getDetail(parsed)
    if (!detail) return err('Advisory details are not available.')
    return ok(detail)
  })

  /* ------------------------------ remediation ------------------------------ */

  const remediationPayload = (payload: unknown) =>
    z
      .object({
        scanId: scanIdSchema,
        targetIds: z.array(z.string()).min(1),
        options: remediationApplyOptionsSchema.pick({ ignoreLifecycleScripts: true, includeBreaking: true })
      })
      .parse(payload)

  handle(CHANNELS.remediationPreview, async (payload) => {
    const parsed = remediationPayload(payload)
    const provider = getJavaScriptProvider()
    if (!provider) return err('JavaScript ecosystem provider is not available')
    const scan = history.getReport(parsed.scanId)
    if (!scan) return err('Scan not found.')
    const preview = await provider.previewRemediation(scan, {
      targetIds: parsed.targetIds,
      ignoreLifecycleScripts: parsed.options.ignoreLifecycleScripts,
      includeBreaking: parsed.options.includeBreaking
    })
    return ok(preview)
  })

  handle(CHANNELS.remediationApply, async (payload) => {
    const parsed = remediationPayload(payload)
    const win = getWindow()
    const provider = getJavaScriptProvider()
    if (!provider) return err('JavaScript ecosystem provider is not available')
    const scan = history.getReport(parsed.scanId)
    if (!scan) return err('Scan not found.')

    const project = registry.get(scan.projectId)
    if (!project) return err('Unknown project.')

    // Containment: remediation touches only the registered project path.
    try {
      await containPath(project.path, scan.projectPath)
    } catch {
      return err('Project path is no longer accessible.')
    }

    const result = await provider.remediate({
      scan,
      options: {
        targetIds: parsed.targetIds,
        ignoreLifecycleScripts: parsed.options.ignoreLifecycleScripts,
        includeBreaking: parsed.options.includeBreaking
      },
      onProgress: (message) => {
        const progress: RemediationProgress = {
          projectId: project.id,
          phase: 'applying',
          message,
          current: 0,
          total: 0
        }
        win?.webContents.send(EVENTS.remediationProgress, progress)
      }
    })
    history.saveRemediation(result)
    // Retain the verification scan in history, linked to the remediation.
    if (result.verification?.afterScan) {
      history.insert(result.verification.afterScan, result.id)
    }
    return ok(result)
  })

  handle(CHANNELS.remediationRollback, async (remediationId) => {
    const parsed = stringPayload(remediationId, 128)
    const remediation = history.getRemediation(parsed)
    if (!remediation) return err('Remediation not found.')

    const project = registry.get(remediation.projectId)
    if (!project) return err('Unknown project.')

    // The backup dir lives under userData and was created by us; still verify
    // it does not escape the backup root.
    try {
      await containPath(deps.backupRootDir, remediation.backupDir)
    } catch {
      return err('Backup directory is invalid.')
    }

    const outcome = await restoreBackup(remediation.backupDir, project.path)
    const rolled: RemediationResult = { ...remediation, state: 'rolled-back' }
    history.saveRemediation(rolled)
    return ok({ restored: outcome.restored, skipped: outcome.skipped })
  })

  /* --------------------------- transitive overrides ------------------------ */

  const overridesPayload = (payload: unknown) =>
    z.object({ scanId: scanIdSchema, ignoreLifecycleScripts: z.boolean() }).parse(payload)

  handle(CHANNELS.overridesPreview, async (payload) => {
    const parsed = overridesPayload(payload)
    const provider = getJavaScriptProvider()
    if (!provider?.previewOverrides) return err('JavaScript ecosystem provider is not available')
    const scan = history.getReport(parsed.scanId)
    if (!scan) return err('Scan not found.')
    const preview = await provider.previewOverrides(scan)
    return ok(preview)
  })

  handle(CHANNELS.overridesApply, async (payload) => {
    const parsed = overridesPayload(payload)
    const win = getWindow()
    const provider = getJavaScriptProvider()
    if (!provider?.applyOverrides) return err('JavaScript ecosystem provider is not available')
    const scan = history.getReport(parsed.scanId)
    if (!scan) return err('Scan not found.')

    const project = registry.get(scan.projectId)
    if (!project) return err('Unknown project.')

    try {
      await containPath(project.path, scan.projectPath)
    } catch {
      return err('Project path is no longer accessible.')
    }

    const result = await provider.applyOverrides({
      scan,
      ignoreLifecycleScripts: parsed.ignoreLifecycleScripts,
      onProgress: (message) => {
        const progress: RemediationProgress = {
          projectId: project.id,
          phase: 'applying',
          message,
          current: 0,
          total: 0
        }
        win?.webContents.send(EVENTS.remediationProgress, progress)
      }
    })

    // Persist through the remediation table so rollback stays available.
    const record = overrideResultAsRemediation(result)
    history.saveRemediation(record)
    if (result.state === 'complete' && result.verification?.afterScan) {
      history.insert(result.verification.afterScan, result.id)
    }
    return ok(result)
  })

  handle(CHANNELS.overridesVerifyVersions, async (payload) => {
    const parsed = z
      .object({
        scanId: scanIdSchema,
        entries: z.array(z.object({ package: z.string().min(1).max(256), from: z.string().min(1).max(64), to: z.string().min(1).max(64) })).max(100)
      })
      .parse(payload)
    const provider = getJavaScriptProvider()
    if (!provider?.verifyInstalledVersions) return err('JavaScript ecosystem provider is not available')
    const scan = history.getReport(parsed.scanId)
    if (!scan) return err('Scan not found.')

    const project = registry.get(scan.projectId)
    if (!project) return err('Unknown project.')

    try {
      await containPath(project.path, scan.projectPath)
    } catch {
      return err('Project path is no longer accessible.')
    }

    const results = await provider.verifyInstalledVersions(scan, parsed.entries)
    return ok({ results })
  })

  /* --------------------------------- tests --------------------------------- */

  handle(CHANNELS.testsDetect, async (projectId) => {
    const parsed = projectIdSchema.parse(projectId)
    const project = registry.get(parsed)
    if (!project) return err('Unknown project.')
    const command = settings.get().testCommand
    const parsedCommand = parseTestCommand(command)
    if (!parsedCommand) {
      return ok({
        projectId: parsed,
        command,
        scriptName: null,
        runnable: false,
        reason: 'The configured test command cannot be run safely (it must start with npm, pnpm, yarn or bun).'
      })
    }
    if (!parsedCommand.scriptName) {
      return ok({
        projectId: parsed,
        command,
        scriptName: null,
        runnable: true,
        reason: 'Custom command — runs exactly as configured.'
      })
    }
    try {
      const manifest = JSON.parse(await readFile(join(project.path, 'package.json'), 'utf8')) as {
        scripts?: Record<string, string>
      }
      const found = typeof manifest.scripts?.[parsedCommand.scriptName] === 'string'
      return ok({
        projectId: parsed,
        command,
        scriptName: parsedCommand.scriptName,
        runnable: found,
        reason: found ? null : `No "${parsedCommand.scriptName}" script found in package.json.`
      })
    } catch {
      return ok({
        projectId: parsed,
        command,
        scriptName: parsedCommand.scriptName,
        runnable: false,
        reason: 'package.json could not be read.'
      })
    }
  })

  handle(CHANNELS.testsRun, async (payload) => {
    const parsed = z.object({ projectId: projectIdSchema, command: testCommandSchema }).parse(payload)
    const project = registry.get(parsed.projectId)
    if (!project) return err('Unknown project.')
    const parsedCommand = parseTestCommand(parsed.command)
    if (!parsedCommand) return err('The configured test command cannot be run safely.')
    const win = getWindow()
    const started = Date.now()
    const run = await testRunner.run(parsedCommand.argv, {
      cwd: project.path,
      timeoutMs: 30 * 60 * 1000,
      onOutput: (text) => {
        win?.webContents.send(EVENTS.testOutput, { projectId: parsed.projectId, text })
      }
    })
    const passed = run.error === null && run.exitCode === 0
    return ok({
      projectId: parsed.projectId,
      command: parsed.command,
      exitCode: run.exitCode,
      passed,
      output: `${run.stdout}${run.stderr}`.slice(-64 * 1024),
      durationMs: Date.now() - started,
      error: run.error
    })
  })

  /* ---------------------------------- bulk --------------------------------- */

  handle(CHANNELS.bulkScanAll, async (payload) => {
    const parsed = z.object({ options: scanOptionsSchema }).parse(payload)
    const provider = getJavaScriptProvider()
    if (!provider) return err('JavaScript ecosystem provider is not available')
    const projects = registry.list()
    const win = getWindow()
    const results: BulkScanProjectResult[] = []
    const startedAt = new Date().toISOString()
    let index = 0
    for (const project of projects) {
      index += 1
      if (!project.ecosystem) {
        results.push({
          projectId: project.id,
          projectName: project.name,
          ok: false,
          summary: null,
          error: 'No JavaScript ecosystem detected in this folder.'
        })
        continue
      }
      if (activeScans.has(project.id)) {
        results.push({
          projectId: project.id,
          projectName: project.name,
          ok: false,
          summary: null,
          error: 'A scan is already running for this project.'
        })
        continue
      }
      const controller = new AbortController()
      activeScans.set(project.id, controller)
      const started = Date.now()
      win?.webContents.send(EVENTS.bulkProgress, {
        kind: 'scan',
        projectId: project.id,
        projectName: project.name,
        index,
        total: projects.length,
        phase: 'scanning',
        message: `Scanning ${project.name}`
      })
      try {
        await containPath(project.path, project.path)
        const report = await provider.scan({
          projectId: project.id,
          projectPath: project.path,
          projectName: project.name,
          options: parsed.options,
          signal: controller.signal,
          onProgress: (message) => {
            const progress: ScanProgress = {
              projectId: project.id,
              phase: 'scanning',
              message,
              elapsedMs: Date.now() - started
            }
            win?.webContents.send(EVENTS.scanProgress, progress)
          }
        })
        history.insert(report)
        results.push({ projectId: project.id, projectName: project.name, ok: true, summary: report.summary, error: null })
      } catch (e) {
        results.push({
          projectId: project.id,
          projectName: project.name,
          ok: false,
          summary: null,
          error: e instanceof Error ? e.message : String(e)
        })
      } finally {
        activeScans.delete(project.id)
      }
    }
    pruneBackups(deps.backupRootDir, settings.get().backupRetentionDays).catch(() => {})
    return ok({ startedAt, finishedAt: new Date().toISOString(), results })
  })

  handle(CHANNELS.bulkRemediateAll, async (payload) => {
    const parsed = z.object({ ignoreLifecycleScripts: z.boolean() }).parse(payload)
    const provider = getJavaScriptProvider()
    if (!provider) return err('JavaScript ecosystem provider is not available')
    const projects = registry.list()
    const win = getWindow()
    const results: BulkRemediateProjectResult[] = []
    const startedAt = new Date().toISOString()
    let index = 0
    for (const project of projects) {
      index += 1
      const note = (error: string | null, applied = 0, resolved = 0, remaining = 0, ok = false) => ({
        projectId: project.id,
        projectName: project.name,
        ok,
        applied,
        resolved,
        remaining,
        error
      })
      const latest = history.latestForProject(project.id)
      if (!latest) {
        results.push(note('No scan yet — scan this project first.'))
        continue
      }
      const scan = history.getReport(latest.id)
      if (!scan?.remediationPlan) {
        results.push(note('No remediation plan is available for the latest scan.'))
        continue
      }
      const safeIds = scan.remediationPlan.targets.filter((t) => t.safe && !t.breaking).map((t) => t.id)
      if (safeIds.length === 0) {
        results.push(note(null, 0, 0, scan.summary.total, true))
        continue
      }
      win?.webContents.send(EVENTS.bulkProgress, {
        kind: 'remediate',
        projectId: project.id,
        projectName: project.name,
        index,
        total: projects.length,
        phase: 'applying',
        message: `Fixing ${project.name}`
      })
      try {
        await containPath(project.path, scan.projectPath)
        const result = await provider.remediate({
          scan,
          options: {
            targetIds: safeIds,
            ignoreLifecycleScripts: parsed.ignoreLifecycleScripts,
            includeBreaking: false
          },
          onProgress: (message) => {
            const progress: RemediationProgress = {
              projectId: project.id,
              phase: 'applying',
              message,
              current: 0,
              total: 0
            }
            win?.webContents.send(EVENTS.remediationProgress, progress)
          }
        })
        history.saveRemediation(result)
        if (result.verification?.afterScan) {
          history.insert(result.verification.afterScan, result.id)
        }
        const ver = result.verification
        results.push({
          projectId: project.id,
          projectName: project.name,
          ok: result.state === 'complete',
          applied: result.applied.length,
          resolved: ver?.resolvedIds.length ?? 0,
          remaining: ver?.remainingIds.length ?? 0,
          error: result.error
        })
      } catch (e) {
        results.push(note(e instanceof Error ? e.message : String(e)))
      }
    }
    return ok({ startedAt, finishedAt: new Date().toISOString(), results })
  })

  /* ---------------------------------- git ---------------------------------- */

  const gitCommitPayload = (payload: unknown) =>
    z.object({ projectId: projectIdSchema, branch: z.string().min(1).max(300), message: z.string().min(1).max(600) }).parse(payload)

  handle(CHANNELS.gitPreview, async (payload) => {
    const parsed = gitCommitPayload(payload)
    const project = registry.get(parsed.projectId)
    if (!project) return err('Unknown project.')
    const info = await git.inspect(project.path)
    const existing: string[] = []
    for (const file of gitCandidateFiles(project.path)) {
      if (await stat(file).then(() => true).catch(() => false)) existing.push(file)
    }
    return ok({
      projectId: parsed.projectId,
      isRepo: info.isRepo,
      currentBranch: info.currentBranch,
      dirtyPaths: info.dirtyPaths,
      branch: parsed.branch,
      message: parsed.message,
      filesToCommit: existing.map((f) => relative(project.path, f)),
      error: info.error
    })
  })

  handle(CHANNELS.gitCommit, async (payload) => {
    const parsed = gitCommitPayload(payload)
    const project = registry.get(parsed.projectId)
    if (!project) return err('Unknown project.')
    const existing: string[] = []
    for (const file of gitCandidateFiles(project.path)) {
      if (await stat(file).then(() => true).catch(() => false)) existing.push(file)
    }
    const result = await git.createBranchAndCommit(project.path, parsed.branch, parsed.message, existing)
    return ok(result)
  })

  /* -------------------------------- history -------------------------------- */

  handle(CHANNELS.historyList, () => {
    return ok({ records: history.list() })
  })

  handle(CHANNELS.historyGet, (scanId) => {
    const parsed = scanIdSchema.parse(scanId)
    const report = history.getReport(parsed)
    if (!report) return err('Scan not found.')
    return ok(report)
  })

  handle(CHANNELS.historyCompare, (payload) => {
    const parsed = z.object({ beforeScanId: scanIdSchema, afterScanId: scanIdSchema }).parse(payload)
    const beforeReport = history.getReport(parsed.beforeScanId)
    const afterReport = history.getReport(parsed.afterScanId)
    if (!beforeReport || !afterReport) return err('Scan not found.')
    const diff = diffScans(beforeReport, afterReport)
    const records = history.list(1000)
    return ok({
      before: records.find((r) => r.id === beforeReport.id) ?? null,
      after: records.find((r) => r.id === afterReport.id) ?? null,
      resolved: beforeReport.vulnerabilities.filter((v) => diff.resolvedIds.includes(v.id)),
      remaining: beforeReport.vulnerabilities.filter((v) => diff.remainingIds.includes(v.id)),
      introduced: afterReport.vulnerabilities.filter((v) => diff.introducedIds.includes(v.id))
    })
  })

  handle(CHANNELS.historyDelete, (scanId) => {
    const parsed = scanIdSchema.parse(scanId)
    history.delete(parsed)
    return ok(null)
  })

  /* -------------------------------- settings ------------------------------- */

  handle(CHANNELS.settingsGet, () => {
    return ok(settings.get())
  })

  handle(CHANNELS.settingsSet, (payload) => {
    const parsed = settingsSchema.parse(payload) as AppSettings
    return ok(settings.set(parsed))
  })

  /* --------------------------------- export -------------------------------- */

  handle(CHANNELS.exportJson, async (scanId) => {
    const parsed = scanIdSchema.parse(scanId)
    const report = history.getReport(parsed)
    if (!report) return err('Scan not found.')
    const win = getWindow()
    if (!win) return err('No application window')
    const stamp = new Date(report.scannedAt).toISOString().replace(/[:.]/g, '-')
    const defaultPath = join(documentsPath(), `guardrail-${report.projectName}-${stamp}.json`)
    const result = await dialog.showSaveDialog(win, {
      title: 'Export scan report',
      defaultPath,
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (result.canceled || !result.filePath) return ok({ path: '' })
    await writeFile(result.filePath, JSON.stringify(report, null, 2), 'utf8')
    return ok({ path: result.filePath })
  })
}

function documentsPath(): string {
  try {
    return app.getPath('documents')
  } catch {
    return app.getPath('home')
  }
}
