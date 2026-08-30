import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const readSource = (relativePath: string) => readFileSync(path.join(__dirname, relativePath), 'utf-8')

describe('no leftover index-based / localStorage-authoritative lineup logic', () => {
  it('TacticsPcbPage no longer derives starters from roster array index (index < 5)', () => {
    const source = readSource('./TacticsPcbPage.tsx')
    expect(source).not.toMatch(/index\s*<\s*5/)
  })

  it('PcbTacticsBoard no longer reads or writes a localStorage-backed starters key', () => {
    const source = readSource('./PcbTacticsBoard.jsx')
    expect(source).not.toMatch(/startersKey/)
  })

  it('CanonicalRoster no longer holds a local unpersisted rotation useState map', () => {
    const source = readSource('../plantilla/CanonicalRoster.tsx')
    expect(source).not.toMatch(/useState<Record<string,\s*string>>\(\{\}\)/)
  })
})
