import fs from 'node:fs';
import {sourceId} from './lib/fighter-identity.mjs';
const fighters=JSON.parse(fs.readFileSync('src/data/fighters.json')),registry=JSON.parse(fs.readFileSync('src/data/fighter-identities.json')),snapshot=JSON.parse(fs.readFileSync('src/data/rankings-snapshot.json'));
const errors=[],ids=new Set(),slugs=new Set();
const histories=JSON.parse(fs.readFileSync('src/data/peleadores-peleas.json')).peleadores;
for(const f of fighters){
 if(slugs.has(f.slug))errors.push('Duplicate public slug: '+f.slug);slugs.add(f.slug);
 if(f.ufcStatsId){
  if(ids.has(f.ufcStatsId))errors.push('Duplicate provider identity: '+f.ufcStatsId);ids.add(f.ufcStatsId);
  if(sourceId(f.ufcStatsUrl)!==f.ufcStatsId)errors.push('Provider URL/identity mismatch: '+f.slug);
 }
 if(f.identityAmbiguousName&&registry.profiles[f.ufcStatsId]?.slug!==f.slug)errors.push('Unregistered homonym: '+f.slug);
 const h=histories[f.slug];
 if(h?.ufcStatsId&&f.ufcStatsId&&h.ufcStatsId!==f.ufcStatsId||h?.bio?.nacimiento&&f.birthDate&&h.bio.nacimiento!==f.birthDate)errors.push('Conflicting cached biography: '+f.slug);
 if(f.recScope==='pro'&&f.ufcRec&&f.rec.split('-').some((n,i)=>Number(n)<Number(f.ufcRec.split('-')[i])))errors.push('Professional record below UFC subset: '+f.slug);
}
for(const entry of snapshot.entries){
 const f=fighters.find(f=>f.slug===entry.slug);
 if(!f||f.rank!==entry.rank||f.div!==entry.div||f.ufcProfileUrl!==entry.ufcProfileUrl)errors.push('Official ranking entry not applied: '+entry.name);
}
if(fighters.filter(f=>f.rank).length!==snapshot.entries.length)errors.push('Ranking snapshot and assigned coverage differ');
console.log(JSON.stringify({athletes:fighters.length,providerIdentities:ids.size,registeredHomonyms:Object.keys(registry.profiles).length,rankings:snapshot.entries.length,errors,recordSourceConflicts:fighters.filter(f=>f.recordConflict).map(f=>f.slug)},null,2));
if(errors.length)process.exitCode=1;
