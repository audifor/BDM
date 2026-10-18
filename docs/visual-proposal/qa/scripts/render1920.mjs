import { chromium, SCREENS, REF, shot } from './lib.mjs'
import fs from 'fs'
const out = 'cur1920'; fs.mkdirSync(out, { recursive: true })
const b = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}); const page = await b.newPage()
const errs=[]; page.on('pageerror', e=>errs.push(String(e)))
const meta = {}
for (const s of SCREENS) for (const [tab,[d,l]] of Object.entries(REF[s])) for (const [theme,id] of [['dark',d],['light',l]]) {
  const f = await shot(page, s, tab, theme, 1920, `${out}/${String(id).padStart(3,'0')}.png`)
  meta[id] = { s, tab, theme, fixed: f }
}
fs.writeFileSync('cur1920/meta.json', JSON.stringify(meta)); console.log('done', Object.keys(meta).length, errs)
await b.close()
