import { clsx, type ClassValue } from 'clsx'

export function cn(...classes: Array<ClassValue>): string {
  return clsx(classes)
}

/** Shared cubic-bezier easing for micro-interactions (portfolio family). */
export const EASE: [number, number, number, number] = [0.21, 0.47, 0.32, 0.98]

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return formatDate(iso)
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export function formatScore(score: number | null): string {
  if (score === null) return '—'
  return score.toFixed(1)
}
