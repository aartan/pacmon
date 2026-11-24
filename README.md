# Guardrail

Local-first desktop application for scanning projects for security vulnerabilities and making remediation simple. Select a project, scan, review the findings, fix with one click, and verify.

Built with Electron, React, and TypeScript. Scanning is powered by [cve-lite-cli](https://github.com/OWASP/cve-lite-cli) (OWASP) with advisories from the OSV database. No cloud account, no telemetry — dependency names and versions are the only data that leaves the machine during a scan.

## Features

- **JavaScript/Node.js scanning** — npm, Yarn, pnpm, and Bun projects via lockfile scanning (`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lock`, plus a `package.json` fallback for exact pins)
- **Clear findings** — severity, CVSS, CVE/GHSA identifiers, direct vs transitive dependency classification, dependency paths, EPSS scores, and per-finding fix guidance
- **One-click remediation** — safe fixes (validated direct upgrades and in-range transitive refreshes) apply automatically; breaking parent upgrades require explicit review
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

## Testing

- Unit: ecosystem detection, vulnerability normalization, remediation planning, command construction, version/breaking rules, verification diffing, backup/rollback safety, path containment, IPC payload validation
- Integration: the real cve-lite-cli engine runs against npm / Yarn / pnpm fixture projects with a local HTTPS mock of the OSV + npm-registry APIs — no external network or registry needed
- Fixtures live in `tests/fixtures/`

## Design

The UI follows the same design language as the author's portfolio: Geist typography, hairline borders, a single restrained accent, subtle motion, and quiet, information-dense views for developers.
