import { updateGameWorld, type GameWorld } from '@/domain/world'
import type { WorldCompetitionFormatNode } from '@/domain/competition'

const marker='BDM_V2_03F_DOCUMENTED_BINDING'
// Supplemental execution fields, never a replacement of the frozen source bundle.
// LNB 2025-26 formula: HHAAH and playoff-table priority. LNB article 262,
// corroborated by Paris/Monaco's actual 2026 quarterfinals: HAH and A-D/B-C.
const sources=[
 {url:'https://lnb.azureedge.net/wp-content/2025/09/FORMULE-Betclic-ELITE_25-26.pdf',type:'OFFICIAL' as const,scope:'2025-26 play-in, playoff-table priority, semifinal/final HHAAH'},
 {url:'https://www.lnb.fr/elite/wp-content/uploads/2022/07/Reglement-LNB-22-23-1.pdf',type:'OFFICIAL' as const,scope:'Article 262: HAH quarterfinals and A-D/B-C bracket; corroborated in 2026'},
 {url:'https://parisbasketball.com/2026/05/lheure-de-la-belle/',type:'OFFICIAL' as const,scope:'2026 Paris-Strasbourg quarterfinal games: Paris, Strasbourg, Paris'},
 {url:'https://asmonaco.basketball/news/show.php?ID=79482',type:'OFFICIAL' as const,scope:'2026 quarterfinal and semifinal actual fixtures corroborate venue order and bracket'},
]

/** Idempotent, in-memory upgrade for new and recovered PBM French careers. */
export function bindWorldDbV2FrenchFormat(world:GameWorld):GameWorld{
 if(world.worldDbCompetitionRuntime?.worldDbV2?.sourceCompetitionId!=='pbm:DYN_championnat:2')return world
 let changed=false
 const seasons=Object.values(world.seasons).map(season=>{
  const format=season.worldCompetitionFormat
  if(!format||format.competitionSeasonId!=='edition:FRA:betclic-elite:2025-26'||format.notes?.includes(marker))return season
  changed=true
  return {...season,worldCompetitionFormat:{...format,notes:(format.notes??'')+' | '+marker+': explicit sourced hosting/paths; qualification seeds use playoff-table slots.',sources:[...format.sources,...sources],variants:format.variants.map(variant=>({...variant,nodes:variant.nodes.map((node):WorldCompetitionFormatNode=>{
   if(node.key==='PLAY_IN_FINAL')return {...node,hosting:{ruleType:'ASSIGNED_HOST',priorityBasis:'FIRST_PARTICIPANT',payload:{source_binding:marker}}}
   if(!['QUARTERFINALS','SEMIFINALS','FINAL'].includes(node.key))return node
   if(node.hosting?.ruleType!=='HIGHER_SEED')throw new Error('French source hosting differs from documented binding: '+node.key)
   return {...node,...(node.key==='SEMIFINALS'?{pairing:{type:'FIXED_BRACKET' as const,payload:{paths:['WINNER_1_VS_8_VS_WINNER_4_VS_5','WINNER_2_VS_7_VS_WINNER_3_VS_6']}}}:{}),hosting:{ruleType:'SERIES_PATTERN',pattern:node.key==='QUARTERFINALS'?'HAH':'HHAAH',priorityBasis:'HIGHER_SEED',payload:{source_binding:marker}}}
  })}))}}
 })
 return changed?updateGameWorld(world,{seasons}):world
}
