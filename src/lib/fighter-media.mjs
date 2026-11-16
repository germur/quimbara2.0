import {normalizeName,expandAnnouncedNames} from './event-data.mjs';
import verifiedAliases from '../data/fighter-photo-aliases.json' with {type:'json'};
export const nameSlug=name=>String(name??'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/['’]/g,'').replace(/[^a-z0-9\s-]/g,'').trim().replace(/\s+/g,'-');
const tokens=name=>String(name??'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').split(/[^a-z0-9]+/).filter(w=>w&&!['jr','ii','iii'].includes(w)).sort().join('|');
export function sameMediaName(a,b){
 if(normalizeName(a)===normalizeName(b)||tokens(a)===tokens(b))return true;
 const words=String(a??'').split(/[\s-]+/).filter(Boolean);
 return words.some((_,i)=>normalizeName([...words.slice(i),...words.slice(0,i)].join(''))===normalizeName(b));
}
const indexes=new WeakMap();
export const invalidatePersonIndex=people=>indexes.delete(people);
function indexPeople(people){
 let index=indexes.get(people);if(index?.count===people.length)return index;
 index={count:people.length,exact:new Map(),ordered:new Map(),rotated:new Map(),last:new Map(),partial:new Map()};
 const add=(map,key,p)=>{const entries=map.get(key)??new Set();entries.add(p);map.set(key,entries);};
 for(const p of people){
  add(index.exact,normalizeName(p.name),p);add(index.exact,normalizeName(p.slug),p);
  for(const alias of p.photoAliases??[])add(index.exact,normalizeName(alias),p);
  add(index.ordered,tokens(p.name),p);
  const words=String(p.name).split(/[\s-]+/).filter(Boolean);
  for(let i=0;i<words.length;i++)add(index.rotated,normalizeName([...words.slice(i),...words.slice(0,i)].join('')),p);
  add(index.last,normalizeName(String(p.name).trim().split(/\s+/).at(-1)),p);
  const pieces=String(p.slug??'').split('-');
  for(let i=1;i<pieces.length;i++){add(index.partial,pieces.slice(0,i).join('-'),p);add(index.partial,pieces.slice(i).join('-'),p);}
 }
 for(const alias of verifiedAliases){
  const match=people.find(p=>p.slug===alias.slug);
  if(match)add(index.exact,normalizeName(alias.alias),match);
 }
 indexes.set(people,index);return index;
}
export function resolvePerson(name,people,{surname=false}={}){
 if(!name||name==='TBD')return null;
 const unique=items=>items.length===1?items[0]:null,index=indexPeople(people);
 const exact=[...(index.exact.get(normalizeName(name))??[])];
 if(exact.length)return unique(exact);
 const ordered=[...(index.ordered.get(tokens(name))??[])];
 if(ordered.length)return unique(ordered);
 const rotated=[...(index.rotated.get(normalizeName(name))??[])];
 if(rotated.length)return unique(rotated);
 if(surname){
  const slug=nameSlug(name);
  return unique([...(index.partial.get(slug)??[])]);
 }
 return null;
}
export function createFighterMedia(fighters,photoPaths){
 const cache=new Map(),validPaths=new Set(photoPaths.values());
 return (name,id='',division='')=>{
  const key=name+'|'+id+'|'+division;
  if(cache.has(key))return cache.get(key);
  const fighter=resolveBoutPerson(name,id,division,fighters);
  const photo=fighter?.img&&validPaths.has(fighter.img)?fighter.img:fighter?.identityAmbiguousName?'':photoPaths.get(fighter?.slug??nameSlug(name))??'';
  const value={fighter,photo};cache.set(key,value);return value;
 };
}
export function resolveBoutPerson(name,id,division,people){
 const exact=resolvePerson(name,people,{surname:true});
 if(exact)return exact;
 const candidates=people.filter(p=>sameMediaName(p.name,name));
 const inDivision=candidates.filter(p=>division&&String(division).toLowerCase().includes(String(p.div).toLowerCase())&&p.div);
 if(inDivision.length===1)return inDivision[0];
 const identified=candidates.filter(p=>id&&(p.slug===id||p.ufcStatsId===id));
 return identified.length===1?identified[0]:null;
}
export function resolveEventPerson(event,side,people){
 const names=expandAnnouncedNames(event),card=(event.fightCard??[]).find(f=>f.bout==='Main Event')??event.fightCard?.[0];
 const cardSide=card&&sameMediaName(names[side],card.f1)?'f1':card&&sameMediaName(names[side],card.f2)?'f2':null;
 return resolveBoutPerson(names[side],cardSide?card[cardSide+'StatsId']??card[cardSide+'Id']:'',cardSide?card.weightClass:'',people);
}
