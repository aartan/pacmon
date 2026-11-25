import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

describe('nodeToolDirectories', () => {
  const originalHome = process.env.HOME
  const originalPath = process.env.PATH

  afterEach(() => {
    process.env.HOME = originalHome
    process.env.PATH = originalPath
  })

  it('includes nvm current-bin when present', async () => {
    const home = mkdtempSync(join(tmpdir(), 'pacmon-home-'))
    mkdirSync(join(home, '.nvm', 'current', 'bin'), { recursive: true })
    process.env.HOME = home
    const { nodeToolDirectories } = await import('../../src/main/services/exec-service')
    const dirs = nodeToolDirectories()
    expect(dirs).toContain(join(home, '.nvm', 'current', 'bin'))
    rmSync(home, { recursive: true, force: true })
  })

  it('includes newest nvm version dirs when present', async () => {
    const home = mkdtempSync(join(tmpdir(), 'pacmon-home-'))
    mkdirSync(join(home, '.nvm', 'versions', 'node', 'v18.0.0', 'bin'), { recursive: true })
    mkdirSync(join(home, '.nvm', 'versions', 'node', 'v22.0.0', 'bin'), { recursive: true })
    process.env.HOME = home
    const { nodeToolDirectories } = await import('../../src/main/services/exec-service')
    const dirs = nodeToolDirectories()
    const index22 = dirs.indexOf(join(home, '.nvm', 'versions', 'node', 'v22.0.0', 'bin'))
    const index18 = dirs.indexOf(join(home, '.nvm', 'versions', 'node', 'v18.0.0', 'bin'))
    expect(index22).toBeGreaterThanOrEqual(0)
    expect(index18).toBeGreaterThanOrEqual(0)
    expect(index22).toBeLessThan(index18) // newest first
    rmSync(home, { recursive: true, force: true })
  })

  it('includes volta and asdf shims', async () => {
    const home = mkdtempSync(join(tmpdir(), 'pacmon-home-'))
    mkdirSync(join(home, '.volta', 'bin'), { recursive: true })
    mkdirSync(join(home, '.asdf', 'shims'), { recursive: true })
    process.env.HOME = home
    const { nodeToolDirectories } = await import('../../src/main/services/exec-service')
    const dirs = nodeToolDirectories()
    expect(dirs).toContain(join(home, '.volta', 'bin'))
    expect(dirs).toContain(join(home, '.asdf', 'shims'))
    rmSync(home, { recursive: true, force: true })
  })

  it('never includes directories that do not exist', async () => {
    const home = mkdtempSync(join(tmpdir(), 'pacmon-home-'))
    process.env.HOME = home
    const { nodeToolDirectories } = await import('../../src/main/services/exec-service')
    for (const dir of nodeToolDirectories()) {
      expect(dir.startsWith(home)).toBe(false)
    }
    rmSync(home, { recursive: true, force: true })
  })
})
