import { applyCoachRpgPreset, createInitialCoachRpgProfile, HEAD_COACH_PROFESSIONAL_ATTRIBUTE_WEIGHTS, type CoachRpgPreset } from '@/domain/coachRpg'
import type { Coach } from '@/domain/coach'
import type { CoachId } from '@/domain/ids'
import { STAFF_PROFESSIONAL_ATTRIBUTE_KEYS, type StaffProfessionalProfile } from '@/domain/staff'
import { hashStringToSeed, SeededRandomSource } from '@/engine/random'

export function createUserCoachRookieProfessionalProfile(preset: CoachRpgPreset = 'blank'): StaffProfessionalProfile {
  const professional = { attributes: Object.fromEntries(STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.map((key) => [key, 25 + Math.round(HEAD_COACH_PROFESSIONAL_ATTRIBUTE_WEIGHTS[key] * 60)])) as StaffProfessionalProfile['attributes'] }
  return applyCoachRpgPreset(professional, preset)
}

export function generateAiCoachProfessionalProfile(coachId: CoachId): StaffProfessionalProfile {
  return { attributes: Object.fromEntries(STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.map((key) => [key, clamp(new SeededRandomSource(hashStringToSeed(`coach-professional-v1:${coachId}:${key}`)).nextInt(25, 55) + Math.round(HEAD_COACH_PROFESSIONAL_ATTRIBUTE_WEIGHTS[key] * 80))])) as StaffProfessionalProfile['attributes'] }
}

export function generateCoachRpgProfiles(coaches: readonly Coach[], userCoachId: CoachId, preset: CoachRpgPreset = 'blank') {
  const professionalProfiles = Object.fromEntries(coaches.map((coach) => [coach.id, coach.id === userCoachId ? createUserCoachRookieProfessionalProfile(preset) : generateAiCoachProfessionalProfile(coach.id)])) as Record<CoachId, StaffProfessionalProfile>
  const rpgProfiles = Object.fromEntries(coaches.map((coach) => [coach.id, createInitialCoachRpgProfile()]))
  return { professionalProfiles, rpgProfiles }
}

function clamp(value: number): number { return Math.max(0, Math.min(100, value)) }
