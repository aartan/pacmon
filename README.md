# Pacmon

**Local-first package vulnerability monitoring and remediation.**

Pacmon scans your JavaScript projects for known vulnerabilities, shows you exactly what's wrong and why, fixes it in one click, and proves the fix with your own test suite — entirely on your machine. No cloud account, no telemetry, no sending your code anywhere. Dependency names and versions are the only data that leave the machine during a scan, queried against the public [OSV](https://osv.dev) advisory database.

Built with Electron, React, and TypeScript. Scanning is powered by [cve-lite-cli](https://github.com/OWASP/cve-lite-cli) (OWASP).

## Features

### Scan

- **JavaScript/Node.js** — npm, Yarn, pnpm, and Bun projects via lockfile scanning (`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lock`, plus a `package.json` fallback for exact pins).
- **Clear findings** — severity, CVSS, CVE/GHSA identifiers, direct vs transitive classification, dependency paths, EPSS scores, and per-finding fix guidance.
- **Bulk operations** — scan every registered project in one click, then apply all safe fixes across them with live progress and per-project results.

### Remediate

- **One-click fixes** — safe fixes (validated direct upgrades and in-range transitive refreshes) apply automatically; breaking parent upgrades require explicit review.
- **Transitive dependency overrides** — when the dependency tree won't cooperate, add version-scoped overrides (npm `overrides`, yarn `resolutions`, pnpm `pnpm.overrides`) that redirect *only* the exact vulnerable version to a fixed one, leaving every other version untouched:
  ```json
  {
    "overrides": {
      "lodash@4.17.20": "4.17.21",
      "minimist@1.2.5": "1.2.8"
    }
  }
  ```
- **Prove the fix** — after overrides are applied, Pacmon runs the package manager install, executes your configured test command (default `npm test`), and checks the installed tree with the package manager's `npm ls`-equivalent to confirm the vulnerable version is gone and the target version is installed.

### Trust

- **Safety first** — change previews before anything runs, local backups with rollback, lifecycle scripts ignored by default, and every fix verified by a fresh scan. A finding is never reported resolved without a verifying scan, and rollback never overwrites files changed after the fix.
- **Commit when you're ready** — create a branch and commit only the touched files (`package.json` + lockfiles), with configurable naming templates (tokens like `{project}`, `{date}`, `{packages}`). Commits are gated on a passing test suite when overrides were applied.
- **Local scan history** — every scan is retained; compare any two scans to see what was resolved, what remains, and what changed.
- **Extensible by design** — a common ecosystem provider contract (`detect` / `scan` / `getRemediations` / `remediate` / `verify`) so Python, IaC, and container ecosystems can be added without touching the core.

## Getting started

Requires Node.js 22.13+ (Electron 45 bundles Node 24).

```bash
npm install
npm run dev          # launch with hot reload
npm test             # unit + integration tests (hermetic: local mock OSV server)
npm run typecheck
```

### Building

```bash
npm run build:linux   # AppImage, deb (Ubuntu), rpm (Fedora)
npm run build:mac     # dmg, zip (macOS)
npm run build:win     # NSIS installer (Windows)
```

Cross-platform builds run in CI; macOS builds must run on macOS.

## How it works

```
scan ──► findings ──► fix plan ──► preview ──► backup ──► apply ──► fresh scan ──► verified diff
                                    └─ transitive overrides: manifest ─► install ─► tests ─► npm ls check
```

1. **Scan** — the cve-lite engine reads the lockfile and queries OSV for advisories affecting the resolved versions.
2. **Plan** — each finding gets a remediation: a validated direct upgrade, an in-range transitive refresh, a breaking parent upgrade (explicit review), or an override.
3. **Apply** — package-manager-native commands (argv-only, never a shell) with lifecycle scripts suppressed unless you opt in.
4. **Verify** — a fresh scan diffs against the previous state; tests and installed-version checks prove the app still works.

## Security model

Pacmon treats your projects as hostile input:

- Renderer is fully sandboxed (`contextIsolation`, no `nodeIntegration`, strict CSP).
- All IPC payloads are zod-validated; filesystem operations are restricted to registered project paths with symlink-aware containment.
- Package-manager execution runs through a fixed allowlist with argv-only command construction — a dependency name containing `&&` can never become a second command.
- Remediation files are backed up with hashed manifests before any change; rollback refuses to clobber files you edited afterwards.

## Architecture

```
src/shared     Domain models + IPC contract (zod-validated), shared by all processes
src/core       Pure, platform-free logic: ecosystem provider contract, the
               JavaScript provider (cve-lite adapter), normalization, remediation
               planning, overrides, version checks, verification, backups, git naming
src/main       Electron main: window, services (engine runner, command executor,
               test runner, git service, history store), and the validated IPC boundary
src/preload    The only bridge: a narrow typed API over ipcRenderer
src/renderer   React UI (Tailwind v4, framer-motion, zustand)
```

## Testing

- **Unit** — ecosystem detection, vulnerability normalization, remediation planning, override merging, version-check parsing, command construction, git naming, backup/rollback safety, path containment, IPC payload validation, and jsdom render tests for the full app.
- **Integration** — the real cve-lite-cli engine runs against npm / Yarn / pnpm fixture projects with a local HTTPS mock of the OSV + npm-registry APIs — no external network or registry needed. Includes the full remediation loop: backup → apply → verify → rollback, and the override → install → `npm ls` check pipeline.

## Design

The UI is **monochrome print**: ink on cool paper, serif display headings (Newsreader), Space Grotesk body text, and JetBrains Mono for every technical label. The chrome is strictly grayscale — colour exists only in the data, where severity dots, status LEDs, and signal blocks carry the meaning. Square corners, 1px rules, no decorative texture.

## License

[MIT](LICENSE)
