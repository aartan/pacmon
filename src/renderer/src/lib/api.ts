/**
 * Typed wrapper over the preload bridge. Unwraps IpcResult envelopes and
 * throws on the error side so views can use plain try/catch.
 */
import type { IpcResult } from '@shared/ipc'

async function unwrap<T>(promise: Promise<IpcResult<T>>): Promise<T> {
  const result = await promise
  if (result.ok) return result.data
  throw new Error(result.error)
}

export const api = {
  getAppInfo: () => unwrap(window.securityApp.getAppInfo()),
  pickProject: () => unwrap(window.securityApp.pickProject()),
  detectProject: (path: string) => unwrap(window.securityApp.detectProject(path)),
  registerProject: (path: string) => unwrap(window.securityApp.registerProject(path)),
  listProjects: () => unwrap(window.securityApp.listProjects()),
  removeProject: (projectId: string) => unwrap(window.securityApp.removeProject(projectId)),
  startScan: (payload: Parameters<Window['securityApp']['startScan']>[0]) =>
    unwrap(window.securityApp.startScan(payload)),
  cancelScan: (projectId: string) => unwrap(window.securityApp.cancelScan(projectId)),
  getScan: (scanId: string) => unwrap(window.securityApp.getScan(scanId)),
  getAdvisory: (advisoryId: string) => unwrap(window.securityApp.getAdvisory(advisoryId)),
  previewRemediation: (payload: Parameters<Window['securityApp']['previewRemediation']>[0]) =>
    unwrap(window.securityApp.previewRemediation(payload)),
  applyRemediation: (payload: Parameters<Window['securityApp']['applyRemediation']>[0]) =>
    unwrap(window.securityApp.applyRemediation(payload)),
  rollbackRemediation: (remediationId: string) =>
    unwrap(window.securityApp.rollbackRemediation(remediationId)),
  previewOverrides: (payload: Parameters<Window['securityApp']['previewOverrides']>[0]) =>
    unwrap(window.securityApp.previewOverrides(payload)),
  applyOverrides: (payload: Parameters<Window['securityApp']['applyOverrides']>[0]) =>
    unwrap(window.securityApp.applyOverrides(payload)),
  verifyInstalledVersions: (payload: Parameters<Window['securityApp']['verifyInstalledVersions']>[0]) =>
    unwrap(window.securityApp.verifyInstalledVersions(payload)),
  detectTests: (projectId: string) => unwrap(window.securityApp.detectTests(projectId)),
  runTests: (payload: Parameters<Window['securityApp']['runTests']>[0]) =>
    unwrap(window.securityApp.runTests(payload)),
  scanAll: (payload: Parameters<Window['securityApp']['scanAll']>[0]) =>
    unwrap(window.securityApp.scanAll(payload)),
  remediateAll: (payload: Parameters<Window['securityApp']['remediateAll']>[0]) =>
    unwrap(window.securityApp.remediateAll(payload)),
  previewGitCommit: (payload: Parameters<Window['securityApp']['previewGitCommit']>[0]) =>
    unwrap(window.securityApp.previewGitCommit(payload)),
  commitChanges: (payload: Parameters<Window['securityApp']['commitChanges']>[0]) =>
    unwrap(window.securityApp.commitChanges(payload)),
  listHistory: () => unwrap(window.securityApp.listHistory()),
  getHistoryScan: (scanId: string) => unwrap(window.securityApp.getHistoryScan(scanId)),
  compareScans: (payload: Parameters<Window['securityApp']['compareScans']>[0]) =>
    unwrap(window.securityApp.compareScans(payload)),
  deleteHistoryScan: (scanId: string) => unwrap(window.securityApp.deleteHistoryScan(scanId)),
  getSettings: () => unwrap(window.securityApp.getSettings()),
  setSettings: (settings: Parameters<Window['securityApp']['setSettings']>[0]) =>
    unwrap(window.securityApp.setSettings(settings)),
  exportJson: (scanId: string) => unwrap(window.securityApp.exportJson(scanId)),
  onScanProgress: (cb: Parameters<Window['securityApp']['onScanProgress']>[0]) =>
    window.securityApp.onScanProgress(cb),
  onRemediationProgress: (cb: Parameters<Window['securityApp']['onRemediationProgress']>[0]) =>
    window.securityApp.onRemediationProgress(cb),
  onBulkProgress: (cb: Parameters<Window['securityApp']['onBulkProgress']>[0]) =>
    window.securityApp.onBulkProgress(cb),
  onTestOutput: (cb: Parameters<Window['securityApp']['onTestOutput']>[0]) =>
    window.securityApp.onTestOutput(cb)
}
