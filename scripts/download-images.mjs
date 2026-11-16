import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {load} from 'cheerio';
import {imageQueue,normalizeName} from '../src/lib/event-data.mjs';
import {fetchBounded} from './lib/fetch.mjs';
import {recordHealth} from './lib/health.mjs';
const read=(p,f)=>existsSync(p)?JSON.parse(readFileSync(p,'utf8')):f;
const fighters=read('src/data/fighters.json',[]),events=read('src/data/events-all.json',[]);
const failures=read('src/data/image-failures.json',{});
// Recover references to existing assets before contacting the upstream.
for(const f of fighters)for(const ext of ['png','jpg','webp'])
  if(!f.img&&existsSync(`public/fighters/${f.slug}.${ext}`))f.img=`/fighters/${f.slug}.${ext}`;
const batch=imageQueue(fighters,events,failures).slice(0,50);
let downloaded=0,failed=0,attempted=0;
for(const f of batch) {
  attempted++;
  try {
    const html=await(await fetchBounded(`https://www.ufc.com/athlete/${f.slug}`,{headers:{'User-Agent':'Mozilla/5.0'}})).text();
    const $=load(html);
    const src=$('img').toArray().map(e=>$(e).attr('src')).find(s=>s?.includes('athlete_bio_full_body'))??$('meta[property="og:image"]').attr('content');
    if(!src)throw new Error('Image not published');
    const url=new URL(src,'https://www.ufc.com').href;
    const response=await fetchBounded(url);
    const type=response.headers.get('content-type')??'';
    if(!type.startsWith('image/'))throw new Error('Non-image content');
    const bytes=Buffer.from(await response.arrayBuffer());
    if(bytes.length<1000)throw new Error('Empty or invalid image');
    const ext=type.includes('png')?'png':type.includes('webp')?'webp':'jpg';
    writeFileSync(`public/fighters/${f.slug}.${ext}`,bytes);
    f.img=`/fighters/${f.slug}.${ext}`;delete failures[f.slug];downloaded++;
  }catch(error){
    failed++;
    failures[f.slug]={error:error.message,lastAttempt:new Date().toISOString(),retryAfter:new Date(Date.now()+(/HTTP 404|Image not published/.test(error.message)?7*86400000:3600000)).toISOString()};
    console.error(f.slug,error.message);
    if(downloaded===0&&failed>=3&&/HTTP 403|HTTP 429/.test(error.message))break;
  }
  await new Promise(resolve=>setTimeout(resolve,1100));
}
writeFileSync('src/data/fighters.json',JSON.stringify(fighters,null,2)+'\n');
writeFileSync('src/data/image-failures.json',JSON.stringify(failures,null,2)+'\n');
const photos=new Map(fighters.filter(f=>f.img).map(f=>[normalizeName(f.name),f.img]));
for(const file of ['src/data/events-all.json','src/data/events.json']){
 const list=read(file,[]);for(const e of list){e.f1img=photos.get(normalizeName(e.f1))??e.f1img??'';e.f2img=photos.get(normalizeName(e.f2))??e.f2img??'';}
 writeFileSync(file,JSON.stringify(list,null,2)+'\n');
}
recordHealth('images',failed===0,{attempted,downloaded,failed,pendingRetries:Object.keys(failures).length});
console.log({attempted,downloaded,failed,pendingRetries:Object.keys(failures).length});
if(failed)process.exitCode=1;
