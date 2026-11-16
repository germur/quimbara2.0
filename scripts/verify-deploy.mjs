const expected=process.argv[2];
if(!/^[a-f0-9]{40}$/.test(expected??''))throw new Error('Expected commit SHA required');
for(let attempt=0;attempt<16;attempt++){
  try{
    const r=await fetch('https://quimbara.org/?deploy-check='+expected,{signal:AbortSignal.timeout(10000),headers:{'Cache-Control':'no-cache'}});
    const html=await r.text();
    if(r.ok&&html.includes(`content="${expected}"`)){console.log('Production commit verified:',expected);process.exit(0);}
  }catch(error){console.error(error.message);}
  await new Promise(r=>setTimeout(r,15000));
}
throw new Error('Netlify has not served the expected commit; IndexNow not submitted');
