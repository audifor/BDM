import { useState } from 'react'
import { createWorldDbUniverseGame, listWorldDbUniverseCompetitions, type WorldDbUniverseCompetitionOption } from '@/app/game/WorldDbUniverseGame'
import type { GameWorld } from '@/domain/world'
import { tauriWorldDatabaseRepository } from '@/tauri/TauriWorldDatabaseRepository'

export function UniverseImport({ onLoaded }: { readonly onLoaded: (world: GameWorld) => void }) {
  const [open, setOpen] = useState(false)
  const [path, setPath] = useState('')
  const [bundle, setBundle] = useState('')
  const [options, setOptions] = useState<readonly WorldDbUniverseCompetitionOption[]>([])
  const [edition, setEdition] = useState('')
  const [team, setTeam] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const access = { repository: tauriWorldDatabaseRepository, databasePath: path, runtimeBundlePath: bundle }
  const run = async (fn: () => Promise<void>) => { setBusy(true); setError(''); try { await fn() } catch (e) { setError(String(e)) } finally { setBusy(false) } }
  if (!open) return <button className="start-screen__secondary" onClick={() => setOpen(true)}>Importar universo WorldDB</button>
  return <fieldset disabled={busy}>
    <legend>Universo generado</legend>
    <p>La SQLite se abre en modo de solo lectura. La partida tendrá sus propios datos. Los formatos parciales y los profesionales sin sistema de juego todavía limitan la simulación.</p>
    <label>SQLite <input aria-label="SQLite del universo" value={path} onChange={e => { setPath(e.target.value); setOptions([]); const i = Math.max(e.target.value.lastIndexOf('/'), e.target.value.lastIndexOf('\\')); setBundle(e.target.value.slice(0, i + 1) + 'competition-runtime-bundle.json') }} /></label>
    <label>Formato del universo <input aria-label="Formato del universo" value={bundle} onChange={e => setBundle(e.target.value)} /></label>
    <button onClick={() => void run(async () => { setOptions(await listWorldDbUniverseCompetitions(access)); setEdition(''); setTeam('') })}>Leer competiciones</button>
    <label>Competición <select aria-label="Competición del universo" value={edition} onChange={e => { setEdition(e.target.value); setTeam('') }}><option value="">Elegir</option>{options.map(o => <option key={o.competitionSeasonId} value={o.competitionSeasonId}>{o.name} · {o.competitionSeasonId.split(':').at(-1)}</option>)}</select></label>
    <label>Club <select aria-label="Club del universo" value={team} onChange={e => setTeam(e.target.value)}><option value="">Elegir</option>{options.find(o => o.competitionSeasonId === edition)?.teams.map(t => <option key={t.teamId} value={t.teamId}>{t.teamName}</option>)}</select></label>
    <button disabled={busy || !team || !edition} onClick={() => void run(async () => { const result = await createWorldDbUniverseGame({ ...access, competitionSeasonId: edition, teamId: team }); onLoaded(result.world) })}>Crear partida independiente</button>
    {error && <p role="alert">{error}</p>}
  </fieldset>
}
