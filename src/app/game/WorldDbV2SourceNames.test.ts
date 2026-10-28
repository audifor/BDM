import { execFileSync } from 'node:child_process'
import { expect, it } from 'vitest'

it('keeps incomplete optional source identities out of the playable free-agent pool without inventing names', () => {
  const result = execFileSync(process.env.BDM_PYTHON ?? 'python', ['-B', '-c', `
import json, runpy
valid = runpy.run_path('src-tauri/resources/worlddb_v2_bridge.py')['has_player_name']
print(json.dumps([valid(*names) for names in [('Jean', 'Dupont'), (' João ', 'Silva'), ('', 'Original'), ('   ', 'Original'), ('Original', ''), (None, 'Original')]]))
`], { encoding: 'utf8' })
  expect(JSON.parse(result)).toEqual([true, true, false, false, false, false])
})
