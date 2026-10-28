import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { expect, it } from 'vitest'
import { createWorldDbV2UniverseFromSnapshots } from './WorldDbV2Universe'
import type { WorldDbV2Snapshot } from '@/tauri/TauriWorldDbV2'
import { validateGameWorld } from '@/domain/world'
import type { StaffRoleId } from '@/domain/staff'
import type { StaffPersonId } from '@/domain/ids'
import { getUserTeam } from '@/engine/calendar'
import { createStaffJobOpeningForTeam, identifyStaffCandidate, startStaffInterview, completeStaffInterview, createStaffJobOffer, acceptStaffJobOffer, listFreeAgentStaff, rankStaffCandidates, fireStaffFromTeam } from '@/app/staffCareer'
import { serializeGameWorldV4, deserializeGameWorldSaveV4 } from '@/save/GameWorldSaveV4'
import { projectPersistentWorldTruth } from '@/save/persistentWorldTruth'
import { processClubFinanceForDate } from '@/engine/finance/ClubFinanceLifecycle'
import { getContractFinancialSchedule } from '@/domain/finance'
import { advanceGameDayWithResultAsync } from './advanceGameDay'
import { createUniverseAcceptanceRunner } from './testSupport/WorldDbV2UniverseRunner'

const out = '.worlddb-v2/final-01'
it.skipIf(process.env.BDM_FINAL01 !== '1' || !existsSync(out + '/snapshot-ESP.json'))('imports original PBM staff and executes general hiring and dismissal with Finance and complete persistence', async () => {
  const snapshots = ['ESP', 'FRA', 'ITA', 'BRA'].map(code => JSON.parse(readFileSync(`${out}/snapshot-${code}.json`, 'utf8')) as WorldDbV2Snapshot)
  let world = await createWorldDbV2UniverseFromSnapshots(snapshots, 'pbm:DYN_equipe:41', { firstName: 'Final', lastName: 'Certificado', dateOfBirth: '1988-01-01', gender: 'male', nationalityCountryCode: 'ESP', background: 'rookie', ambition: 'firstTitle', biography: 'FINAL 01 certification', coachingStyle: 'balanced', disposition: 'balanced' })
  const due = Object.keys(world.organizationFinancialProfilesById).flatMap(organizationId => getContractFinancialSchedule(world, { organizationId })).filter(entry => entry.effectiveOn === world.currentDate && entry.compensationStatus === 'GUARANTEED')
  world = processClubFinanceForDate(world).world
  expect(Object.values(world.expenseRecognitionsById)).toHaveLength(due.length)
  expect(processClubFinanceForDate(world).world).toBe(world)
  const initial = serializeGameWorldV4(world, '2026-10-28T00:00:00Z')
  writeFileSync(out + '/opening-corrected.json', JSON.stringify(initial))
  expect(Object.keys(world.competitions)).toHaveLength(4)
  expect(Object.keys(world.teams)).toHaveLength(70)
  const identities = Object.keys(world.personsById).sort(), staffIds = Object.keys(world.staffPeopleById).sort()
  expect(staffIds.length).toBeGreaterThan(200)
  expect(staffIds.filter(id => id.startsWith('generated-staff-'))).toHaveLength(0)
  for (const id of ['pbm:DYN_person:74105', 'pbm:DYN_person:77427']) {
    expect(world.staffPeopleById[id as never], 'Original chairmen remain Persons, never invented head coaches').toBeUndefined()
    expect(world.personsById[id as never]).toBeDefined()
  }
  const teamId = getUserTeam(world)!.id
  const hired: { staffId: StaffPersonId; roleId: StaffRoleId }[] = []
  for (const roleId of ['assistantCoach', 'physiotherapist', 'strengthConditioningCoach', 'regionalScout'] as StaffRoleId[]) {
    const vacancy = createStaffJobOpeningForTeam(world, { teamId, roleId })
    const candidates = rankStaffCandidates(vacancy.world, vacancy.opening.id)
    const staffId = listFreeAgentStaff(vacancy.world, roleId).find(id => candidates.includes(id))
    expect(staffId, `Original unemployed ${roleId}`).toBeDefined()
    const identified = identifyStaffCandidate(vacancy.world, { openingId: vacancy.opening.id, staffId: staffId! })
    const interviewed = completeStaffInterview(startStaffInterview(identified.world, identified.candidacyId), identified.candidacyId)
    const offered = createStaffJobOffer(interviewed, { candidacyId: identified.candidacyId })
    world = acceptStaffJobOffer(offered.world, offered.offerId)
    expect(world.staffEmploymentByStaffId[staffId!]!.status).toBe('employed')
    expect(Object.values(world.staffContractsById).some(c => c.staffId === staffId && c.teamId === teamId && !c.termination)).toBe(true)
    hired.push({ staffId: staffId!, roleId })
  }
  writeFileSync(out + '/staff-hired.json', JSON.stringify(serializeGameWorldV4(world, '2026-10-28T00:00:00Z')))
  const hiredContracts = Object.values(world.staffContractsById).filter(c => hired.some(h => h.staffId === c.staffId))
  const runner = createUniverseAcceptanceRunner()
  try {
    let seed = 151617
    const day = await advanceGameDayWithResultAsync(world, runner, () => seed++)
    expect(day.status, JSON.stringify(day.failure)).toMatch(/COMPLETED|BREAKPOINT_AFTER_PROCESSING/)
    world = day.world
    for (const contract of hiredContracts) expect(Object.values(world.expenseRecognitionsById).some(e => e.dimensions?.reference?.kind === 'STAFF_CONTRACT' && e.dimensions.reference.id === contract.id)).toBe(true)
  } finally { runner.dispose() }
  const dismissed = hired.at(-1)!.staffId
  world = fireStaffFromTeam(world, dismissed)
  expect(world.staffEmploymentByStaffId[dismissed]!.status).toBe('unemployed')
  expect(Object.values(world.teamStaffAssignmentsById).some(a => a.staffPersonId === dismissed)).toBe(false)
  expect(Object.values(world.staffJobOpeningsById).some(o => o.teamId === teamId && o.roleId === 'regionalScout' && o.status === 'open')).toBe(true)
  expect(Object.keys(world.personsById).sort()).toEqual(identities)
  expect(Object.keys(world.staffPeopleById).sort()).toEqual(staffIds)
  validateGameWorld(world)
  const restored = deserializeGameWorldSaveV4(JSON.parse(JSON.stringify(serializeGameWorldV4(world, '2026-10-28T00:00:00Z'))))
  expect(projectPersistentWorldTruth(restored)).toEqual(projectPersistentWorldTruth(world))
  writeFileSync(out + '/staff-operations.json', JSON.stringify({ passed: true, originalStaffProfiles: staffIds.length, hired, dismissed, identitiesUnchanged: true, exactRoundTrip: true }, null, 2))
}, 180000)
