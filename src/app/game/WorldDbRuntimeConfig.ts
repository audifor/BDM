export const DEFAULT_WORLD_DB_PATH = 'C:\\BDM_DB\\DDL-12\\output\\bdm_world_ddl12.db'
export const DEFAULT_WORLD_DB_RUNTIME_BUNDLE_PATH = 'C:\\BDM_DB\\phase1-competition-runtime-bundle.json'

export function worldDbDatabasePath(): string {
  const configured = __BDM_WORLD_DB_PATH__.trim()
  if (configured.length > 0) return configured
  const viteConfigured = import.meta.env.VITE_BDM_WORLD_DB_PATH?.trim() ?? ''
  if (viteConfigured.length > 0) return viteConfigured
  if (import.meta.env.DEV) return DEFAULT_WORLD_DB_PATH
  throw new Error('WORLD DB is not configured. Set BDM_WORLD_DB_PATH before launching BDM.')
}

export function worldDbRuntimeBundlePath(): string {
  const configured = __BDM_WORLD_DB_RUNTIME_BUNDLE_PATH__.trim()
  if (configured.length > 0) return configured
  const viteConfigured = import.meta.env.VITE_BDM_WORLD_DB_RUNTIME_BUNDLE_PATH?.trim() ?? ''
  if (viteConfigured.length > 0) return viteConfigured
  if (import.meta.env.DEV) return DEFAULT_WORLD_DB_RUNTIME_BUNDLE_PATH
  throw new Error('World DB runtime bundle is not configured before launching BDM.')
}
