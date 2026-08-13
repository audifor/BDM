import { addDays, compareGameDates, type GameDate } from '@/domain/date'
import type { GameId, InjuryId, PlayerId } from '@/domain/ids'
export type InjuryKind = 'ankleSprain' | 'hamstringStrain' | 'kneeSprain' | 'backStrain' | 'handInjury' | 'shoulderStrain'
export type InjurySeverity = 'minor' | 'moderate' | 'serious'
export interface InjuryRecord { readonly id: InjuryId; readonly playerId: PlayerId; readonly kind: InjuryKind; readonly severity: InjurySeverity; readonly injuredOn: GameDate; readonly expectedReturnDate: GameDate; readonly sourceGameId?: GameId }
export function createInjury(input: InjuryRecord): InjuryRecord { if (!['ankleSprain','hamstringStrain','kneeSprain','backStrain','handInjury','shoulderStrain'].includes(input.kind)) throw new TypeError('Injury kind is invalid'); if (!['minor','moderate','serious'].includes(input.severity)) throw new TypeError('Injury severity is invalid'); if (compareGameDates(input.expectedReturnDate,input.injuredOn)<=0) throw new RangeError('Injury expected return date must be after injuredOn'); return {...input} }
export function isInjuryActive(injury: InjuryRecord,date:GameDate):boolean{return compareGameDates(injury.injuredOn,date)<=0&&compareGameDates(date,injury.expectedReturnDate)<0}
export function recoveryDaysForSeverity(severity:InjurySeverity):readonly[number,number]{return severity==='minor'?[3,7]:severity==='moderate'?[8,21]:[22,60]}
export function injuryReturnDate(injuredOn:GameDate,recoveryDays:number):GameDate{return addDays(injuredOn,recoveryDays)}
export function formatInjuryKind(kind:InjuryKind):string{return{ankleSprain:'Ankle sprain',hamstringStrain:'Hamstring strain',kneeSprain:'Knee sprain',backStrain:'Back strain',handInjury:'Hand injury',shoulderStrain:'Shoulder strain'}[kind]}
