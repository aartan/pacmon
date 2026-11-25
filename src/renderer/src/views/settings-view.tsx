import { useEffect, useState } from 'react'
import { PageBody, PageHeader } from '@renderer/components/layout/page-header'
import { Card, MicroLabel, TextInput } from '@renderer/components/ui/ui'
import { useAppStore } from '@renderer/state/app-store'
import { useTheme } from '@renderer/lib/theme'
import type { AppSettings, Severity } from '@shared/models'
import { cn } from '@renderer/lib/utils'
import {
  expandPattern,
  SAMPLE_CONTEXT,
  validateBranchName,
  validateCommitMessage
} from '@core/git/naming'

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 py-3.5">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="mt-0.5 max-w-md text-xs leading-relaxed text-faint">{hint}</p>}
      </div>
      <div className="w-64 shrink-0">{children}</div>
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
      className="h-9 w-full rounded-none border border-hairline bg-surface px-2.5 text-sm text-foreground outline-none transition-colors focus:border-accent/60"
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
        'relative h-5 w-9 border transition-colors',
        checked ? 'border-transparent bg-foreground' : 'border-hairline bg-surface-2'
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 h-4 w-4 bg-white shadow-sm transition-all',
          checked ? 'left-[18px]' : 'left-0.5'
        )}
      />
    </button>
  )
}

function PatternField({
  label,
  hint,
  value,
  preview,
  valid,
  validationError,
  onChange
}: {
  label: string
  hint: string
  value: string
  preview: string
  valid: boolean
  validationError: string | null
  onChange: (value: string) => void
}) {
  return (
    <div className="py-3.5">
      <div className="flex items-center justify-between gap-6">
        <div>
          <p className="text-sm font-medium">{label}</p>
          <p className="mt-0.5 max-w-md text-xs leading-relaxed text-faint">{hint}</p>
        </div>
        <div className="w-64 shrink-0">
          <TextInput value={value} spellCheck={false} onChange={(e) => onChange(e.target.value)} />
        </div>
      </div>
      <div className="mt-2 rounded-none border border-hairline bg-code-bg px-3 py-2">
        <p className="font-mono text-[11px] leading-relaxed">
          <span className="text-faint">preview: </span>
          <span className={valid ? 'text-foreground' : 'text-critical'}>{preview}</span>
        </p>
        {validationError && <p className="mt-1 font-mono text-[10px] text-critical">{validationError}</p>}
      </div>
    </div>
  )
}

export function SettingsView() {
  const settings = useAppStore((s) => s.settings)
  const saveSettings = useAppStore((s) => s.saveSettings)
  const appInfo = useAppStore((s) => s.appInfo)
  const { setTheme } = useTheme()
  const [draft, setDraft] = useState<AppSettings>(settings)
  const [saved, setSaved] = useState(false)
  const [persistError, setPersistError] = useState<string | null>(null)

  useEffect(() => setDraft(settings), [settings])

  const persist = async (patch: Partial<AppSettings>) => {
    const next = { ...draft, ...patch }
    setDraft(next)
    try {
      await saveSettings(next)
      if (patch.theme) setTheme(patch.theme)
      setSaved(true)
      setPersistError(null)
    } catch (e) {
      setSaved(false)
      setPersistError(e instanceof Error ? e.message : String(e))
    }
  }

  const branchPreview = expandPattern(draft.branchNamePattern, SAMPLE_CONTEXT)
  const branchError = validateBranchName(branchPreview)
  const commitPreview = expandPattern(draft.commitMessagePattern, {
    ...SAMPLE_CONTEXT,
    branch: branchError ? undefined : branchPreview
  })
  const commitError = validateCommitMessage(commitPreview)

  return (
    <>
      <PageHeader label="Settings" title="Settings" description="Local preferences. Everything is stored on this machine." />
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
              <Row
                label="Test command"
                hint="Run to verify changes after remediation (e.g. npm test). Must start with npm, pnpm, yarn or bun; executed argv-only, never through a shell."
              >
                <TextInput
                  value={draft.testCommand}
                  spellCheck={false}
                  onChange={(e) => persist({ testCommand: e.target.value })}
                />
              </Row>
            </div>
          </Card>

          <Card>
            <MicroLabel>Git integration</MicroLabel>
            <p className="mt-2 text-xs leading-relaxed text-faint">
              Templates used when committing remediation changes to a new branch. Tokens: <code className="font-mono">{"{project}"}</code>{' '}
              <code className="font-mono">{"{date}"}</code> <code className="font-mono">{"{time}"}</code>{' '}
              <code className="font-mono">{"{packages}"}</code> and, for commit messages,{' '}
              <code className="font-mono">{"{branch}"}</code>.
            </p>
            <div className="mt-2 divide-y divide-hairline">
              <PatternField
                label="Branch name"
                hint="Branch created for the fix, e.g. fix/{project}-deps-{date}."
                value={draft.branchNamePattern}
                preview={branchPreview}
                valid={branchError === null}
                validationError={branchError}
                onChange={(v) => persist({ branchNamePattern: v })}
              />
              <PatternField
                label="Commit message"
                hint="Message used for the fix commit."
                value={draft.commitMessagePattern}
                preview={commitPreview}
                valid={commitError === null}
                validationError={commitError}
                onChange={(v) => persist({ commitMessagePattern: v })}
              />
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

          {persistError && (
            <p className="rounded-none border border-critical/30 bg-critical-soft px-3 py-2 text-sm text-critical">
              {persistError}
            </p>
          )}
          {saved && <p className="text-xs text-ok">Settings saved.</p>}
        </div>
      </PageBody>
    </>
  )
}
