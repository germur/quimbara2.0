import {resolveBoutPerson} from '../../src/lib/fighter-media.mjs';
import {recordParts} from '../../src/lib/history-sanity.mjs';
export function activeFighterSlugs(fighters,events,now=Date.now()) {
 const today=new Date(now).toISOString().slice(0,10),slugs=new Set();
 for(const event of events){
  const days=(Date.parse(event.date)-Date.parse(today))/86400000;
  if(!Number.isFinite(days)||days < -14||days > 42||['cancelled','postponed','unconfirmed'].includes(event.status))continue;
  for(const bout of [{f1:event.f1,f2:event.f2},...(event.fightCard??[])])for(const side of ['f1','f2']){
   const person=resolveBoutPerson(bout[side],bout[side+'StatsId']??bout[side+'Id'],bout.weightClass,fighters);
   if(person)slugs.add(person.slug);
  }
 }
 return slugs;
}
export function historyRefreshDue(fighter,saved,active,now=Date.now(),attempt) {
 if(attempt?.found===false&&now-Date.parse(attempt.checkedAt)<7*86400000)return false;
 if(!saved)return true;
 const pro=recordParts(fighter.rec),history=recordParts(saved.recordWiki);
 const mismatch=fighter.recScope==='pro'&&pro&&history&&pro.some((n,i)=>n!==history[i]);
 const ttl=active.has(fighter.slug)||mismatch?12*3600000:7*86400000;
 const checked=Date.parse(saved.actualizado??'');
 return !Number.isFinite(checked)||now-checked>=ttl;
}
export function selectHistoryRefreshTargets(fighters,saved,active,{now=Date.now(),limit=Infinity,attempts={}}={}) {
 const age=f=>Date.parse(saved[f.slug]?.actualizado??'1970-01-01')||0;
 const due=fighters.filter(f=>historyRefreshDue(f,saved[f.slug],active,now,attempts[f.slug]))
  .sort((a,b)=>age(a)-age(b)||a.slug.localeCompare(b.slug));
 if(!Number.isFinite(limit)||limit<4)return due.slice(0,limit);
 // Reserve a quarter for overdue histories outside the active window.
 // Reuse unused slots in either group; repeated daily runs cannot starve the roster.
 const inactive=due.filter(f=>!active.has(f.slug)),current=due.filter(f=>active.has(f.slug));
 const reserve=Math.min(inactive.length,Math.max(1,Math.floor(limit/4)));
 const selected=[...current.slice(0,limit-reserve),...inactive.slice(0,reserve)];
 const chosen=new Set(selected.map(f=>f.slug));
 return [...selected,...due.filter(f=>!chosen.has(f.slug))].slice(0,limit);
}
