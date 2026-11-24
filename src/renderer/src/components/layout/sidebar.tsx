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

function ShieldMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 1024 1024" fill="none" className={className} aria-hidden>
      <path
        d="M512 236 L700 316 V496 C700 626 622 726 512 788 C402 726 324 626 324 496 V316 L512 236 Z"
        stroke="currentColor"
        strokeOpacity="0.35"
        strokeWidth="60"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M432 512 L488 568 L600 424"
        stroke="currentColor"
        strokeWidth="80"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function Sidebar() {
  const { theme, setTheme } = useTheme()
  const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)

  return (
    <aside className="flex w-52 shrink-0 flex-col border-r border-hairline bg-surface/60">
      <div className="flex h-14 items-center gap-2.5 border-b border-hairline px-4">
        <ShieldMark className="h-5 w-5 text-accent" />
        <span className="text-sm font-medium tracking-tight">Guardrail</span>
      </div>

      <nav className="flex-1 space-y-0.5 px-2 py-3" aria-label="Primary">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                'relative flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors',
                isActive ? 'text-foreground' : 'text-muted hover:text-foreground'
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <motion.span
                    layoutId="sidebar-pill"
                    className="absolute inset-0 rounded-md border border-hairline bg-accent-soft"
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
          className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-muted transition-colors hover:text-foreground"
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
      </div>
    </aside>
  )
}
