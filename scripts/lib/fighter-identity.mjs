export const sourceId=url=>String(url??'').match(/fighter-details\/([a-f0-9]{16})/i)?.[1]??null;
export const identityName=name=>String(name??'').toLowerCase().replace(/ł/g,'l').replace(/ø/g,'o').replace(/đ/g,'d').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
export const identitySlug=name=>String(name??'').toLowerCase().replace(/ł/g,'l').replace(/ø/g,'o').replace(/đ/g,'d').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/['’]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
export function joinFighterSources(tott,details,fights,eventDates,registry){
 const counts=new Map();for(const p of tott)counts.set(p.FIGHTER.trim(),(counts.get(p.FIGHTER.trim())??0)+1);
 const detailById=new Map(details.map(p=>[sourceId(p.URL),p]));
 const profiles=tott.map(p=>{
  const id=sourceId(p.URL);if(!id)throw new Error('Missing UFCStats athlete ID');
  const name=p.FIGHTER.trim(),ambiguous=counts.get(name)>1,binding=registry.profiles?.[id];
  if(ambiguous&&!binding)throw new Error('Unresolved duplicate athlete identity: '+name+' '+id);
  return {id,name,slug:binding?.slug??identitySlug(name),tott:p,detail:detailById.get(id),ambiguous,binding};
 });
 const byName=new Map();for(const p of profiles){const list=byName.get(p.name)??[];list.push(p);byName.set(p.name,list);}
 const history=new Map(profiles.map(p=>[p.id,[]])),unresolved=new Map();
 for(const fight of fights){
  const names=fight.BOUT?.split(/\s+vs\.?\s+/).map(n=>n.trim());if(names?.length!==2)continue;
  const outcome=(fight.OUTCOME??'').split('/');
  for(let i=0;i<2;i++){
   const candidates=byName.get(names[i])??[];
   const id=candidates.length===1?candidates[0].id:registry.fights?.[fight.URL]?.[i];
   if(!id||!candidates.some(p=>p.id===id)){
    for(const p of candidates)unresolved.set(p.id,(unresolved.get(p.id)??0)+1);
    continue;
   }
   history.get(id).push({result:['W','L','D','NC'].includes(outcome[i])?outcome[i]:'unknown',method:(fight.METHOD??'').trim(),opponent:names[1-i],date:eventDates.get(fight.EVENT?.trim())??'',weightClass:fight.WEIGHTCLASS?.trim()??'',sourceFightUrl:fight.URL});
  }
 }
 for(const rows of history.values())rows.sort((a,b)=>b.date.localeCompare(a.date));
 if(new Set(profiles.map(p=>p.slug)).size!==profiles.length)throw new Error('Duplicate public fighter slugs');
 return {profiles,history,unresolved};
}
