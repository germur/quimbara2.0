export const normalizeName = s => String(s??'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
export const fightKey = f => [normalizeName(f.f1),normalizeName(f.f2)].sort().join('|');
export function expandAnnouncedNames(event) {
  const own=[event.f1,event.f2];
  const compatible=(short,full)=>normalizeName(short)===normalizeName(full)||
    (String(short).trim().split(/\s+/).length===1&&normalizeName(full).endsWith(normalizeName(short))&&normalizeName(short).length>=4);
  const pairs=(event.fightCard??[]).flatMap(f=>[[f.f1,f.f2],[f.f2,f.f1]])
    .filter(pair=>pair.every((name,i)=>compatible(own[i],name)));
  if(pairs.length!==1)return {f1:event.f1,f2:event.f2};
  return {f1:pairs[0][0],f2:pairs[0][1]};
}
export function preserveFightCorners(incoming,previous) {
  const old=previous.find(f=>fightKey(f)===fightKey(incoming));
  return old?{...incoming,f1:old.f1,f2:old.f2,
    ...(old.f1Id?{f1Id:old.f1Id}:{}),...(old.f2Id?{f2Id:old.f2Id}:{})}:incoming;
}
export function sameFighterName(a,b) {
    if(normalizeName(a)===normalizeName(b))return true;
    const x=String(a).split(/\s+/),y=String(b).split(/\s+/);
    if(x.length<2||y.length<2)return false;
    const firstA=normalizeName(x[0]),firstB=normalizeName(y[0]);
    return normalizeName(x.at(-1))===normalizeName(y.at(-1))&&Math.min(firstA.length,firstB.length)>=3&&(firstA.startsWith(firstB)||firstB.startsWith(firstA));
}
export function matchesProviderFight(competition,event) {
  const source=competition.competitors?.map(x=>x.athlete?.displayName)??[];
  const own=[event.f1,event.f2];
  return source.length===2&&[source,[...source].reverse()].some(pair=>pair.every((name,i)=>sameFighterName(name,own[i])));
}
export function rankingCoverageValid(count,divisions,previous) {
  return count>=100&&divisions>=8&&count>=previous*0.75;
}
export function validDate(s) {
  if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;
  const d=new Date(s+'T00:00:00Z');
  return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s;
}
export const validTime = s => typeof s==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(s);
export function eventStatus(e,today=new Date().toISOString().slice(0,10)) {
  if(['cancelled','postponed'].includes(e.status))return e.status;
  return e.date<today?'past':'upcoming';
}
export function schemaStatus(e) {
  return 'https://schema.org/'+({cancelled:'EventCancelled',postponed:'EventPostponed',rescheduled:'EventRescheduled'}[e.status]??'EventScheduled');
}
export function cardChanges(before,after) {
  const a=new Map(before.map(f=>[fightKey(f),f])),b=new Map(after.map(f=>[fightKey(f),f]));
  return {
    added:[...b].filter(([k])=>!a.has(k)).map(([,f])=>`${f.f1} vs. ${f.f2}`),
    removed:[...a].filter(([k])=>!b.has(k)).map(([,f])=>`${f.f1} vs. ${f.f2}`),
  };
}
export function imageQueue(fighters,events,failures={},now=Date.now()) {
  const active=new Set(events.filter(e=>e.date>=new Date(now).toISOString().slice(0,10)).flatMap(e=>[e.f1,e.f2,...(e.fightCard??[]).flatMap(f=>[f.f1,f.f2])]).map(normalizeName));
  return fighters.filter(f=>!f.img&&(f.rank||active.has(normalizeName(f.name))))
    .filter(f=>!failures[f.slug]?.retryAfter||Date.parse(failures[f.slug].retryAfter)<=now)
    .sort((a,b)=>Number(active.has(normalizeName(b.name)))-Number(active.has(normalizeName(a.name)))||Number(Boolean(b.rank))-Number(Boolean(a.rank)));
}
