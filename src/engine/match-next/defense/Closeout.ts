/**
 * A defender reacts to a pass 0.2 s after it leaves the passer's hands. The simulation (ActionCore) and the offense's forecast
 * of the closeout (DecisionCore) share this constant, so what the offense expects is what the defense will do.
 */
import { tuning } from '../tuning'

export const closeoutReactionTicks = (): number => tuning().closeoutReactionTicks
