/**
 * Git integration: branch + commit for remediation changes. Executes `git`
 * with argv arrays only (never a shell), restricted to a fixed command set,
 * and never stages files outside the registered project.
 */
import { execa, type ExecaError } from 'execa'
import { join, relative } from 'node:path'
import type { GitCommitResult } from '../../shared/models'
import { validateBranchName, validateCommitMessage } from '../../core/git/naming'
import { augmentedEnv } from './exec-service'

export interface GitCommandResult {
  exitCode: number | null
  stdout: string
  stderr: string
  error: string | null
}

const GIT_TIMEOUT = 30_000

async function runGit(argv: string[], cwd: string): Promise<GitCommandResult> {
  let stdout = ''
  let stderr = ''
  try {
    const child = execa('git', argv, {
      cwd,
      timeout: GIT_TIMEOUT,
      stripFinalNewline: false,
      windowsHide: true,
      env: augmentedEnv()
    })
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8')
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
    })
    await child
    return { exitCode: 0, stdout, stderr, error: null }
  } catch (e) {
    const error = e as ExecaError
    if ((error as Error & { code?: string }).code === 'ENOENT') {
      return { exitCode: null, stdout, stderr, error: 'git was not found on this machine.' }
    }
    return {
      exitCode: typeof error.exitCode === 'number' ? error.exitCode : null,
      stdout: stdout + (error.stdout ?? ''),
      stderr: stderr + (error.stderr ?? ''),
      error: null
    }
  }
}

export interface GitRepoInfo {
  isRepo: boolean
  currentBranch: string | null
  dirtyPaths: string[]
  error: string | null
}

export class GitService {
  /** Verify the directory is inside a git work tree and read its state. */
  async inspect(cwd: string): Promise<GitRepoInfo> {
    const inside = await runGit(['rev-parse', '--is-inside-work-tree'], cwd)
    if (inside.exitCode !== 0) {
      return { isRepo: false, currentBranch: null, dirtyPaths: [], error: null }
    }
    const branch = await runGit(['branch', '--show-current'], cwd)
    const status = await runGit(['status', '--porcelain'], cwd)
    const dirtyPaths = status.stdout
      .split('\n')
      .map((line) => line.slice(3))
      .filter((p) => p.length > 0)
    return {
      isRepo: true,
      currentBranch: branch.exitCode === 0 ? branch.stdout.trim() || null : null,
      dirtyPaths,
      error: null
    }
  }

  /**
   * Create a branch at HEAD, stage exactly `files` (paths inside `cwd`),
   * and commit with `message`. Both are validated before anything runs.
   */
  async createBranchAndCommit(
    cwd: string,
    branch: string,
    message: string,
    files: string[]
  ): Promise<GitCommitResult> {
    const branchError = validateBranchName(branch)
    if (branchError) return { branch, commit: null, files: [], error: branchError }
    const messageError = validateCommitMessage(message)
    if (messageError) return { branch, commit: null, files: [], error: messageError }
    if (files.length === 0) return { branch, commit: null, files: [], error: 'No files to commit.' }

    const info = await this.inspect(cwd)
    if (!info.isRepo) return { branch, commit: null, files: [], error: 'This project is not inside a git repository.' }

    // Every staged path must stay inside the project directory.
    const staged: string[] = []
    for (const file of files) {
      const rel = relative(cwd, file)
      if (rel.startsWith('..') || rel === '' || rel.includes('\0')) {
        return { branch, commit: null, files: [], error: `Refusing to stage a file outside the project: ${file}` }
      }
      staged.push(rel.split('\\').join('/'))
    }

    const checkout = await runGit(['checkout', '-b', branch], cwd)
    if (checkout.exitCode !== 0) {
      return {
        branch,
        commit: null,
        files: [],
        error: `Could not create branch "${branch}": ${checkout.stderr.trim() || checkout.stdout.trim() || 'git checkout failed'}`
      }
    }

    const add = await runGit(['add', '--', ...staged], cwd)
    if (add.exitCode !== 0) {
      return {
        branch,
        commit: null,
        files: [],
        error: `Could not stage files: ${add.stderr.trim() || add.stdout.trim() || 'git add failed'}`
      }
    }

    const commit = await runGit(['commit', '-m', message], cwd)
    if (commit.exitCode !== 0) {
      return {
        branch,
        commit: null,
        files: [],
        error: `Could not commit: ${commit.stderr.trim() || commit.stdout.trim() || 'git commit failed'}`
      }
    }

    const hash = await runGit(['rev-parse', 'HEAD'], cwd)
    return {
      branch,
      commit: hash.exitCode === 0 ? hash.stdout.trim() : null,
      files: staged,
      error: null
    }
  }
}

/** Absolute paths of the manifest/lockfiles a remediation may have touched. */
export function gitCandidateFiles(projectPath: string): string[] {
  const names = [
    'package.json',
    'package-lock.json',
    'pnpm-lock.yaml',
    'yarn.lock',
    'bun.lock',
    'bun.lockb',
    'npm-shrinkwrap.json'
  ]
  return names.map((n) => join(projectPath, n))
}
