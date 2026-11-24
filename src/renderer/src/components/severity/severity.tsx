import { AlertOctagon, AlertTriangle, Info, ShieldAlert, ShieldCheck } from 'lucide-react'
import type { Severity } from '@shared/models'
import { SEVERITY_ORDER } from '@shared/models'
import { cn } from '@renderer/lib/utils'

export const SEVERITY_META: Record<
  Severity,
  {
    label: string
    text: string
    bg: string
    border: string
    dot: string
    order: number
  }
> = {
  critical: {
    label: 'Critical',
    text: 'text-critical',
    bg: 'bg-critical-soft',
    border: 'border-critical/30',
    dot: 'bg-critical',
    order: SEVERITY_ORDER.critical
  },
  high: {
    label: 'High',
    text: 'text-high',
    bg: 'bg-high-soft',
    border: 'border-high/30',
    dot: 'bg-high',
    order: SEVERITY_ORDER.high
  },
  medium: {
    label: 'Medium',
    text: 'text-medium',
    bg: 'bg-medium-soft',
    border: 'border-medium/30',
    dot: 'bg-medium',
    order: SEVERITY_ORDER.medium
  },
  low: {
    label: 'Low',
    text: 'text-low',
    bg: 'bg-low-soft',
    border: 'border-low/30',
    dot: 'bg-low',
    order: SEVERITY_ORDER.low
  },
  informational: {
    label: 'Info',
    text: 'text-info',
    bg: 'bg-info-soft',
    border: 'border-info/30',
    dot: 'bg-info',
    order: SEVERITY_ORDER.informational
  }
}

export function severityLabel(severity: Severity): string {
  return SEVERITY_META[severity].label
}

/** Small coloured dot. */
export function SeverityDot({ severity, className }: { severity: Severity; className?: string }) {
  return <span aria-hidden className={cn('inline-block h-2 w-2 rounded-full', SEVERITY_META[severity].dot, className)} />
}

/** Pill badge with severity label. */
export function SeverityBadge({ severity, className }: { severity: Severity; className?: string }) {
  const meta = SEVERITY_META[severity]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[11px] font-medium',
        meta.text,
        meta.bg,
        meta.border,
        className
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', meta.dot)} />
      {meta.label}
    </span>
  )
}

export function SeverityIcon({ severity, className }: { severity: Severity; className?: string }) {
  const iconClass = cn('h-4 w-4', className)
  switch (severity) {
    case 'critical':
      return <AlertOctagon className={cn(iconClass, 'text-critical')} />
    case 'high':
      return <ShieldAlert className={cn(iconClass, 'text-high')} />
    case 'medium':
      return <AlertTriangle className={cn(iconClass, 'text-medium')} />
    case 'low':
      return <ShieldCheck className={cn(iconClass, 'text-low')} />
    default:
      return <Info className={cn(iconClass, 'text-info')} />
  }
}
