import { useState } from 'react'
import type { SimulateUntilResult } from '@/app/game'
import { createGameDate, daysInMonth, parseGameDate, type GameDate } from '@/domain/date'
import type { GameWorld } from '@/domain/world'
import { BdmButton, Dialog, Feedback, Select, type SelectOption } from '@/ui/components/designSystem'
import { formatPrototypeDate } from '@/ui/formatters'

const MONTHS = [
  { value: '1', label: 'Enero' }, { value: '2', label: 'Febrero' }, { value: '3', label: 'Marzo' },
  { value: '4', label: 'Abril' }, { value: '5', label: 'Mayo' }, { value: '6', label: 'Junio' },
  { value: '7', label: 'Julio' }, { value: '8', label: 'Agosto' }, { value: '9', label: 'Septiembre' },
  { value: '10', label: 'Octubre' }, { value: '11', label: 'Noviembre' }, { value: '12', label: 'Diciembre' },
]

/** A century of selectable years ahead of the current one; the domain itself has no cap. */
const YEAR_RANGE = 100

/**
 * SIMULAR HASTA FECHA: an explicit target-date order distinct from CONTINUAR (which stops at
 * the next user game/media/season event) and from a future PRÓXIMO PARTIDO command. It always
 * reaches targetDate exactly, auto-resolving every FULLY_SUPPORTED competition rollover on the
 * way (see CompetitionLifecycleCoordinator), and reports an explicit diagnostic rather than
 * silently stopping if an UNSUPPORTED_FUTURE_LIFECYCLE competition would need one.
 */
export function SimulateUntilDateControl({ world, onSimulateUntilDate }: { readonly world: GameWorld; readonly onSimulateUntilDate: (date: GameDate) => SimulateUntilResult }) {
  const [open, setOpen] = useState(false)
  const [isSimulating, setIsSimulating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastResult, setLastResult] = useState<SimulateUntilResult | null>(null)
  const [year, currentMonth, currentDay] = world.currentDate.split('-').map(Number) as [number, number, number]
  const [selectedYear, setSelectedYear] = useState(String(year))
  const [selectedMonth, setSelectedMonth] = useState(String(currentMonth))
  const [selectedDay, setSelectedDay] = useState(String(currentDay))

  const yearOptions: SelectOption[] = Array.from({ length: YEAR_RANGE + 1 }, (_, index) => { const value = year + index; return { value: String(value), label: String(value) } })
  const dayCount = daysInMonth(Number(selectedYear), Number(selectedMonth))
  const dayOptions: SelectOption[] = Array.from({ length: dayCount }, (_, index) => ({ value: String(index + 1), label: String(index + 1) }))

  const handleDayChange = (value: string) => setSelectedDay(value)
  const handleMonthChange = (value: string) => {
    setSelectedMonth(value)
    const maxDay = daysInMonth(Number(selectedYear), Number(value))
    if (Number(selectedDay) > maxDay) setSelectedDay(String(maxDay))
  }
  const handleYearChange = (value: string) => {
    setSelectedYear(value)
    const maxDay = daysInMonth(Number(value), Number(selectedMonth))
    if (Number(selectedDay) > maxDay) setSelectedDay(String(maxDay))
  }

  const targetDate = createGameDate(Number(selectedYear), Number(selectedMonth), Number(selectedDay))
  const isPastOrCurrent = targetDate <= world.currentDate

  const handleSimulate = () => {
    setError(null)
    setIsSimulating(true)
    try {
      const result = onSimulateUntilDate(parseGameDate(targetDate))
      setLastResult(result)
      if (result.stopReason.type !== 'unsupportedLifecycle') setOpen(false)
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : 'No se pudo simular hasta esa fecha.')
    } finally {
      setIsSimulating(false)
    }
  }

  return <>
    <BdmButton className="desktop-simulate-until-control__trigger" onClick={() => { setError(null); setLastResult(null); setOpen(true) }} size="compact" variant="ghost">Simular hasta fecha</BdmButton>
    <Dialog onClose={() => setOpen(false)} open={open} title="Simular hasta fecha">
      <div className="desktop-simulate-until-control">
        <p className="desktop-simulate-until-control__current">Fecha actual · {formatPrototypeDate(world.currentDate)}</p>
        <div className="desktop-simulate-until-control__fields">
          <Select ariaLabel="Día" label="Día" onChange={handleDayChange} options={dayOptions} value={selectedDay} />
          <Select ariaLabel="Mes" label="Mes" onChange={handleMonthChange} options={MONTHS} value={selectedMonth} />
          <Select ariaLabel="Año" label="Año" onChange={handleYearChange} options={yearOptions} value={selectedYear} />
        </div>
        {isPastOrCurrent && <Feedback tone="warning">La fecha seleccionada debe ser posterior a la fecha actual del mundo.</Feedback>}
        {error !== null && <Feedback tone="danger">{error}</Feedback>}
        {lastResult !== null && lastResult.stopReason.type === 'unsupportedLifecycle' && (
          <Feedback tone="warning">
            No se pudo completar la simulación: la competición {lastResult.stopReason.diagnostic.competitionId} no tiene lifecycle de temporadas futuras (última fecha soportada: {formatPrototypeDate(lastResult.stopReason.diagnostic.lastSupportedDate)}). El mundo avanzó hasta {formatPrototypeDate(lastResult.finalDate)}.
          </Feedback>
        )}
        <BdmButton disabled={isPastOrCurrent} loading={isSimulating} onClick={handleSimulate} size="large" trailingIcon="▶">{isSimulating ? `Simulando hasta ${formatPrototypeDate(targetDate)}...` : 'SIMULAR HASTA'}</BdmButton>
      </div>
    </Dialog>
  </>
}
