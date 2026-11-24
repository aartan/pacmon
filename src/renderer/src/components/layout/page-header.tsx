import type { ReactNode } from 'react'
import { MicroLabel } from '@renderer/components/ui/ui'

export function PageHeader({
  label,
  title,
  description,
  actions
}: {
  label: string
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <div className="border-b border-hairline">
      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="flex items-start justify-between gap-6">
          <div>
            <MicroLabel>{label}</MicroLabel>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">{title}</h1>
            {description && <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      </div>
    </div>
  )
}

export function PageBody({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-5xl px-6 py-8">{children}</div>
}
