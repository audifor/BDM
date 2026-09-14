import type { WorldCompetitionFormatDocument } from '@/domain/competition'

export interface WorldCompetitionRoundRobinEntryV1 {
  readonly competitionSeasonEntryId: string
}

export interface WorldCompetitionRoundRobinFixtureV1 {
  readonly fixtureId: string
  readonly competitionSeasonId: string
  readonly variantKey: string
  readonly nodeKey: string
  readonly roundNo: number
  readonly meetingNo: number
  readonly homeEntryId: string
  readonly awayEntryId: string
}

export interface WorldCompetitionRoundRobinPlanV1 {
  readonly competitionSeasonId: string
  readonly variantKey: string
  readonly nodeKey: string
  readonly roundsPerMeeting: number
  readonly meetingsPerPair: number
  readonly fixtures: readonly WorldCompetitionRoundRobinFixtureV1[]
}

/**
 * Deterministically instantiates a ROUND_ROBIN node without assigning calendar dates.
 *
 * The circle method defines opponent rounds. Additional meetings repeat the same round topology
 * while alternating home/away. For an odd number of participants one synthetic bye is inserted
 * and omitted from the emitted fixture set.
 */
export function instantiateWorldCompetitionRoundRobinV1(
  format: WorldCompetitionFormatDocument,
  variantKey: string,
  nodeKey: string,
  entries: readonly WorldCompetitionRoundRobinEntryV1[],
): WorldCompetitionRoundRobinPlanV1 {
  if (format.status !== 'COMPLETE') throw new Error(`Competition format is not executable: ${format.competitionSeasonId} status=${format.status}`)
  const variant = format.variants.find((candidate) => candidate.key === variantKey)
  if (variant === undefined) throw new Error(`Competition format variant not found: ${variantKey}`)
  const node = variant.nodes.find((candidate) => candidate.key === nodeKey)
  if (node === undefined) throw new Error(`Competition format node not found: ${nodeKey}`)
  if (node.pairing?.type !== 'ROUND_ROBIN') throw new Error(`Competition node ${nodeKey} is not ROUND_ROBIN`)
  if (node.opponentScope !== undefined && node.opponentScope.type !== 'ALL_STAGE') {
    throw new Error(`ROUND_ROBIN node ${nodeKey} requires ALL_STAGE opponent scope in v1`)
  }

  const meetingsPerPair = node.pairing.meetingsPerPair ?? 1
  if (!Number.isInteger(meetingsPerPair) || meetingsPerPair <= 0) throw new RangeError(`Invalid meetings_per_pair for ${nodeKey}`)
  if (entries.length < 2) throw new Error(`ROUND_ROBIN node ${nodeKey} requires at least two entries`)
  if (node.teamCount !== undefined && node.teamCount !== entries.length) {
    throw new Error(`ROUND_ROBIN node ${nodeKey} declares ${node.teamCount} teams but received ${entries.length}`)
  }

  const entryIds = entries.map((entry) => entry.competitionSeasonEntryId)
  if (entryIds.some((id) => id.length === 0)) throw new Error('Round-robin entry id must be non-empty')
  if (new Set(entryIds).size !== entryIds.length) throw new Error('Duplicate round-robin competition entry')

  const bye = '__BDM_BYE__'
  const rotation = [...entryIds]
  if (rotation.length % 2 === 1) rotation.push(bye)
  const roundsPerMeeting = rotation.length - 1
  const half = rotation.length / 2
  const firstLegPairings: Array<Array<readonly [string, string]>> = []
  let current = [...rotation]

  for (let roundIndex = 0; roundIndex < roundsPerMeeting; roundIndex += 1) {
    const pairs: Array<readonly [string, string]> = []
    for (let index = 0; index < half; index += 1) {
      const left = current[index]!
      const right = current[current.length - 1 - index]!
      if (left === bye || right === bye) continue

      // Alternating the anchored team's orientation avoids a permanent home bias while remaining
      // fully deterministic. Other pair orientations flip with the round parity as well.
      const reverse = (roundIndex + index) % 2 === 1
      pairs.push(reverse ? [right, left] : [left, right])
    }
    firstLegPairings.push(pairs)
    current = [current[0]!, current[current.length - 1]!, ...current.slice(1, -1)]
  }

  const fixtures: WorldCompetitionRoundRobinFixtureV1[] = []
  for (let meetingIndex = 0; meetingIndex < meetingsPerPair; meetingIndex += 1) {
    const flip = meetingIndex % 2 === 1
    for (let roundIndex = 0; roundIndex < firstLegPairings.length; roundIndex += 1) {
      const globalRound = meetingIndex * roundsPerMeeting + roundIndex + 1
      const pairs = firstLegPairings[roundIndex]!
      for (let pairIndex = 0; pairIndex < pairs.length; pairIndex += 1) {
        const [firstHome, firstAway] = pairs[pairIndex]!
        const homeEntryId = flip ? firstAway : firstHome
        const awayEntryId = flip ? firstHome : firstAway
        fixtures.push(Object.freeze({
          fixtureId: `worldrr:${format.competitionSeasonId}:${variantKey}:${nodeKey}:m${meetingIndex + 1}:r${roundIndex + 1}:p${pairIndex + 1}`,
          competitionSeasonId: format.competitionSeasonId,
          variantKey,
          nodeKey,
          roundNo: globalRound,
          meetingNo: meetingIndex + 1,
          homeEntryId,
          awayEntryId,
        }))
      }
    }
  }

  validatePairCounts(fixtures, entryIds, meetingsPerPair)
  return Object.freeze({
    competitionSeasonId: format.competitionSeasonId,
    variantKey,
    nodeKey,
    roundsPerMeeting,
    meetingsPerPair,
    fixtures: Object.freeze(fixtures),
  })
}

function validatePairCounts(
  fixtures: readonly WorldCompetitionRoundRobinFixtureV1[],
  entryIds: readonly string[],
  meetingsPerPair: number,
): void {
  const counts = new Map<string, number>()
  for (const fixture of fixtures) {
    const key = fixture.homeEntryId < fixture.awayEntryId
      ? `${fixture.homeEntryId}\u0000${fixture.awayEntryId}`
      : `${fixture.awayEntryId}\u0000${fixture.homeEntryId}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  for (let left = 0; left < entryIds.length; left += 1) {
    for (let right = left + 1; right < entryIds.length; right += 1) {
      const a = entryIds[left]!
      const b = entryIds[right]!
      const key = a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`
      if (counts.get(key) !== meetingsPerPair) {
        throw new Error(`Round-robin pair ${a}/${b} does not have ${meetingsPerPair} meetings`)
      }
    }
  }
}
