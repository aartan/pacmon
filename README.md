# Guardrail

Local-first desktop application for scanning projects for security vulnerabilities and making remediation simple. Select a project, scan, review the findings, fix with one click, and verify.

Built with Electron, React, and TypeScript. Scanning is powered by [cve-lite-cli](https://github.com/OWASP/cve-lite-cli) (OWASP) with advisories from the OSV database. No cloud account, no telemetry — dependency names and versions are the only data that leaves the machine during a scan.

## Features

- **JavaScript/Node.js scanning** — npm, Yarn, pnpm, and Bun projects via lockfile scanning (`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lock`, plus a `package.json` fallback for exact pins)
- **Clear findings** — severity, CVSS, CVE/GHSA identifiers, direct vs transitive dependency classification, dependency paths, EPSS scores, and per-finding fix guidance
- **One-click remediation** — safe fixes (validated direct upgrades and in-range transitive refreshes) apply automatically; breaking parent upgrades require explicit review
- **Transitive dependency overrides** — after remediation, opt in per project to add version-scoped overrides (npm `overrides`, yarn `resolutions`, pnpm `pnpm.overrides`) that redirect only the exact vulnerable version to a fixed one, leaving all other versions untouched
- **Verify with tests** — a configurable test command (default `npm test`) runs after remediation when the script exists in `package.json`; output streams live
- **Commit to a new branch** — with configurable branch/commit naming templates (tokens like `{project}`, `{date}`, `{packages}`), stages only package.json + lockfiles; gated on a passing test suite when overrides were applied
- **Bulk operations** — scan every registered project in one click and apply all safe fixes; transitive overrides stay per project
- **Safety first** — change previews, local backups with rollback, lifecycle scripts ignored by default, automatic verification by fresh rescan, and a strict Electron security boundary
- **Local scan history** — every scan is retained locally; compare any two scans to see what was resolved, what remains, and what changed
- **Extensible by design** — a common ecosystem provider contract (`detect` / `scan` / `getRemediations` / `remediate` / `verify`) so Python, IaC, and container ecosystems can be added without touching the core

## Development

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

Cross-platform builds run in CI (see `.github/workflows/ci.yml`); macOS builds must run on macOS.

## Architecture

```
src/shared     Domain models + IPC contract (zod-validated), shared by all processes
src/core       Pure, platform-free logic: ecosystem provider contract, the
               JavaScript provider (cve-lite adapter), normalization, remediation
               planning, verification, filesystem safety — fully unit-tested
src/main       Electron main: window, services (engine runner, command executor,
               backups, history store), and the validated IPC boundary
src/preload    The only bridge: a narrow typed API over ipcRenderer
src/renderer   React UI (Tailwind v4, framer-motion, zustand)
```

Security boundary: `contextIsolation` on, `nodeIntegration` off, renderer sandboxed, a strict production CSP, all IPC payloads validated, filesystem operations restricted to registered project paths (symlink-aware), and package-manager execution restricted to a fixed allowlist with argv-only command construction (never a shell).

Remediation flow: preview → backup (manifest with hashes) → apply (package-manager-native commands, lifecycle scripts suppressed unless opted in) → fresh scan → verified diff (resolved / remaining / introduced). A finding is never reported resolved without a verifying scan, and rollback never overwrites files changed after the remediation.

Transitive override flow (per project, available from the moment a scan shows transitive findings): tick "Include transitive dependencies in fix" and the pipeline chains — collect remaining transitive findings with a fixed version → merge flat version-scoped keys (`"lodash@4.17.20": "4.17.21"`) into the manager's override field (existing entries preserved) → backup → write manifest → package-manager install → fresh-scan verify → run the configured test command automatically → verify the installed tree with the package manager's `npm ls`-equivalent so the vulnerable version is provably gone and the target version installed. The same section stays available after reloading results and can apply overrides on their own when nothing else needs fixing. Overrides never redirect any version other than the exact vulnerable one.

## Testing

- Unit: ecosystem detection, vulnerability normalization, remediation planning, command construction, version/breaking rules, verification diffing, backup/rollback safety, path containment, IPC payload validation
- Integration: the real cve-lite-cli engine runs against npm / Yarn / pnpm fixture projects with a local HTTPS mock of the OSV + npm-registry APIs — no external network or registry needed
- Fixtures live in `tests/fixtures/`

## Design

The UI is **monochrome print**: ink on cool paper, with serif display headings (Newsreader), Space Grotesk body text, and JetBrains Mono for every technical label. The chrome is strictly grayscale — colour exists only in the data, where severity dots, status LEDs, and signal blocks carry the meaning. Square corners, 1px rules, no decorative texture. The identity is deliberately unlike the author's other projects and mainstream dev tools.
