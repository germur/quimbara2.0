import fs from 'node:fs';
import {load} from 'cheerio';
import {fetchBounded} from './lib/fetch.mjs';
import {recordHealth} from './lib/health.mjs';
import {identityName,identitySlug} from './lib/fighter-identity.mjs';
import {parseUfcProfile,profileNameMatches} from './lib/ufc-profile.mjs';
import {resolvePhotoSource} from './lib/photo-sources.mjs';
const DIV_MAP = {
  'Peso mosca':              'Flyweight',
  'Peso gallo':              'Bantamweight',
  'Peso pluma':              'Featherweight',
  'Peso ligero':             'Lightweight',
  'Ligero':                  'Lightweight',
  'Peso wélter':             'Welterweight',
  'Peso welter':             'Welterweight',
  'Peso medio':              'Middleweight',
  'Peso semipesado':         'Light Heavyweight',
  'Peso pesado':             'Heavyweight',
  'De peso pesado':          'Heavyweight',
  'Peso paja femenino':      "Women's Strawweight",
  'Peso de la mujer':        "Women's Strawweight",
  'Peso mosca femenino':     "Women's Flyweight",
  'Peso gallo femenino':     "Women's Bantamweight",
  'Gallo de las mujeres':    "Women's Bantamweight",
  // Inglés (fallback)
  'Flyweight':               'Flyweight',
  'Bantamweight':             'Bantamweight',
  'Featherweight':            'Featherweight',
  'Lightweight':              'Lightweight',
  'Welterweight':             'Welterweight',
  'Middleweight':             'Middleweight',
  'Light Heavyweight':        'Light Heavyweight',
  'Heavyweight':              'Heavyweight',
  "Women's Strawweight":      "Women's Strawweight",
  "Women's Flyweight":        "Women's Flyweight",
  "Women's Bantamweight":     "Women's Bantamweight",
};


export function parseOfficialRankings(html){
 const $=load(html),entries=[],divisions=new Set(),keys=new Set();
 const groups=$('.view-display-id-block_1 .view-grouping');
 if(!groups.length)throw new Error('Current rankings block not found; previous rankings retained');
 for(const group of groups.toArray()){
  const div=DIV_MAP[$(group).find('.view-grouping-header').text().trim()];if(!div)continue;
  if(divisions.has(div))throw new Error('Duplicate current division');divisions.add(div);
  const champ=$(group).find('.rankings--athlete--champion h5 a').first();
  const links=[{link:champ,rank:'C'},...$(group).find('tbody tr').toArray().map(tr=>({link:$(tr).find('td').eq(1).find('a').first(),rank:$(tr).find('td').first().text().trim()}))];
  if(links.length!==16)throw new Error('Incomplete division: '+div);
  for(const {link,rank} of links){
   const name=link.text().trim(),href=link.attr('href');
   if(!name||!href||rank!=='C'&&!/^(?:[1-9]|1[0-5])$/.test(rank))throw new Error('Invalid ranking row');
   const linked=new URL(href,'https://www.ufc.com');
   if(!['https:','http:'].includes(linked.protocol)||!['www.ufc.com','ufc.com','www.ufcespanol.com','ufcespanol.com'].includes(linked.hostname)||!linked.pathname.startsWith('/athlete/'))throw new Error('Invalid official athlete URL for '+name+': '+href);
   const url=new URL(linked.pathname.replace(/\/+$/,''),'https://www.ufc.com');
   const key=div+'|'+url.pathname;if(keys.has(key))throw new Error('Duplicate athlete in division');keys.add(key);
   entries.push({name,rank,div,ufcProfileUrl:url.href,sourceSlug:url.pathname.split('/').filter(Boolean).at(-1)});
  }
 }
 if(divisions.size!==11)throw new Error('Expected 11 current divisions; previous rankings retained');
 return entries;
}
export async function updateRankings(){
 const entries=parseOfficialRankings(await(await fetchBounded('https://www.ufc.com/rankings')).text());
 const fighters=JSON.parse(fs.readFileSync('src/data/fighters.json')),candidate=structuredClone(fighters),used=new Set();
 const media=JSON.parse(fs.readFileSync('src/data/fighter-media-extra.json'));
 const directory=JSON.parse(fs.readFileSync('src/data/fighter-photo-sources.json')).athletes;
 for(const entry of entries){
  let options=candidate.filter(f=>f.ufcProfileUrl===entry.ufcProfileUrl||f.photoSource?.profileUrl===entry.ufcProfileUrl);
  if(!options.length)options=candidate.filter(f=>f.slug===entry.sourceSlug);
  if(!options.length)options=candidate.filter(f=>identityName(f.name)===identityName(entry.name));
  if(options.length>1)throw new Error('Ambiguous ranked athlete: '+entry.name);
  let fighter=options[0];
  if(!fighter){
   const profile=parseUfcProfile(await(await fetchBounded(entry.ufcProfileUrl)).text());
   if(!profileNameMatches(entry.name,profile)||!profile.rec)throw new Error('New ranked profile identity unverified: '+entry.name);
   const extra=media.find(m=>m.slug===entry.sourceSlug);
   fighter={slug:entry.sourceSlug,name:entry.name,nick:profile.nick,div:entry.div,rec:profile.rec,recScope:'pro',recordCheckedAt:new Date().toISOString(),recordSourceUrl:entry.ufcProfileUrl,from:profile.from,img:extra?.img??'',...(extra?.photoSource?{photoSource:extra.photoSource}:{}),height:profile.height,weight:profile.weight,reach:profile.reach,stance:'',team:'',form:[],formTypes:[]};
   candidate.push(fighter);
  }
  if(used.has(fighter.slug))throw new Error('Multiple ranking assignments to one athlete; requires explicit multi-division support');
  used.add(fighter.slug);fighter.rank=entry.rank;fighter.div=entry.div;fighter.ufcProfileUrl=entry.ufcProfileUrl;fighter.rankCheckedAt=new Date().toISOString();
 }
 for(const f of candidate)if(!used.has(f.slug))delete f.rank;
 fs.writeFileSync('src/data/fighters.json',JSON.stringify(candidate,null,2)+'\n');
 fs.writeFileSync('src/data/rankings-snapshot.json',JSON.stringify({checkedAt:new Date().toISOString(),source:'https://www.ufc.com/rankings',entries:entries.map(e=>({...e,slug:candidate.find(f=>f.ufcProfileUrl===e.ufcProfileUrl).slug}))},null,2)+'\n');
 recordHealth('rankings',true,{sourceEntries:entries.length,assigned:used.size,divisions:11});
 console.log('Official rankings:',entries.length,'entries;',used.size,'athletes, fully assigned');
}
if(process.argv[1]&&import.meta.url===(await import('node:url')).pathToFileURL(process.argv[1]).href)updateRankings().catch(e=>{recordHealth('rankings',false,{error:e.message});console.error(e);process.exitCode=1;});
