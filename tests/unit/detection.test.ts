import { describe, expect, it } from 'vitest'
import { resolve } from 'node:path'
import { detectProject, resolveProjectName } from '@core/detection/detect'

const fixtures = resolve(__dirname, '../fixtures')

describe('detectProject', () => {
  it('detects an npm project via package-lock.json', async () => {
    const result = await detectProject(resolve(fixtures, 'npm-v2'))
    expect(result.isJavaScriptProject).toBe(true)
    expect(result.ecosystem).toBe('javascript')
    expect(result.packageManager).toBe('npm')
    expect(result.lockfile).toBe('package-lock.json')
  })

  it('detects a yarn classic project', async () => {
    const result = await detectProject(resolve(fixtures, 'yarn-classic'))
    expect(result.packageManager).toBe('yarn')
    expect(result.lockfile).toBe('yarn.lock')
  })

  it('detects a pnpm project', async () => {
    const result = await detectProject(resolve(fixtures, 'pnpm-v9'))
    expect(result.packageManager).toBe('pnpm')
    expect(result.lockfile).toBe('pnpm-lock.yaml')
  })

  it('detects a package.json-only project with no lockfile', async () => {
    const result = await detectProject(resolve(fixtures, 'package-json-only'))
    expect(result.isJavaScriptProject).toBe(true)
    expect(result.packageManager).toBeNull()
    expect(result.lockfile).toBeNull()
  })

  it('reports unknown for non-JS folders', async () => {
    const result = await detectProject(resolve(fixtures, 'non-js'))
    expect(result.isJavaScriptProject).toBe(false)
    expect(result.ecosystem).toBeNull()
  })

  it('handles empty folders', async () => {
    const result = await detectProject(resolve(fixtures, 'empty'))
    expect(result.isJavaScriptProject).toBe(false)
    expect(result.manifests).toEqual([])
  })

  it('handles nonexistent folders defensively', async () => {
    const result = await detectProject(resolve(fixtures, 'does-not-exist'))
    expect(result.isJavaScriptProject).toBe(false)
  })

  it('prefers the packageManager field over lockfile presence', async () => {
    const result = await detectProject(resolve(fixtures, 'package-json-only'))
    expect(result.packageManager).toBeNull()
  })
})

describe('resolveProjectName', () => {
  it('reads the package.json name', async () => {
    expect(await resolveProjectName(resolve(fixtures, 'npm-v2'))).toBe('fixture-npm')
  })

  it('falls back to the directory name', async () => {
    expect(await resolveProjectName(resolve(fixtures, 'non-js'))).toBe('non-js')
  })
})
