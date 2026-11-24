/**
 * Filesystem safety: every operation that touches a project path goes through
 * containment checks here. Nothing outside a registered project directory may
 * ever be read or written by scan/remediation flows.
 */
import { realpath } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'

export class PathContainmentError extends Error {
  constructor(public readonly requested: string, public readonly root: string) {
    super(`Path escapes the project root: ${requested}`)
    this.name = 'PathContainmentError'
  }
}

/**
 * Resolve `candidate` against `root` and verify it stays inside `root`.
 * Symlink-aware: both sides are realpath'ed first so a symlink inside the
 * project pointing outside cannot smuggle operations past the boundary.
 */
export async function containPath(root: string, candidate: string): Promise<string> {
  const rootReal = await realpath(root).catch(() => resolve(root))
  const candidateAbs = isAbsolute(candidate) ? candidate : join(root, candidate)
  const candidateReal = await realpath(candidateAbs).catch(() => resolve(candidateAbs))

  const rel = relative(rootReal, candidateReal)
  if (rel === '' || rel === '.' ) return candidateReal
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new PathContainmentError(candidateAbs, root)
  }
  return candidateReal
}

/** Join segments under root and assert containment (no symlink traversal). */
export async function containedJoin(root: string, ...segments: string[]): Promise<string> {
  const candidate = join(root, ...segments)
  return containPath(root, candidate)
}

/** Verify a list of paths, deduplicated, all contained. Returns real paths. */
export async function verifyContained(root: string, paths: string[]): Promise<string[]> {
  const seen = new Set<string>()
  const out: string[] = []
  for (const p of paths) {
    const real = await containPath(root, p)
    if (!seen.has(real)) {
      seen.add(real)
      out.push(real)
    }
  }
  return out
}

/**
 * Relative path (posix separators) of `target` against `root`, for backup
 * manifests. Throws if not contained.
 */
export async function relativeContainedPath(root: string, target: string): Promise<string> {
  const real = await containPath(root, target)
  const rootReal = await realpath(root).catch(() => resolve(root))
  return relative(rootReal, real).split(sep).join('/')
}
