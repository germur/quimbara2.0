import aliases from '../../src/data/fighter-photo-aliases.json' with {type:'json'};
import {normalizeName} from '../../src/lib/event-data.mjs';
import {resolvePerson,sameMediaName} from '../../src/lib/fighter-media.mjs';
import {publisherPlaceholderURL} from './photo-validation.mjs';
const words=name=>String(name).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().split(/[^a-z]+/).filter(w=>w&&!['jr','ii','iii'].includes(w));
const indexes=new WeakMap();
function filenameWords(url){
 let pathname=new URL(url).pathname;
 for(let i=0;i<3;i++){const decoded=decodeURIComponent(pathname);if(decoded===pathname)break;pathname=decoded;}
 return words(pathname.replace(/([a-z])([A-Z])/g,'$1 $2'));
}
function indexSources(sources){
 if(indexes.has(sources))return indexes.get(sources);
 const index={slugs:new Map(),files:new Map(),tokens:new Map()};
 for(const source of sources){
  index.slugs.set(source.slug,source);
  const tokens=source.images.filter(url=>!publisherPlaceholderURL(url)).map(url=>new Set(filenameWords(url)));
  index.tokens.set(source,tokens);
  for(const word of new Set(tokens.flatMap(t=>[...t]))){const list=index.files.get(word)??new Set();list.add(source);index.files.set(word,list);}
 }
 indexes.set(sources,index);return index;
}
export function resolvePhotoSource(person,sources){
 if(person.identityAmbiguousName){
  if(!person.ufcProfileUrl)return null;
  sources=sources.filter(source=>source.profileUrl===person.ufcProfileUrl);
 }
 const index=indexSources(sources),parts=words(person.name);
 const filenameMatches=source=>parts.length>=2&&index.tokens.get(source).some(tokens=>parts.every(word=>tokens.has(word)));
 const names=[person.name,...(person.photoAliases??[])];
 const verified=source=>names.some(name=>sameMediaName(name,source.name))||
  aliases.some(alias=>(person.slug===alias.slug||names.some(name=>normalizeName(name)===normalizeName(alias.alias)))&&source.slug===alias.slug)||filenameMatches(source);
 const direct=index.slugs.get(person.slug);
 if(direct&&verified(direct))return direct;
 const candidates=new Set(names.map(name=>resolvePerson(name,sources)).filter(Boolean));
 if(parts.length>=2)for(const source of index.files.get(parts[0])??[])if(filenameMatches(source))candidates.add(source);
 const valid=[...candidates].filter(verified);
 return valid.length===1?valid[0]:null;
}
