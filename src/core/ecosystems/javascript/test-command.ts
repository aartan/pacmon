/**
 * Parsing and safety checks for user-configurable test commands.
 *
 * The configured command (e.g. `npm test`) is split into argv here, never
 * through a shell. Only package-manager executables may start the command,
 * and any token containing shell metacharacters is rejected outright.
 */

const ALLOWED_EXECUTABLES = new Set(['npm', 'pnpm', 'yarn', 'bun'])

const UNSAFE = /[;&|<>$`*?(){}!\\\n\r]/

/**
 * Tokenise a command line respecting single/double quotes. Returns null when
 * the command is empty, unbalanced, or contains shell metacharacters.
 */
export function parseCommandLine(command: string): string[] | null {
  const trimmed = command.trim()
  if (trimmed.length === 0) return null

  const tokens: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null
  for (const char of trimmed) {
    if (quote) {
      if (char === quote) {
        quote = null
      } else {
        current += char
      }
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      continue
    }
    if (/\s/.test(char)) {
      if (current.length > 0) {
        tokens.push(current)
        current = ''
      }
      continue
    }
    current += char
  }
  if (quote !== null) return null
  if (current.length > 0) tokens.push(current)

  if (tokens.length === 0) return null
  for (const token of tokens) {
    if (UNSAFE.test(token)) return null
  }
  return tokens
}

export interface ParsedTestCommand {
  argv: string[]
  /** The package.json script the command invokes, when derivable. */
  scriptName: string | null
}

/**
 * Parse a configured test command into executable argv. Returns null when
 * the command is unsafe or does not start with an allowed package manager.
 */
export function parseTestCommand(command: string): ParsedTestCommand | null {
  const tokens = parseCommandLine(command)
  if (!tokens) return null
  const executable = tokens[0]
  if (!executable || !ALLOWED_EXECUTABLES.has(executable)) return null

  let scriptName: string | null = null
  const second = tokens[1]
  const third = tokens[2]
  if (second === 'run' && third) {
    scriptName = third
  } else if (tokens.length === 2 && second && /^[A-Za-z0-9:._-]+$/.test(second)) {
    // `npm test`, `yarn test:unit`, `pnpm lint` — PM shorthand for `run`.
    if (
      second !== 'install' &&
      second !== 'add' &&
      second !== 'update' &&
      second !== 'run' &&
      second !== 'uninstall'
    ) {
      scriptName = second
    }
  }
  return { argv: tokens, scriptName }
}
