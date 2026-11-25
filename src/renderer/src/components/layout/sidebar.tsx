import { NavLink } from 'react-router-dom'
import { FolderKanban, History, LayoutDashboard, Moon, Settings, Sun } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { cn } from '@renderer/lib/utils'
import { useTheme } from '@renderer/lib/theme'

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/projects', label: 'Projects', icon: FolderKanban, end: false },
  { to: '/history', label: 'History', icon: History, end: false },
  { to: '/settings', label: 'Settings', icon: Settings, end: false }
]

/** Guardrail mark: angled rail bars, mono-console style. */
function GuardrailMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M4 20 L9 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M11 20 L16 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M18 20 L23 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" opacity="0.45" />
      <path d="M2.5 21.5 H21.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.55" />
    </svg>
  )
}

export function Sidebar() {
  const { theme, setTheme } = useTheme()
  const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)

  return (
    <aside className="flex w-52 shrink-0 flex-col border-r border-hairline bg-surface-2/50">
      <div className="flex h-14 items-center gap-2.5 border-b border-hairline px-4">
        <GuardrailMark className="h-5 w-5 text-foreground" />
        <span className="font-display text-[17px] font-medium tracking-tight">Guardrail</span>
      </div>

      <nav className="flex-1 space-y-0.5 px-2 py-3" aria-label="Primary">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                'relative flex items-center gap-2.5 rounded-none border-l-2 border-transparent px-2.5 py-2 text-sm transition-colors',
                isActive
                  ? 'border-foreground bg-accent-soft text-foreground'
                  : 'text-muted hover:bg-surface hover:text-foreground'
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <motion.span
                    layoutId="sidebar-pill"
                    className="absolute inset-y-1 right-1 w-0.5 bg-foreground"
                    transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                  />
                )}
                <item.icon className="relative z-10 h-4 w-4" />
                <span className="relative z-10">{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-hairline p-2">
        <button
          type="button"
          onClick={() => setTheme(isDark ? 'light' : 'dark')}
          className="flex w-full items-center gap-2.5 rounded-none px-2.5 py-2 text-sm text-muted transition-colors hover:bg-surface hover:text-foreground"
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={isDark ? 'moon' : 'sun'}
              initial={{ rotate: -70, opacity: 0, scale: 0.5 }}
              animate={{ rotate: 0, opacity: 1, scale: 1 }}
              exit={{ rotate: 70, opacity: 0, scale: 0.5 }}
              transition={{ duration: 0.22 }}
              className="flex"
            >
              {isDark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </motion.span>
          </AnimatePresence>
          {isDark ? 'Light mode' : 'Dark mode'}
        </button>
        <p className="mt-2 px-2.5 font-mono text-[9px] uppercase tracking-[0.18em] text-faint/70">
          local-first · no cloud
        </p>
      </div>
    </aside>
  )
}
