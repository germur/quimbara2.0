import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {load} from 'cheerio';
import sharp from 'sharp';
import {resolvePerson,invalidatePersonIndex} from '../src/lib/fighter-media.mjs';
import {expandAnnouncedNames} from '../src/lib/event-data.mjs';
import {fetchBounded} from './lib/fetch.mjs';
import {recordHealth} from './lib/health.mjs';
import {publisherPlaceholder,publisherPlaceholderURL} from './lib/photo-validation.mjs';
import {syncPhotoSources} from './sync-photo-sources.mjs';
import {resolvePhotoSource} from './lib/photo-sources.mjs';
const read=(p,f)=>existsSync(p)?JSON.parse(readFileSync(p,'utf8')):f;
const fighters=read('src/data/fighters.json',[]),events=read('src/data/events-all.json',[]);
const failures=read('src/data/image-failures.json',{});
const sources=await syncPhotoSources();
const directoryProfiles=sources.athletes.length;
sources.athletes=[...sources.athletes,...read('src/data/fighter-photo-overrides.json',[])];
const validPath=path=>typeof path==='string'&&path.startsWith('/fighters/')&&!path.includes('..')&&existsSync('public'+path)&&!publisherPlaceholder(readFileSync('public'+path));
for(const f of fighters){
 if(f.img&&!validPath(f.img))f.img='';
 for(const ext of ['png','jpg','webp'])if(!f.img&&validPath(`/fighters/${f.slug}.${ext}`))f.img=`/fighters/${f.slug}.${ext}`;
}
// Media-only athletes must not create invented sporting profiles or records.
const addAlias=(person,name)=>{if(name!==person.name)person.photoAliases=[...new Set([...(person.photoAliases??[]),name])];};
const extras=read('src/data/fighter-media-extra.json',[]).filter(extra=>{
 const existing=fighters.find(f=>f.slug===extra.slug);
 if(existing){addAlias(existing,extra.name);return false;}return true;
});
for(const f of extras){
 if(f.img&&!validPath(f.img))f.img='';
 for(const ext of ['png','jpg','webp'])if(!f.img&&validPath(`/fighters/${f.slug}.${ext}`))f.img=`/fighters/${f.slug}.${ext}`;
}
const people=[...fighters,...extras];
for(const event of events)for(const name of [event.f1,event.f2,...(event.fightCard??[]).flatMap(f=>[f.f1,f.f2])]){
 if(!name||name==='TBD'||resolvePerson(name,people,{surname:true}))continue;
 const source=resolvePerson(name,sources.athletes);
 if(source){
  const existing=people.find(p=>p.slug===source.slug);
  if(existing){addAlias(existing,name);addAlias(existing,source.name);invalidatePersonIndex(people);}
  else{const extra={name:source.name,slug:source.slug,img:''};extras.push(extra);people.push(extra);}
 }
}
const eventPeople=new Set(events.flatMap(e=>[e.f1,e.f2,...(e.fightCard??[]).flatMap(f=>[f.f1,f.f2])]).map(n=>resolvePerson(n,people,{surname:true})?.slug).filter(Boolean));
const upcoming=new Set(events.filter(e=>e.date>=new Date().toISOString().slice(0,10)).flatMap(e=>[e.f1,e.f2,...(e.fightCard??[]).flatMap(f=>[f.f1,f.f2])]).map(n=>resolvePerson(n,people,{surname:true})?.slug).filter(Boolean));
const limit=Number(process.argv.find(a=>a.startsWith('--limit='))?.split('=')[1]??50);
if(!Number.isInteger(limit)||limit<1||limit>5000)throw new Error('Image batch limit must be between 1 and 5000');
const retry=process.argv.includes('--retry');
const batch=people.filter(f=>/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(f.slug)&&!f.img&&(retry||!failures[f.slug]?.retryAfter||Date.parse(failures[f.slug].retryAfter)<=Date.now()))
 .map(f=>({f,source:resolvePhotoSource(f,sources.athletes)}))
 .filter(({f,source})=>source?.images.length||f.rank||upcoming.has(f.slug))
 .sort((a,b)=>Number(upcoming.has(b.f.slug))-Number(upcoming.has(a.f.slug))||Number(Boolean(b.f.rank))-Number(Boolean(a.f.rank))||Number(eventPeople.has(b.f.slug))-Number(eventPeople.has(a.f.slug))).slice(0,limit);
