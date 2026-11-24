/**
 * Backup and rollback for remediation. Backups are file copies with a signed
 * manifest (relative path + sha256). Rollback restores exactly the files in
 * the manifest and nothing else, and refuses to clobber a file whose current
 * content hash differs from the post-change hash we recorded — so rollback
 * never overwrites user edits made after remediation.
 */
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, copyFile, readFile, writeFile, rename, rm, readdir, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { relativeContainedPath } from './containment'

export interface BackupFileEntry {
  relPath: string
  sha256: string
  /** Hash of the file as it was immediately after remediation (for rollback safety). */
  postSha256?: string
  size: number
}

export interface BackupManifest {
  id: string
  createdAt: string
  projectPath: string
  files: BackupFileEntry[]
}

export interface Backup {
  backupDir: string
  manifest: BackupManifest
}

async function sha256File(path: string): Promise<string> {
  const data = await readFile(path)
  return createHash('sha256').update(data).digest('hex')
}

function manifestPath(backupDir: string): string {
  return join(backupDir, 'manifest.json')
}

/**
 * Create a backup of `files` (absolute paths, all inside `projectRoot`) under
 * `backupRootDir`. The backup dir name is deterministic via id.
 */
export async function createBackup(
  backupRootDir: string,
  projectRoot: string,
  files: string[],
  id: string = randomUUID()
): Promise<Backup> {
  const backupDir = join(backupRootDir, id)
  await mkdir(backupDir, { recursive: true })
  const manifest: BackupManifest = {
    id,
    createdAt: new Date().toISOString(),
    projectPath: projectRoot,
    files: []
  }

  for (const file of files) {
    const relPath = await relativeContainedPath(projectRoot, file)
    const target = join(backupDir, 'files', ...relPath.split('/'))
    await mkdir(dirname(target), { recursive: true })
    await copyFile(file, target)
    const entry: BackupFileEntry = {
      relPath,
      sha256: await sha256File(file),
      size: (await stat(file)).size
    }
    manifest.files.push(entry)
  }

  await writeFile(manifestPath(backupDir), JSON.stringify(manifest, null, 2), 'utf8')
  return { backupDir, manifest }
}

export async function readBackupManifest(backupDir: string): Promise<BackupManifest | null> {
  try {
    const raw = await readFile(manifestPath(backupDir), 'utf8')
    const parsed = JSON.parse(raw) as BackupManifest
    if (!parsed.id || !Array.isArray(parsed.files)) return null
    return parsed
  } catch {
    return null
  }
}

/**
 * Record the post-remediation state of every backed-up file so rollback can
 * refuse to clobber later user edits.
 */
export async function recordPostRemediationState(backupDir: string, projectRoot: string): Promise<void> {
  const manifest = await readBackupManifest(backupDir)
  if (!manifest) throw new Error(`No backup manifest at ${backupDir}`)
  for (const entry of manifest.files) {
    const abs = join(projectRoot, ...entry.relPath.split('/'))
    try {
      entry.postSha256 = await sha256File(abs)
    } catch {
      entry.postSha256 = undefined // file was removed during remediation
    }
  }
  await writeFile(manifestPath(backupDir), JSON.stringify(manifest, null, 2), 'utf8')
}

/**
 * Restore the project files captured in the backup. Files whose current hash
 * differs from the recorded post-remediation hash are left untouched and
 * reported — never overwrite unrelated user changes.
 */
export async function restoreBackup(backupDir: string, projectRoot: string): Promise<{ restored: string[]; skipped: string[] }> {
  const manifest = await readBackupManifest(backupDir)
  if (!manifest) throw new Error(`No backup manifest at ${backupDir}`)
  const restored: string[] = []
  const skipped: string[] = []
  for (const entry of manifest.files) {
    const relSegments = entry.relPath.split('/')
    // Guards: the manifest path must stay inside the project.
    if (relSegments.some((s) => s === '..' || s === '')) {
      skipped.push(entry.relPath)
      continue
    }
    const abs = join(projectRoot, ...relSegments)
    if (entry.postSha256 !== undefined) {
      try {
        const current = await sha256File(abs)
        if (current !== entry.postSha256) {
          skipped.push(entry.relPath)
          continue
        }
      } catch {
        // File missing: safe to restore from backup.
      }
    }
    const source = join(backupDir, 'files', ...relSegments)
    await mkdir(dirname(abs), { recursive: true })
    // Atomic-ish: write to temp then rename.
    const tmp = `${abs}.guardrail-restore-${randomUUID().slice(0, 8)}`
    await copyFile(source, tmp)
    await rename(tmp, abs)
    restored.push(entry.relPath)
  }
  return { restored, skipped }
}

export async function deleteBackup(backupDir: string): Promise<void> {
  await rm(backupDir, { recursive: true, force: true })
}

/** Remove backups older than `retentionDays` (0 = keep everything). */
export async function pruneBackups(backupRootDir: string, retentionDays: number): Promise<void> {
  if (retentionDays <= 0) return
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000
  const entries = await readdir(backupRootDir).catch(() => [] as string[])
  for (const entry of entries) {
    const p = join(backupRootDir, entry)
    const st = await stat(p).catch(() => null)
    if (st && st.isDirectory() && st.mtimeMs < cutoff) {
      await rm(p, { recursive: true, force: true })
    }
  }
}
