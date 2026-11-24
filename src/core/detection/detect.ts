/**
 * Lightweight project detection for instant UI feedback. This is a fast
 * best-effort pass over the filesystem; the scanning engine remains the
 * authoritative source for lockfile selection and package resolution.
 */
import { readdir, readFile, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type { DetectionResult, PackageManager } from '../../shared/models'

const LOCKFILE_MAP: Array<{ file: string; packageManager: PackageManager }> = [
  { file: 'package-lock.json', packageManager: 'npm' },
  { file: 'pnpm-lock.yaml', packageManager: 'pnpm' },
  { file: 'yarn.lock', packageManager: 'yarn' },
  { file: 'bun.lock', packageManager: 'bun' },
  { file: 'bun.lockb', packageManager: 'bun' }
]

interface PackageJson {
  name?: string
  packageManager?: string
}

function packageManagerFromField(value: string | undefined): PackageManager | null {
  if (!value) return null
  const name = value.split('@')[0]!.trim().toLowerCase()
  if (name === 'npm' || name === 'pnpm' || name === 'yarn' || name === 'bun') return name
  return null
}

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p)
    return true
  } catch {
    return false
  }
}

async function readJson<T>(p: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(p, 'utf8')) as T
  } catch {
    return null
  }
}

export async function detectProject(projectPath: string): Promise<DetectionResult> {
  const entries = await readdir(projectPath).catch(() => [] as string[])
  const fileSet = new Set(entries)

  const packageJson = await readJson<PackageJson>(join(projectPath, 'package.json'))
  const isJavaScriptProject = packageJson !== null

  // Lockfiles present, in the engine's priority order.
  const lockfile = LOCKFILE_MAP.find((l) => fileSet.has(l.file)) ?? null

  let packageManager = lockfile?.packageManager ?? null
  const manifestManager = packageManagerFromField(packageJson?.packageManager)
  if (manifestManager) packageManager = manifestManager

  const manifests = entries.filter(
    (e) =>
      e === 'package.json' ||
      e === 'package-lock.json' ||
      e === 'pnpm-lock.yaml' ||
      e === 'pnpm-workspace.yaml' ||
      e === 'yarn.lock' ||
      e === 'bun.lock' ||
      e === 'bun.lockb' ||
      e === 'requirements.txt' ||
      e === 'pyproject.toml' ||
      e === 'Pipfile' ||
      e === 'uv.lock'
  )

  const ecosystem = isJavaScriptProject ? 'javascript' : null
  const ecosystemLabel = ecosystem === 'javascript' ? 'JavaScript' : 'Unknown'

  return {
    ecosystem,
    ecosystemLabel,
    packageManager,
    lockfile: lockfile?.file ?? null,
    manifests,
    isJavaScriptProject
  }
}

export async function resolveProjectName(projectPath: string): Promise<string> {
  const packageJson = await readJson<PackageJson>(join(projectPath, 'package.json'))
  if (packageJson?.name) return packageJson.name
  return basename(projectPath)
}
