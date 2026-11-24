/**
 * Spawns the cve-lite-cli engine as a subprocess on the app's own Node
 * runtime (ELECTRON_RUN_AS_NODE), so no system Node installation is needed.
 */
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import type { CveLiteRunner, EngineRunResult } from '../../core/ecosystems/javascript/cve-lite-provider'

const MAX_OUTPUT = 8 * 1024 * 1024 // 8 MiB cap per stream

interface EnginePackage {
  version: string
}

export function engineEntryPath(): string {
  const base = app.getAppPath()
  const root = base.endsWith('app.asar') ? base.replace(/app\.asar$/, 'app.asar.unpacked') : base
  return join(root, 'node_modules', 'cve-lite-cli', 'dist', 'index.js')
}

export function engineVersion(): string {
  try {
    const base = app.getAppPath()
    const root = base.endsWith('app.asar') ? base.replace(/app\.asar$/, 'app.asar.unpacked') : base
    const pkg = JSON.parse(readFileSync(join(root, 'node_modules', 'cve-lite-cli', 'package.json'), 'utf8')) as EnginePackage
    return pkg.version
  } catch {
    return 'unknown'
  }
}

function bufferConcat(prev: Buffer<ArrayBufferLike>, chunk: Buffer<ArrayBufferLike>): Buffer<ArrayBufferLike> {
  const next = Buffer.concat([prev, chunk])
  return next.length > MAX_OUTPUT ? next.subarray(next.length - MAX_OUTPUT) : next
}

export class ElectronEngineRunner implements CveLiteRunner {
  private readonly versionValue: string

  constructor() {
    this.versionValue = engineVersion()
  }

  version(): string {
    return this.versionValue
  }

  run(args: string[], opts: { cwd: string; timeoutMs: number; signal?: AbortSignal }): Promise<EngineRunResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [engineEntryPath(), ...args], {
        cwd: opts.cwd,
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', NO_COLOR: '1' },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true
      })

      let stdout: Buffer<ArrayBufferLike> = Buffer.alloc(0)
      let stderr: Buffer<ArrayBufferLike> = Buffer.alloc(0)
      let settled = false
      let timedOut = false

      const finish = (result: EngineRunResult) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        opts.signal?.removeEventListener('abort', onAbort)
        resolve(result)
      }

      const onAbort = () => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        try {
          child.kill('SIGKILL')
        } catch {
          /* child already gone */
        }
        reject(new Error('Scan was cancelled.'))
      }

      const timer = setTimeout(() => {
        timedOut = true
        try {
          child.kill('SIGKILL')
        } catch {
          /* child already gone */
        }
      }, opts.timeoutMs)

      child.stdout.on('data', (chunk: Buffer) => {
        stdout = bufferConcat(stdout, chunk)
      })
      child.stderr.on('data', (chunk: Buffer) => {
        stderr = bufferConcat(stderr, chunk)
      })
      child.on('error', (error) => {
        if (settled) return
        clearTimeout(timer)
        opts.signal?.removeEventListener('abort', onAbort)
        settled = true
        reject(error)
      })
      child.on('close', (code) => {
        if (timedOut) {
          finish({
            exitCode: 124,
            stdout: stdout.toString('utf8'),
            stderr: `Engine timed out after ${Math.round(opts.timeoutMs / 1000)}s.\n${stderr.toString('utf8')}`
          })
          return
        }
        finish({ exitCode: code ?? -1, stdout: stdout.toString('utf8'), stderr: stderr.toString('utf8') })
      })

      opts.signal?.addEventListener('abort', onAbort)
      if (opts.signal?.aborted) onAbort()
    })
  }
}
