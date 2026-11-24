/**
 * Preload bridge: the only surface the renderer can touch. Exposes a narrow,
 * typed API over validated IPC channels — no Node primitives leak through.
 */
import { contextBridge, ipcRenderer } from 'electron'
import { CHANNELS, EVENTS } from '../shared/ipc'
import type { SecurityAppApi } from '../shared/ipc'
import type { RemediationProgress, ScanProgress } from '../shared/models'

const api: SecurityAppApi = {
  getAppInfo: () => ipcRenderer.invoke(CHANNELS.appInfo),
  pickProject: () => ipcRenderer.invoke(CHANNELS.projectsPick),
  detectProject: (path) => ipcRenderer.invoke(CHANNELS.projectsDetect, path),
  registerProject: (path) => ipcRenderer.invoke(CHANNELS.projectsRegister, path),
  listProjects: () => ipcRenderer.invoke(CHANNELS.projectsList),
  removeProject: (projectId) => ipcRenderer.invoke(CHANNELS.projectsRemove, projectId),
  startScan: (payload) => ipcRenderer.invoke(CHANNELS.scansStart, payload),
  cancelScan: (projectId) => ipcRenderer.invoke(CHANNELS.scansCancel, projectId),
  getScan: (scanId) => ipcRenderer.invoke(CHANNELS.scansGet, scanId),
  getAdvisory: (advisoryId) => ipcRenderer.invoke(CHANNELS.advisoriesGet, advisoryId),
  previewRemediation: (payload) => ipcRenderer.invoke(CHANNELS.remediationPreview, payload),
  applyRemediation: (payload) => ipcRenderer.invoke(CHANNELS.remediationApply, payload),
  rollbackRemediation: (remediationId) => ipcRenderer.invoke(CHANNELS.remediationRollback, remediationId),
  listHistory: () => ipcRenderer.invoke(CHANNELS.historyList),
  getHistoryScan: (scanId) => ipcRenderer.invoke(CHANNELS.historyGet, scanId),
  compareScans: (payload) => ipcRenderer.invoke(CHANNELS.historyCompare, payload),
  deleteHistoryScan: (scanId) => ipcRenderer.invoke(CHANNELS.historyDelete, scanId),
  getSettings: () => ipcRenderer.invoke(CHANNELS.settingsGet),
  setSettings: (settings) => ipcRenderer.invoke(CHANNELS.settingsSet, settings),
  exportJson: (scanId) => ipcRenderer.invoke(CHANNELS.exportJson, scanId),
  onScanProgress: (cb: (progress: ScanProgress) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: ScanProgress) => cb(progress)
    ipcRenderer.on(EVENTS.scanProgress, listener)
    return () => ipcRenderer.removeListener(EVENTS.scanProgress, listener)
  },
  onRemediationProgress: (cb: (progress: RemediationProgress) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: RemediationProgress) => cb(progress)
    ipcRenderer.on(EVENTS.remediationProgress, listener)
    return () => ipcRenderer.removeListener(EVENTS.remediationProgress, listener)
  }
}

contextBridge.exposeInMainWorld('securityApp', api)
