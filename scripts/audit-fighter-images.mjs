import {readFileSync,existsSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import sharp from 'sharp';
import {resolvePerson,resolveBoutPerson} from '../src/lib/fighter-media.mjs';
import {publisherPlaceholder,publisherPlaceholderURL} from './lib/photo-validation.mjs';
import {resolvePhotoSource} from './lib/photo-sources.mjs';
const read=file=>JSON.parse(readFileSync(file,'utf8'));
const fighters=read('src/data/fighters.json'),extras=read('src/data/fighter-media-extra.json'),events=read('src/data/events-all.json'),people=[...fighters,...extras];
const refs=new Set(people.map(f=>f.img).filter(Boolean));
for(const e of events)for(const side of ['f1','f2'])if(e[side+'img'])refs.add(e[side+'img']);
const errors=[];
const sources=[...read('src/data/fighter-photo-sources.json').athletes,...read('src/data/fighter-photo-overrides.json')];
for(const person of people)if(person.img&&person.photoSource){
 if(publisherPlaceholderURL(person.photoSource.imageUrl))errors.push({path:person.img,error:'Publisher silhouette URL'});
 const snapshot=person.photoSource.athleteName?[{name:person.photoSource.athleteName,slug:person.photoSource.athleteSlug,profileUrl:person.photoSource.profileUrl,images:[person.photoSource.imageUrl,...(person.photoSource.sourceImages??[])]}]:sources;
 if(resolvePhotoSource(person,snapshot)?.profileUrl!==person.photoSource.profileUrl)errors.push({path:person.img,error:'Photo source does not preserve this athlete identity'});
}
const paths=[...refs];let cursor=0;
await Promise.all(Array.from({length:8},async()=>{
 while(cursor<paths.length){const path=paths[cursor++];
 try{
  if(!path.startsWith('/fighters/')||path.includes('..')||!existsSync('public'+path))throw new Error('Missing or invalid local asset');
  const meta=await sharp('public'+path).metadata();
  if(publisherPlaceholder(readFileSync('public'+path)))throw new Error('Publisher placeholder is not a real photograph');
  if(!meta.width||!meta.height||meta.width<64||meta.height<64)throw new Error('Invalid image dimensions');
  await sharp('public'+path).resize(1,1).toBuffer();
 }catch(error){errors.push({path,error:error.message});}
 }
}));
let renderedPages=0;
if(process.argv.includes('--dist')){
 const walk=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(join(dir,entry.name)):[join(dir,entry.name)]);
 for(const file of walk('dist').filter(file=>file.endsWith('.html'))){
  renderedPages++;
  for(const tag of readFileSync(file,'utf8').matchAll(/<img\b[^>]*>/g)){
   const src=tag[0].match(/\bsrc="([^"]+)"/)?.[1];
   if(!src?.startsWith('/')||src.startsWith('//'))continue;
   const pathname=decodeURIComponent(new URL(src.replaceAll('&amp;','&'),'https://quimbara.org').pathname);
   if(!existsSync(join('dist',pathname)))errors.push({file,path:pathname,error:'Rendered image points to a missing deployed asset'});
  }
 }
 const search=read('dist/fighters-index.json');
 for(const fighter of search)if(fighter.img&&!existsSync(join('dist',fighter.img)))errors.push({path:fighter.img,error:'Search index references a missing photograph'});
 const indexedSlugs=new Set(search.map(f=>f.slug));
 for(const f of fighters)if(f.img&&!indexedSlugs.has(f.slug))errors.push({path:f.img,error:'Photographed fighter missing from search'});
}
const missing=[];
for(const e of events)for(const f of e.fightCard??[])for(const side of ['f1','f2']){
 if(!f[side]||f[side]==='TBD')continue;
 const person=resolveBoutPerson(f[side],f[side+'StatsId']??f[side+'Id'],f.weightClass,people);
 if(!person?.img)missing.push({event:e.slug,name:f[side]});
}
console.log(JSON.stringify({checkedAssets:refs.size,renderedPages,errors,rankedWithoutPhoto:fighters.filter(f=>f.rank&&!f.img).map(f=>f.slug),eventHeroesWithoutPhoto:events.filter(e=>e.main!=='TBD'&&(!e.f1img||!e.f2img)).map(e=>e.slug),eventNamesWithoutPhoto:[...new Set(missing.map(f=>f.name))],fightersWithPhoto:fighters.filter(f=>f.img).length,mediaOnlyWithPhoto:extras.filter(f=>f.img).length},null,2));
if(errors.length)process.exitCode=1;