let downloaded=0,failed=0,unavailable=0,attempted=0,blocked=false;
async function download({f,source}){
 attempted++;
 try{
  let urls=source?.images??[],profileUrl=source?.profileUrl??`https://www.ufc.com/athlete/${f.slug}`,athleteName=source?.name;
  if(new URL(profileUrl).hostname.endsWith('ufc.com')&&(!urls.length||f.rank||upcoming.has(f.slug))){
   const html=await(await fetchBounded(profileUrl,{headers:{'User-Agent':'Mozilla/5.0'}})).text();
   const $=load(html);
   const full=$('img').toArray().map(e=>$(e).attr('src')).filter(s=>s&&/athlete_bio_full_body|event_fight_card_upper_body/.test(s));
   const pageSource={name:$('h1').first().text().trim(),slug:new URL(profileUrl).pathname.split('/').at(-1),profileUrl,images:full.map(s=>new URL(s,profileUrl).href)};
   if(resolvePhotoSource(f,[pageSource])){urls=[...new Set([...pageSource.images,...urls])];athleteName=pageSource.name;}
   else if(!source)throw new Error('Profile identity not verified');
  }
  if(!urls.length)throw new Error('Official profile has no athlete photograph');
  let lastError;
  for(const url of urls){
   try{
    if(publisherPlaceholderURL(url))throw new Error('Publisher silhouette is not an athlete photograph');
    if(!['ufc.com','www.ufc.com','cdn.onefc.com'].includes(new URL(url).hostname))throw new Error('Unexpected photo host');
    const response=await fetchBounded(url),type=response.headers.get('content-type')??'';
    if(!type.startsWith('image/'))throw new Error('Non-image content');
    const bytes=Buffer.from(await response.arrayBuffer()),metadata=await sharp(bytes).metadata();
    if(publisherPlaceholder(bytes))throw new Error('Publisher silhouette is not an athlete photograph');
    if(bytes.length<1000||metadata.width<64||metadata.height<64)throw new Error('Invalid photograph dimensions');
    const ext='webp';
    const output=await sharp(bytes).resize({width:800,height:1200,fit:'inside',withoutEnlargement:true}).webp({quality:88}).toBuffer();
    writeFileSync(`public/fighters/${f.slug}.${ext}`,output);
    f.img=`/fighters/${f.slug}.${ext}`;
    f.photoSource={profileUrl,provider:source?.provider??'UFC',athleteName,athleteSlug:source?.slug??new URL(profileUrl).pathname.split('/').filter(Boolean).at(-1),sourceImages:source?.images??urls,imageUrl:url,checkedAt:new Date().toISOString()};
    delete failures[f.slug];downloaded++;console.log('Downloaded',f.slug);return;
   }catch(error){lastError=error;if(/HTTP 403|HTTP 429/.test(error.message))throw error;}
  }
  throw lastError;
 }catch(error){
  if(/silhouette|has no athlete photograph|identity not verified/.test(error.message))unavailable++;else failed++;
  failures[f.slug]={error:error.message,lastAttempt:new Date().toISOString(),retryAfter:new Date(Date.now()+7*86400000).toISOString()};
  if(/HTTP 403|HTTP 429/.test(error.message))blocked=true;
  console.error(f.slug,error.message);
 }
}
let cursor=0;
await Promise.all(Array.from({length:3},async()=>{
 while(cursor<batch.length&&!blocked){const task=batch[cursor++];await download(task);await new Promise(r=>setTimeout(r,250));}
}));
for(const f of people)if(f.img)delete failures[f.slug];
writeFileSync('src/data/fighters.json',JSON.stringify(fighters,null,2)+'\n');
writeFileSync('src/data/fighter-media-extra.json',JSON.stringify(extras,null,2)+'\n');
writeFileSync('src/data/image-failures.json',JSON.stringify(failures,null,2)+'\n');
for(const file of ['src/data/events-all.json','src/data/events.json']){
 const list=read(file,[]);
 for(const e of list){
  const names=expandAnnouncedNames(e);
  for(const side of ['f1','f2'])e[side+'img']=resolvePerson(names[side],people,{surname:true})?.img??'';
 }
 writeFileSync(file,JSON.stringify(list,null,2)+'\n');
}
recordHealth('images',failed===0,{attempted,downloaded,failed,unavailable,pendingRetries:Object.keys(failures).length,directoryProfiles,remaining:people.filter(f=>!f.img).length});
console.log({attempted,downloaded,failed,unavailable,pendingRetries:Object.keys(failures).length});
if(failed)process.exitCode=1;
