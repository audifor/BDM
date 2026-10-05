/**
 * ME-LOCK1.2 execution helper: `JSON.stringify(left) === JSON.stringify(right)` for plain JSON-like data, without building the strings.
 * It follows the serializer's rules exactly: object members in key order, members whose value is undefined, a function or a symbol
 * left out, those values written as null inside arrays, non-finite numbers written as null, and -0 written as 0.
 */
export function jsonEqual(left: unknown, right: unknown): boolean {
  // At the top level an omitted kind serializes to undefined (not "null"): equal only to another omitted kind.
  if (omitted(left) || omitted(right)) return omitted(left) && omitted(right)
  return nestedEqual(left, right)
}

function nestedEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true
  const a = jsonValue(left)
  const b = jsonValue(right)
  if (a === b) return true
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false
  const leftArray = Array.isArray(a)
  if (leftArray !== Array.isArray(b)) return false
  if (leftArray) {
    const l = a as readonly unknown[]
    const r = b as readonly unknown[]
    if (l.length !== r.length) return false
    for (let index = 0; index < l.length; index += 1) if (!nestedEqual(l[index], r[index])) return false
    return true
  }
  const l = a as Readonly<Record<string, unknown>>
  const r = b as Readonly<Record<string, unknown>>
  const leftKeys = Object.keys(l)
  const rightKeys = Object.keys(r)
  let i = 0
  let j = 0
  for (;;) {
    while (i < leftKeys.length && omitted(l[leftKeys[i]!])) i += 1
    while (j < rightKeys.length && omitted(r[rightKeys[j]!])) j += 1
    if (i === leftKeys.length || j === rightKeys.length) return i === leftKeys.length && j === rightKeys.length
    if (leftKeys[i] !== rightKeys[j] || !nestedEqual(l[leftKeys[i]!], r[rightKeys[j]!])) return false
    i += 1
    j += 1
  }
}

/** What the serializer writes for a value: null for non-finite numbers and (in arrays) for omitted kinds, the value otherwise. */
function jsonValue(value: unknown): unknown {
  if (typeof value === 'number') return Number.isFinite(value) ? (value === 0 ? 0 : value) : null
  if (omitted(value)) return null
  return value
}

function omitted(value: unknown): boolean {
  return value === undefined || typeof value === 'function' || typeof value === 'symbol'
}
