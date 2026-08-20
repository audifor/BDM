/** Competition and team category in the BDM world. */
export type Gender = 'male' | 'female'
/** Sports competition context. It deliberately remains separate from person identity. */
export type SportsCategory = 'men' | 'women'

export function sportsCategoryForGender(gender: Gender): SportsCategory {
  return gender === 'male' ? 'men' : 'women'
}

export function requireGender(value: unknown): Gender {
  if (value !== 'male' && value !== 'female') {
    throw new TypeError('Gender must be male or female')
  }

  return value
}
