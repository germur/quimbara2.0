import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseSherdogResults,resultPresentation} from './lib/recent-results.mjs';
import {archiveEventResults} from './lib/event-results.mjs';
import {historyMatchesRecord} from '../src/lib/history-sanity.mjs';
import {historyRefreshDue,activeFighterSlugs,selectHistoryRefreshTargets} from './lib/history-refresh.mjs';
import {preserveRecordScope} from './lib/record-sanity.mjs';

const fighter=(name,status,cls='')=>`<div class="fighter ${cls}"><span itemprop="name">${name}</span><span class="final_result ${status}">${status}</span></div>`;
const fixture=(a='win',b='loss',method='Decision (Unanimous)')=>`<div class="fight_card">${fighter('Left Athlete',a,'left_side')}${fighter('Right Athlete',b,'right_side')}</div><table class="fight_card_resume"><tr><td><em>Method</em>${method}</td><td><em>Round</em>3</td><td><em>Time</em>5:00</td></tr></table><table class="new_table result"><tr>${'<td>Heading</td>'.repeat(7)}</tr><tr><td>1</td><td itemprop="performer">${fighter('Uros<br>Medic','draw')}</td><td>VS</td><td itemprop="performer">${fighter('Kevin Holland','draw')}</td><td><b>Draw (Majority)</b></td><td>3</td><td>5:00</td></tr></table>`;
const parse=html=>parseSherdogResults(html,{event:'Verified event',sourceUrl:'https://www.sherdog.com/events/test'});
test('main event is included, table headers ignored, and draws never have a winner',()=>{
 const results=parse(fixture());
 assert.equal(results.length,2);
 assert.equal(results[0].w,'Left Athlete');
 assert.equal(results[1].w,'Uros Medic');
 assert.deepEqual(resultPresentation(results[1]),{winner:false,label:'EMPATE'});
 assert.deepEqual(resultPresentation({method:'Draw (Majority)'}),{winner:false,label:'EMPATE'});
});
test('winner follows explicit source status even when listed on the right',()=>{
 const [result]=parse(fixture('loss','win'));
 assert.equal(result.w,'Right Athlete');assert.equal(result.l,'Left Athlete');
 assert.ok(resultPresentation(result).winner);
});
test('no contest has no winner and invalid or unfinished results reject replacement',()=>{
 assert.equal(parse(fixture('nc','nc','No Contest'))[0].outcome,'nc');
 assert.equal(resultPresentation(parse(fixture('nc','nc','No Contest'))[0]).winner,false);
 for(const args of [['win','win'],['',''],['win','loss','Draw (Majority)'],['draw','draw','KO (Punch)']])assert.throws(()=>parse(fixture(...args)));
 assert.throws(()=>parse('<table></table>'),/main event missing/);
});
test('new editions and partial results cannot erase an event archive', () => {
 const events = [
   {slug:'december-card',date:'2026-12-05',main:'Right Athlete vs. Left Athlete',f1:'Right Athlete',f2:'Left Athlete'},
   {slug:'january-card',date:'2027-01-16',main:'Right Athlete vs. Left Athlete',f1:'Right Athlete',f2:'Left Athlete'},
 ];
 const results = parse(fixture());
 const first = archiveEventResults([], events, events[0].date, results);
 const both = archiveEventResults(first, events, events[1].date, results.slice(0, 1));
 assert.deepEqual(both.map(entry => [entry.eventId, entry.results.length]), [
   ['december-card', 2], ['january-card', 1],
 ]);
 const partial = archiveEventResults(both, events, events[0].date, results.slice(0, 1));
 assert.deepEqual(partial, both);
 assert.equal(archiveEventResults(both, events, '2027-01-17', results), null);
 assert.equal(archiveEventResults(both, events, events[0].date, results.slice(1)), null);
});
test('historical aggregates must agree with both canonical record and completed bout totals',()=>{
 const hist={recordWiki:'2-1',peleas:[{resultado:'victoria'},{resultado:'derrota'},{resultado:'victoria'}]};
 assert.ok(historyMatchesRecord(hist,{rec:'2-1-0',recScope:'pro'}));
 assert.equal(historyMatchesRecord(hist,{rec:'1-1-0',recScope:'pro'}),false);
 assert.equal(historyMatchesRecord(hist,{rec:'2-1-0',recScope:'ufc'}),false);
 assert.equal(historyMatchesRecord({...hist,peleas:hist.peleas.slice(1)},{rec:'2-1-0',recScope:'pro'}),false);
 assert.equal(historyMatchesRecord({...hist,peleas:[...hist.peleas,{resultado:'victoria',fecha:'2099-01-01'}]},{rec:'3-1-0',recScope:'pro'}),false);
});
test('recent unranked participants are refreshed daily, cached former ranked athletes weekly',()=>{
 const now=Date.parse('2026-11-17T12:00:00Z'),person={name:'Active Athlete',slug:'active',rec:'2-1-0',recScope:'pro'};
 const active=activeFighterSlugs([person],[{date:'2026-11-14',f1:person.name,f2:'Other'}],now);
 assert.ok(active.has(person.slug));
 const saved={actualizado:'2026-11-16T12:01:00Z',recordWiki:'2-1'};
 assert.ok(historyRefreshDue(person,saved,active,now));
 assert.equal(historyRefreshDue(person,saved,new Set(),now),false);
 assert.ok(historyRefreshDue(person,{...saved,recordWiki:'1-1'},new Set(),now));
 assert.ok(historyRefreshDue(person,{...saved,actualizado:'2026-07-01'},new Set(),now));
});
test('evidence-backed record correction survives recurring stale imports without freezing later results',()=>{
 const original={slug:'kevin-vallejos',ufcStatsId:'239d8e5359022f3b',rec:'17-1-0',recScope:'pro',ufcRec:'4-0-0',recordSourceUrl:'https://www.ufc.com/athlete/kevin-vallejos'};
 const corrected=preserveRecordScope({...original});
 assert.equal(corrected.rec,'18-1-0');assert.match(corrected.recordSourceUrl,/emmett-vs-vallejos-results/);
 assert.equal(preserveRecordScope({...original}).rec,'18-1-0');
 assert.equal(preserveRecordScope({...original,rec:'19-1-0',ufcRec:'5-0-0'}).rec,'19-1-0');
 assert.equal(preserveRecordScope({...original,ufcStatsId:'different-person'}).rec,'17-1-0');
 const staleAfterNewFight=preserveRecordScope({...original,ufcRec:'5-0-0'});
 assert.equal(staleAfterNewFight.rec,'5-0-0');
 assert.equal(staleAfterNewFight.recScope,'ufc');
 assert.match(staleAfterNewFight.recordConflict.reason,/new UFC results/);
});
test('daily batches refresh inactive histories even with more active athletes than available slots',()=>{
 const fighters=Array.from({length:121},(_,i)=>({slug:`athlete-${String(i).padStart(3,'0')}`}));
 const active=new Set(fighters.slice(0,81).map(f=>f.slug)),saved={};
 const base=Date.parse('2026-11-17T12:00:00Z'),refreshed=new Set();
 for(let day=0;day<4;day++){
  const now=base+day*86400000;
  const batch=selectHistoryRefreshTargets(fighters,saved,active,{now,limit:50});
  assert.ok(batch.filter(f=>!active.has(f.slug)).length>=4);
  assert.equal(new Set(batch.map(f=>f.slug)).size,batch.length);
  for(const f of batch){saved[f.slug]={actualizado:new Date(now).toISOString()};if(!active.has(f.slug))refreshed.add(f.slug);}
 }
 assert.equal(refreshed.size,40);
});
test('missing pages have a bounded retry interval and do not consume every daily batch',()=>{
 const now=Date.parse('2026-11-17T12:00:00Z'),f={slug:'missing'},active=new Set([f.slug]);
 const attempts={missing:{found:false,checkedAt:'2026-11-16T12:00:00Z'}};
 assert.deepEqual(selectHistoryRefreshTargets([f],{},active,{now,limit:50,attempts}),[]);
 assert.equal(selectHistoryRefreshTargets([f],{},active,{now:now+7*86400000,limit:50,attempts}).length,1);
});
