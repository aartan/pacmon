import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode
} from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@renderer/lib/utils'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'border-transparent bg-foreground text-background hover:opacity-90',
  secondary: 'border-hairline bg-surface text-foreground hover:border-hairline-strong',
  ghost: 'border-hairline bg-transparent text-muted hover:border-hairline-strong hover:text-foreground',
  danger: 'border-transparent bg-critical text-white hover:opacity-90'
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  loading?: boolean
  size?: 'sm' | 'md'
}

export function Button({
  variant = 'secondary',
  loading = false,
  size = 'md',
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-none border font-medium transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'h-8 px-3 text-xs' : 'h-10 px-4 text-sm',
        VARIANTS[variant],
        className
      )}
      {...rest}
    >
      {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {children}
    </button>
  )
}

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-none border border-hairline bg-surface p-5', className)} {...rest} />
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded-none border border-hairline bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-faint">
      {children}
    </kbd>
  )
}

/** Print kicker: a small ink square followed by a mono uppercase label. */
export function MicroLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-faint', className)}>
      <span aria-hidden className="h-1.5 w-1.5 bg-foreground/60" />
      {children}
    </span>
  )
}

/** A small glowing status light. */
export function Led({ tone = 'ok', blink = false, className }: { tone?: 'ok' | 'warn' | 'critical' | 'accent' | 'idle'; blink?: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'led',
        tone === 'ok' && 'led-ok',
        tone === 'warn' && 'led-warn',
        tone === 'critical' && 'led-critical',
        tone === 'accent' && 'led-accent',
        blink && 'led-blink',
        className
      )}
    />
  )
}

export function TextInput({
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'h-9 w-full rounded-none border border-hairline bg-surface px-2.5 font-mono text-xs text-foreground outline-none transition-colors placeholder:text-faint focus:border-hairline-strong',
        className
      )}
      {...rest}
    />
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action
}: {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-none border border-dashed border-hairline-strong bg-surface/60 px-6 py-16 text-center">
      {icon && <div className="mb-4 text-faint">{icon}</div>}
      <h3 className="font-display text-base font-medium tracking-tight">{title}</h3>
      {description && <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="group relative inline-flex">
      {children}
      <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-none border border-hairline bg-surface px-2 py-1 text-[11px] text-muted opacity-0 transition-opacity duration-150 group-hover:opacity-100">
        {label}
      </span>
    </span>
  )
}
