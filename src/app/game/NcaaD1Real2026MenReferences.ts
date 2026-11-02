import programs from '@/data/worlddb-v2/ncaa-d1-2026-27-programs.json'
import reference from '@/data/worlddb-v2/competition-runtime.json'
import { parseWorldCompetitionRuntimeBundle, type WorldCompetitionFormatDocument } from '@/domain/competition'

/** Exact contemporary directory identity to EXISTING BDM men's NCAA 2026-27 format.
 *
 * This crosswalk does not apply to women or to historical PBM league 71.
 * A matching conference count is a structural check, not fixture/regulation
 * certification. The reference documents have their own evidence and status.
 */
export const NCAA_D1_2026_MEN_CONFERENCE_CROSSWALK: Readonly<Record<string, string>> = Object.freeze({
  'america-east-conference': 'america-east',
  'american-conference': 'american',
  'atlantic-10-conference': 'atlantic-10',
  'atlantic-coast-conference': 'acc',
  'atlantic-sun-conference': 'asun',
  'big-12-conference': 'big-12',
  'big-east-conference': 'big-east',
  'big-sky-conference': 'big-sky',
  'big-south-conference': 'big-south',
  'big-ten-conference': 'big-ten',
  'big-west-conference': 'big-west',
  'coastal-athletic-association': 'caa',
  'conference-usa': 'cusa',
  'horizon-league': 'horizon',
  'ivy-league': 'ivy',
  'metro-conference': 'maac',
  'mid-american-conference': 'mac',
  'mid-eastern-athletic-conference': 'meac',
  'missouri-valley-conference': 'mvc',
  'mountain-west-conference': 'mountain-west',
  'northeast-conference': 'nec',
  'ohio-valley-conference': 'ovc',
  'pac-12-conference': 'pac-12',
  'patriot-league': 'patriot',
  'southeastern-conference': 'sec',
  'southern-conference': 'southern',
  'southland-conference': 'southland',
  'southwestern-athletic-conference': 'swac',
  'summit-league': 'summit',
  'sun-belt-conference': 'sun-belt',
  'united-athletic-conference': 'uac',
  'west-coast-conference': 'wcc',
})

export interface NcaaMenConferenceReconciliation {
  readonly directoryConferenceId: string
  readonly referenceFormatId: string
  readonly referenceEditionId: string
  readonly sourceClubCount: number
  readonly documentedClubCount: number
  readonly format: WorldCompetitionFormatDocument
}

/** Fails closed when a current real male membership group is missing or disagrees
 * with the reference. The caller must separately verify sporting scheduling.
 */
export function reconcileNcaaD1Real2026MenConferenceFormats(): readonly NcaaMenConferenceReconciliation[] {
  const source = programs.genders.men
  const references = parseWorldCompetitionRuntimeBundle(reference).competitionFormats
  const members = new Map<string, number>()
  for (const team of source.teams) members.set(team.conferenceId, (members.get(team.conferenceId) ?? 0) + 1)
  const mappings = Object.entries(NCAA_D1_2026_MEN_CONFERENCE_CROSSWALK)
  if (mappings.length !== 32 || members.size !== 32) throw new Error('Men NCAA 2026-27 must have 32 distinct conferences')
  const output = mappings.map(([directoryConferenceId, referenceConferenceId]) => {
    const sourceClubCount = members.get(directoryConferenceId)
    if (sourceClubCount === undefined) throw new Error('Unreconciled NCAA men conference membership: ' + directoryConferenceId)
    const referenceFormatId = `competition:USA:ncaa-d1-men:${referenceConferenceId}:regular-season`
    const format = references.find(item => item.competitionId === referenceFormatId && item.seasonLabel === '2026-27')
    if (format === undefined || format.status !== 'COMPLETE') throw new Error('Unresolved NCAA men 2026-27 reference: ' + referenceFormatId)
    const regular = format.variants[0]?.nodes.find(node => node.role === 'REGULAR_SEASON')
    if (regular?.teamCount === undefined || regular.teamCount !== sourceClubCount) {
      throw new Error(`NCAA men 2026-27 ${directoryConferenceId}: reference has ${regular?.teamCount}, membership has ${sourceClubCount}; do not substitute`)
    }
    return { directoryConferenceId, referenceFormatId, referenceEditionId: format.competitionSeasonId,
      sourceClubCount, documentedClubCount: regular.teamCount, format }
  })
  if (new Set(output.map(row => row.referenceEditionId)).size !== 32) throw new Error('Duplicate NCAA men 2026-27 conference reference')
  if (output.reduce((sum, row) => sum + row.sourceClubCount, 0) !== 365) throw new Error('NCAA D1 men official projected sponsorship count mismatch')
  return output
}
