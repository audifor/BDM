export const CAREER_FATIGUE_DAILY_RECOVERY=3
export function clampCareerFatigue(value:number):number{if(!Number.isFinite(value))throw new RangeError('Career fatigue must be finite');return Math.max(0,Math.min(100,value))}
export function recoverCareerFatigue(value:number):number{return clampCareerFatigue(value-CAREER_FATIGUE_DAILY_RECOVERY)}
