// Proposed bounded acceptance only. This runner never certifies the historical long run.
import { execFileSync, spawn } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

const root = process.cwd()
const frozen = '94c077092224a9f75c861a853d9d52fceae526fe'
const cache = resolve(root, 'node_modules/.cache/bs15-bs16-bs17-certification/v2')
const baseline = join(cache, 'frozen-bs15')
const output = join(cache, 'runs', `${Date.now()}-${process.pid}`)
mkdirSync(output, { recursive: true })
const test = 'src/app/game/WorldDbGameBootstrap.test.ts'
mkdirSync(cache, { recursive: true })
// Additive archive only: no checkout, merge or mutation of a source worktree.
if (!existsSync(join(baseline, '.frozen-sha'))) {
  assert(!existsSync(baseline), 'Unidentified existing archive; preserve it and choose a new cache directory')
  mkdirSync(baseline)
  const archive = join(cache, 'frozen-bs15.tar')
  execFileSync('git', ['archive', '--format=tar', `--output=${archive}`, frozen], { cwd: root })
  execFileSync('tar', ['-xf', archive, '-C', baseline])
  writeFileSync(join(baseline, '.frozen-sha'), frozen)
}
assert.equal(readFileSync(join(baseline, '.frozen-sha'), 'utf8'), frozen)
// Verify every archived production source against the frozen Git blob before running.
const tree = execFileSync('git', ['ls-tree', '-r', '-z', frozen, 'src'], { cwd: root, encoding: 'utf8' })
for (const entry of tree.split('\0').filter(Boolean)) {
  const [metadata, path] = entry.split('\t')
  if (path === test) continue // Only this acceptance harness is replaced below.
  const bytes = readFileSync(join(baseline, path))
  const hashBlob = content => createHash('sha1').update(`blob ${content.length}\0`).update(content).digest('hex')
  const expected = metadata.split(' ')[2]
  const text = bytes.toString('utf8')
  const normalized = bytes.equals(Buffer.from(text)) ? Buffer.from(text.replace(/\r\n/g, '\n')) : bytes
  assert(hashBlob(bytes) === expected || hashBlob(normalized) === expected, `Frozen source changed: ${path}`)
}
// Identical acceptance harness on both versions. Production files remain frozen.
copyFileSync(join(root, test), join(baseline, test))
copyFileSync(join(root, 'src/app/game/WorldDbCertificationDiagnostics.ts'), join(baseline, 'src/app/game/WorldDbCertificationDiagnostics.ts'))
const harnessSha = execFileSync('git', ['hash-object', test], { cwd: root, encoding: 'utf8' }).trim()
const integratedSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
const sources = [frozen, '97c58b98b9192a569f30bdfd8b63565f0b02a744', '6945cb90604bd349edd9d2333aa7d1861e9a311a']
for (const sha of sources) execFileSync('git', ['merge-base', '--is-ancestor', sha, 'HEAD'], { cwd: root })
async function run(label, directory) {
  const report = join(output, `${label}.json`)
  let log = ''
  const code = await new Promise((done, reject) => {
    const child = spawn(process.execPath, [join(root, 'node_modules/vitest/vitest.mjs'), 'run', test,
      '--root', directory, '--config', join(directory, 'vitest.config.ts'), '-t', 'V2 differential|closure diagnostic',
      '--reporter=json', `--outputFile=${report}`], { cwd: directory, env: { ...process.env, NO_COLOR: '1' } })
    child.stdout.on('data', data => { log += data })
    child.stderr.on('data', data => { log += data })
    child.on('error', reject)
    child.on('exit', done)
  })
  writeFileSync(join(output, `${label}.log`), log)
  const results = JSON.parse(readFileSync(report, 'utf8'))
  console.log(`${label}: ${results.numPassedTests} passed, ${results.numFailedTests} failed`)
  assert.equal(code, 0, `${label} failed; inspect ${report}`)
  assert.equal(results.numPassedTests, 10)
  const records = new Map()
  for (const line of log.split(/\r?\n/)) {
    const match = line.match(/\[World DB (?:V2 differential|closure diagnostic)\] (\{.*\})/)
    if (match) { const record = JSON.parse(match[1]); assert(!records.has(record.label)); records.set(record.label, record) }
  }
  assert.equal(records.size, 10, 'Missing differential evidence')
  return records
}
const old = await run('frozen-bs15', baseline)
const current = await run('integrated', root)
const differences = []
for (const [label, previous] of old) {
  const next = current.get(label)
  assert(next, `Missing ${label}`)
  if (!label.startsWith('training-')) { assert.deepEqual(next, previous, `Unexplained shared authority difference: ${label}`); continue }
  assert.equal(next.sourceFingerprint, previous.sourceFingerprint)
  assert.equal(next.initialShared, previous.initialShared)
  assert.equal(previous.facts.hasPhysicalPolicy, false, 'Frozen BS15 policy expectation changed')
  assert.equal(next.facts.hasPhysicalPolicy, true, 'Integrated P0 consumer missing')
  assert.equal(next.facts.unrelated, previous.facts.unrelated)
  if (label === 'training-FULL' || label === 'training-UNKNOWN') {
    assert.equal(next.finalShared, previous.finalShared)
    assert.deepEqual(next.facts.stimulus, previous.facts.stimulus)
    assert.equal(next.facts.status, 'completed')
    assert.equal(next.facts.physicalAttempt.status, label === 'training-FULL' ? 'VERIFIED_AVAILABLE' : 'UNVERIFIED_PHYSICAL_CONTEXT')
  } else {
    assert.equal(label, 'training-OUT_OF_SERVICE')
    assert.equal(previous.facts.status, 'completed')
    assert.equal(next.facts.status, 'scheduled')
    assert.equal(next.facts.physicalAttempt.status, 'VERIFIED_UNAVAILABLE')
    assert.equal(next.facts.stimulus.length, 0)
    assert(previous.facts.stimulus.length > 0)
    const allowed = new Set(['scheduledTrainingSessionsById', 'developmentStimulusEventsById', 'developmentStimulusByPlayerId', 'careerFatigueByPlayerId', 'moraleByPersonId', 'teamCohesionByTeamId'])
    for (const key of Object.keys(previous.sharedFields)) if (!allowed.has(key)) assert.equal(next.sharedFields[key], previous.sharedFields[key], `${label}: unexpected ${key} difference`)
  }
  differences.push({ label, authority: 'BS17D-P0', baseline: previous.facts, integrated: next.facts })
}
writeFileSync(join(output, 'comparison.json'), JSON.stringify({ status: 'PROPOSED_GATES_GREEN_PENDING_ACCEPTANCE',
  integratedSha, workingTree: execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }),
  frozenSources: sources, harnessGitBlob: harnessSha, scenarios: [...old.keys()], differences,
  historical2029: 'UNRESOLVED_HISTORICAL_CAUSE', longitudinalCertified: false }, null, 2))
console.log(`Evidence: ${output}`)
console.log('Ten bounded differential scenarios verified. V2 acceptance remains pending explicit approval.')
