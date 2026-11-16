export function failedIngestions(steps){
 return ['identities','base','rankings','records','details','history','images'].filter(id=>steps[id]?.outcome!=='success');
}
if(process.argv[1]&&import.meta.url===(await import('node:url')).pathToFileURL(process.argv[1]).href){
 const failed=failedIngestions(JSON.parse(process.env.OUTCOMES??'{}'));
 if(failed.length){console.error('Candidate not published; ingestion failed:',failed.join(', '));process.exitCode=1;}
 else console.log('All ingestion steps succeeded; candidate may proceed to validation.');
}
