import {canonicalEvents,eventPath} from './event-routing.mjs';
import {expandAnnouncedNames,normalizeName,sameFighterName,validDate} from './event-data.mjs';
import {resolveBoutPerson} from './fighter-media.mjs';
import {bogotaDate,CARD_MAX_AGE} from './upcoming-fights.mjs';

export function fighterAnswer(f,{heightCm,reachCm,division=''}) {
 const clauses=[];
 if(Number.isFinite(heightCm)&&heightCm>0)clauses.push(`${f.name} mide ${heightCm} cm${Number.isFinite(reachCm)&&reachCm>0?` y tiene ${reachCm} cm de alcance`:''}.`);
 else if(Number.isFinite(reachCm)&&reachCm>0)clauses.push(`${f.name} tiene ${reachCm} cm de alcance.`);
 if(!f.recordUnavailable&&/^(\d+)-(\d+)-(\d+)$/.test(f.rec)&&['pro','ufc'].includes(f.recScope))clauses.push(`${clauses.length?'Su récord':`${f.name} tiene un récord`} ${f.recScope==='pro'?'profesional':'en UFC'} ${clauses.length?'es':'de'} ${f.rec}.`);
 if(division)clauses.push(`División registrada: ${division}.`);
 return clauses.join(' ')||`Consulta los datos disponibles de ${f.name} y sus fuentes en esta ficha.`;
}

const nextCache=new WeakMap();
export function nextFightLookup(events,people,now=Date.now()) {
 const bucket=Math.floor(now/60000),cached=nextCache.get(events);
 if(cached?.people===people&&cached.bucket===bucket)return cached.map;
 const map=new Map(),today=bogotaDate(now);
 for(const event of canonicalEvents(events)){
  const checked=Date.parse(event.cardCheckedAt);
  if(!validDate(event.date)||event.date<today||['unconfirmed','cancelled','postponed'].includes(event.status)||event.cardFetchError||!Number.isFinite(checked)||checked>now||now-checked>=CARD_MAX_AGE)continue;
  for(const bout of event.fightCard??[]){
   if(bout.sourceStatus!=='STATUS_SCHEDULED'||['cancelled','postponed','withdrawn','completed'].includes(bout.status)||[bout.f1,bout.f2].some(n=>!normalizeName(n)||['tbd','tba','opponenttba','opponenttbd','porconfirmar'].includes(normalizeName(n))))continue;
   for(const [side,other] of [['f1','f2'],['f2','f1']]){
    const person=resolveBoutPerson(bout[side],bout[side+'StatsId']??bout[side+'Id'],bout.weightClass,people);
    if(person&&!map.has(person.slug))map.set(person.slug,{opponent:bout[other],date:event.date,dateLabel:event.dateLabel,event:event.name,href:eventPath(event.slug)});
   }
  }
 }
 nextCache.set(events,{people,bucket,map});return map;
}

export function comparisonAnswer(a,b) {
 const clauses=[];
 for(const [field,label,equal] of [['altura_cm','estatura','miden'],['alcance_cm','alcance','tienen un alcance de']]){
  const x=a.fisico[field],y=b.fisico[field];if(!Number.isFinite(x)||!Number.isFinite(y)||x<=0||y<=0)continue;
  clauses.push(x===y?`Ambos ${equal} ${x} cm.`:`${a.nombre} tiene ${x} cm de ${label} y ${b.nombre}, ${y} cm: ${x>y?a.nombre:b.nombre} registra ${Math.abs(x-y)} cm más.`);
 }
 return clauses.join(' ')||`Compara los datos disponibles de ${a.nombre} y ${b.nombre}.`;
}

export function resultsForEvent(event,results) {
 if(!validDate(event.date)||event.date>=bogotaDate(Date.now()))return [];
 const names=expandAnnouncedNames(event);
 const candidates=results.filter(r=>normalizeName(String(r.event).split(/\s+[-–:]\s+/)[0])===normalizeName(event.name)&&['win','draw','nc'].includes(r.outcome)&&r.sourceUrl&&Date.parse(r.checkedAt)>=Date.parse(event.date));
 const matches=candidates.some(r=>[[r.w,r.l],[r.l,r.w]].some(pair=>pair.every((name,i)=>sameFighterName(name,names[['f1','f2'][i]]))));
 return matches?candidates:[];
}
