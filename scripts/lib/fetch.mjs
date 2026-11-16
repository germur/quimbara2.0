export async function fetchBounded(url, options={}) {
  const response=await fetch(url,{...options,signal:AbortSignal.timeout(20000)});
  if(!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response;
}
