/**
 * Local scan history, stored in SQLite (node:sqlite — no native deps) in the
 * userData directory. Full reports are retained per scan so comparisons and
 * exports never need to rescan.
 */
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { RemediationResult, ScanRecord, ScanReport } from '../../shared/models'

const DB_FILE = 'history.db'

interface ScanRow {
  id: string
  project_id: string
  project_name: string
  project_path: string
  ecosystem: string
  scanned_at: string
  duration_ms: number
  engine_version: string
  summary: string
  remediation_id: string | null
  report: string
}

export class HistoryStore {
  private readonly db: DatabaseSync

  constructor(userDataDir: string) {
    mkdirSync(userDataDir, { recursive: true })
    this.db = new DatabaseSync(join(userDataDir, DB_FILE))
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS scans (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        project_name TEXT NOT NULL,
        project_path TEXT NOT NULL,
        ecosystem TEXT NOT NULL,
        scanned_at TEXT NOT NULL,
        duration_ms INTEGER NOT NULL,
        engine_version TEXT NOT NULL,
        summary TEXT NOT NULL,
        remediation_id TEXT,
        report TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_scans_project ON scans (project_id, scanned_at);
      CREATE TABLE IF NOT EXISTS advisory_cache (
        advisory_id TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        fetched_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS remediations (
        id TEXT PRIMARY KEY,
        scan_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        started_at TEXT NOT NULL,
        finished_at TEXT NOT NULL,
        state TEXT NOT NULL,
        backup_dir TEXT NOT NULL,
        result TEXT NOT NULL
      );
    `)
  }

  insert(report: ScanReport, remediationId: string | null = null): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO scans
         (id, project_id, project_name, project_path, ecosystem, scanned_at, duration_ms,
          engine_version, summary, remediation_id, report)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        report.id,
        report.projectId,
        report.projectName,
        report.projectPath,
        report.ecosystem,
        report.scannedAt,
        report.durationMs,
        report.engineVersion,
        JSON.stringify(report.summary),
        remediationId,
        JSON.stringify(report)
      )
  }

  getReport(scanId: string): ScanReport | null {
    const row = this.db.prepare('SELECT report FROM scans WHERE id = ?').get(scanId) as { report: string } | undefined
    if (!row) return null
    try {
      return JSON.parse(row.report) as ScanReport
    } catch {
      return null
    }
  }

  list(limit = 200): ScanRecord[] {
    const rows = this.db
      .prepare(
        `SELECT id, project_id, project_name, project_path, ecosystem, scanned_at,
                duration_ms, engine_version, summary, remediation_id
         FROM scans ORDER BY scanned_at DESC LIMIT ?`
      )
      .all(limit) as Array<Omit<ScanRow, 'report'>>
    return rows.map((r) => ({
      id: r.id,
      projectId: r.project_id,
      projectName: r.project_name,
      projectPath: r.project_path,
      ecosystem: r.ecosystem,
      scannedAt: r.scanned_at,
      durationMs: r.duration_ms,
      engineVersion: r.engine_version,
      summary: JSON.parse(r.summary) as ScanRecord['summary'],
      remediationId: r.remediation_id
    }))
  }

  latestForProject(projectId: string): ScanRecord | null {
    const row = this.db
      .prepare(
        `SELECT id, project_id, project_name, project_path, ecosystem, scanned_at,
                duration_ms, engine_version, summary, remediation_id
         FROM scans WHERE project_id = ? ORDER BY scanned_at DESC LIMIT 1`
      )
      .get(projectId) as Omit<ScanRow, 'report'> | undefined
    if (!row) return null
    return {
      id: row.id,
      projectId: row.project_id,
      projectName: row.project_name,
      projectPath: row.project_path,
      ecosystem: row.ecosystem,
      scannedAt: row.scanned_at,
      durationMs: row.duration_ms,
      engineVersion: row.engine_version,
      summary: JSON.parse(row.summary) as ScanRecord['summary'],
      remediationId: row.remediation_id
    }
  }

  delete(scanId: string): void {
    this.db.prepare('DELETE FROM scans WHERE id = ?').run(scanId)
  }

  deleteForProject(projectId: string): void {
    this.db.prepare('DELETE FROM scans WHERE project_id = ?').run(projectId)
  }

  /* ----------------------------- advisory cache ---------------------------- */

  getAdvisory(advisoryId: string): { payload: string; fetchedAt: string } | null {
    const row = this.db.prepare('SELECT payload, fetched_at FROM advisory_cache WHERE advisory_id = ?').get(advisoryId) as
      | { payload: string; fetched_at: string }
      | undefined
    if (!row) return null
    return { payload: row.payload, fetchedAt: row.fetched_at }
  }

  putAdvisory(advisoryId: string, payload: string, fetchedAt: string): void {
    this.db
      .prepare('INSERT OR REPLACE INTO advisory_cache (advisory_id, payload, fetched_at) VALUES (?, ?, ?)')
      .run(advisoryId, payload, fetchedAt)
  }

  /* ------------------------------ remediations ----------------------------- */

  saveRemediation(result: RemediationResult): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO remediations
         (id, scan_id, project_id, started_at, finished_at, state, backup_dir, result)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        result.id,
        result.scanId,
        result.projectId,
        result.startedAt,
        result.finishedAt,
        result.state,
        result.backupDir,
        JSON.stringify(result)
      )
  }

  getRemediation(id: string): RemediationResult | null {
    const row = this.db.prepare('SELECT result FROM remediations WHERE id = ?').get(id) as { result: string } | undefined
    if (!row) return null
    try {
      return JSON.parse(row.result) as RemediationResult
    } catch {
      return null
    }
  }

  latestRemediationForProject(projectId: string): RemediationResult | null {
    const row = this.db
      .prepare('SELECT result FROM remediations WHERE project_id = ? ORDER BY finished_at DESC LIMIT 1')
      .get(projectId) as { result: string } | undefined
    if (!row) return null
    try {
      return JSON.parse(row.result) as RemediationResult
    } catch {
      return null
    }
  }

  close(): void {
    this.db.close()
  }
}
