import { useEffect, useState } from 'react'

import { createConfiguredGameAsync, discoverWorldDbSpainSelection, NEW_GAME_UNIVERSES, WORLD_DB_SPAIN_UNIVERSE_ID, type NewGameConfiguration, type NewGameUniverseId, type WorldDbSpainTeamOption } from '@/app/game'
import { loadSavedGame } from '@/app/save/GameSaveService'
import { ACB_QUICK_START_TEAM_KEY, ACB_SNAPSHOT_DATE, ACB_TEST_UNIVERSE_ID } from '@/data/acb2026'
import { useGameStore } from '@/stores/gameStore'
import { useMatchViewerStore } from '@/stores/matchViewerStore'
import { useTacticalPlanStore } from '@/stores/tacticalPlanStore'
import { tauriGameSaveRepository } from '@/tauri/TauriGameSaveRepository'
import { BdmOsNg } from '@/ui-ng/BdmOsNg'
import { App } from '@/ui/App'

import './BootstrapApp.css'

export function BootstrapApp({ uiMode = 'ng' }: { readonly uiMode?: 'legacy' | 'ng' }) {
  const world = useGameStore((state) => state.world)
  const replaceWorld = useGameStore((state) => state.replaceWorld)
  const resetTacticalPlan = useTacticalPlanStore((state) => state.reset)
  const clearMatch = useMatchViewerStore((state) => state.clear)
  const [hasSave, setHasSave] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [isStartingGame, setIsStartingGame] = useState(false)

  useEffect(() => {
    let active = true
    void tauriGameSaveRepository.getInfo()
      .then((info) => { if (active) setHasSave(info !== null) })
      .catch(() => { if (active) setHasSave(false) })
    return () => { active = false }
  }, [])

  if (world !== null) {
    return uiMode === 'ng' ? <BdmOsNg /> : <App />
  }

  const startGame = async (configuration: NewGameConfiguration) => {
    setMessage(null)
    setIsStartingGame(true)
    try {
      const newWorld = await createConfiguredGameAsync(configuration)
      clearMatch()
      resetTacticalPlan()
      replaceWorld(newWorld)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to create game')
    } finally {
      setIsStartingGame(false)
    }
  }

  const loadGame = async () => {
    try {
      const loaded = await loadSavedGame(tauriGameSaveRepository)
      clearMatch()
      resetTacticalPlan()
      replaceWorld(loaded)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load saved game')
    }
  }

  return <StartScreen canLoad={hasSave} isStarting={isStartingGame} message={message} onLoad={() => void loadGame()} onStart={startGame} />
}

