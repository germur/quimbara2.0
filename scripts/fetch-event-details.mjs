// ESPN is a supplementary, attributed source. Match the announced main fight;
// never replace an event just because it shares a calendar date.
import {readFileSync,writeFileSync} from 'node:fs';
import {normalizeName,fightKey,cardChanges,validDate,matchesProviderFight,preserveFightCorners,expandAnnouncedNames,sameFighterName} from '../src/lib/event-data.mjs';
import {canonicalEvents} from '../src/lib/event-routing.mjs';
import {fetchBounded} from './lib/fetch.mjs';
import {recordHealth} from './lib/health.mjs';
import {cardCoverage,namedBouts} from './lib/card-coverage.mjs';

const events=JSON.parse(readFileSync('src/data/events-all.json','utf8'));
const fighters=JSON.parse(readFileSync('src/data/fighters.json','utf8'));
const fullName=name=>{const exact=fighters.find(f=>normalizeName(f.name)===normalizeName(name));if(exact)return exact.name;const found=fighters.filter(f=>normalizeName(f.name).endsWith(normalizeName(name)));const ranked=found.filter(f=>f.rank);return found.length===1?found[0].name:ranked.length===1?ranked[0].name:name;};
const today=new Date().toISOString().slice(0,10);
let failed=0,updated=0;
const partial=[];
for(const event of canonicalEvents(events).filter(e=>validDate(e.date)&&e.date>=today&&Date.parse(e.date)-Date.now()<60*86400000&&e.main!=='TBD')) {
  Object.assign(event,expandAnnouncedNames(event));
  event.f1=fullName(event.f1);event.f2=fullName(event.f2);event.main=event.f1+' vs. '+event.f2;
  for(const corner of ['f1','f2']){
    const matches=fighters.filter(f=>sameFighterName(f.name,event[corner]));
    event[corner+'img']=matches.length===1?matches[0].img:'';
  }
  const url='https://site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard?dates='+event.date.replaceAll('-','');
  try {
    const data=await(await fetchBounded(url)).json();
    const match=(data.events??[]).find(e=>(!event.espnEventId||String(e.id)===String(event.espnEventId))&&e.competitions?.some(c=>matchesProviderFight(c,event)));
    if(!match)throw new Error('No matching main fight; previous card retained');
    const raw=match.competitions;
    if(!Array.isArray(raw)||!raw.length)throw new Error('Empty competition list');
    const starts=raw.map(c=>c.date).filter(Boolean).sort();
    const first=starts[0],last=starts.at(-1);
    const hasSegments=first!==last;
    const fights=[...raw].reverse().map(c=>{
      const names=c.competitors?.map(x=>x.athlete?.displayName);
      if(names?.length!==2||!names.every(Boolean))throw new Error('Invalid fighter pair');
      const isMain=matchesProviderFight(c,event);
      // Preserve the site's announced main-fight orientation.
      return preserveFightCorners({f1:isMain?event.f1:names[0],f2:isMain?event.f2:names[1],sourceFightId:String(c.id),
        weightClass:c.type?.abbreviation??'',bout:isMain?'Main Event':hasSegments&&c.date===first?'prelim':'maincard',order:0,
        sourceStartUTC:c.date,sourceStatus:c.status?.type?.name??'UNKNOWN',segmentInferred:true}, event.fightCard??[]);
    }).sort((a,b)=>Number(b.bout==='Main Event')-Number(a.bout==='Main Event')||String(b.sourceStartUTC).localeCompare(String(a.sourceStartUTC)));
    const namedFights=namedBouts(fights);
    namedFights.forEach((f,i)=>f.order=i);
    if(new Set(namedFights.map(fightKey)).size!==namedFights.length)throw new Error('Duplicate fighter pairs');
    const coverage=cardCoverage(event,namedFights);
    if(coverage==='reject')throw new Error('Unexpected card collapse or conflicting data; previous card retained');
    const checked=new Date().toISOString();
    const primary=events.find(e=>e.slug===event.slug);
    if(coverage==='keep-wikipedia'){
      const summary={slug:event.slug,espnBouts:namedFights.length,wikiBouts:namedBouts(event.fightCard).length};
      primary.cardSupplement={checkedAt:checked,provider:'ESPN',status:'partial',...summary};
      primary.cardFetchError=null;
      partial.push(summary);
      console.warn(`::warning::${event.slug}: ESPN has ${summary.espnBouts} named bouts; retained ${summary.wikiBouts} freshly checked Wikipedia bouts.`);
      continue;
    }
    const changes=cardChanges(namedBouts(event.fightCard),namedFights);
    if(primary.fightCard?.length&&(changes.added.length||changes.removed.length)){
      primary.cardHistory=[...(primary.cardHistory??[]),{checkedAt:checked,sourceUrl:url,...changes}].slice(-20);
    }
    Object.assign(primary,{fightCard:namedFights,cardSupplement:null,espnEventId:String(match.id),cardCheckedAt:checked,cardSourceUrl:url,cardSource:'ESPN',cardSourcePage:'https://www.espn.com/mma/fightcenter/_/id/'+match.id+'/league/ufc',cardFetchError:null,
      venue:match.competitions[0]?.venue?.fullName,
      city:match.competitions[0]?.venue?.address?.city,country:match.competitions[0]?.venue?.address?.country,
      programmingStartUTC:match.date,scheduleSourceUrl:url,scheduleCheckedAt:checked});
    updated++;
    console.log(`Updated ${event.slug}: ${namedFights.length} fights`);
  } catch(error) {
    event.cardFetchError=String(error.message);
    const primary=events.find(e=>e.slug===event.slug);primary.cardFetchError=event.cardFetchError;
    failed++;console.error(event.slug,error.message);
  }
}
writeFileSync('src/data/events-all.json',JSON.stringify(events,null,2)+'\n');
recordHealth('event-details',failed===0,{updated,failed,partial});
if(failed)process.exitCode=1;
