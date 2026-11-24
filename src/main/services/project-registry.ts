/**
 * Registered projects, stored as JSON in userData. The registry only holds
 * identity + detection data; scan history lives in the history store.
 */
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { DetectionResult, ProjectInfo } from '../../shared/models'

const PROJECTS_FILE = 'projects.json'

interface StoredProject {
  id: string
  name: string
  path: string
  ecosystem: string | null
  ecosystemLabel: string
  packageManager: string | null
  lockfile: string | null
  addedAt: string
}

export function projectIdForPath(path: string): string {
  return createHash('sha256').update(path).digest('hex').slice(0, 24)
}

export class ProjectRegistry {
  private readonly file: string
  private projects: StoredProject[] = []

  constructor(userDataDir: string) {
    mkdirSync(userDataDir, { recursive: true })
    this.file = join(userDataDir, PROJECTS_FILE)
    this.load()
  }

  private load(): void {
    try {
      const parsed = JSON.parse(readFileSync(this.file, 'utf8')) as { projects: StoredProject[] }
      this.projects = Array.isArray(parsed.projects) ? parsed.projects : []
    } catch {
      this.projects = []
    }
  }

  private save(): void {
    writeFileSync(this.file, JSON.stringify({ projects: this.projects }, null, 2), 'utf8')
  }

  get(projectId: string): StoredProject | null {
    return this.projects.find((p) => p.id === projectId) ?? null
  }

  getByPath(path: string): StoredProject | null {
    return this.projects.find((p) => p.path === path) ?? null
  }

  list(): StoredProject[] {
    return [...this.projects]
  }

  register(path: string, name: string, detection: DetectionResult): StoredProject {
    const existing = this.getByPath(path)
    if (existing) {
      existing.name = name
      existing.ecosystem = detection.ecosystem
      existing.ecosystemLabel = detection.ecosystemLabel
      existing.packageManager = detection.packageManager
      existing.lockfile = detection.lockfile
      this.save()
      return existing
    }
    const project: StoredProject = {
      id: projectIdForPath(path),
      name,
      path,
      ecosystem: detection.ecosystem,
      ecosystemLabel: detection.ecosystemLabel,
      packageManager: detection.packageManager,
      lockfile: detection.lockfile,
      addedAt: new Date().toISOString()
    }
    this.projects.push(project)
    this.save()
    return project
  }

  remove(projectId: string): boolean {
    const before = this.projects.length
    this.projects = this.projects.filter((p) => p.id !== projectId)
    if (this.projects.length !== before) {
      this.save()
      return true
    }
    return false
  }
}

export type { StoredProject }
export type { ProjectInfo }
