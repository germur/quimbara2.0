import {normalizeName,sameFighterName} from './event-data.mjs';
import verifiedAliases from '../data/fighter-photo-aliases.json' with {type:'json'};
export const nameSlug=name=>String(name??'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/['’]/g,'').replace(/[^a-z0-9\s-]/g,'').trim().replace(/\s+/g,'-');
const tokens=name=>String(name??'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').split(/[^a-z0-9]+/).filter(w=>w&&!['jr','ii','iii'].includes(w)).sort().join('|');
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
 const aliases=[...(index.last.get(normalizeName(String(name).trim().split(/\s+/).at(-1)))??[])].filter(p=>sameFighterName(p.name,name));
 if(aliases.length)return unique(aliases);
 if(surname){
  const slug=nameSlug(name);
  return unique([...(index.partial.get(slug)??[])]);
 }
 return null;
}
export function createFighterMedia(fighters,photoPaths){
 const cache=new Map(),validPaths=new Set(photoPaths.values());
 return name=>{
  if(cache.has(name))return cache.get(name);
  const fighter=resolvePerson(name,fighters,{surname:true});
  const photo=fighter?.img&&validPaths.has(fighter.img)?fighter.img:photoPaths.get(fighter?.slug??nameSlug(name))??'';
  const value={fighter,photo};cache.set(name,value);return value;
 };
}
