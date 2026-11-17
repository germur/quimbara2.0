export function recordParts(value) {
  const match=String(value??'').replace(/[–−]/g,'-').match(/^\s*(\d+)\s*-\s*(\d+)(?:\s*-\s*(\d+))?/);
  return match?[Number(match[1]),Number(match[2]),Number(match[3]??0)]:null;
}
export function historyMatchesRecord(history,fighter) {
  if(fighter?.recScope!=='pro'||!history?.peleas?.length)return false;
  const expected=recordParts(fighter.rec), reported=recordParts(history.recordWiki);
  if(!expected||!reported||expected.some((n,i)=>n!==reported[i]))return false;
  const totals=['victoria','derrota','empate'].map(result=>history.peleas.filter(p=>p.resultado===result).length);
  return totals.every((n,i)=>n===expected[i])&&history.peleas.every(p=>
    ['victoria','derrota','empate','nc'].includes(p.resultado)&&(!p.fecha||p.fecha<=new Date().toISOString().slice(0,10)));
}
