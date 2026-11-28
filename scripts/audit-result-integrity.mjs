import fs from 'node:fs';
import {historyMatchesRecord,recordParts} from '../src/lib/history-sanity.mjs';
const read=name=>JSON.parse(fs.readFileSync(`src/data/${name}.json`,'utf8'));
const fighters=read('fighters'),histories=read('peleadores-peleas').peleadores,results=read('results');
const archive=read('event-results');
const errors=[];
const keys=new Set();
for(const entry of archive){
 const key=entry.eventId+'@'+entry.date;
 if(keys.has(key)||!entry.eventId||!Number.isFinite(Date.parse(entry.date))||!entry.results?.length)errors.push(`Invalid event results archive: ${key}`);
 keys.add(key);
}
for(const result of [...results,...archive.flatMap(entry=>entry.results??[])]){
 if(!['win','draw','nc'].includes(result.outcome)||!result.w||!result.l||!result.sourceUrl||!Number.isFinite(Date.parse(result.checkedAt)))errors.push(`Invalid result provenance: ${result.w}`);
 if(/draw/i.test(result.method)&&result.outcome!=='draw'||/no contest/i.test(result.method)&&result.outcome!=='nc')errors.push(`Contradictory winner: ${result.w}`);
}
const conflicts=[];
for(const fighter of fighters){
 const history=histories[fighter.slug];
 if(!history||fighter.recScope!=='pro')continue;
 const pro=recordParts(fighter.rec),wiki=recordParts(history.recordWiki);
 if(pro&&wiki&&pro.some((n,i)=>n!==wiki[i]))conflicts.push({slug:fighter.slug,record:fighter.rec,historyRecord:history.recordWiki,recordSourceUrl:fighter.recordSourceUrl,historyCheckedAt:history.actualizado});
 if(!historyMatchesRecord(history,fighter))continue; // Reader suppresses unverified aggregates.
 const wins=history.peleas.filter(p=>p.resultado==='victoria').length;
 if(history.desgloseCuadra&&history.desglose&&Object.entries(history.desglose).filter(([key])=>key.endsWith('Victorias')).reduce((n,[,value])=>n+value,0)!==wins)errors.push(`Contradictory breakdown: ${fighter.slug}`);
}
console.log(JSON.stringify({resultCount:results.length,sourceDisagreements:conflicts.length,errors},null,2));
if(conflicts.length)console.warn(`${conflicts.length} source disagreements: conflicting historical aggregates are withheld pending reconciliation.`);
fs.writeFileSync('src/data/result-integrity.json',JSON.stringify({checkedAt:new Date().toISOString(),results:results.length,sourceDisagreements:conflicts,errors},null,2)+'\n');
if(errors.length)process.exitCode=1;
