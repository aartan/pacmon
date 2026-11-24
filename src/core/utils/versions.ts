import semver from 'semver'

/**
 * Whether upgrading `from` → `to` is a potentially breaking change.
 * Mirrors cve-lite's semantics: a major bump is breaking, and for 0.x
 * releases the minor (or patch, for 0.0.x) is the breaking position.
 */
export function isBreakingUpgrade(from: string, to: string): boolean {
  const fromVersion = semver.coerce(from)
  const toVersion = semver.coerce(to)
  if (!fromVersion || !toVersion) {
    // Non-semver versions: fall back to simple integer parts.
    const [fromMajor, fromMinor, fromPatch] = from.split('.').map((n) => parseInt(n, 10))
    const [toMajor, toMinor, toPatch] = to.split('.').map((n) => parseInt(n, 10))
    const fMajor = fromMajor ?? Number.NaN
    const fMinor = fromMinor ?? Number.NaN
    const fPatch = fromPatch ?? Number.NaN
    const tMajor = toMajor ?? Number.NaN
    const tMinor = toMinor ?? Number.NaN
    const tPatch = toPatch ?? Number.NaN
    if (Number.isNaN(fMajor) || Number.isNaN(tMajor)) return false
    if (tMajor > fMajor) return true
    if (fMajor === 0 && tMajor === 0) {
      if (Number.isNaN(fMinor) || Number.isNaN(tMinor)) return false
      if (tMinor > fMinor) return true
      if (fMinor === 0 && tMinor === 0) {
        if (Number.isNaN(fPatch) || Number.isNaN(tPatch)) return false
        if (tPatch > fPatch) return true
      }
    }
    return false
  }
  return semver.major(toVersion) > semver.major(fromVersion) ||
    (semver.major(fromVersion) === 0 && semver.major(toVersion) === 0 &&
      semver.minor(toVersion) > semver.minor(fromVersion)) ||
    (semver.major(fromVersion) === 0 && semver.minor(fromVersion) === 0 &&
      semver.major(toVersion) === 0 && semver.minor(toVersion) === 0 &&
      semver.patch(toVersion) > semver.patch(fromVersion))
}

/** Is `candidate` strictly greater than `current`, semver-wise? */
export function isUpgrade(current: string, candidate: string): boolean {
  const c = semver.coerce(current)
  const n = semver.coerce(candidate)
  if (!c || !n) return candidate !== current
  return semver.gt(n, c)
}

/** Human-friendly diff level between two versions. */
export function diffLevel(from: string, to: string): 'patch' | 'minor' | 'major' | 'unknown' {
  const f = semver.coerce(from)
  const t = semver.coerce(to)
  if (!f || !t) return 'unknown'
  if (semver.major(f) !== semver.major(t)) return 'major'
  if (semver.minor(f) !== semver.minor(t)) return 'minor'
  return 'patch'
}
