/**
 * Executes package-manager commands for remediation. The executable is
 * restricted to a fixed allowlist, arguments travel as argv arrays (never
 * through a shell), and lifecycle-script policy is enforced by the caller
 * through the command builder.
 *
 * Desktop launchers often start apps with a minimal PATH that misses Node
 * version-manager locations (nvm, fnm, volta, mise, asdf). Both detection and
 * execution therefore run with an augmented PATH built from those common
 * locations, so package managers installed through a version manager are
 * found the same way they are in the user's shell.
 */
import { execa, type ExecaError } from 'execa'
import { existsSync, readdirSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import type { PackageManager } from '../../shared/models'
import type { CommandExecutor, PackageManagerInfo } from '../../core/ecosystems/javascript/cve-lite-provider'

const ALLOWED_EXECUTABLES = new Set(['npm', 'pnpm', 'yarn', 'bun'])

const MAX_OUTPUT = 4 * 1024 * 1024 // 4 MiB cap

function tail(text: string): string {
  return text.length > MAX_OUTPUT ? text.slice(text.length - MAX_OUTPUT) : text
}

/** Candidate directories that commonly hold Node tool binaries. */
export function nodeToolDirectories(): string[] {
  const dirs: string[] = []
  const home = process.env.HOME || process.env.USERPROFILE
  const localAppData = process.platform === 'win32' ? (process.env.LOCALAPPDATA ?? '') : ''
  const appData = process.platform === 'win32' ? (process.env.APPDATA ?? '') : ''

  if (home) {
    // nvm (POSIX)
    const nvmDir = process.env.NVM_DIR ?? join(home, '.nvm')
    if (existsSync(join(nvmDir, 'current', 'bin'))) dirs.push(join(nvmDir, 'current', 'bin'))
    const versionsDir = join(nvmDir, 'versions', 'node')
    if (existsSync(versionsDir)) {
      const versions = readdirSync(versionsDir)
        .sort()
        .reverse()
        .map((v) => join(versionsDir, v, 'bin'))
      dirs.push(...versions.slice(0, 3))
    }
    // fnm
    dirs.push(join(home, '.local', 'share', 'fnm', 'aliases', 'default', 'bin'))
    dirs.push(join(home, 'Library', 'Application Support', 'fnm', 'aliases', 'default', 'bin'))
    // volta
    dirs.push(join(home, '.volta', 'bin'))
    // mise
    const miseNode = join(home, '.local', 'share', 'mise', 'installs', 'node')
    if (existsSync(miseNode)) {
      const versions = readdirSync(miseNode).sort().reverse().map((v) => join(miseNode, v, 'bin'))
      dirs.push(...versions.slice(0, 3))
    }
    // asdf shims
    dirs.push(join(home, '.asdf', 'shims'))
    // user-local bins
    dirs.push(join(home, '.local', 'bin'), join(home, 'bin'))
  }
  if (localAppData) {
    // nvm-windows
    const nvmWin = join(localAppData, 'nvm')
    const winVersions = existsSync(nvmWin) ? readdirSync(nvmWin).filter((e) => e.startsWith('v')) : []
    winVersions
      .sort()
      .reverse()
      .slice(0, 3)
      .forEach((v) => dirs.push(join(nvmWin, v)))
    dirs.push(join(localAppData, 'Volta', 'bin'))
    dirs.push(join(localAppData, 'fnm_multishells', 'default', 'bin'))
  }
  if (appData) dirs.push(join(appData, 'npm'))

  // Common system locations not always present in minimal launcher PATHs.
  dirs.push('/usr/local/bin', '/opt/homebrew/bin', '/opt/local/bin', '/usr/local/sbin')

  return dirs.filter((d) => existsSync(d))
}

function augmentedEnv(): Record<string, string> {
  const currentPath = process.env.PATH ?? ''
  const existing = new Set(currentPath.split(delimiter).filter(Boolean))
  const extras = nodeToolDirectories().filter((d) => !existing.has(d))
  if (extras.length === 0) return { ...process.env } as Record<string, string>
  const env = { ...process.env } as Record<string, string>
  env.PATH = [...extras, currentPath].join(delimiter)
  return env
}

export class PackageManagerExecutor implements CommandExecutor {
  async run(
    argv: string[],
    opts: { cwd: string; timeoutMs: number; signal?: AbortSignal; onOutput?: (chunk: string) => void }
  ): Promise<{ exitCode: number | null; stdout: string; stderr: string; error: string | null }> {
    const executable = argv[0]
    if (!executable || !ALLOWED_EXECUTABLES.has(executable)) {
      return {
        exitCode: null,
        stdout: '',
        stderr: '',
        error: `Refusing to execute untrusted command: ${executable ?? '<empty>'}`
      }
    }

    let stdout = ''
    let stderr = ''
    try {
      const child = execa(executable, argv.slice(1), {
        cwd: opts.cwd,
        timeout: opts.timeoutMs,
        signal: opts.signal,
        stripFinalNewline: false,
        windowsHide: true,
        all: false,
        env: augmentedEnv()
      })
      child.stdout?.on('data', (chunk: Buffer) => {
        const text = chunk.toString('utf8')
        stdout = tail(stdout + text)
        opts.onOutput?.(text)
      })
      child.stderr?.on('data', (chunk: Buffer) => {
        stderr = tail(stderr + chunk.toString('utf8'))
      })
      const result = await child
      return { exitCode: 0, stdout, stderr, error: null }
    } catch (e) {
      const error = e as ExecaError
      if (error.isCanceled) {
        return { exitCode: null, stdout, stderr, error: 'Command was cancelled.' }
      }
      if (error.timedOut) {
        return {
          exitCode: null,
          stdout,
          stderr,
          error: `Command timed out after ${Math.round(opts.timeoutMs / 1000)}s.`
        }
      }
      return {
        exitCode: typeof error.exitCode === 'number' ? error.exitCode : null,
        stdout: tail(stdout + (error.stdout ?? '')),
        stderr: tail(stderr + (error.stderr ?? '')),
        error:
          (error as Error & { code?: string }).code === 'ENOENT' ? `Command not found: ${executable}` : null
      }
    }
  }
}

/** Detect whether a package manager is installed, and its version. */
export async function detectPackageManager(pm: PackageManager): Promise<PackageManagerInfo> {
  try {
    const result = await execa(pm, ['--version'], {
      timeout: 10_000,
      windowsHide: true,
      env: augmentedEnv()
    })
    const version = result.stdout.trim().split('\n')[0]?.trim() ?? null
    return { available: true, version }
  } catch {
    return { available: false, version: null }
  }
}
