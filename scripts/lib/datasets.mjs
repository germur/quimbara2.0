import {readFileSync,writeFileSync,existsSync} from 'node:fs';
export function safeWriteJson(path,data,{force=false}={}) {
  let previous;
  if(existsSync(path)){
    // Only corrupt/unreadable old JSON is recoverable here. Rejection of a
    // valid dataset's replacement must escape to the ingestion's failure path.
    try{previous=JSON.parse(readFileSync(path,'utf8'));}catch{}
  }
  if(!force&&Array.isArray(data)&&Array.isArray(previous)&&previous.length){
    if(data.length===0||data.length<previous.length*0.5)
      throw new Error(`Unsafe dataset replacement rejected: ${path} (${previous.length} -> ${data.length})`);
  }
  writeFileSync(path,JSON.stringify(data,null,2)+'\n','utf8');
}
