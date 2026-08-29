import type { DataGridPreferences } from './types'
const version = 1 as const
export function loadGridPreferences(key: string): DataGridPreferences | undefined { if (typeof window === 'undefined') return undefined; try { const parsed: unknown = JSON.parse(localStorage.getItem(`bdm:grid:${key}`) ?? 'null'); if (typeof parsed !== 'object' || parsed === null || (parsed as { schemaVersion?: unknown }).schemaVersion !== version) return undefined; return parsed as DataGridPreferences } catch { return undefined } }
export function saveGridPreferences(key: string, preferences: DataGridPreferences) { if (typeof window !== 'undefined') localStorage.setItem(`bdm:grid:${key}`, JSON.stringify(preferences)) }
export function removeGridPreferences(key: string) { if (typeof window !== 'undefined') localStorage.removeItem(`bdm:grid:${key}`) }
