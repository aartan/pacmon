import { describe, expect, it } from 'vitest'
import { projectIdSchema, remediationApplyOptionsSchema, scanIdSchema, scanOptionsSchema, settingsSchema } from '@shared/ipc'

describe('IPC payload validation', () => {
  it('accepts a valid scan options payload', () => {
    const parsed = scanOptionsSchema.parse({ includeDev: true, timeoutSeconds: 300, minSeverity: 'high' })
    expect(parsed.minSeverity).toBe('high')
  })

  it('rejects scan options with unknown severity', () => {
    expect(() => scanOptionsSchema.parse({ includeDev: true, timeoutSeconds: 300, minSeverity: 'fatal' })).toThrow()
  })

  it('rejects out-of-range timeouts', () => {
    expect(() => scanOptionsSchema.parse({ includeDev: true, timeoutSeconds: 1, minSeverity: null })).toThrow()
    expect(() => scanOptionsSchema.parse({ includeDev: true, timeoutSeconds: 999999, minSeverity: null })).toThrow()
  })

  it('rejects missing fields', () => {
    expect(() => scanOptionsSchema.parse({ includeDev: true })).toThrow()
    expect(() => scanOptionsSchema.parse({})).toThrow()
  })

  it('validates remediation options', () => {
    const parsed = remediationApplyOptionsSchema.parse({
      targetIds: ['a', 'b'],
      ignoreLifecycleScripts: true,
      includeBreaking: false
    })
    expect(parsed.targetIds).toHaveLength(2)
  })

  it('rejects empty target selections', () => {
    expect(() =>
      remediationApplyOptionsSchema.parse({ targetIds: [], ignoreLifecycleScripts: true, includeBreaking: false })
    ).toThrow()
  })

  it('rejects non-string target ids', () => {
    expect(() =>
      remediationApplyOptionsSchema.parse({ targetIds: [42], ignoreLifecycleScripts: true, includeBreaking: false })
    ).toThrow()
  })

  it('rejects huge identifiers', () => {
    expect(() => projectIdSchema.parse('x'.repeat(1000))).toThrow()
    expect(() => scanIdSchema.parse('')).toThrow()
  })

  it('validates settings payloads', () => {
    const parsed = settingsSchema.parse({
      theme: 'dark',
      defaultIncludeDev: false,
      defaultIgnoreLifecycleScripts: true,
      scanTimeoutSeconds: 120,
      backupRetentionDays: 0,
      minSeverity: null,
      testCommand: 'npm test',
      branchNamePattern: 'fix/{project}-deps-{date}',
      commitMessagePattern: 'fix(deps): remediate vulnerable dependencies [guardrail]'
    })
    expect(parsed.theme).toBe('dark')
  })

  it('rejects malformed settings', () => {
    expect(() => settingsSchema.parse({ theme: 'neon' })).toThrow()
    expect(() => settingsSchema.parse({ theme: 'light', backupRetentionDays: -1 })).toThrow()
  })
})
