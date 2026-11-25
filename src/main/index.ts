import { app, BrowserWindow, shell } from 'electron'
import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { registerIpc } from './ipc/register'
import { bootstrapProviders } from './services/provider-bootstrap'
import { HistoryStore } from './services/history-store'
import { ProjectRegistry } from './services/project-registry'
import { SettingsStore } from './services/settings-store'
import { AdvisoryService } from './services/advisory-service'
import { GitService } from './services/git-service'
import { ProjectTestRunner } from './services/exec-service'
import { getJavaScriptProvider } from '../core/ecosystems/registry'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: 'Pacmon',
    autoHideMenuBar: true,
    backgroundColor: '#f6f7f9',
    ...(existsSync(join(__dirname, '../../build/icon.png'))
      ? { icon: join(__dirname, '../../build/icon.png') }
      : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  // Never allow the app to navigate away from its own UI.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const current = mainWindow?.webContents.getURL()
    if (current && url !== current) {
      event.preventDefault()
      if (url.startsWith('https://')) shell.openExternal(url)
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  const userData = app.getPath('userData')

  const history = new HistoryStore(userData)
  const registry = new ProjectRegistry(userData)
  const settings = new SettingsStore(userData)
  const advisories = new AdvisoryService(history)
  const git = new GitService()
  const testRunner = new ProjectTestRunner()

  bootstrapProviders()
  registerIpc({
    getWindow: () => mainWindow,
    registry,
    history,
    settings,
    advisories,
    git,
    testRunner,
    backupRootDir: join(userData, 'backups')
  })

  // Smoke-test hook (PACMON_SMOKE_PROJECT): scan a project headlessly,
  // write the report, and exit. Used by CI to verify the packaged binary
  // end-to-end, including spawning the engine from the unpacked asar.
  const smokeProject = process.env.PACMON_SMOKE_PROJECT
  if (smokeProject) {
    const smoke = async (): Promise<void> => {
      const provider = getJavaScriptProvider()
      if (!provider) throw new Error('provider unavailable')
      const { detectProject, resolveProjectName } = await import('../core/detection/detect')
      const detection = await detectProject(smokeProject)
      const name = await resolveProjectName(smokeProject)
      const project = registry.register(smokeProject, name, detection)
      const report = await provider.scan({
        projectId: project.id,
        projectPath: smokeProject,
        projectName: name,
        options: { includeDev: true, timeoutSeconds: 300, minSeverity: null }
      })
      const outPath = join(app.getPath('temp'), 'pacmon-smoke-report.json')
      writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8')
      console.log(`SMOKE_OK findings=${report.summary.total} path=${outPath}`)
      app.exit(0)
    }
    smoke().catch((e) => {
      console.error('SMOKE_FAIL', e instanceof Error ? e.message : String(e))
      app.exit(1)
    })
    return
  }

  // UI smoke hook (PACMON_SMOKE_UI): render the app and dump the visible
  // text after a short delay, to catch blank screens in CI.
  if (process.env.PACMON_SMOKE_UI) {
    createWindow()
    mainWindow?.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        try {
          const text = await mainWindow?.webContents.executeJavaScript('document.body.innerText')
          console.log(`UI_SMOKE ${String(text).slice(0, 400).replace(/\n/g, ' | ')}`)
          app.exit(0)
        } catch (e) {
          console.error('UI_SMOKE_FAIL', e instanceof Error ? e.message : String(e))
          app.exit(1)
        }
      }, 4000)
    })
    return
  }

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
