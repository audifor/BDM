/** Read-only HOME digest: leaders, user's neighborhood, relegation end. */
export function homeStandingsWindow<T extends {readonly position:number;readonly teamId:string}>(
  rows:readonly T[],teamId?:string,limit=7,
):readonly T[] {
  const sorted=[...rows].sort((a,b)=>a.position-b.position||a.teamId.localeCompare(b.teamId))
  if(sorted.length<=limit)return sorted
  const selected=new Set<number>([0,1,sorted.length-2,sorted.length-1])
  const userIndex=sorted.findIndex(r=>r.teamId===teamId)
  if(userIndex>=0)for(const index of [userIndex-1,userIndex,userIndex+1])
    if(index>=0&&index<sorted.length)selected.add(index)
  for(let index=0;selected.size<limit&&index<sorted.length;index++)selected.add(index)
  return sorted.filter((_,i)=>selected.has(i)).slice(0,limit)
}
