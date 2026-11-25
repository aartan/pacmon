/**
 * Application settings, stored as JSON in the userData directory.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AppSettings } from '../../shared/models'

const SETTINGS_FILE = 'settings.json'

export const DEFAULT_SETTINGS: AppSettings = {
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

export class SettingsStore {
  private readonly file: string
  private cache: AppSettings | null = null

  constructor(userDataDir: string) {
    mkdirSync(userDataDir, { recursive: true })
    this.file = join(userDataDir, SETTINGS_FILE)
  }

  get(): AppSettings {
    if (this.cache) return this.cache
    try {
      const raw = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<AppSettings>
      this.cache = { ...DEFAULT_SETTINGS, ...raw }
    } catch {
      this.cache = { ...DEFAULT_SETTINGS }
    }
    return this.cache
  }

  set(settings: AppSettings): AppSettings {
    this.cache = settings
    writeFileSync(this.file, JSON.stringify(settings, null, 2), 'utf8')
    return settings
  }
}
