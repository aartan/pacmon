import { useEffect, useState } from 'react'
import { PageBody, PageHeader } from '@renderer/components/layout/page-header'
import { Card, MicroLabel } from '@renderer/components/ui/ui'
import { useAppStore } from '@renderer/state/app-store'
import { useTheme } from '@renderer/lib/theme'
import type { AppSettings, Severity } from '@shared/models'
import { cn } from '@renderer/lib/utils'

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 py-3.5">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="mt-0.5 max-w-md text-xs leading-relaxed text-faint">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function Select<T extends string | number | null>({
  value,
  options,
  onChange
}: {
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (value: T) => void
}) {
  return (
    <select
      value={value ?? ''}
      onChange={(e) => {
        const raw = e.target.value
        const match = options.find((o) => String(o.value) === raw)
        if (match) onChange(match.value)
      }}
      className="h-9 rounded-md border border-hairline bg-surface px-2.5 text-sm text-foreground outline-none transition-colors focus:border-accent/50"
    >
      {options.map((o) => (
        <option key={String(o.value)} value={String(o.value)}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

function Checkbox({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-5 w-9 rounded-full border transition-colors',
        checked ? 'border-transparent bg-accent' : 'border-hairline bg-surface-2'
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all',
          checked ? 'left-[18px]' : 'left-0.5'
        )}
      />
    </button>
  )
}

export function SettingsView() {
  const settings = useAppStore((s) => s.settings)
  const saveSettings = useAppStore((s) => s.saveSettings)
  const appInfo = useAppStore((s) => s.appInfo)
  const { setTheme } = useTheme()
  const [draft, setDraft] = useState<AppSettings>(settings)
  const [saved, setSaved] = useState(false)

  useEffect(() => setDraft(settings), [settings])

  const persist = async (patch: Partial<AppSettings>) => {
    const next = { ...draft, ...patch }
    setDraft(next)
    await saveSettings(next)
    if (patch.theme) setTheme(patch.theme)
    setSaved(true)
  }

  return (
    <>
      <PageHeader label="04 // Settings" title="Settings" description="Local preferences. Everything is stored on this machine." />
      <PageBody>
        <div className="max-w-2xl space-y-6">
          <Card>
            <MicroLabel>Appearance</MicroLabel>
            <div className="mt-2 divide-y divide-hairline">
              <Row label="Theme" hint="Follow the system or pin a theme.">
                <Select
                  value={draft.theme}
                  options={[
                    { value: 'system', label: 'System' },
                    { value: 'light', label: 'Light' },
                    { value: 'dark', label: 'Dark' }
                  ]}
                  onChange={(v) => persist({ theme: v })}
                />
              </Row>
            </div>
          </Card>

          <Card>
            <MicroLabel>Scanning</MicroLabel>
            <div className="mt-2 divide-y divide-hairline">
              <Row
                label="Include dev dependencies"
                hint="Scan packages from devDependencies as well as production dependencies."
              >
                <Checkbox
                  checked={draft.defaultIncludeDev}
                  onChange={(v) => persist({ defaultIncludeDev: v })}
                />
              </Row>
              <Row label="Scan timeout" hint="How long a single scan may run before it is stopped.">
                <Select
                  value={draft.scanTimeoutSeconds}
                  options={[
                    { value: 120, label: '2 minutes' },
                    { value: 300, label: '5 minutes' },
                    { value: 600, label: '10 minutes' }
                  ]}
                  onChange={(v) => persist({ scanTimeoutSeconds: v })}
                />
              </Row>
              <Row label="Minimum severity" hint="Findings below this severity are hidden from reports.">
                <Select
                  value={draft.minSeverity}
                  options={[
                    { value: null, label: 'Show everything' },
                    { value: 'low', label: 'Low and above' },
                    { value: 'medium', label: 'Medium and above' },
                    { value: 'high', label: 'High and above' },
                    { value: 'critical', label: 'Critical only' }
                  ]}
                  onChange={(v) => persist({ minSeverity: v as Severity | null })}
                />
              </Row>
            </div>
          </Card>

          <Card>
            <MicroLabel>Remediation</MicroLabel>
            <div className="mt-2 divide-y divide-hairline">
              <Row
                label="Ignore lifecycle scripts"
                hint="Run installs with lifecycle scripts disabled by default. Untrusted postinstall scripts will not execute unless you opt in per remediation."
              >
                <Checkbox
                  checked={draft.defaultIgnoreLifecycleScripts}
                  onChange={(v) => persist({ defaultIgnoreLifecycleScripts: v })}
                />
              </Row>
              <Row label="Backup retention" hint="How long remediation backups are kept for rollback.">
                <Select
                  value={draft.backupRetentionDays}
                  options={[
                    { value: 0, label: 'Keep forever' },
                    { value: 7, label: '7 days' },
                    { value: 14, label: '14 days' },
                    { value: 30, label: '30 days' }
                  ]}
                  onChange={(v) => persist({ backupRetentionDays: v })}
                />
              </Row>
            </div>
          </Card>

          <Card>
            <MicroLabel>About</MicroLabel>
            <div className="mt-2 divide-y divide-hairline">
              <Row label="Application">
                <span className="font-mono text-xs text-muted">Guardrail {appInfo?.version ?? '—'}</span>
              </Row>
              <Row label="Scanning engine">
                <span className="font-mono text-xs text-muted">{appInfo?.engine.version ?? '—'}</span>
              </Row>
              <Row label="Runtime">
                <span className="font-mono text-xs text-muted">
                  Electron {appInfo?.electron} · Node {appInfo?.node}
                </span>
              </Row>
              <Row label="Advisory data" hint="Findings come from the OSV database via cve-lite-cli.">
                <span className="font-mono text-xs text-muted">osv.dev</span>
              </Row>
            </div>
          </Card>

          {saved && <p className="text-xs text-ok">Settings saved.</p>}
        </div>
      </PageBody>
    </>
  )
}