function StartScreen({
  canLoad,
  isStarting,
  message,
  onLoad,
  onStart,
}: {
  readonly canLoad: boolean
  readonly isStarting: boolean
  readonly message: string | null
  readonly onLoad: () => void
  readonly onStart: (configuration: NewGameConfiguration) => void | Promise<void>
}) {
  const [setupOpen, setSetupOpen] = useState(false)
  const [universeId, setUniverseId] = useState<NewGameUniverseId>(WORLD_DB_SPAIN_UNIVERSE_ID)
  const selectedUniverse = NEW_GAME_UNIVERSES.find((universe) => universe.id === universeId)!
  const [teamKey, setTeamKey] = useState<string>(ACB_QUICK_START_TEAM_KEY)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [dateOfBirth, setDateOfBirth] = useState('1990-01-01')
  const [coachGender, setCoachGender] = useState<'male' | 'female'>('male')
  const [background, setBackground] = useState<'rookie' | 'formerPlayer' | 'inDebt' | 'academyCoach' | 'videoAnalyst' | 'formerAssistant'>('rookie')
  const [ambition, setAmbition] = useState<'firstTitle' | 'talentDeveloper' | 'eliteReputation' | 'financialFreedom'>('firstTitle')
  const [biography, setBiography] = useState('')
  const [coachingStyle, setCoachingStyle] = useState<'blank' | 'balanced' | 'tactician' | 'developer' | 'motivator' | 'analyst'>('balanced')
  const [disposition, setDisposition] = useState<'balanced' | 'ambitious' | 'loyal'>('balanced')
  const [worldDbTeams, setWorldDbTeams] = useState<readonly WorldDbSpainTeamOption[]>([])
  const [worldDbLoading, setWorldDbLoading] = useState(false)
  const [worldDbError, setWorldDbError] = useState<string | null>(null)

  useEffect(() => {
    if (!setupOpen || universeId !== WORLD_DB_SPAIN_UNIVERSE_ID) {
      setWorldDbTeams([])
      setWorldDbLoading(false)
      setWorldDbError(null)
      return
    }
    let active = true
    setWorldDbLoading(true)
    setWorldDbError(null)
    void discoverWorldDbSpainSelection()
      .then((selection) => {
        if (!active) return
        setWorldDbTeams(selection.teams)
        setTeamKey('')
      })
      .catch((error) => {
        if (active) {
          setWorldDbTeams([])
          setTeamKey('')
          setWorldDbError(error instanceof Error ? error.message : 'Unable to read the Spain ACB World DB catalog')
        }
      })
      .finally(() => { if (active) setWorldDbLoading(false) })
    return () => { active = false }
  }, [setupOpen, universeId])

  const chooseUniverse = (nextId: NewGameUniverseId) => {
    setUniverseId(nextId)
    const universe = NEW_GAME_UNIVERSES.find((candidate) => candidate.id === nextId)!
    if (universe.defaultTeamKey !== undefined) setTeamKey(universe.defaultTeamKey)
    else if (nextId !== WORLD_DB_SPAIN_UNIVERSE_ID) setTeamKey('')
  }

  const availableTeams = universeId === WORLD_DB_SPAIN_UNIVERSE_ID ? worldDbTeams : selectedUniverse.teams
  const worldDbReady = universeId !== WORLD_DB_SPAIN_UNIVERSE_ID || (!worldDbLoading && worldDbError === null && availableTeams.length === 18)
  const coachCreatorSupported = true
  const coachIdentityReady = !coachCreatorSupported || (firstName.trim().length > 0 && lastName.trim().length > 0 && dateOfBirth.length === 10)

  if (!setupOpen) {
    return (
      <main className="start-screen">
        <section className="bdm-start-card">
          <p className="eyebrow">PROTOTYPE CAREER</p>
          <h1>BDM</h1>
          <p className="subtitle">Basketball Dynasty Manager</p>
          <div className="bdm-start-actions">
            <button className="primary-button" disabled={isStarting} onClick={() => setSetupOpen(true)} type="button">NEW GAME</button>
            <button className="text-button" disabled={!canLoad || isStarting} onClick={onLoad} type="button">CONTINUE</button>
            <button className="secondary-button bdm-quick-start" disabled={isStarting} onClick={() => void onStart({ universeId: ACB_TEST_UNIVERSE_ID, userTeamKey: ACB_QUICK_START_TEAM_KEY })} type="button">
              {isStarting ? 'STARTING GAME...' : 'DEV QUICK START ACB · CASADEMONT ZARAGOZA'}
            </button>
          </div>
          {message !== null && <p className="bdm-start-message">{message}</p>}
        </section>
      </main>
    )
  }

  return (
    <main className="start-screen">
      <section className="bdm-start-card bdm-new-game-card">
        <div className="bdm-new-game-heading">
          <div><p className="eyebrow">NEW CAREER</p><h1>NEW GAME</h1></div>
          <button className="text-button" disabled={isStarting} onClick={() => setSetupOpen(false)} type="button">BACK</button>
        </div>
        <label className="bdm-start-field">
          <span>UNIVERSE</span>
          <select disabled={isStarting} value={universeId} onChange={(event) => chooseUniverse(event.target.value as NewGameUniverseId)}>
            {NEW_GAME_UNIVERSES.map((universe) => <option key={universe.id} value={universe.id}>{universe.label}{universe.isTest ? ' [TEST]' : ''}</option>)}
          </select>
        </label>
        <p className="bdm-universe-description">{selectedUniverse.description}</p>
        {universeId === WORLD_DB_SPAIN_UNIVERSE_ID && (worldDbLoading || isStarting) && <p aria-live="polite" className="bdm-world-db-status" role="status">Cargando World Database...</p>}
        {universeId === WORLD_DB_SPAIN_UNIVERSE_ID && worldDbError !== null && <p className="bdm-start-message">{worldDbError}</p>}
        {availableTeams.length > 0 && (
          <label className="bdm-start-field">
            <span>{universeId === WORLD_DB_SPAIN_UNIVERSE_ID ? `TEAM - ${availableTeams.length} CANONICAL OPTIONS` : 'TEAM'}</span>
            <select disabled={isStarting} value={teamKey} onChange={(event) => setTeamKey(event.target.value)}>
              {universeId === WORLD_DB_SPAIN_UNIVERSE_ID && <option disabled value="">CHOOSE A TEAM</option>}
              {availableTeams.map((team) => <option key={team.key} value={team.key}>{team.name} · {team.code}</option>)}
            </select>
          </label>
        )}
        {universeId === ACB_TEST_UNIVERSE_ID && (
          <div className="bdm-test-note">
            <strong>ACB SNAPSHOT {ACB_SNAPSHOT_DATE}</strong>
            <p>Real test data: clubs, player names, positions and head-coach names. Generated by BDM: ratings, tendencies, bios, contracts and finances.</p>
          </div>
        )}
        {coachCreatorSupported ? (
          <section aria-label="CREATE YOUR COACH" className="bdm-coach-creator">
            <div className="bdm-coach-creator__head"><strong>CREATE YOUR COACH</strong><span>BS19B · CANONICAL PERSON</span></div>
            <div className="bdm-coach-creator__grid">
              <label className="bdm-start-field">
                <span>COACH FIRST NAME</span>
                <input disabled={isStarting} maxLength={60} required value={firstName} onChange={(event) => setFirstName(event.target.value)} />
              </label>
              <label className="bdm-start-field">
                <span>COACH LAST NAME</span>
                <input disabled={isStarting} maxLength={90} required value={lastName} onChange={(event) => setLastName(event.target.value)} />
              </label>
              <label className="bdm-start-field">
                <span>DATE OF BIRTH</span>
                <input disabled={isStarting} type="date" value={dateOfBirth} onChange={(event) => setDateOfBirth(event.target.value)} />
              </label>
              <label className="bdm-start-field">
                <span>GENDER</span>
                <select disabled={isStarting} value={coachGender} onChange={(event) => setCoachGender(event.target.value as 'male' | 'female')}>
                  <option value="male">Male</option><option value="female">Female</option>
                </select>
              </label>
              <label className="bdm-start-field">
                <span>BACKGROUND</span>
                <select disabled={isStarting} value={background} onChange={(event) => setBackground(event.target.value as typeof background)}>
                  <option value="rookie">New coach</option>
                  <option value="formerPlayer">Former player · practical experience</option>
                  <option value="inDebt">In debt · financial pressure</option>
                  <option value="academyCoach">Academy coach · youth training</option>
                  <option value="videoAnalyst">Video analyst · technical scouting</option>
                  <option value="formerAssistant">Former assistant · bench experience</option>
                </select>
              </label>
              <label className="bdm-start-field">
                <span>COACHING STYLE</span>
                <select disabled={isStarting} value={coachingStyle} onChange={(event) => setCoachingStyle(event.target.value as typeof coachingStyle)}>
                  <option value="blank">No specialty</option>
                  <option value="balanced">Balanced</option>
                  <option value="tactician">Tactician</option>
                  <option value="developer">Player development</option>
                  <option value="motivator">Motivator</option>
                  <option value="analyst">Analyst</option>
                </select>
              </label>
              <label className="bdm-start-field">
                <span>CAREER AMBITION</span>
                <select disabled={isStarting} value={ambition} onChange={(event) => setAmbition(event.target.value as typeof ambition)}>
                  <option value="firstTitle">Win my first title</option>
                  <option value="talentDeveloper">Develop players</option>
                  <option value="eliteReputation">Become an elite coach</option>
                  <option value="financialFreedom">Achieve financial independence</option>
                </select>
              </label>
              <label className="bdm-start-field">
                <span>PERSONALITY</span>
                <select disabled={isStarting} value={disposition} onChange={(event) => setDisposition(event.target.value as typeof disposition)}>
                  <option value="balanced">Balanced</option>
                  <option value="ambitious">Ambitious</option>
                  <option value="loyal">Loyal</option>
                </select>
              </label>
            </div>
            <label className="bdm-start-field">
              <span>PERSONAL BACKSTORY (OPTIONAL, MAX 600 CHARACTERS)</span>
              <textarea disabled={isStarting} maxLength={600} rows={2} value={biography} onChange={(event) => setBiography(event.target.value)} />
            </label>
            <p className="bdm-coach-creator__note">Your chosen background influences real coaching attributes or finances. Your ambition and fictional story persist in your Coach RPG profile. The historical WorldDB people stay unchanged.</p>
          </section>
        ) : null}
        <button className="primary-button" disabled={isStarting || !worldDbReady || !coachIdentityReady || (availableTeams.length > 0 && teamKey.length === 0)} onClick={() => void onStart({
          universeId,
          userTeamKey: availableTeams.length > 0 ? teamKey : undefined,
          ...(coachCreatorSupported ? { userCoachCreation: { firstName, lastName, dateOfBirth, gender: coachGender, background, ambition, biography, coachingStyle, disposition } } : {}),
        })} type="button">{isStarting ? 'STARTING CAREER...' : 'START CAREER'}</button>
        {message !== null && <p className="bdm-start-message">{message}</p>}
      </section>
    </main>
  )
}
