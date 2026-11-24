import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { containPath, PathContainmentError, verifyContained, relativeContainedPath } from '@core/fs-safety/containment'
import {
  createBackup,
  readBackupManifest,
  recordPostRemediationState,
  restoreBackup,
  pruneBackups,
  deleteBackup
} from '@core/fs-safety/backup'

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'guardrail-test-'))
}

describe('containment', () => {
  it('allows paths inside the root', async () => {
    const root = tempDir()
    expect(await containPath(root, join(root, 'package.json'))).toBe(join(root, 'package.json'))
    rmSync(root, { recursive: true, force: true })
  })

  it('rejects paths escaping the root', async () => {
    const root = tempDir()
    await expect(containPath(root, join(root, '..', 'elsewhere'))).rejects.toBeInstanceOf(PathContainmentError)
    rmSync(root, { recursive: true, force: true })
  })

  it('rejects symlinks pointing outside the root', async () => {
    const root = tempDir()
    const outside = tempDir()
    writeFileSync(join(outside, 'secret.txt'), 'secret')
    symlinkSync(join(outside, 'secret.txt'), join(root, 'link'))
    await expect(containPath(root, join(root, 'link'))).rejects.toBeInstanceOf(PathContainmentError)
    rmSync(root, { recursive: true, force: true })
    rmSync(outside, { recursive: true, force: true })
  })

  it('allows symlinks that stay inside the root', async () => {
    const root = tempDir()
    writeFileSync(join(root, 'real.txt'), 'x')
    symlinkSync(join(root, 'real.txt'), join(root, 'link.txt'))
    const real = await containPath(root, join(root, 'link.txt'))
    expect(real).toBe(join(root, 'real.txt'))
    rmSync(root, { recursive: true, force: true })
  })

  it('deduplicates verified paths', async () => {
    const root = tempDir()
    const a = join(root, 'a.json')
    const out = await verifyContained(root, [a, a])
    expect(out).toHaveLength(1)
    rmSync(root, { recursive: true, force: true })
  })

  it('computes relative manifest paths', async () => {
    const root = tempDir()
    const rel = await relativeContainedPath(root, join(root, 'sub', 'file.json'))
    expect(rel).toBe('sub/file.json')
    rmSync(root, { recursive: true, force: true })
  })
})

