import { TRAINING_DAYS } from './TrainingVisualMock'

export type TrainingIntensity = 'Baja' | 'Media' | 'Alta'
export type TrainingSession = { readonly id: string; readonly time: string; readonly focus: string; readonly intensity: TrainingIntensity }
export type TrainingDay = { readonly name: string; readonly sessions: readonly TrainingSession[] }

export function createTrainingPlan(): readonly TrainingDay[] { return TRAINING_DAYS.map(([name, sessions], dayIndex) => ({ name, sessions: sessions.map(([time, focus, intensity], sessionIndex) => ({ id: `${dayIndex}-${sessionIndex}`, time, focus, intensity: intensity as TrainingIntensity })) })) }
export function addTrainingSession(plan: readonly TrainingDay[], dayIndex: number, session: TrainingSession): readonly TrainingDay[] { return plan.map((day, index) => index === dayIndex ? { ...day, sessions: [...day.sessions, session] } : day) }
export function updateTrainingSession(plan: readonly TrainingDay[], dayIndex: number, session: TrainingSession): readonly TrainingDay[] { return plan.map((day, index) => index === dayIndex ? { ...day, sessions: day.sessions.map((current) => current.id === session.id ? session : current) } : day) }
export function deleteTrainingSession(plan: readonly TrainingDay[], dayIndex: number, id: string): readonly TrainingDay[] { return plan.map((day, index) => index === dayIndex ? { ...day, sessions: day.sessions.filter((session) => session.id !== id) } : day) }
export function generateTrainingPlan(context: string): readonly TrainingDay[] { const plan = createTrainingPlan(); return plan.map((day, index) => index === 6 ? day : { ...day, sessions: [{ id: `generated-${index}`, time: index % 2 === 0 ? '10:00' : '17:00', focus: context === 'Recuperación' ? 'Recuperación' : index % 2 === 0 ? 'Técnica individual' : 'Sistemas ofensivos', intensity: context === 'Recuperación' ? 'Baja' : index % 3 === 0 ? 'Alta' : 'Media' }] }) }
