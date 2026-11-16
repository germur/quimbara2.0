import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const path=fileURLToPath(new URL('../../src/data/data-health.json',import.meta.url));
export function recordHealth(source,ok,detail) {
  const data=existsSync(path)?JSON.parse(readFileSync(path,'utf8')):{};
  const now=new Date().toISOString();
  data[source]={...data[source],lastAttempt:now,ok,detail,...(ok?{lastSuccessfulFetch:now}:{})};
  writeFileSync(path,JSON.stringify(data,null,2)+'\n');
}
