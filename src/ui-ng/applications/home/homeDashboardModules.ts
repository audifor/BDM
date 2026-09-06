export const HOME_DASHBOARD_MODULE_IDS = [
  'standings',
  'leaders',
  'objectives',
  'finances',
  'dynamics',
  'upcoming',
  'inbox',
  'news',
] as const

export type HomeDashboardModuleId = (typeof HOME_DASHBOARD_MODULE_IDS)[number]

export const HOME_DASHBOARD_MODULE_LABELS: Readonly<Record<HomeDashboardModuleId, string>> = {
  standings: 'Clasificación de la liga',
  leaders: 'Líderes estadísticos',
  objectives: 'Objetivos',
  finances: 'Finanzas y sueldos',
  dynamics: 'Dinámicas del choque',
  upcoming: 'Próximos partidos',
  inbox: 'Buzón',
  news: 'Noticias del club',
}

export const HOME_DASHBOARD_DEFAULT_SLOTS: readonly HomeDashboardModuleId[] = [
  'standings',
  'leaders',
  'objectives',
  'finances',
]

export function homeDashboardModuleLabel(id: HomeDashboardModuleId): string {
  return HOME_DASHBOARD_MODULE_LABELS[id]
}
