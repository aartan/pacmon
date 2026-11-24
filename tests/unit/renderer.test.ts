// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { SEVERITY_META, severityLabel } from '@renderer/components/severity/severity'
import { diffLevel } from '@renderer/components/remediation/version-diff'
import { SEVERITIES, SEVERITY_ORDER } from '@shared/models'

describe('severity metadata', () => {
  it('covers every severity with an order and label', () => {
    for (const severity of SEVERITIES) {
      expect(SEVERITY_META[severity]).toBeDefined()
      expect(SEVERITY_ORDER[severity]).toBeDefined()
      expect(severityLabel(severity).length).toBeGreaterThan(0)
    }
  })

  it('orders severities from critical to informational', () => {
    expect(SEVERITY_ORDER.critical).toBeLessThan(SEVERITY_ORDER.high)
    expect(SEVERITY_ORDER.high).toBeLessThan(SEVERITY_ORDER.medium)
    expect(SEVERITY_ORDER.medium).toBeLessThan(SEVERITY_ORDER.low)
    expect(SEVERITY_ORDER.low).toBeLessThan(SEVERITY_ORDER.informational)
  })

  it('labels severities for humans', () => {
    expect(severityLabel('critical')).toBe('Critical')
    expect(severityLabel('informational')).toBe('Info')
  })
})

describe('diffLevel', () => {
  it('classifies version jumps', () => {
    expect(diffLevel('1.2.5', '1.2.6')).toBe('patch')
    expect(diffLevel('1.2.5', '1.9.0')).toBe('minor')
    expect(diffLevel('1.2.5', '2.0.0')).toBe('major')
    expect(diffLevel('weird', '4.0.0')).toBe('unknown')
    expect(diffLevel('1.2.5', 'git+https://...')).toBe('unknown')
  })
})
