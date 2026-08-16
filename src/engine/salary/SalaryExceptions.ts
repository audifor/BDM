import { consumeSalaryException } from '@/domain/salary'
import { updateGameWorld, type GameWorld } from '@/domain/world'

/** Applies an available exception to an operation without creating any transaction. */
export function useSalaryException(world: GameWorld, exceptionId: string, amount: number): GameWorld {
  const exception = world.salaryExceptionsById[exceptionId]
  if (exception === undefined || exception.seasonId !== world.currentSeasonId || exception.status !== 'active') throw new RangeError('Salary exception is unavailable')
  const updated = consumeSalaryException(exception, amount)
  return updateGameWorld(world, { salaryExceptions: Object.values({ ...world.salaryExceptionsById, [exceptionId]: updated }) })
}
