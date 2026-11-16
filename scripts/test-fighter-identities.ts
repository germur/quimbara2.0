import {test} from 'node:test';
import assert from 'node:assert/strict';
import {joinFighterSources} from './lib/fighter-identity.mjs';
import {buildFighter} from './fetch-ufc-data.ts';
import {parseOfficialRankings} from './fetch-rankings.mjs';
import {failedIngestions} from './verify-ingestion.mjs';
import {preserveRecordScope} from './lib/record-sanity.mjs';
import {getPeleador} from '../src/lib/peleadores.ts';
import {generarTextoComparativo} from '../src/lib/comparar.ts';
const a='1111111111111111',b='2222222222222222';
const rows=[{FIGHTER:'Bruno Silva',HEIGHT:`5' 4"`,WEIGHT:'125 lbs.',REACH:'65"',STANCE:'Orthodox',DOB:'Mar 16, 1990',URL:'http://ufcstats.com/fighter-details/'+a},{FIGHTER:'Bruno Silva',HEIGHT:`6' 0"`,WEIGHT:'185 lbs.',REACH:'74"',STANCE:'Orthodox',DOB:'Jul 13, 1989',URL:'http://ufcstats.com/fighter-details/'+b}];
test('same-name athletes retain separate identities, measures, corners and results',()=>{
 const data=joinFighterSources(rows,[{FIRST:'Bruno',LAST:'Silva',NICKNAME:'Bulldog',URL:rows[0].URL},{FIRST:'Bruno',LAST:'Silva',NICKNAME:'Blindado',URL:rows[1].URL}],[{BOUT:'Bruno Silva vs. A Rival',EVENT:'A',OUTCOME:'W/L',URL:'fight-a',WEIGHTCLASS:'Flyweight'},{BOUT:'B Rival vs. Bruno Silva',EVENT:'B',OUTCOME:'W/L',URL:'fight-b',WEIGHTCLASS:'Middleweight'}],new Map([['A','2026-01-01'],['B','2026-01-02']]),{profiles:{[a]:{slug:'bruno-silva'},[b]:{slug:'bruno-silva-blindado'}},fights:{'fight-a':[a,null],'fight-b':[null,b]}});
 assert.equal(data.profiles.length,2);assert.equal(data.history.get(a)[0].result,'W');assert.equal(data.history.get(b)[0].result,'L');
 const csv:any={...data,fightsByFighter:data.history};const previous=new Map([['bruno-silva',{slug:'bruno-silva',name:'Bruno Silva',rank:'7',div:'Flyweight',ufcStatsId:a}]]);
 const f=buildFighter(data.profiles[0],csv,previous as any),other=buildFighter(data.profiles[1],csv,previous as any);
 assert.equal(f.ufcRec,'1-0-0');assert.equal(other.ufcRec,'0-1-0');assert.equal(f.height,`5' 4"`);assert.equal(other.weight,'185 lbs');assert.equal(f.nick,'Bulldog');assert.equal(other.nick,'Blindado');assert.equal(f.rank,'7');assert.equal(other.rank,undefined);
});
test('unresolved homonyms cannot be merged and source failure blocks publication',()=>{
 const data=joinFighterSources(rows,[],[{BOUT:'Bruno Silva vs. Rival',EVENT:'A',OUTCOME:'W/L',URL:'unknown'}],new Map(),{profiles:{[a]:{slug:'bruno-silva'},[b]:{slug:'bruno-silva-blindado'}},fights:{}});
 assert.equal(data.history.get(a).length,0);assert.equal(data.history.get(b).length,0);assert.equal(data.unresolved.get(a),1);
 const steps=Object.fromEntries(['identities','base','rankings','records','details','history','images'].map(k=>[k,{outcome:'success'}]));
 assert.deepEqual(failedIngestions(steps),[]);steps.rankings.outcome='failure';assert.deepEqual(failedIngestions(steps),['rankings']);
});
test('ranking importer reads only the visible current block and refuses missing divisions',()=>{
 const divisions=['Peso mosca','Peso gallo','Peso pluma','Ligero','Peso welter','Peso medio','Peso semipesado','De peso pesado','Peso de la mujer',"Women's Flyweight",'Gallo de las mujeres'];
 const group=(div:string,i:number)=>`<div class="view-grouping"><div class="view-grouping-header">${div}</div><div class="rankings--athlete--champion"><h5><a href="/athlete/champ-${i}">Champ ${i}</a></h5></div><table><tbody>${Array.from({length:15},(_,n)=>`<tr><td>${n+1}</td><td><a href="/athlete/f-${i}-${n}">F ${i} ${n}</a></td></tr>`).join('')}</tbody></table></div>`;
 const html='<div class="view-display-id-block_1">'+divisions.map(group).join('')+'</div><div class="view-display-id-meta_rankings">'+group('Peso mosca',99)+'</div>';
 const entries=parseOfficialRankings(html);assert.equal(entries.length,176);assert.ok(entries.every(e=>!e.name.includes('99')));
 const regional=html.replace('/athlete/champ-0','https://ufc.com/athlete/champ-0').replace('/athlete/champ-1','https://www.ufcespanol.com/athlete/champ-1/');
 assert.equal(parseOfficialRankings(regional)[0].ufcProfileUrl,'https://www.ufc.com/athlete/champ-0');
 assert.equal(parseOfficialRankings(regional)[16].ufcProfileUrl,'https://www.ufc.com/athlete/champ-1');
 assert.equal(parseOfficialRankings(html.replace('/athlete/champ-0','/index%2ephp/athlete/champ-0'))[0].ufcProfileUrl,'https://www.ufc.com/athlete/champ-0');
 assert.equal(parseOfficialRankings(html.replace('/athlete/champ-0','/index.php/athlete/champ-0'))[0].ufcProfileUrl,'https://www.ufc.com/athlete/champ-0');
 assert.throws(()=>parseOfficialRankings(html.replace('/athlete/champ-0','https://example.com/athlete/champ-0')),/Invalid official athlete URL/);
 assert.throws(()=>parseOfficialRankings(html.replace('view-display-id-block_1','other')),/block not found/);
});
test('contradictory professional totals retain the verified UFC scope',()=>{
 const f=preserveRecordScope({rec:'17-0-0',recScope:'pro',ufcRec:'9-1-0',recordSourceUrl:'source',ufcStatsUrl:'stats'});
 assert.equal(f.rec,'9-1-0');assert.equal(f.recScope,'ufc');assert.equal(f.recordConflict.reportedRecord,'17-0-0');
});
test('a provider name change preserves the published URL through the immutable ID',()=>{
 const data=joinFighterSources([rows[0]],[],[],new Map(),{profiles:{},fights:{}});
 const previous=new Map([['published-name',{slug:'published-name',name:'Old Name',ufcStatsId:a,rec:'8-2-0',recScope:'pro',recordCheckedAt:'2026-11-16'}]]);
 const f=buildFighter(data.profiles[0],{...data,fightsByFighter:data.history} as any,previous as any);
 assert.equal(f.slug,'published-name');assert.equal(f.rec,'8-2-0');assert.equal(f.recordCheckedAt,'2026-11-16');
});
test('comparison prose does not promote a UFC subset to an unbeaten professional record',()=>{
 const a=structuredClone(getPeleador('ilia-topuria')!),b=structuredClone(getPeleador('max-holloway')!);
 assert.ok(a&&b);a.record={texto:'5-0-0',victorias:5,derrotas:0,empates:0,scope:'ufc'};b.record={texto:'20-5-0',victorias:20,derrotas:5,empates:0,scope:'pro'};
 const text=generarTextoComparativo(a,b).join(' ');
 assert.match(text,/récord en UFC/);assert.doesNotMatch(text,/llega invicto|Ninguno de los dos conoce la derrota/);
});
