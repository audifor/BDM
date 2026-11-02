import { useGameStore } from '@/stores/gameStore'
import { syncWorkspaceAppQuery } from '@/ui-ng/workspace/workspaceApps'
import type { CareerArrivalModel } from './careerArrivalModel'

const responsibilityLabel: Readonly<Record<string, string>> = {
  createTeamTrainingPlan: 'Team training',
  assignIndividualDevelopment: 'Individual development',
  oppositionScouting: 'Opposition scouting',
  assignScouts: 'Scout assignments',
}

export function CareerArrivalBriefing({ model }: { readonly model: CareerArrivalModel }) {
  const decideStaffMeeting = useGameStore((state) => state.decideUserCoachStaffMeeting)
  const pending = model.pendingMeeting
  if (pending === null) return null

  const decide = (choice: 'seekInput' | 'setDirection') => {
    decideStaffMeeting(pending.assistantStaffId, choice)
  }

  return (
    <section className="career-arrival" aria-label="Career arrival briefing" data-career-arrival="pending">
      <div className="career-arrival__header">
        <div>
          <p className="ng-canon__eyebrow">FIRST DAYS · {model.clubName}</p>
          <h1 className="career-arrival__title">{model.coachName}, you are now {model.post.toLowerCase()}</h1>
          <p className="career-arrival__intro">This is the club you joined, the work already delegated, and the first professional decision waiting for you.</p>
        </div>
        <span className="ng-canon__badge">LIVE CAREER</span>
      </div>

      <div className="career-arrival__facts">
        <div><span>Competition</span><strong>{model.competitionName ?? 'Unavailable'}</strong><small>{model.seasonLabel ?? 'Season unavailable'}</small></div>
        <div><span>Staff</span><strong>{model.staffCount}</strong><small>{model.upcomingTrainingSessions} scheduled training sessions</small></div>
        <div><span>Next match</span><strong>{model.nextFixture?.opponentName ?? 'No fixture scheduled'}</strong><small>{model.nextFixture?.date ?? 'Date unavailable'}</small></div>
        <div><span>Organisation</span><strong>{model.facilityCount} facilities</strong><small>{model.financialStatus === null ? 'Financial position unavailable' : `Payroll status: ${model.financialStatus}`}</small></div>
      </div>

      <div className="career-arrival__grid">
        <div className="career-arrival__column">
          <p className="ng-canon__eyebrow">CLUB BRIEF</p>
          <h2>What is already yours to manage</h2>
          {model.objectives.length === 0 ? <p className="career-arrival__muted">The Board has not recorded an active objective for this club.</p> : <ul>{model.objectives.map((objective) => <li key={objective}>{objective}</li>)}</ul>}
          <div className="career-arrival__links">
            <button className="ng-canon__action" onClick={() => syncWorkspaceAppQuery('board')} type="button">Review Board</button>
            <button className="ng-canon__action" onClick={() => syncWorkspaceAppQuery('staff')} type="button">Open Staff</button>
          </div>
          <p className="career-arrival__muted">{model.openStaffVacancies} open staff vacancies · {model.unassignedResponsibilities} responsibilities awaiting a named holder.</p>
        </div>
        <div className="career-arrival__column">
          <p className="ng-canon__eyebrow">NEXT MATCH PREP</p>
          <h2>{model.nextFixture === null ? 'No next fixture available' : `Prepare for ${model.nextFixture.opponentName}`}</h2>
          <p>{model.nextFixture?.scoutingReady ? 'Scouting information is ready.' : 'Scouting information is not yet available.'} {model.nextFixture?.planApplied ? 'A tactical recommendation is already applied to the game plan.' : 'The game plan is still waiting for your decision.'}</p>
          <div className="career-arrival__links">
            <button className="ng-canon__action" onClick={() => syncWorkspaceAppQuery('scouting')} type="button">Open Scouting</button>
            <button className="ng-canon__action" onClick={() => syncWorkspaceAppQuery('tactics')} type="button">Open Tactics</button>
            <button className="ng-canon__action" onClick={() => syncWorkspaceAppQuery('training')} type="button">Open Training</button>
          </div>
        </div>
      </div>

      <div className="career-arrival__responsibilities">
        <p className="ng-canon__eyebrow">RESPONSIBILITIES FROM THE LIVE STAFF MODEL</p>
        {model.responsibilities.length === 0 ? <p className="career-arrival__muted">No staff responsibility is currently recorded.</p> : <ul>{model.responsibilities.map((item) => <li key={item.kind}><strong>{responsibilityLabel[item.kind] ?? item.kind}</strong><span>{item.mode}{item.holderName === null ? '' : ` · ${item.holderName}`}</span></li>)}</ul>}
      </div>

      <div className="career-arrival__decision">
        <div>
          <p className="ng-canon__eyebrow">FIRST PROFESSIONAL DECISION</p>
          <h2>Meet {pending.assistantName}</h2>
          <p>Your existing assistant is already part of the club. Choose how the relationship starts; the decision updates the canonical relationship, morale, memory and HRPG history.</p>
        </div>
        <div className="career-arrival__decision-actions">
          <button className="ng-canon__action ng-canon__action--primary" onClick={() => decide('seekInput')} type="button">Ask for input</button>
          <button className="ng-canon__action" onClick={() => decide('setDirection')} type="button">Set direction</button>
        </div>
      </div>
    </section>
  )
}
