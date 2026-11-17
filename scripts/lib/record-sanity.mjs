import verifications from '../../src/data/record-verifications.json' with {type:'json'};
export function preserveRecordScope(fighter){
 const verified=verifications.find(v=>v.slug===fighter.slug&&v.ufcStatsId===fighter.ufcStatsId&&v.reportedRecord===fighter.rec&&v.ufcRecAtVerification===fighter.ufcRec);
 if(fighter.recScope==='pro'&&verified){
  fighter.recordVerification={reportedRecord:fighter.rec,profileSourceUrl:fighter.recordSourceUrl,sourceUrl:verified.sourceUrl,throughDate:verified.throughDate};
  fighter.rec=verified.verifiedRecord;fighter.recordSourceUrl=verified.sourceUrl;
 }
 if(fighter.recScope!=='pro'||!fighter.ufcRec)return fighter;
 const professional=fighter.rec.split('-').map(Number),ufc=fighter.ufcRec.split('-').map(Number);
 if(professional.length!==3||ufc.length!==3||professional.some((n,i)=>!Number.isFinite(n)||n<ufc[i])){
  fighter.recordConflict={reportedRecord:fighter.rec,sourceUrl:fighter.recordSourceUrl,checkedAt:fighter.recordCheckedAt,reason:'Reported professional record is below the verified UFC subset'};
  fighter.rec=fighter.ufcRec;fighter.recScope='ufc';fighter.recordSourceUrl=fighter.ufcStatsUrl;
 }else delete fighter.recordConflict;
 return fighter;
}
