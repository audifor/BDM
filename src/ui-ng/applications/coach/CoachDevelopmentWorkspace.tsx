import { useMemo, useState } from 'react'

import type { CoachRpgProfile } from '@/domain/coachRpg'
import type { CoachPerkId, CoachSkillId } from '@/domain/ids'
import type { CoachRpgOperationResult } from '@/engine/coach'
import { CoachPerkGlyph, CoachSkillGlyph } from '@/ui-ng/applications/coach/CoachDevelopmentGlyph'
import {
  buildCoachDevelopmentSummary,
  buildCoachPerkRows,
  buildCoachSkillRows,
  coachRpgReasonLabel,
} from '@/ui-ng/applications/coach/coachDevelopmentModel'

import './coach-development.css'

type Panel = 'skills' | 'perks'

/**
 * Development board: one workspace split into a dense Skills workstation (left) and a compact Perks
 * column (right). Cyan carries system/information, amber/gold is reserved for progression actions.
 * Purchases go through the canonical engine entry points, which stay the only authority — the board
 * just surfaces their verdict instead of swallowing it.
 */
export function CoachDevelopmentWorkspace({
  rpg,
  onDevelopSkill,
  onPurchasePerk,
}: {
  readonly rpg: CoachRpgProfile
  readonly onDevelopSkill: (skillId: CoachSkillId) => CoachRpgOperationResult
  readonly onPurchasePerk: (perkId: CoachPerkId) => CoachRpgOperationResult
}) {
  const skills = useMemo(() => buildCoachSkillRows(rpg), [rpg])
  const perks = useMemo(() => buildCoachPerkRows(rpg), [rpg])
  const summary = useMemo(() => buildCoachDevelopmentSummary(rpg), [rpg])
  const [failure, setFailure] = useState<{ readonly panel: Panel; readonly message: string } | undefined>(undefined)

  const developSkill = (skillId: CoachSkillId) => {
    const result = onDevelopSkill(skillId)
    setFailure(result.ok ? undefined : { panel: 'skills', message: coachRpgReasonLabel(result.reason) })
  }

  const purchasePerk = (perkId: CoachPerkId) => {
    const result = onPurchasePerk(perkId)
    setFailure(result.ok ? undefined : { panel: 'perks', message: coachRpgReasonLabel(result.reason) })
  }

  return (
    <div className="ng-coach-dev" data-ng-region="coach-development">
      <section className="ng-coach-dev__panel ng-coach-dev__panel--skills">
        <header className="ng-coach-dev__panel-head">
          <div className="ng-coach-dev__panel-heading">
            <h2 className="ng-coach-dev__panel-title">Skills</h2>
            <p className="ng-coach-dev__panel-subtitle">Develop your coaching abilities</p>
          </div>
          <div className="ng-coach-dev__panel-stats">
            <span className="ng-coach-dev__stat">
              {summary.skillCount} skills <span aria-hidden="true">·</span> avg rank {summary.averageSkillRank}
            </span>
            <span className="ng-coach-dev__stat-chip">Progress {summary.globalProgress} / 100</span>
            <span className="ng-coach-dev__stat-chip ng-coach-dev__stat-chip--gold">{summary.developmentPoints} DP</span>
          </div>
        </header>

        <ul className="ng-coach-dev__list ng-coach-dev__skill-list">
          {skills.map((row) => (
            <li className="ng-coach-dev__skill" data-maxed={row.maxed} key={row.id}>
              <span className="ng-coach-dev__glyph">
                <CoachSkillGlyph skillId={row.id} />
              </span>
              <span className="ng-coach-dev__identity">
                <span className="ng-coach-dev__name">{row.name}</span>
                <span className="ng-coach-dev__meta">
                  {row.category} <span aria-hidden="true">·</span> {row.attribute}
                </span>
              </span>
              <span className="ng-coach-dev__rank">
                <span className="ng-coach-dev__rank-label">Rank {row.rank}</span>
                <span className="ng-coach-dev__rank-track">
                  <span className="ng-coach-dev__rank-fill" style={{ width: `${Math.round(row.progress * 100)}%` }} />
                </span>
                <span className="ng-coach-dev__rank-value">
                  {row.rank} / {row.maxRank}
                </span>
              </span>
              <span className="ng-coach-dev__cost">{row.nextRankCost === undefined ? 'Max' : `${row.nextRankCost} DP`}</span>
              <button className="ng-coach-dev__cta" disabled={row.maxed} onClick={() => developSkill(row.id)} type="button">
                {row.maxed ? 'Maxed' : 'Develop'}
              </button>
            </li>
          ))}
        </ul>

        {failure?.panel === 'skills' ? (
          <p className="ng-coach-dev__failure" role="status">
            {failure.message}
          </p>
        ) : null}

        <footer className="ng-coach-dev__panel-foot">
          <span>Total ranks</span>
          <span className="ng-coach-dev__foot-value">
            {summary.totalSkillRanks} / {summary.skillRankCapacity}
          </span>
        </footer>
      </section>

      <section className="ng-coach-dev__panel ng-coach-dev__panel--perks">
        <header className="ng-coach-dev__panel-head">
          <div className="ng-coach-dev__panel-heading">
            <h2 className="ng-coach-dev__panel-title">Perks</h2>
            <p className="ng-coach-dev__panel-subtitle">Unlock development capabilities</p>
          </div>
          <div className="ng-coach-dev__panel-stats">
            <span className="ng-coach-dev__stat">
              {summary.unlockedPerkCount} / {summary.perkCount} unlocked
            </span>
            <span className="ng-coach-dev__stat-chip ng-coach-dev__stat-chip--gold">{summary.developmentPoints} DP</span>
          </div>
        </header>

        <ul className="ng-coach-dev__list ng-coach-dev__perk-list">
          {perks.map((row) => (
            <li className="ng-coach-dev__perk" data-owned={row.owned} data-rarity={row.rarity} key={row.id}>
              <span className="ng-coach-dev__glyph ng-coach-dev__glyph--perk">
                <CoachPerkGlyph perkId={row.id} />
              </span>
              <div className="ng-coach-dev__perk-body">
                <div className="ng-coach-dev__perk-top">
                  <span className="ng-coach-dev__name">{row.name}</span>
                  <span className="ng-coach-dev__rarity">{row.rarityLabel}</span>
                  <span className="ng-coach-dev__cost">{row.cost} DP</span>
                  {row.owned ? (
                    <span className="ng-coach-dev__owned">Owned</span>
                  ) : (
                    <button className="ng-coach-dev__cta" onClick={() => purchasePerk(row.id)} type="button">
                      Purchase
                    </button>
                  )}
                </div>
                <p className="ng-coach-dev__requirements">
                  <span className="ng-coach-dev__perk-type">{row.typeLabel}</span> {row.requirements}
                </p>
              </div>
            </li>
          ))}
        </ul>

        {failure?.panel === 'perks' ? (
          <p className="ng-coach-dev__failure" role="status">
            {failure.message}
          </p>
        ) : null}

        <footer className="ng-coach-dev__panel-foot">
          <span>Career focus</span>
          <span className="ng-coach-dev__foot-value">
            {summary.careerFocusUsed} / {summary.careerFocusLimit}
          </span>
        </footer>
      </section>
    </div>
  )
}
