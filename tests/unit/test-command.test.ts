import { describe, expect, it } from 'vitest'
import { parseCommandLine, parseTestCommand } from '@core/ecosystems/javascript/test-command'

describe('parseCommandLine', () => {
  it('tokenises simple commands', () => {
    expect(parseCommandLine('npm test')).toEqual(['npm', 'test'])
    expect(parseCommandLine('npm run test:unit -- --watch')).toEqual(['npm', 'run', 'test:unit', '--', '--watch'])
  })

  it('respects quotes', () => {
    expect(parseCommandLine('npm test "my suite"')).toEqual(['npm', 'test', 'my suite'])
    expect(parseCommandLine("npm test 'a b'")).toEqual(['npm', 'test', 'a b'])
  })

  it('rejects unbalanced quotes and empty commands', () => {
    expect(parseCommandLine('npm test "unclosed')).toBeNull()
    expect(parseCommandLine('')).toBeNull()
    expect(parseCommandLine('   ')).toBeNull()
  })

  it('rejects shell metacharacters', () => {
    expect(parseCommandLine('npm test && rm -rf /')).toBeNull()
    expect(parseCommandLine('npm test; echo hi')).toBeNull()
    expect(parseCommandLine('npm test | cat')).toBeNull()
    expect(parseCommandLine('npm test $(whoami)')).toBeNull()
    expect(parseCommandLine('npm test `id`')).toBeNull()
    expect(parseCommandLine('npm test > out.txt')).toBeNull()
  })
})

describe('parseTestCommand', () => {
  it('derives the script name for npm run and shorthand forms', () => {
    expect(parseTestCommand('npm test')?.scriptName).toBe('test')
    expect(parseTestCommand('npm run test:unit')?.scriptName).toBe('test:unit')
    expect(parseTestCommand('yarn lint')?.scriptName).toBe('lint')
    expect(parseTestCommand('pnpm run check')?.scriptName).toBe('check')
  })

  it('does not treat install commands as scripts', () => {
    expect(parseTestCommand('npm install')?.scriptName).toBeNull()
    expect(parseTestCommand('npm run')?.scriptName).toBeNull()
  })

  it('rejects commands not starting with a package manager', () => {
    expect(parseTestCommand('jest --ci')).toBeNull()
    expect(parseTestCommand('./scripts/test.sh')).toBeNull()
    expect(parseTestCommand('sudo npm test')).toBeNull()
  })
})
