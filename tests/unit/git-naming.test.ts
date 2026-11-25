import { describe, expect, it } from 'vitest'
import {
  expandPattern,
  slugify,
  validateBranchName,
  validateCommitMessage,
  SAMPLE_CONTEXT
} from '@core/git/naming'

const FIXED_DATE = new Date('2026-11-24T09:07:05Z')

describe('slugify', () => {
  it('lowercases and replaces unsafe characters', () => {
    expect(slugify('My Web App!')).toBe('my-web-app')
    expect(slugify('Acme/Corp')).toBe('acme/corp')
    expect(slugify('  spaced  out ')).toBe('spaced-out')
  })

  it('falls back for empty slugs', () => {
    expect(slugify('!!!')).toBe('project')
  })
})

describe('expandPattern', () => {
  it('expands project, date, time and packages tokens', () => {
    const result = expandPattern('fix/{project}-deps-{date}-{time}-{packages}', {
      projectName: 'My Web App',
      packages: ['lodash', '@scope/minimist', 'semver'],
      now: FIXED_DATE
    })
    expect(result).toBe('fix/my-web-app-deps-2026-11-24-0907-lodash-minimist-semver')
  })

  it('expands {branch} in commit messages', () => {
    const result = expandPattern('{project}: update {packages} [{branch}]', {
      projectName: 'Demo',
      packages: ['lodash'],
      branch: 'fix/demo-deps-2026-11-24',
      now: FIXED_DATE
    })
    expect(result).toBe('demo: update lodash [fix/demo-deps-2026-11-24]')
  })

  it('limits the packages token to three entries', () => {
    const result = expandPattern('{packages}', {
      projectName: 'Demo',
      packages: ['a', 'b', 'c', 'd'],
      now: FIXED_DATE
    })
    expect(result).toBe('a-b-c')
  })

  it('uses the sample context without throwing', () => {
    const branch = expandPattern('fix/{project}-deps-{date}', SAMPLE_CONTEXT)
    expect(branch).toMatch(/^fix\/my-web-app-deps-\d{4}-\d{2}-\d{2}$/)
    const message = expandPattern('fix(deps): {project} [{branch}]', { ...SAMPLE_CONTEXT, branch })
    expect(message).toContain('fix/my-web-app-deps-')
  })
})

describe('validateBranchName', () => {
  it('accepts safe names', () => {
    expect(validateBranchName('fix/my-app-deps-2026-11-24')).toBeNull()
    expect(validateBranchName('guardrail/lodash-4.17.21')).toBeNull()
  })

  it('rejects spaces, dots, traversal and bad edges', () => {
    expect(validateBranchName('fix my deps')).not.toBeNull()
    expect(validateBranchName('fix/../evil')).not.toBeNull()
    expect(validateBranchName('-leading-dash')).not.toBeNull()
    expect(validateBranchName('trailing-')).not.toBeNull()
    expect(validateBranchName('/leading-slash')).not.toBeNull()
    expect(validateBranchName('feature.lock')).not.toBeNull()
    expect(validateBranchName('has..dots')).not.toBeNull()
    expect(validateBranchName('')).not.toBeNull()
    expect(validateBranchName('x'.repeat(300))).not.toBeNull()
  })

  it('rejects control characters and weird symbols', () => {
    expect(validateBranchName('fix/bad\u0000name')).not.toBeNull()
    expect(validateBranchName('fix/bad~tilde')).not.toBeNull()
    expect(validateBranchName('fix/bad:colon')).not.toBeNull()
  })
})

describe('validateCommitMessage', () => {
  it('accepts single-line messages', () => {
    expect(validateCommitMessage('fix(deps): update lodash [guardrail]')).toBeNull()
  })

  it('rejects empty, multiline and control-character messages', () => {
    expect(validateCommitMessage('')).not.toBeNull()
    expect(validateCommitMessage('   ')).not.toBeNull()
    expect(validateCommitMessage('line one\nline two')).not.toBeNull()
    expect(validateCommitMessage('bad\u0000control')).not.toBeNull()
    expect(validateCommitMessage('x'.repeat(600))).not.toBeNull()
  })
})
