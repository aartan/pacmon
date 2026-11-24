/** Lightweight semver-ish diff level for display (renderer-only). */
export function diffLevel(from: string, to: string): 'patch' | 'minor' | 'major' | 'unknown' {
  const parse = (v: string): number[] => {
    const match = v.match(/^(\d+)\.(\d+)\.(\d+)/)
    return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : []
  }
  const f = parse(from)
  const t = parse(to)
  if (f.length === 0 || t.length === 0) return 'unknown'
  if (t[0]! !== f[0]!) return 'major'
  if (t[1]! !== f[1]!) return 'minor'
  return 'patch'
}
