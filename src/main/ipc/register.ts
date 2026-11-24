/**
 * IPC surface. Every handler validates its payload with zod, resolves
 * projects through the registry, and enforces path containment. The renderer
 * can only ever trigger operations against registered project paths, with
 * package-manager execution restricted to the fixed allowlist in exec-service.
 */
import { app, dialog, ipcMain, type BrowserWindow } from 'electron'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { CHANNELS, EVENTS, err, ok, type IpcResult } from '../../shared/ipc'
import {
  projectIdSchema,
  remediationApplyOptionsSchema,
  scanIdSchema,
  scanOptionsSchema,
  settingsSchema
} from '../../shared/ipc'
import type {
  AppSettings,
  ProjectInfo,
  RemediationProgress,
  RemediationResult,
  ScanProgress
} from '../../shared/models'
import type { HistoryStore } from '../services/history-store'
import type { ProjectRegistry, StoredProject } from '../services/project-registry'
import type { SettingsStore } from '../services/settings-store'
import type { AdvisoryService } from '../services/advisory-service'
import { getJavaScriptProvider } from '../../core/ecosystems/registry'
import { detectProject, resolveProjectName } from '../../core/detection/detect'
import { containPath } from '../../core/fs-safety/containment'
import { pruneBackups, restoreBackup } from '../../core/fs-safety/backup'
import { diffScans } from '../../core/remediation/verifier'

export interface IpcDeps {
  getWindow: () => BrowserWindow | null
  registry: ProjectRegistry
  history: HistoryStore
  settings: SettingsStore
  advisories: AdvisoryService
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

export function registerIpc(deps: IpcDeps): void {
  const { getWindow, registry, history, settings, advisories } = deps

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
