import {load} from 'cheerio';
const clean=s=>String(s??'').replace(/\s+/g,' ').trim();
export function parseSherdogResults(html,{event,sourceUrl,checkedAt=new Date().toISOString()}) {
  const $=load(html), results=[];
  const name=el=>clean($(el).find('[itemprop="name"]').first().html()?.replace(/<br\s*\/?>/gi,' ').replace(/<[^>]+>/g,''));
  const status=el=>clean($(el).find('.final_result').text()).toLowerCase();
  const add=(left,right,method,round,time)=>{
    const a=name(left),b=name(right),sa=status(left),sb=status(right);
    let outcome,first=a,second=b;
    if(sa==='win'&&sb==='loss')outcome='win';
    else if(sa==='loss'&&sb==='win'){outcome='win';first=b;second=a;}
    else if(sa==='draw'&&sb==='draw')outcome='draw';
    else if(['nc','no contest'].includes(sa)&&['nc','no contest'].includes(sb))outcome='nc';
    else throw new Error('Results: ambiguous or unfinished result; previous data retained');
    if(!a||!b||a===b||!method||!Number.isInteger(round)||round<1||!/^[0-5]:[0-5]\d$/.test(time))throw new Error('Results: invalid completed bout');
    if(/draw/i.test(method)!==(outcome==='draw')||(/no contest|^nc\b/i.test(method))!==(outcome==='nc'))throw new Error('Results: method contradicts result');
    results.push({w:first,l:second,outcome,method,round,time,event,sourceUrl,checkedAt});
  };
  // Sherdog renders the main event separately from the undercard table.
  const main=$('.fight_card').first();
  if(!main.length)throw new Error('Results: main event missing');
  const fields=new Map($('.fight_card_resume').first().find('td').toArray().map(el=>{
    const label=clean($(el).find('em').text()).toLowerCase();const value=$(el).clone();value.find('em').remove();return [label,clean(value.text())];
  }));
  add(main.find('.fighter.left_side'),main.find('.fighter.right_side'),fields.get('method'),Number(fields.get('round')),fields.get('time'));
  $('table.new_table.result tr').each((_,tr)=>{
    const cells=$(tr).find('td');if(cells.length<7||!$(tr).find('[itemprop="performer"]').length)return;
    add(cells.eq(1),cells.eq(3),clean(cells.eq(4).find('b').first().text()),Number(clean(cells.eq(5).text())),clean(cells.eq(6).text()));
  });
  return results;
}
export function resultPresentation(result) {
  // Also protects a cached legacy dataset that predates the explicit outcome field.
  const outcome=result.outcome??(/draw/i.test(result.method)?'draw':/no contest/i.test(result.method)?'nc':null);
  return outcome==='win'?{winner:true,label:'DEF.'}:outcome==='draw'?{winner:false,label:'EMPATE'}:{winner:false,label:'SIN RESULTADO'};
}