describe('backup and rollback', () => {
  it('backs up, records post-state, and restores files', async () => {
    const root = tempDir()
    const backups = tempDir()
    writeFileSync(join(root, 'package.json'), '{"dependencies":{}}')
    writeFileSync(join(root, 'package-lock.json'), '{"lock":1}')

    const { backupDir, manifest } = await createBackup(backups, root, [
      join(root, 'package.json'),
      join(root, 'package-lock.json')
    ])
    expect(manifest.files).toHaveLength(2)
    expect(readFileSync(join(backupDir, 'files', 'package.json'), 'utf8')).toBe('{"dependencies":{}}')

    // Simulate remediation: modify both files.
    writeFileSync(join(root, 'package.json'), '{"dependencies":{"minimist":"1.2.6"}}')
    writeFileSync(join(root, 'package-lock.json'), '{"lock":2}')
    await recordPostRemediationState(backupDir, root)

    const outcome = await restoreBackup(backupDir, root)
    expect(outcome.restored).toHaveLength(2)
    expect(outcome.skipped).toHaveLength(0)
    expect(readFileSync(join(root, 'package.json'), 'utf8')).toBe('{"dependencies":{}}')
    expect(readFileSync(join(root, 'package-lock.json'), 'utf8')).toBe('{"lock":1}')

    rmSync(root, { recursive: true, force: true })
    rmSync(backups, { recursive: true, force: true })
  })

  it('refuses to clobber files edited after remediation', async () => {
    const root = tempDir()
    const backups = tempDir()
    writeFileSync(join(root, 'package.json'), '{"v":1}')
    const { backupDir } = await createBackup(backups, root, [join(root, 'package.json')])
    writeFileSync(join(root, 'package.json'), '{"v":2}')
    await recordPostRemediationState(backupDir, root)

    // User edits the file after remediation completed.
    writeFileSync(join(root, 'package.json'), '{"v":3,"userEdit":true}')

    const outcome = await restoreBackup(backupDir, root)
    expect(outcome.restored).toHaveLength(0)
    expect(outcome.skipped).toEqual(['package.json'])
    expect(readFileSync(join(root, 'package.json'), 'utf8')).toBe('{"v":3,"userEdit":true}')

    rmSync(root, { recursive: true, force: true })
    rmSync(backups, { recursive: true, force: true })
  })

  it('restores files that were deleted during remediation', async () => {
    const root = tempDir()
    const backups = tempDir()
    writeFileSync(join(root, 'yarn.lock'), 'lock content')
    const { backupDir } = await createBackup(backups, root, [join(root, 'yarn.lock')])
    writeFileSync(join(root, 'yarn.lock'), 'changed')
    await recordPostRemediationState(backupDir, root)
    rmSync(join(root, 'yarn.lock'))

    const outcome = await restoreBackup(backupDir, root)
    expect(outcome.restored).toEqual(['yarn.lock'])
    expect(readFileSync(join(root, 'yarn.lock'), 'utf8')).toBe('lock content')

    rmSync(root, { recursive: true, force: true })
    rmSync(backups, { recursive: true, force: true })
  })

  it('rejects manifest paths that escape the project', async () => {
    const root = tempDir()
    const backups = tempDir()
    writeFileSync(join(root, 'package.json'), '{}')
    const { backupDir } = await createBackup(backups, root, [join(root, 'package.json')])
    const manifestPath = join(backupDir, 'manifest.json')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { files: Array<{ relPath: string; sha256?: string; size?: number }> }
    manifest.files.push({ relPath: '../escape.txt', sha256: 'x', size: 1 })
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
    await recordPostRemediationState(backupDir, root)

    const outcome = await restoreBackup(backupDir, root)
    expect(outcome.skipped).toContain('../escape.txt')
    rmSync(root, { recursive: true, force: true })
    rmSync(backups, { recursive: true, force: true })
  })

  it('prunes old backups and keeps recent ones', async () => {
    const backups = tempDir()
    const root = tempDir()
    writeFileSync(join(root, 'package.json'), '{}')
    const recent = await createBackup(backups, root, [join(root, 'package.json')])
    const old = await createBackup(backups, root, [join(root, 'package.json')], 'old-backup')
    const oldDir = join(backups, 'old-backup')
    const now = Date.now()
    const { utimesSync } = await import('node:fs')
    utimesSync(oldDir, new Date(now - 40 * 24 * 3600 * 1000), new Date(now - 40 * 24 * 3600 * 1000))

    await pruneBackups(backups, 14)
    expect(await readBackupManifest(old.backupDir)).toBeNull()
    expect(await readBackupManifest(recent.backupDir)).not.toBeNull()

    rmSync(root, { recursive: true, force: true })
    rmSync(backups, { recursive: true, force: true })
  })

  it('deleteBackup removes the directory', async () => {
    const backups = tempDir()
    const root = tempDir()
    writeFileSync(join(root, 'package.json'), '{}')
    const { backupDir } = await createBackup(backups, root, [join(root, 'package.json')])
    await deleteBackup(backupDir)
    expect(await readBackupManifest(backupDir)).toBeNull()
    rmSync(root, { recursive: true, force: true })
    rmSync(backups, { recursive: true, force: true })
  })

  it('rejects backing up files outside the project', async () => {
    const root = tempDir()
    const outside = tempDir()
    const backups = tempDir()
    writeFileSync(join(outside, 'file.json'), '{}')
    await expect(createBackup(backups, root, [join(outside, 'file.json')])).rejects.toBeInstanceOf(
      PathContainmentError
    )
    rmSync(root, { recursive: true, force: true })
    rmSync(outside, { recursive: true, force: true })
    rmSync(backups, { recursive: true, force: true })
  })

  it('handles nested file paths in the backup layout', async () => {
    const root = tempDir()
    const backups = tempDir()
    mkdirSync(join(root, 'packages', 'a'), { recursive: true })
    writeFileSync(join(root, 'packages', 'a', 'package.json'), '{"name":"a"}')
    const { backupDir } = await createBackup(backups, root, [join(root, 'packages', 'a', 'package.json')])
    expect(readFileSync(join(backupDir, 'files', 'packages', 'a', 'package.json'), 'utf8')).toBe('{"name":"a"}')
    rmSync(root, { recursive: true, force: true })
    rmSync(backups, { recursive: true, force: true })
  })
})
