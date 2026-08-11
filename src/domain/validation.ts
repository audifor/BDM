export function requireNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${fieldName} must be a non-empty string`)
  }

  return value.trim()
}

export function copyUniqueIds<Id extends string>(ids: readonly Id[], fieldName: string): readonly Id[] {
  const copiedIds = [...ids]

  for (const id of copiedIds) {
    requireNonEmptyString(id, fieldName)
  }

  if (new Set(copiedIds).size !== copiedIds.length) {
    throw new RangeError(`${fieldName} must not contain duplicates`)
  }

  return Object.freeze(copiedIds)
}
