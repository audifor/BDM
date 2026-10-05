/**
 * WSR2.1: one day's match results are applied as one batch. Each result still runs the whole canonical chain (completeResolvedMatch),
 * in calendar order, reading the state every earlier result left; what the batch changes is storage only. The world-sized records that
 * every result rewrites (morale, career fatigue, development stimulus) were copied whole once per result; inside a batch, the first write
 * copies the record and later results of the same batch write into that copy.
 *
 * - The input world is never written: a record is mutated only if this batch created it.
 * - If a result fails, the batch's copies are discarded with its intermediate worlds; the caller keeps the original world (atomicity).
 * - When the batch ends its copies are sealed (no longer writable): the returned world is as immutable as any other.
 * - Result application is synchronous, so a module-level scope cannot interleave with another batch.
 * Nothing here is persisted or becomes domain state.
 */
let ownedRecords: WeakSet<object> | undefined
let recordCopies = 0

/** Runs `apply` as one result batch (nested calls join the enclosing batch). */
export function withDailyResultBatch<T>(apply: () => T): T {
  if (ownedRecords !== undefined) return apply()
  ownedRecords = new WeakSet()
  try {
    return apply()
  } finally {
    ownedRecords = undefined
  }
}

/**
 * A record to write the next values into: a fresh copy outside a batch (what callers always did), or, inside a batch, the batch's own
 * copy (made on first write, reused afterwards). Copies preserve key order; writes to existing keys keep their position and new keys are
 * appended, exactly as on a fresh copy.
 */
export function writableResultRecord<Value>(record: Readonly<Record<string, Value>>): Record<string, Value> {
  if (ownedRecords !== undefined && ownedRecords.has(record) && !Object.isFrozen(record)) return record as Record<string, Value>
  const copy = { ...record }
  recordCopies += 1
  ownedRecords?.add(copy)
  return copy
}

/** Diagnostics: whole-record copies made through `writableResultRecord` since start-up. */
export function resultRecordCopyCount(): number {
  return recordCopies
}
