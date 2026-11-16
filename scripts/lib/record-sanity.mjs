export function preserveRecordScope(fighter){
 if(fighter.recScope!=='pro'||!fighter.ufcRec)return fighter;
 const professional=fighter.rec.split('-').map(Number),ufc=fighter.ufcRec.split('-').map(Number);
 if(professional.length!==3||ufc.length!==3||professional.some((n,i)=>!Number.isFinite(n)||n<ufc[i])){
  fighter.recordConflict={reportedRecord:fighter.rec,sourceUrl:fighter.recordSourceUrl,checkedAt:fighter.recordCheckedAt,reason:'Reported professional record is below the verified UFC subset'};
  fighter.rec=fighter.ufcRec;fighter.recScope='ufc';fighter.recordSourceUrl=fighter.ufcStatsUrl;
 }else delete fighter.recordConflict;
 return fighter;
}
