import { useState } from 'react'
import DraggableSubnav from './components/DraggableSubnav'
import ClubAnalytics from './components/club/ClubAnalytics'
import ClubBoard from './components/club/ClubBoard'
import ClubDashboard from './components/club/ClubDashboard'
import ClubFacilities from './components/club/ClubFacilities'
import ClubFinances from './components/club/ClubFinances'
import ClubHistory from './components/club/ClubHistory'
import ClubStaffAssignments from './components/club/ClubStaffAssignments'
import { clubFixtures } from './fixtures/clubFixtures'

type ClubTab = 'dashboard' | 'facilities' | 'staff' | 'board' | 'finances' | 'analytics' | 'history'
const tabs: readonly [ClubTab, string][] = [['dashboard', 'Visión General'], ['facilities', 'Instalaciones'], ['staff', 'Staff & Roles'], ['board', 'Junta Directiva'], ['finances', 'Finanzas'], ['analytics', 'Analítica'], ['history', 'Historia']]
const players = [{ id: 1, name: 'Marcus Cole', data: { bio: { pos: 'PG', age: 26 }, potential: 84, market_value: 950000 }, assigned_coach: 3 }, { id: 2, name: 'Julian Price', data: { bio: { pos: 'SF', age: 24 }, potential: 81, market_value: 720000 }, assigned_coach: null }]
const analytics = { league_name: 'ACB', season_label: '2026/27', updated_at: 0, team_metrics: { games: 24, wins: 16, losses: 8, pace: 98.3, off_rating: 114.2, def_rating: 108.6, net_rating: 5.6, efg_pct: 54.1, ts_pct: 58.4, ast_pg: 24.2, reb_pg: 39.7, tov_pg: 12.1, ft_rate: .22, tp_rate: .39 }, league_averages: {}, team_ranks: {}, leaders: {}, awards: [] }

let nextHireId = 100
const ROLE_HIRE_LABEL: Record<string, string> = { head_coach: 'Entrenador Principal', assistant_off: 'Asistente Ofensivo', assistant_def: 'Asistente Defensivo', physio: 'Fisioterapeuta', dev_coach: 'Entrenador de Desarrollo', strength: 'Preparador Físico', scout: 'Ojeador' }
const ROLE_SKILLS: Record<string, readonly string[]> = { head_coach: ['leadership', 'tactics', 'motivation'], assistant_off: ['offensive_tactics', 'shooting', 'playmaking'], assistant_def: ['defensive_tactics', 'positioning'], physio: ['medical', 'recovery'], dev_coach: ['youth_development', 'potential'], strength: ['strength', 'conditioning'], scout: ['scouting', 'evaluation'] }

export function ClubPcbPage() {
  const [tab, setTab] = useState<ClubTab>('dashboard')
  const [assignments, setAssignments] = useState<Record<string, { role: string; staff_id: number }>>(clubFixtures.staffAssignments)
  const [staffMembers, setStaffMembers] = useState(clubFixtures.staff)
  const [teamPlayers, setTeamPlayers] = useState(players)
  const [facilities, setFacilities] = useState(clubFixtures.facilities)
  const [balance, setBalance] = useState(850000)
  const [confidence, setConfidence] = useState(76)

  const onAssignPlayerToCoach = (coachId: number, playerId: number) => setTeamPlayers((value) => value.map((player) => (player.id === playerId ? { ...player, assigned_coach: coachId } : player)))
  const onHireStaff = (roleId: string) => { const id = nextHireId++; setStaffMembers((value) => [...value, { id, name: `${ROLE_HIRE_LABEL[roleId] ?? 'Staff'} ${id}`, wage: 90000, skills: Object.fromEntries(ROLE_SKILLS[roleId]?.map((skill) => [skill, 620]) ?? []) }]); setAssignments((value) => ({ ...value, [id]: { role: roleId, staff_id: id } })) }
  const onNegotiateObjectives = () => setConfidence((value) => (value >= 55 ? Math.min(100, value + 4) : value))

  return <section className="pcb-club" aria-label="Club PCB migrado">
    <DraggableSubnav className="subnav club-subnav" items={tabs.map(([id, label]) => ({ id, label, active: tab === id, onClick: () => setTab(id) }))} storageKey="pcbasket.subnav.club" />
    {tab === 'dashboard' && <ClubDashboard alerts={clubFixtures.alerts} balance={balance} boardConfidence={confidence} jobSecurity={82} leaguePosition={3} nextOpponent="Real Madrid" objectives={clubFixtures.objectives} reputation={68} teamDivision="ACB" teamName="Casademont Zaragoza" topPlayers={players} upcomingMatches={clubFixtures.matches} />}
    {tab === 'facilities' && <ClubFacilities onUpgradeFacility={(facilityId: string) => { setBalance((value) => value - 50000); setFacilities((value) => ({ ...value, [facilityId]: { level: (value[facilityId]?.level ?? 0) + 1 } })) }} teamBudget={balance} teamFacilities={facilities} teamLevel={4} />}
    {tab === 'staff' && <ClubStaffAssignments assignments={assignments} onAssignPlayerToCoach={onAssignPlayerToCoach} onAssignStaff={(roleId: string, staffId: number | null, removeStaffId: number | null) => setAssignments((value) => { if (removeStaffId !== null) { const next = { ...value }; delete next[removeStaffId]; return next } if (staffId !== null) return { ...value, [staffId]: { role: roleId, staff_id: staffId } }; return value })} onHireStaff={onHireStaff} staffMembers={staffMembers} teamPlayers={teamPlayers} />}
    {tab === 'board' && <ClubBoard confidence={confidence} currentMetrics={{ league_position: 3, wins: 16, balance }} currentObjectives={clubFixtures.objectives} onNegotiateObjectives={onNegotiateObjectives} season={22} />}
    {tab === 'finances' && <ClubFinances currentBalance={balance} fiscalYear={2027} projectedExpenses={{ wages: 300000, operations: 100000, facilities: 50000 }} projectedIncome={{ ticket_sales: 420000, sponsorships: 280000, tv_rights: 190000 }} seasonBudget={1200000} transactions={clubFixtures.transactions} />}
    {tab === 'analytics' && <ClubAnalytics analytics={analytics} teamName="Casademont Zaragoza" />}
    {tab === 'history' && <ClubHistory clubFounded={1990} hallOfFame={clubFixtures.hallOfFame} milestones={clubFixtures.milestones} records={clubFixtures.records} seasonHistory={clubFixtures.seasons} trophies={clubFixtures.trophies} />}
  </section>
}
