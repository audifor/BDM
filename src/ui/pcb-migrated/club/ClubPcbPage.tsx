import { useState } from 'react'
import type { StaffPersonId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import { ASSIGNABLE_STAFF_ROLE_IDS, calculateStaffRoleProficiencyByRoleId, isStaffRoleApplicableToEcosystem, STAFF_ROLE_REGISTRY, type StaffRoleId } from '@/domain/staff'
import { getStaffMarketRole, listFreeAgentStaff } from '@/app/staffCareer'
import { getUserTeam } from '@/engine/calendar'
import { STAFF_ROLE_LABELS } from '@/ui/staffPresentation'
import DraggableSubnav from './components/DraggableSubnav'
import ClubAnalytics from './components/club/ClubAnalytics'
import ClubBoard from './components/club/ClubBoard'
import ClubDashboard from './components/club/ClubDashboard'
import ClubFacilities from './components/club/ClubFacilities'
import ClubFinances from './components/club/ClubFinances'
import ClubHistory from './components/club/ClubHistory'
import ClubStaffAssignments from './components/club/ClubStaffAssignments'
import { clubFixtures } from './fixtures/clubFixtures'
import './ClubPcbPage.css'

type ClubTab = 'dashboard' | 'facilities' | 'staff' | 'board' | 'finances' | 'analytics' | 'history'
const tabs: readonly [ClubTab, string][] = [['dashboard', 'VisiÃ³n General'], ['facilities', 'Instalaciones'], ['staff', 'Staff & Roles'], ['board', 'Junta Directiva'], ['finances', 'Finanzas'], ['analytics', 'AnalÃ­tica'], ['history', 'Historia']]
const players = [{ id: 1, name: 'Marcus Cole', data: { bio: { pos: 'PG', age: 26 }, potential: 84, market_value: 950000 }, assigned_coach: 3 }, { id: 2, name: 'Julian Price', data: { bio: { pos: 'SF', age: 24 }, potential: 81, market_value: 720000 }, assigned_coach: null }]
const analytics = { league_name: 'ACB', season_label: '2026/27', updated_at: 0, team_metrics: { games: 24, wins: 16, losses: 8, pace: 98.3, off_rating: 114.2, def_rating: 108.6, net_rating: 5.6, efg_pct: 54.1, ts_pct: 58.4, ast_pg: 24.2, reb_pg: 39.7, tov_pg: 12.1, ft_rate: .22, tp_rate: .39 }, league_averages: {}, team_ranks: {}, leaders: {}, awards: [] }

export function ClubPcbPage({ initialTab = 'dashboard', onAcceptStaffOffer, onCompleteStaffInterview, onCreateStaffOffer, onDeclineStaffOffer, onFireStaff, onStartStaffCandidacy, onStartStaffInterview, world }: { readonly initialTab?: ClubTab; readonly onAcceptStaffOffer?: (offerId: string) => void; readonly onCompleteStaffInterview?: (candidacyId: string) => void; readonly onCreateStaffOffer?: (candidacyId: string) => void; readonly onDeclineStaffOffer?: (offerId: string) => void; readonly onFireStaff?: (staffId: StaffPersonId) => void; readonly onStartStaffCandidacy?: (roleId: StaffRoleId, staffId: StaffPersonId) => void; readonly onStartStaffInterview?: (candidacyId: string) => void; readonly world?: GameWorld }) {
  const [tab, setTab] = useState<ClubTab>(initialTab)
  const [facilities, setFacilities] = useState(clubFixtures.facilities)
  const [balance, setBalance] = useState(850000)
  const [confidence, setConfidence] = useState(76)
  const [selectedPlayer, setSelectedPlayer] = useState<(typeof players)[number] | null>(null)
  const staffData = world === undefined ? undefined : getCanonicalStaffData(world)
  const onNegotiateObjectives = () => setConfidence((value) => (value >= 55 ? Math.min(100, value + 4) : value))

  return <section className="pcb-club" aria-label="Club PCB migrado">
    <DraggableSubnav className="subnav club-subnav" items={tabs.map(([id, label]) => ({ id, label, active: tab === id, onClick: () => setTab(id) }))} storageKey="pcbasket.subnav.club" />
    {tab === 'dashboard' && <ClubDashboard alerts={clubFixtures.alerts} balance={balance} boardConfidence={confidence} jobSecurity={82} leaguePosition={3} nextOpponent="Real Madrid" objectives={clubFixtures.objectives} onPlayerClick={setSelectedPlayer} reputation={68} teamDivision="ACB" teamName="Casademont Zaragoza" topPlayers={players} upcomingMatches={clubFixtures.matches} />}
    {selectedPlayer && <aside aria-label="Detalle de jugador" className="pcb-club__detail" style={{ display: 'grid', gap: 8, border: '1px solid rgba(255,255,255,.12)', borderRadius: 10, background: 'rgba(15,23,42,.6)', padding: 14 }}><header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><h3 style={{ margin: 0 }}>{selectedPlayer.name}</h3><button onClick={() => setSelectedPlayer(null)} type="button">Cerrar</button></header><dl style={{ display: 'grid', gridTemplateColumns: 'repeat(4, auto)', gap: 12, margin: 0 }}><div><dt style={{ color: '#94a3b8', fontSize: 10, textTransform: 'uppercase' }}>PosiciÃ³n</dt><dd style={{ margin: 0 }}>{selectedPlayer.data.bio.pos}</dd></div><div><dt style={{ color: '#94a3b8', fontSize: 10, textTransform: 'uppercase' }}>Edad</dt><dd style={{ margin: 0 }}>{selectedPlayer.data.bio.age}</dd></div><div><dt style={{ color: '#94a3b8', fontSize: 10, textTransform: 'uppercase' }}>Potencial</dt><dd style={{ margin: 0 }}>{selectedPlayer.data.potential}</dd></div><div><dt style={{ color: '#94a3b8', fontSize: 10, textTransform: 'uppercase' }}>Valor de mercado</dt><dd style={{ margin: 0 }}>{selectedPlayer.data.market_value}</dd></div></dl></aside>}
    {tab === 'facilities' && <ClubFacilities onUpgradeFacility={(facilityId: string) => { setBalance((value) => value - 50000); setFacilities((value) => ({ ...value, [facilityId]: { level: (value[facilityId]?.level ?? 0) + 1 } })) }} teamBudget={balance} teamFacilities={facilities} teamLevel={4} />}
    {tab === 'staff' && (staffData === undefined ? <section className="content-panel">No hay mundo de juego activo.</section> : <ClubStaffAssignments marketCandidates={staffData.marketCandidates} onAcceptStaffOffer={onAcceptStaffOffer} onCompleteStaffInterview={onCompleteStaffInterview} onCreateStaffOffer={onCreateStaffOffer} onDeclineStaffOffer={onDeclineStaffOffer} onFireStaff={onFireStaff} onStartStaffCandidacy={onStartStaffCandidacy} onStartStaffInterview={onStartStaffInterview} roles={staffData.roles} staffMembers={staffData.staffMembers} />)}
    {tab === 'board' && <ClubBoard confidence={confidence} currentMetrics={{ league_position: 3, wins: 16, balance }} currentObjectives={clubFixtures.objectives} onNegotiateObjectives={onNegotiateObjectives} season={22} />}
    {tab === 'finances' && <ClubFinances currentBalance={balance} fiscalYear={2027} projectedExpenses={{ wages: 300000, operations: 100000, facilities: 50000 }} projectedIncome={{ ticket_sales: 420000, sponsorships: 280000, tv_rights: 190000 }} seasonBudget={1200000} transactions={clubFixtures.transactions} />}
    {tab === 'analytics' && <ClubAnalytics analytics={analytics} teamName="Casademont Zaragoza" />}
    {tab === 'history' && <ClubHistory clubFounded={1990} hallOfFame={clubFixtures.hallOfFame} milestones={clubFixtures.milestones} records={clubFixtures.records} seasonHistory={clubFixtures.seasons} trophies={clubFixtures.trophies} />}
  </section>
}

function getCanonicalStaffData(world: GameWorld) {
  const team = getUserTeam(world)
  if (team === undefined) return { staffMembers: [], marketCandidates: [], roles: [] }
  const competition = Object.values(world.competitions).find((item) => item.participantTeamIds.includes(team.id))
  const ecosystemKind = competition === undefined ? undefined : world.ecosystems[competition.ecosystemId]?.kind
  const roleIds = ASSIGNABLE_STAFF_ROLE_IDS.filter((roleId) => ecosystemKind !== undefined && isStaffRoleApplicableToEcosystem(roleId, ecosystemKind))
  const roles = roleIds.map((id) => ({ id, label: STAFF_ROLE_LABELS[id], department: STAFF_ROLE_REGISTRY[id].department }))
  const salaryFor = (staffId: StaffPersonId) => Object.values(world.staffContractsById).find((contract) => contract.staffId === staffId && contract.termination === undefined)?.compensation.annualSalary
  const staffMembers = Object.values(world.teamStaffAssignmentsById).filter((assignment) => assignment.teamId === team.id).map((assignment) => {
    const staff = world.staffPeopleById[assignment.staffPersonId]!
    return { id: staff.id, name: `${staff.identity.firstName} ${staff.identity.lastName}`, roleId: assignment.role, department: STAFF_ROLE_REGISTRY[assignment.role].department, proficiency: calculateStaffRoleProficiencyByRoleId(staff, assignment.role), annualSalary: salaryFor(staff.id) }
  })
  const marketCandidates = listFreeAgentStaff(world).flatMap((staffId) => {
    const staff = world.staffPeopleById[staffId]!
    const marketRole = getStaffMarketRole(world, staff.id)
    if (marketRole === undefined) return []
    const candidacy = Object.values(world.staffJobCandidaciesById).find((item) => item.staffId === staff.id && ['identified', 'interviewing', 'offered'].includes(item.status) && world.staffJobOpeningsById[item.jobOpeningId]?.teamId === team.id)
    const interview = candidacy === undefined ? undefined : world.staffInterviewsByCandidacyId[candidacy.id]
    const offer = candidacy === undefined ? undefined : Object.values(world.staffJobOffersById).find((item) => item.staffId === staff.id && item.jobOpeningId === candidacy.jobOpeningId && item.status === 'pending')
    return [{ id: staff.id, name: `${staff.identity.firstName} ${staff.identity.lastName}`, marketRole, proficiency: calculateStaffRoleProficiencyByRoleId(staff, marketRole), candidacyId: candidacy?.id, candidacyStatus: candidacy?.status, interviewStatus: interview?.status, offerId: offer?.id, annualSalary: offer?.annualSalary }]
  })
  return { staffMembers, marketCandidates, roles }
}
