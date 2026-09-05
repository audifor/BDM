import './simulate-until.css'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { getNextKnownEvent, tickSimulateUntilDate, type UserMatchSummary } from '@/app/game'
import { addDays, compareGameDates, parseGameDate, type GameDate } from '@/domain/date'
import type { GameWorld } from '@/domain/world'
import { useGameStore } from '@/stores/gameStore'
import { formatGameDateLabel } from '@/ui-ng/applications/player/data/presentationHelpers'
import { holidayResultStillVisible } from '@/ui-ng/system/holidayMatchSpotlight'

const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'] as const
const MONTH_NAMES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
] as const

export function SimulateUntilControl({ blocked, world }: { readonly blocked: boolean; readonly world: GameWorld }) {
  const tomorrow = addDays(world.currentDate, 1)
  const maxDate = latestScheduledGameDate(world) ?? tomorrow
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(defaultTargetDate(world, tomorrow, maxDate))
  const [monthCursor, setMonthCursor] = useState(() => monthStart(draft))
  const [running, setRunning] = useState(false)
  const [liveDate, setLiveDate] = useState(world.currentDate)
  const [matches, setMatches] = useState<UserMatchSummary[]>([])
  const rootRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef(false)

  useEffect(() => {
    if (open || running) return
    const nextDraft = defaultTargetDate(world, tomorrow, maxDate)
    setDraft(nextDraft)
    setMonthCursor(monthStart(nextDraft))
  }, [maxDate, open, running, tomorrow, world])

  useEffect(() => {
    if (!open) return
    const closeOnOutside = (event: MouseEvent) => {
      if (rootRef.current?.contains(event.target as Node) !== true) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', closeOnOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOnOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  useEffect(() => {
    return () => {
      cancelRef.current = true
    }
  }, [])

  const canConfirm = isValidTarget(world.currentDate, draft) && compareGameDates(parseGameDate(draft), maxDate) <= 0
  const minMonth = monthStart(tomorrow)
  const maxMonth = monthStart(maxDate)

  const startHoliday = () => {
    if (!canConfirm) return
    const target = parseGameDate(draft)
    cancelRef.current = false
    setOpen(false)
    setRunning(true)
    setMatches([])
    setLiveDate(world.currentDate)

    let iterations = 0
    let spotlight: UserMatchSummary | undefined
    const step = () => {
      if (cancelRef.current) return
      const current = useGameStore.getState().world
      if (current === null) {
        setRunning(false)
        setMatches([])
        return
      }

      const tick = tickSimulateUntilDate(current, target)
      iterations += 1
      useGameStore.getState().replaceWorld(tick.world)
      const live = tick.event.type === 'userMatch' ? tick.event.match.date : tick.world.currentDate
      if (tick.event.type === 'userMatch') {
        spotlight = tick.event.match
      } else if (spotlight !== undefined && !holidayResultStillVisible(spotlight.date, live)) {
        spotlight = undefined
      }
      setLiveDate(live)
      setMatches(spotlight === undefined ? [] : [spotlight])
      const arrived = compareGameDates(tick.world.currentDate, target) >= 0
      if (tick.event.type === 'finished' || arrived || iterations > 4000) {
        setRunning(false)
        setMatches([])
        return
      }
      window.setTimeout(step, spotlight === undefined ? 90 : 500)
    }

    window.setTimeout(step, 0)
  }

  return (
    <div className="ng-system-bar__until" ref={rootRef}>
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Simulate until date"
        className="ng-btn ng-btn--primary ng-btn--icon"
        disabled={blocked || running}
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <HourglassIcon />
      </button>
      {open ? (
        <div aria-label="Simulate until date" className="ng-system-bar__until-panel" role="dialog">
          <div className="ng-sim-cal__head">
            <button
              aria-label="Previous month"
              className="ng-sim-cal__nav"
              disabled={compareGameDates(monthCursor, minMonth) <= 0}
              onClick={() => setMonthCursor((current) => shiftMonth(current, -1))}
              type="button"
            >
              ‹
            </button>
            <p className="ng-sim-cal__month">{monthTitle(monthCursor)}</p>
            <button
              aria-label="Next month"
              className="ng-sim-cal__nav"
              disabled={compareGameDates(monthCursor, maxMonth) >= 0}
              onClick={() => setMonthCursor((current) => shiftMonth(current, 1))}
              type="button"
            >
              ›
            </button>
          </div>
          <div className="ng-sim-cal__weekdays">
            {WEEKDAYS.map((label, index) => (
              <span className="ng-sim-cal__weekday" key={index}>
                {label}
              </span>
            ))}
          </div>
          <div className="ng-sim-cal__grid">
            {monthGrid(monthCursor).map((date) => {
              const selectable =
                compareGameDates(date, world.currentDate) > 0 && compareGameDates(date, maxDate) <= 0
              const selected = date === draft
              return (
                <button
                  aria-label={`Choose ${date}`}
                  aria-pressed={selected}
                  className={`ng-sim-cal__day${selected ? ' is-selected' : ''}${date.slice(0, 7) !== monthCursor.slice(0, 7) ? ' is-outside' : ''}`}
                  disabled={!selectable}
                  key={date}
                  onClick={() => {
                    if (!selectable) return
                    setDraft(date)
                  }}
                  type="button"
                >
                  {Number(date.slice(-2))}
                </button>
              )
            })}
          </div>
          <div className="ng-sim-cal__actions">
            <button className="ng-btn ng-btn--primary" disabled={!canConfirm} onClick={startHoliday} type="button">
              Simulate
            </button>
          </div>
        </div>
      ) : null}
      {running ? (
        <SimulationOverlay>
          <div aria-busy aria-label="Simulation progress" className="ng-sim-modal" role="dialog">
            <p className="ng-sim-modal__eyebrow">Simulando</p>
            <h2 className="ng-sim-modal__date">{formatGameDateLabel(liveDate)}</h2>
            <div aria-label="Your results" className="ng-sim-modal__results">
              {matches[0] === undefined ? (
                <p className="ng-sim-modal__empty" />
              ) : (
                <article className="ng-sim-modal__match">
                  <span className="ng-sim-modal__match-date">{formatGameDateLabel(matches[0].date)}</span>
                  <span className="ng-sim-modal__match-line">
                    {matches[0].homeName} — {matches[0].awayName}
                  </span>
                  <span className="ng-sim-modal__match-score">
                    {matches[0].homeScore}–{matches[0].awayScore}
                  </span>
                  <span className={`ng-sim-modal__match-outcome is-${matches[0].outcome}`}>
                    {matches[0].outcome === 'win' ? 'W' : matches[0].outcome === 'loss' ? 'L' : 'D'}
                  </span>
                </article>
              )}
            </div>
          </div>
        </SimulationOverlay>
      ) : null}
    </div>
  )
}

function SimulationOverlay({ children }: { readonly children: ReactNode }) {
  const host = document.querySelector('[data-ng-shell="bdm-os-ng"]') ?? document.body
  return createPortal(
    <div className="ng-sim-overlay" data-ng-region="simulate-overlay">
      {children}
    </div>,
    host,
  )
}

function HourglassIcon() {
  return (
    <svg aria-hidden className="ng-system-bar__hourglass" viewBox="0 0 24 24">
      <path
        d="M7 3.5h10M7 20.5h10M8.2 3.5v2.1c0 1.8.8 3.5 2.2 4.6L12 11.5l1.6-1.3c1.4-1.1 2.2-2.8 2.2-4.6V3.5M8.2 20.5v-2.1c0-1.8.8-3.5 2.2-4.6L12 12.5l1.6 1.3c1.4 1.1 2.2 2.8 2.2 4.6v2.1"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </svg>
  )
}

function defaultTargetDate(world: GameWorld, tomorrow: GameDate, maxDate: GameDate): GameDate {
  const next = getNextKnownEvent(world)
  if (next !== undefined && compareGameDates(next.date, world.currentDate) > 0 && compareGameDates(next.date, maxDate) <= 0) {
    return next.date
  }
  return compareGameDates(tomorrow, maxDate) <= 0 ? tomorrow : maxDate
}

function latestScheduledGameDate(world: GameWorld): GameDate | undefined {
  let latest: GameDate | undefined
  for (const game of Object.values(world.games)) {
    if (game.status !== 'scheduled') continue
    if (latest === undefined || compareGameDates(game.date, latest) > 0) latest = game.date
  }
  return latest
}

function isValidTarget(current: GameDate, draft: string): boolean {
  try {
    return compareGameDates(parseGameDate(draft), current) > 0
  } catch {
    return false
  }
}

function isoWeekday(date: GameDate): number {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number]
  const jsDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  return jsDay === 0 ? 7 : jsDay
}

function monthStart(date: GameDate): GameDate {
  return parseGameDate(`${date.slice(0, 7)}-01`)
}

function shiftMonth(date: GameDate, delta: number): GameDate {
  const [year, month] = date.split('-').map(Number)
  const total = year! * 12 + (month! - 1) + delta
  const nextYear = Math.floor(total / 12)
  const nextMonth = (total % 12) + 1
  return parseGameDate(`${String(nextYear).padStart(4, '0')}-${String(nextMonth).padStart(2, '0')}-01`)
}

function monthTitle(date: GameDate): string {
  return `${MONTH_NAMES[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`
}

function monthGrid(month: GameDate): readonly GameDate[] {
  const start = monthStart(month)
  const gridStart = addDays(start, -(isoWeekday(start) - 1))
  return Array.from({ length: 42 }, (_, index) => addDays(gridStart, index))
}
