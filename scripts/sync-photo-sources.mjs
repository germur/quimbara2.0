import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {load} from 'cheerio';
import {pathToFileURL} from 'node:url';
import {fetchBounded} from './lib/fetch.mjs';
export const SOURCE_FILE='src/data/fighter-photo-sources.json';
export function parseDirectory(html,url){
 const $=load(html);
 const athletes=$('.c-listing-athlete-flipcard').toArray().map(el=>{
  const card=$(el),href=card.find('a[href*="/athlete/"]').first().attr('href');
  if(!href)return null;
  const profileUrl=new URL(href,url).href;
  const images=[...new Set(card.find('img').toArray().map(img=>$(img).attr('src')).filter(src=>src&&!/no-profile|placeholder|default|shadow|coming.?soon/i.test(src)).map(src=>new URL(src,url).href))];
  images.sort((a,b)=>Number(/upper_body|full_body/.test(b))-Number(/upper_body|full_body/.test(a)));
  return {name:card.find('.c-listing-athlete__name').first().text().trim(),slug:new URL(profileUrl).pathname.split('/').filter(Boolean).at(-1),profileUrl,images};
 }).filter(Boolean);
 return {athletes,next:$('.pager a[rel=next]').attr('href')??$('.pager a').filter((_,el)=>/page=/.test($(el).attr('href')??'')).last().attr('href')};
}
export async function syncPhotoSources({force=false}={}){
 const previous=existsSync(SOURCE_FILE)?JSON.parse(readFileSync(SOURCE_FILE,'utf8')):null;
 if(!force&&previous?.complete&&Date.now()-Date.parse(previous.checkedAt)<30*86400000)return previous;
 const entries=new Map(),visited=new Set();
 let url='https://www.ufc.com/athletes/all',pages=0;
 while(url){
  if(visited.has(url)||pages>=500)throw new Error('Incomplete athlete directory pagination');
  visited.add(url);
  const parsed=parseDirectory(await(await fetchBounded(url)).text(),url);
  if(!parsed.athletes.length&&pages===0)throw new Error('Empty athlete directory; previous sources retained');
  for(const athlete of parsed.athletes)entries.set(athlete.slug,athlete);
  pages++;
  if(pages%25===0)console.log('Athlete directory:',pages,'pages,',entries.size,'profiles');
  url=parsed.next?new URL(parsed.next,url).href:null;
  if(url&&!url.startsWith('https://www.ufc.com/athletes/all'))throw new Error('Unexpected directory pagination host');
 }
 if(entries.size<100||previous&&entries.size<previous.athletes.length*0.75)throw new Error('Athlete directory coverage collapsed; previous sources retained');
 const result={checkedAt:new Date().toISOString(),complete:true,pages,athletes:[...entries.values()]};
 writeFileSync(SOURCE_FILE,JSON.stringify(result,null,2)+'\n');
 console.log('Saved official photo directory:',result.athletes.length,'athletes');
 return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await syncPhotoSources({force:process.argv.includes('--force')});
