import type { WorldCompetitionFormatDocument, WorldCompetitionRuntimeBundle } from '@/domain/competition'

export interface WorldCompetitionCatalog {
  readonly bundleContentId: string
  readonly bundleContentHash: string
  readonly formatsBySeasonId: Readonly<Record<string, WorldCompetitionFormatDocument>>
  readonly seasonIdsByCompetitionId: Readonly<Record<string, readonly string[]>>
}

export function createWorldCompetitionCatalog(bundle: WorldCompetitionRuntimeBundle): WorldCompetitionCatalog {
  const formatsBySeasonId: Record<string, WorldCompetitionFormatDocument> = {}
  const seasonIdsByCompetitionId: Record<string, string[]> = {}

  for (const format of bundle.competitionFormats) {
    if (formatsBySeasonId[format.competitionSeasonId] !== undefined) throw new RangeError(`Duplicate competition season id: ${format.competitionSeasonId}`)
    formatsBySeasonId[format.competitionSeasonId] = format
    ;(seasonIdsByCompetitionId[format.competitionId] ??= []).push(format.competitionSeasonId)
  }

  for (const seasonIds of Object.values(seasonIdsByCompetitionId)) seasonIds.sort()

  return Object.freeze({
    bundleContentId: bundle.contentId,
    bundleContentHash: bundle.contentHash,
    formatsBySeasonId: Object.freeze({ ...formatsBySeasonId }),
    seasonIdsByCompetitionId: Object.freeze(Object.fromEntries(Object.entries(seasonIdsByCompetitionId).map(([competitionId, seasonIds]) => [competitionId, Object.freeze([...seasonIds])]))),
  })
}

export function requireWorldCompetitionFormat(catalog: WorldCompetitionCatalog, competitionSeasonId: string): WorldCompetitionFormatDocument {
  const format = catalog.formatsBySeasonId[competitionSeasonId]
  if (format === undefined) throw new Error(`Competition season is not present in the loaded World DB bundle: ${competitionSeasonId}`)
  return format
}

export function listWorldCompetitionFormats(catalog: WorldCompetitionCatalog, competitionId: string): readonly WorldCompetitionFormatDocument[] {
  return (catalog.seasonIdsByCompetitionId[competitionId] ?? []).map((seasonId) => requireWorldCompetitionFormat(catalog, seasonId))
}
