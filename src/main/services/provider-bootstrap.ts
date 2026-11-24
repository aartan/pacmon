/**
 * Wires the JavaScript provider to its main-process dependencies (engine
 * runner, command executor, backup directory) and registers it.
 */
import { join } from 'node:path'
import { app } from 'electron'
import { CveLiteProvider, type CveLiteProviderDeps } from '../../core/ecosystems/javascript/cve-lite-provider'
import { registerProvider } from '../../core/ecosystems/registry'
import { ElectronEngineRunner } from './engine-runner'
import { PackageManagerExecutor, detectPackageManager } from './exec-service'

export function bootstrapProviders(): void {
  const deps: CveLiteProviderDeps = {
    runner: new ElectronEngineRunner(),
    executor: new PackageManagerExecutor(),
    getBackupRootDir: () => join(app.getPath('userData'), 'backups'),
    getPackageManagerInfo: (pm) => detectPackageManager(pm)
  }
  registerProvider(new CveLiteProvider(deps))
}
