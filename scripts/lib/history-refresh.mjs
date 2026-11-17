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
export function historyRefreshDue(fighter,saved,active,now=Date.now()) {
 if(!saved)return true;
 const pro=recordParts(fighter.rec),history=recordParts(saved.recordWiki);
 const mismatch=fighter.recScope==='pro'&&pro&&history&&pro.some((n,i)=>n!==history[i]);
 const ttl=active.has(fighter.slug)||mismatch?12*3600000:7*86400000;
 const checked=Date.parse(saved.actualizado??'');
 return !Number.isFinite(checked)||now-checked>=ttl;
}
