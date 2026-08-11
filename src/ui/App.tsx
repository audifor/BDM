import { useState } from 'react'

import { useGameStore } from '@/stores/gameStore'

import { formatPrototypeDate } from './formatters'
import { HomeScreen, ScheduleScreen, SquadScreen, StandingsScreen } from './screens'
import './styles.css'

type Section = 'home' | 'squad' | 'schedule' | 'standings'

const NAVIGATION: readonly { readonly id: Section; readonly label: string }[] = [
  { id: 'home', label: 'HOME' },
  { id: 'squad', label: 'SQUAD' },
  { id: 'schedule', label: 'SCHEDULE' },
  { id: 'standings', label: 'STANDINGS' },
]

export function App() {
  const world = useGameStore((state) => state.world)
  const newGame = useGameStore((state) => state.newGame)
  const resetGame = useGameStore((state) => state.resetGame)
  const playUserGame = useGameStore((state) => state.playUserGame)
  const advanceDay = useGameStore((state) => state.advanceDay)
  const [section, setSection] = useState<Section>('home')

  if (world === null) {
    return <StartScreen onNewGame={() => { newGame(); setSection('home') }} />
  }

  const startNewGame = () => {
    if (window.confirm('Start a new prototype career? The current career will be lost.')) {
      newGame()
      setSection('home')
    }
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div><strong>BDM</strong><span>BASKETBALL DYNASTY MANAGER</span></div>
        <time>{formatPrototypeDate(world.currentDate)}</time>
      </header>
      <aside className="sidebar">
        <nav aria-label="Main navigation">
          {NAVIGATION.map((item) => <button className={section === item.id ? 'nav-item active' : 'nav-item'} key={item.id} onClick={() => setSection(item.id)} type="button">{item.label}</button>)}
        </nav>
        <div className="sidebar-actions">
          <button className="advance-button" onClick={advanceDay} type="button">ADVANCE DAY</button>
          <button className="text-button" onClick={startNewGame} type="button">NEW GAME</button>
          <button className="text-button" onClick={resetGame} type="button">EXIT CAREER</button>
        </div>
      </aside>
      <div className="main-content">
        {section === 'home' && <HomeScreen world={world} onPlayGame={playUserGame} />}
        {section === 'squad' && <SquadScreen world={world} />}
        {section === 'schedule' && <ScheduleScreen world={world} />}
        {section === 'standings' && <StandingsScreen world={world} />}
      </div>
    </main>
  )
}

function StartScreen({ onNewGame }: { readonly onNewGame: () => void }) {
  return (
    <main className="start-screen">
      <section>
        <p className="eyebrow">PROTOTYPE CAREER</p>
        <h1>BDM</h1>
        <p className="subtitle">Basketball Dynasty Manager</p>
        <button className="primary-button" onClick={onNewGame} type="button">NEW GAME</button>
      </section>
    </main>
  )
}
