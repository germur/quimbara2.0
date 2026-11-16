import fs from 'node:fs';
import {parse} from 'csv-parse/sync';
import {load} from 'cheerio';
import {fetchBounded} from './lib/fetch.mjs';
import {sourceId,identityName,identitySlug} from './lib/fighter-identity.mjs';
const file='src/data/fighter-identities.json';
const previous=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)): {profiles:{},fights:{}};
const base='https://raw.githubusercontent.com/Greco1899/scrape_ufc_stats/main/';
const readCSV=async name=>parse(await(await fetchBounded(base+name)).text(),{columns:true,skip_empty_lines:true,relax_quotes:true});
const [rows,fights,eventCSV]=await Promise.all([readCSV('ufc_fighter_tott.csv'),readCSV('ufc_fight_results.csv'),readCSV('ufc_event_details.csv')]);
const dates=new Map(eventCSV.map(e=>[e.EVENT?.trim(),new Date(e.DATE).toISOString().slice(0,10)]));
const sources=JSON.parse(fs.readFileSync('src/data/fighter-photo-sources.json')).athletes;
const groups=new Map();for(const p of rows){const list=groups.get(p.FIGHTER.trim())??[];list.push(p);groups.set(p.FIGHTER.trim(),list);}
const registry={...previous,profiles:{...previous.profiles},fights:{...previous.fights},checkedAt:new Date().toISOString()};
let sourceFailures=0;
const inches=s=>{const m=String(s).match(/(\d+)'\s*(\d+)/);return m?+m[1]*12 + +m[2]:null;};
for(const [name,profiles] of groups){
 if(profiles.length<2)continue;
 const candidates=sources.filter(s=>identityName(s.name)===identityName(name));
 const matches=new Map(),officialResults=[];
 for(const candidate of candidates){
  try{
   const html=await(await fetchBounded(candidate.profileUrl)).text(),$=load(html),fields={};
   $('.c-bio__field').each((_,el)=>fields[$(el).find('.c-bio__label').text().trim().toLowerCase()]=$(el).find('.c-bio__text').text().trim());
   const height=parseFloat(fields.height??fields.alto),weight=parseFloat(fields.weight??fields.peso),reach=parseFloat(fields.reach??fields.alcance),age=parseFloat(fields.age??fields['años']);
   const compatible=profiles.filter(p=>{
    const born=Number(p.DOB.match(/\d{4}/)?.[0]),expectedAge=new Date().getUTCFullYear()-born;
    const signals=[inches(p.HEIGHT)!==null&&Math.abs(inches(p.HEIGHT)-height)<0.5,Math.abs(parseFloat(p.WEIGHT)-weight)<=1,Math.abs(parseFloat(p.REACH)-reach)<0.5,born&&Number.isFinite(age)&&Math.abs(expectedAge-age)<=1];
    return signals.filter(Boolean).length>=2;
   });
   if(compatible.length!==1)continue;
   const profile=compatible[0],id=sourceId(profile.URL),record=$('.hero-profile__division-body').first().text().match(/\d+-\d+-\d+/)?.[0];
   matches.set(id,{ufcProfileUrl:candidate.profileUrl,record,checkedAt:registry.checkedAt});
   let page=0,doc=$;
   while(page<30){
    const cards=doc('#athlete-record .c-card-event--athlete-results');
    for(const el of cards.toArray()){
     const date=new Date(doc(el).find('.c-card-event--athlete-results__date').text().trim());
     if(Number.isFinite(date.getTime()))officialResults.push({id,date:date.toISOString().slice(0,10)});
    }
    const next=doc('#athlete-record .pager a[rel=next]').attr('href')??doc('#athlete-record .pager a').last().attr('href');
    if(!next||!cards.length)break;
    page++;doc=load(await(await fetchBounded(new URL(next,candidate.profileUrl).href)).text());
   }
  }catch(error){sourceFailures++;console.error(candidate.profileUrl,error.message);}
 }
 let canonical=profiles.find(p=>matches.get(sourceId(p.URL))?.ufcProfileUrl.split('/').filter(Boolean).at(-1)===identitySlug(name));
 canonical??=profiles.filter(p=>matches.has(sourceId(p.URL))).length===1?profiles.find(p=>matches.has(sourceId(p.URL))):profiles.at(-1);
 for(const p of profiles){
  const id=sourceId(p.URL),birth=String(p.DOB).match(/\b(19\d\d|20\d\d)\b/)?.[1];
  const official=matches.get(id),officialSlug=official?.ufcProfileUrl.split('/').filter(Boolean).at(-1);
  const suffix=officialSlug&&officialSlug!==identitySlug(name)?officialSlug:identitySlug(name)+'-'+(birth??id.slice(0,8));
  registry.profiles[id]={...registry.profiles[id],name,sourceUrl:p.URL,slug:registry.profiles[id]?.slug??(p===canonical?identitySlug(name):suffix),...official};
 }
 const relevant=fights.filter(f=>f.BOUT?.split(/\s+vs\.?\s+/).map(n=>n.trim()).includes(name));
 for(const result of officialResults){
  // Event CSV dates can use UTC while the official athlete card uses local date.
  const found=relevant.filter(f=>Math.abs(Date.parse(dates.get(f.EVENT?.trim()))-Date.parse(result.date))<=86400000);
  if(found.length!==1)continue;
  const fight=found[0],names=fight.BOUT.split(/\s+vs\.?\s+/).map(n=>n.trim()),side=names.indexOf(name);
  if(side===-1||names[0]===names[1])continue;
  const saved=registry.fights[fight.URL]??[null,null];
  if(saved[side]&&saved[side]!==result.id)throw new Error('Conflicting athlete identity for '+fight.URL);
  saved[side]=result.id;registry.fights[fight.URL]=saved;
 }
 console.log(name,':',profiles.length,'identities,',matches.size,'verified official profiles,',relevant.filter(f=>registry.fights[f.URL]?.some(Boolean)).length+'/'+relevant.length,'bouts mapped');
}
if(sourceFailures)throw new Error('Official identity source failed; previous registry retained');
fs.writeFileSync(file,JSON.stringify(registry,null,2)+'\n');
