// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { HashRouter } from 'react-router-dom'
import App from '@renderer/App'
import { SettingsView } from '@renderer/views/settings-view'
import { ThemeProvider } from '@renderer/lib/theme'
import type { AppSettings } from '@shared/models'

const settings: AppSettings = {
  theme: 'system',
  defaultIncludeDev: true,
  defaultIgnoreLifecycleScripts: true,
  scanTimeoutSeconds: 300,
  backupRetentionDays: 14,
  minSeverity: null,
  testCommand: 'npm test',
  branchNamePattern: 'fix/{project}-deps-{date}',
  commitMessagePattern: 'fix(deps): remediate vulnerable dependencies [pacmon]'
}

const noop = () => () => {}

function mockBridge() {
  const securityApp = {
    getAppInfo: () =>
      Promise.resolve({
        ok: true as const,
        data: { name: 'Pacmon', version: '0.1.0', engine: { name: 'cve-lite', version: '1.42.0' }, node: '24', electron: '45', platform: 'linux' }
      }),
    pickProject: () => Promise.resolve({ ok: true as const, data: { cancelled: true, path: null } }),
    detectProject: () => Promise.resolve({ ok: true as const, data: null }),
    registerProject: () => Promise.resolve({ ok: true as const, data: null }),
    listProjects: () => Promise.resolve({ ok: true as const, data: { projects: [] } }),
    removeProject: () => Promise.resolve({ ok: true as const, data: null }),
    startScan: () => Promise.resolve({ ok: true as const, data: null }),
    cancelScan: () => Promise.resolve({ ok: true as const, data: null }),
    getScan: () => Promise.resolve({ ok: true as const, data: null }),
    getAdvisory: () => Promise.resolve({ ok: true as const, data: null }),
    previewRemediation: () => Promise.resolve({ ok: true as const, data: null }),
    applyRemediation: () => Promise.resolve({ ok: true as const, data: null }),
    rollbackRemediation: () => Promise.resolve({ ok: true as const, data: null }),
    previewOverrides: () => Promise.resolve({ ok: true as const, data: null }),
    applyOverrides: () => Promise.resolve({ ok: true as const, data: null }),
    detectTests: () => Promise.resolve({ ok: true as const, data: null }),
    runTests: () => Promise.resolve({ ok: true as const, data: null }),
    scanAll: () => Promise.resolve({ ok: true as const, data: null }),
    remediateAll: () => Promise.resolve({ ok: true as const, data: null }),
    previewGitCommit: () => Promise.resolve({ ok: true as const, data: null }),
    commitChanges: () => Promise.resolve({ ok: true as const, data: null }),
    listHistory: () => Promise.resolve({ ok: true as const, data: { records: [] } }),
    getHistoryScan: () => Promise.resolve({ ok: true as const, data: null }),
    compareScans: () => Promise.resolve({ ok: true as const, data: null }),
    deleteHistoryScan: () => Promise.resolve({ ok: true as const, data: null }),
    getSettings: () => Promise.resolve({ ok: true as const, data: settings }),
    setSettings: (next: AppSettings) => Promise.resolve({ ok: true as const, data: next }),
    exportJson: () => Promise.resolve({ ok: true as const, data: { path: '' } }),
    onScanProgress: noop,
    onRemediationProgress: noop,
    onBulkProgress: noop,
    onTestOutput: noop
  }
  Object.defineProperty(window, 'securityApp', { value: securityApp, configurable: true })
}

describe('App render', () => {
  let root: Root

  beforeAll(() => {
    mockBridge()
    window.matchMedia = window.matchMedia ?? ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false
    })) as unknown as typeof window.matchMedia
    document.body.innerHTML = '<div id="root"></div>'
  })

  it('boots and renders the dashboard view', async () => {
    const container = document.getElementById('root')!
    root = createRoot(container)
    await act(async () => {
      root.render(
        <ThemeProvider>
          <HashRouter>
            <App />
          </HashRouter>
        </ThemeProvider>
      )
    })
    await act(async () => {})
    const text = document.body.textContent ?? ''
    expect(text).toContain('Security posture')
    expect(text).toContain('No projects yet')
    expect(text).toContain('Select a project folder')
    root.unmount()
  })

  it('renders the settings view with git pattern previews', async () => {
    const container = document.getElementById('root')!
    root = createRoot(container)
    await act(async () => {
      root.render(
        <ThemeProvider>
          <HashRouter>
            <SettingsView />
          </HashRouter>
        </ThemeProvider>
      )
    })
    await act(async () => {})
    const text = document.body.textContent ?? ''
    expect(text).toContain('Test command')
    expect(text).toContain('Git integration')
    expect(text).toContain('Branch name')
    expect(text).toContain('fix/my-web-app-deps-')
    root.unmount()
  })
})
