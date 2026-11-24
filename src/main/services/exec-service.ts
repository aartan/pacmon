/**
 * Executes package-manager commands for remediation. The executable is
 * restricted to a fixed allowlist, arguments travel as argv arrays (never
 * through a shell), and lifecycle-script policy is enforced by the caller
 * through the command builder.
 */
import { execa, type ExecaError } from 'execa'
import type { PackageManager } from '../../shared/models'
import type { CommandExecutor, PackageManagerInfo } from '../../core/ecosystems/javascript/cve-lite-provider'

const ALLOWED_EXECUTABLES = new Set(['npm', 'pnpm', 'yarn', 'bun'])

const MAX_OUTPUT = 4 * 1024 * 1024 // 4 MiB cap

function tail(text: string): string {
  return text.length > MAX_OUTPUT ? text.slice(text.length - MAX_OUTPUT) : text
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
        all: false
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
    const result = await execa(pm, ['--version'], { timeout: 10_000, windowsHide: true })
    const version = result.stdout.trim().split('\n')[0]?.trim() ?? null
    return { available: true, version }
  } catch {
    return { available: false, version: null }
  }
}
