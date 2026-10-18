import { chromium, SCREENS, REF, BASE } from './lib.mjs'
import fs from 'fs'
const W = +process.argv[2]; const H = Math.round(W*9/16)
const SCALE=[220,320,440,560,720,920]; const THEME=process.argv[3]||'dark'; const DIR=process.argv[4]||'aud'
fs.mkdirSync(`${DIR}/${W}`,{recursive:true})
const b = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {})
const page = await b.newPage({ viewport:{width:W,height:H} })
const out=[]
for (const s of SCREENS) for (const tab of Object.keys(REF[s])) {
  await page.goto(`${BASE}?dir=b&theme=${THEME}&screen=${s}&tab=${tab}`)
  await page.waitForFunction('window.__ready===true',null,{timeout:15000})
  await page.evaluate(()=>document.fonts.ready); await page.waitForTimeout(250)
  const fixed = await page.evaluate('window.__fixedVp')
  if(!fixed){ const extra=await page.evaluate(()=>{const p=document.querySelector('[data-screen-body]');return p.scrollHeight-p.clientHeight}); if(extra>0){await page.setViewportSize({width:W,height:H+extra});await page.waitForTimeout(450)} }
  await page.screenshot({path:`${DIR}/${W}/${s}__${tab}.png`})
  const r = await page.evaluate((SCALE)=>{
    const R=e=>e.getBoundingClientRect(), vis=e=>{const r=R(e);const cs=getComputedStyle(e);return r.width>0&&r.height>0&&cs.visibility!=='hidden'&&cs.display!=='none'}
    const sel=e=>e.tagName.toLowerCase()+(e.className&&typeof e.className==='string'?'.'+e.className.trim().split(/\s+/).slice(0,2).join('.'):'')
    const o={W:innerWidth, docScrollX:document.documentElement.scrollWidth-innerWidth, trunc:[], overlap:[], modules:[], gaps:[], contentW:[], dock:null}
    const page=document.querySelector('[data-screen-body]'); const pr=R(page)
    // barra de tareas
    const dk=document.querySelector('.dock'); if(dk){const d=R(dk); const ic=document.querySelector('.tb-app'); o.dock={h:Math.round(d.height),w:Math.round(d.width),icon:ic?Math.round(R(ic).width)+'x'+Math.round(R(ic).height):null, bottom:Math.round(innerHeight-d.bottom)}}
    // anchura de contenido
    for(const c of page.children){ if(!vis(c))continue; const r=R(c); o.contentW.push(Math.round(r.width)) }
    o.maxContent=Math.max(0,...o.contentW); o.leftMargin=Math.round(Math.min(...[...page.children].filter(vis).map(c=>R(c).left)))
    // truncado
    const seen=new Set()
    for(const e of page.querySelectorAll('*')){
      if(!vis(e))continue; if(e.closest('svg'))continue
      const cs=getComputedStyle(e)
      const hasText=[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())
      if(!hasText)continue
      const clipX=e.scrollWidth>e.clientWidth+1 && (cs.overflowX!=='visible'||cs.textOverflow==='ellipsis')
      const clipY=e.scrollHeight>e.clientHeight+2 && cs.overflowY!=='visible' && cs.overflowY!=='auto' && cs.overflowY!=='scroll'
      if(clipX||clipY){ const t=e.textContent.trim().replace(/\s+/g,' ').slice(0,50); const k=t+sel(e); if(seen.has(k))continue; seen.add(k); o.trunc.push({sel:sel(e),text:t,sw:e.scrollWidth,cw:e.clientWidth,ell:cs.textOverflow==='ellipsis',axis:clipX?'x':'y'}) }
    }
    // módulos y solapes
    const grids=[...page.querySelectorAll('.grid')].filter(g=>!g.parentElement.closest('.grid'))
    for(const g of grids){
      const items=[...g.children].filter(vis); const gr=R(g)
      items.forEach((c,i)=>{
        const r=R(c); const h=Math.round(r.height)
        const cs=getComputedStyle(c)
        let innerScroll=false; let overflowing=false
        for(const d of c.querySelectorAll('*')){ const dc=getComputedStyle(d); if((dc.overflowY==='auto'||dc.overflowY==='scroll')&&d.scrollHeight>d.clientHeight+1)innerScroll=true }
        const sh=c.scrollHeight-c.clientHeight, sw=c.scrollWidth-c.clientWidth
        // contenido que sobresale del módulo
        let protrude=0; for(const d of c.querySelectorAll('*')){ if(!vis(d)||d.closest('svg'))continue; let clipped=false; for(let a=d.parentElement;a&&a!==c;a=a.parentElement){const ac=getComputedStyle(a); if(ac.overflowX!=='visible'||ac.overflowY!=='visible'){clipped=true;break}} if(clipped)continue; const dr=R(d); if(dr.right>r.right+2||dr.bottom>r.bottom+2){protrude++} }
        o.modules.push({sel:sel(c),title:(c.querySelector('h3')?.textContent||'').slice(0,30),w:Math.round(r.width),h,inScale:SCALE.includes(h),innerScroll,overflowStyle:cs.overflow,sh,sw,protrude,top:Math.round(r.top-pr.top+page.scrollTop)})
        for(let j=i+1;j<items.length;j++){ const q=R(items[j]); const ix=Math.min(r.right,q.right)-Math.max(r.left,q.left), iy=Math.min(r.bottom,q.bottom)-Math.max(r.top,q.top); if(ix>2&&iy>2) o.overlap.push({a:sel(c),b:sel(items[j]),ix:Math.round(ix),iy:Math.round(iy)}) }
      })
      // huecos: borde derecho vacío por fila
      const rows=new Map(); items.forEach(c=>{const t=Math.round(R(c).top); (rows.get(t)||rows.set(t,[]).get(t)).push(c)})
      rows.forEach((cs2,t)=>{ const right=Math.max(...cs2.map(c=>R(c).right)); const gap=Math.round(gr.right-right); if(gap>24) o.gaps.push({row:t,gapRight:gap,n:cs2.length}) })
    }
    o.textOverlap=[]; o.hscroll=[]
    for(const e of page.querySelectorAll('.tscroll,.card-b,.scroll')){ if(vis(e)&&e.scrollWidth>e.clientWidth+1&&getComputedStyle(e).overflowX!=='visible') o.hscroll.push({sel:sel(e),title:(e.closest('.card')?.querySelector('h3')?.textContent||'').slice(0,30),sw:e.scrollWidth,cw:e.clientWidth}) }
    for(const card of page.querySelectorAll('.card')){
      const items=[]
      const w=document.createTreeWalker(card,NodeFilter.SHOW_TEXT)
      let n; while((n=w.nextNode())){ if(!n.textContent.trim())continue; const el=n.parentElement; if(!vis(el)||el.closest('svg'))continue
        const rg=document.createRange(); rg.selectNodeContents(n)
        for(const r of rg.getClientRects()){ if(r.width<1)continue
        let x1=r.left,y1=r.top,x2=r.right,y2=r.bottom
        for(let a=el;a&&a!==document.body;a=a.parentElement){const ac=getComputedStyle(a); if(ac.overflowX!=='visible'||ac.overflowY!=='visible'){const q=a.getBoundingClientRect(); x1=Math.max(x1,q.left);y1=Math.max(y1,q.top);x2=Math.min(x2,q.right);y2=Math.min(y2,q.bottom)}}
        const hh=y2-y1; y1+=hh*.2; y2-=hh*.2; if(x2-x1>1&&y2-y1>1) items.push({t:n.textContent.trim().slice(0,24),x1,y1,x2,y2,n}) }
      }
      for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){const a=items[i],b=items[j];const ix=Math.min(a.x2,b.x2)-Math.max(a.x1,b.x1),iy=Math.min(a.y2,b.y2)-Math.max(a.y1,b.y1); if(a.n!==b.n&&ix>3&&iy>3) o.textOverlap.push([a.t,b.t,Math.round(ix),Math.round(iy)])}
    }
    // espacio vacío bajo el contenido (viewport más alto que el contenido)
    const last=[...page.children].filter(vis).pop(); o.bottomEmpty=Math.round(R(dk||page).top-R(last).bottom)
    return o
  }, SCALE)
  out.push({s,tab,fixed,...r})
}
fs.writeFileSync(`${DIR}/${W}.json`,JSON.stringify(out)); console.log(W,'ok',out.length)
await b.close()
