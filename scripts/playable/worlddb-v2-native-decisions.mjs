// Real Courtside decisions shared by native family acceptance consumers.
import {appendFileSync} from 'node:fs'
import {join} from 'node:path'

async function record(c,out,action){
 const date=await c.evaluate("document.querySelector('.ng-system-bar__date')?.innerText")
 appendFileSync(join(out,'required-decisions.jsonl'),JSON.stringify({date,...action})+'\n')
 await c.screenshot(join(out,'decision-'+Date.now()+'.png'))
}
export async function resolveNativeMedical(c,open,out){
 await open('Medical','Equipo')
 const review='section[aria-label="Return-to-Play review"]'
 for(let n=0;n<10&&await c.locate(review);n++){
  const action=await c.locate(review+' button:not([disabled])','=CLEAR FOR PLAY')?'CLEAR FOR PLAY':'CONTINUE RECOVERY'
  if(!await c.locate(review+' button:not([disabled])','='+action))throw Error('Medical review has no supported user decision')
  await c.click(review+' button:not([disabled])','='+action)
  await record(c,out,{kind:'RETURN_TO_PLAY',action})
 }
}
export async function resolveNativePress(c,open,out){
 await open('Press','Mundo y narrativa')
 for(let n=0;n<10&&await c.locate('button','=Delegate answer');n++){
  await c.click('button','=Delegate answer')
  await record(c,out,{kind:'MEDIA',action:'Delegate answer'})
 }
}
