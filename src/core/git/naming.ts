/**
 * Branch and commit-message naming for Guardrail commits. Patterns are
 * configurable and token-expanded; expansion output is validated so it can
 * only ever produce safe git refs and messages. Pure and unit-testable.
 */

export interface NamingContext {
  projectName: string
  /** Up to a handful of package names the commit touches. */
  packages: string[]
  /** Optional branch name (for {branch} in commit messages). */
  branch?: string
  /** Overrides for deterministic tests; defaults to "now". */
  now?: Date
}

const TOKENS = ['{project}', '{date}', '{time}', '{packages}', '{branch}'] as const
export type NamingToken = (typeof TOKENS)[number]

export const NAMING_TOKENS = TOKENS as readonly string[]

export function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9._/-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 64)
  return slug === '' ? 'project' : slug
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function dateToken(now: Date): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

function timeToken(now: Date): string {
  return `${pad(now.getHours())}${pad(now.getMinutes())}`
}

function packagesToken(packages: string[]): string {
  const names = packages
    .map((p) => slugify(p.replace(/^@[^/]+\//, '')))
    .filter(Boolean)
    .slice(0, 3)
  return names.length === 0 ? 'deps' : names.join('-')
}

export function expandToken(token: string, ctx: NamingContext): string {
  const now = ctx.now ?? new Date()
  switch (token) {
    case '{project}':
      return slugify(ctx.projectName)
    case '{date}':
      return dateToken(now)
    case '{time}':
      return timeToken(now)
    case '{packages}':
      return packagesToken(ctx.packages)
    case '{branch}':
      return ctx.branch ?? 'branch'
    default:
      return token
  }
}

/** Expand every token in a pattern; unknown braces are left untouched. */
export function expandPattern(pattern: string, ctx: NamingContext): string {
  return pattern.replace(/\{[a-z]+\}/g, (match) => expandToken(match as NamingToken, ctx))
}

const BRANCH_SAFE = /^[A-Za-z0-9._/-]+$/
const BRANCH_FORBIDDEN = /\.\.|^[./-]|[./-]$|\.lock$|[ ~^:?*\\[\]@{}]/

/** Returns a human-readable error, or null when the branch name is valid. */
export function validateBranchName(name: string): string | null {
  if (name.length === 0) return 'Branch name must not be empty'
  if (name.length > 244) return 'Branch name is too long (max 244 characters)'
  if (/\s/.test(name)) return 'Branch name must not contain whitespace'
  if (!BRANCH_SAFE.test(name)) return 'Branch name contains unsupported characters'
  if (BRANCH_FORBIDDEN.test(name)) return 'Branch name must not start or end with ., / or - and must not contain ..'
  return null
}

/** Returns a human-readable error, or null when the commit message is valid. */
export function validateCommitMessage(message: string): string | null {
  if (message.trim().length === 0) return 'Commit message must not be empty'
  if (message.length > 500) return 'Commit message is too long (max 500 characters)'
  if (/[\u0000-\u001f\u007f]/.test(message)) return 'Commit message must not contain control characters'
  if (message.includes('\n') || message.includes('\r')) return 'Commit message must be a single line'
  return null
}

/** Sample context used by the settings UI to preview pattern expansion. */
export const SAMPLE_CONTEXT: NamingContext = {
  projectName: 'My Web App',
  packages: ['lodash', 'minimist'],
  branch: 'fix/my-web-app-deps-2026-11-24'
}
