import fs from 'node:fs';
import {load} from 'cheerio';
import {fetchBounded} from './lib/fetch.mjs';
import {recordHealth} from './lib/health.mjs';
import {resolvePhotoSource} from './lib/photo-sources.mjs';
import {parseUfcProfile} from './lib/ufc-profile.mjs';
import {isIndexable} from '../src/lib/indexable.mjs';
import {preserveRecordScope} from './lib/record-sanity.mjs';
import {activeFighterSlugs} from './lib/history-refresh.mjs';
const read=p=>JSON.parse(fs.readFileSync(p));
const fighters=read('src/data/fighters.json'),events=read('src/data/events-all.json');
const sources=read('src/data/fighter-photo-sources.json').athletes;
const named=activeFighterSlugs(fighters,events);
const only=process.argv.find(a=>a.startsWith('--slug='))?.slice(7).split(','),force=process.argv.includes('--force');
const limit=Number(process.argv.find(a=>a.startsWith('--limit='))?.split('=')[1]??100);
if(!Number.isInteger(limit)||limit<1||limit>5000)throw new Error('Invalid record batch limit');
const priority=f=>Boolean(f.rank||named.has(f.slug));
const targets=fighters.filter(f=>only?only.includes(f.slug):(isIndexable(f)||f.img||priority(f)))
 .filter(f=>force||only||(!f.recordRetryAfter||Date.parse(f.recordRetryAfter)<=Date.now())&&Date.now()-Date.parse(f.recordCheckedAt??'1970-01-01')>(named.has(f.slug)?12*3600000:priority(f)?86400000:30*86400000))
 .sort((a,b)=>Number(named.has(b.slug))-Number(named.has(a.slug))||Number(priority(b))-Number(priority(a))||Date.parse(a.recordCheckedAt??'1970-01-01')-Date.parse(b.recordCheckedAt??'1970-01-01')).slice(0,limit);
let updated=0,unavailable=0,errors=0;
for(const f of targets){
 const source=resolvePhotoSource(f,sources);
 const url=f.ufcProfileUrl??source?.profileUrl;
 f.recordAttemptedAt=new Date().toISOString();
 if(!url){unavailable++;f.recordRetryAfter=new Date(Date.now()+7*86400000).toISOString();continue;}
 try{
  const html=await(await fetchBounded(url,{headers:{'User-Agent':'QuimbaraBot/1.0 (https://quimbara.org)'}})).text(),$=load(html),profile=parseUfcProfile(html);
  const images=$('img').toArray().map(e=>$(e).attr('src')).filter(Boolean).map(src=>new URL(src,url).href);
  const verified=resolvePhotoSource(f,[{name:profile.name,slug:new URL(url).pathname.split('/').filter(Boolean).at(-1),profileUrl:url,images}]);
  if(!profile.rec||!verified){unavailable++;f.recordRetryAfter=new Date(Date.now()+7*86400000).toISOString();console.error('Record unavailable or identity unverified:',f.slug);continue;}
  f.rec=profile.rec;f.recScope='pro';f.recordSourceUrl=url;f.recordCheckedAt=new Date().toISOString();f.ufcProfileUrl=url;delete f.recordUnavailable;delete f.recordRetryAfter;preserveRecordScope(f);updated++;
  console.log(f.slug,f.rec);
 }catch(error){errors++;console.error(f.slug,error.message);if(/HTTP 403|HTTP 429/.test(error.message))break;}
 await new Promise(resolve=>setTimeout(resolve,1000));
}
if(errors>=3&&errors>updated)throw new Error('Record source failure; candidate records not saved');
fs.writeFileSync('src/data/fighters.json',JSON.stringify(fighters,null,2)+'\n');
recordHealth('records',errors===0,{attempted:targets.length,updated,unavailable,errors});
console.log({attempted:targets.length,updated,unavailable,errors});if(errors)process.exitCode=1;
