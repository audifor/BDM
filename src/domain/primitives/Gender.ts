/** Competition and team category in the BDM world. */
export type Gender = 'male' | 'female'

export function requireGender(value: unknown): Gender {
  if (value !== 'male' && value !== 'female') {
    throw new TypeError('Gender must be male or female')
  }

  return value
}
