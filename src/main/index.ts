import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { registerIpc } from './ipc/register'
import { bootstrapProviders } from './services/provider-bootstrap'
import { HistoryStore } from './services/history-store'
import { ProjectRegistry } from './services/project-registry'
import { SettingsStore } from './services/settings-store'
import { AdvisoryService } from './services/advisory-service'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: 'Guardrail',
    autoHideMenuBar: true,
    backgroundColor: '#fafafa',
    icon: join(__dirname, '../../build/icon.png'),
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

  bootstrapProviders()
  registerIpc({
    getWindow: () => mainWindow,
    registry,
    history,
    settings,
    advisories,
    backupRootDir: join(userData, 'backups')
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
