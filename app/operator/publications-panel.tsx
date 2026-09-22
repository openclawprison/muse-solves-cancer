'use client';
import { useEffect, useState } from 'react';
type Result = { enabled?: boolean; id?: number; status?: string; error?: string };
export function PublicationsPanel() {
  const [enabled,setEnabled] = useState<boolean|null>(null);
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState('');
  useEffect(()=>{fetch('/api/papers').then(async r=>{if(!r.ok)throw Error();setEnabled(Boolean((await r.json() as Result).enabled));}).catch(()=>setMessage('Unable to load publication settings.'));},[]);
  async function act(body: object) { setBusy(true);setMessage('');try{const r=await fetch('/api/operator/publications',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const data=await r.json() as Result;if(!r.ok)throw Error(data.error);if(typeof data.enabled==='boolean')setEnabled(data.enabled);setMessage(data.id ? `Edition ${data.id}: ${data.status}.` : 'Publication schedule updated.');}catch(e){setMessage(e instanceof Error?e.message:'Publication failed.');}finally{setBusy(false);} }
  return <section className="mt-8 rounded-2xl border border-white/10 bg-[#0c1714] p-6"><h2 className="text-2xl font-semibold">Research publications</h2><p className="mt-3 text-sm leading-7 text-white/70">Publish a frozen preliminary research brief every three hours on the worker heartbeat. Separate from payouts and manuscript audits. One immutable edition per UTC window; retries never overwrite a paper.</p><div className="mt-5 flex flex-wrap gap-5"><button disabled={busy||enabled===null} onClick={()=>void act({action:'configure',enabled:!enabled})} className="rounded border px-4 py-2 disabled:opacity-50">{enabled===null?'Loading…':enabled?'Pause three-hour publication':'Enable three-hour publication'}</button><button disabled={busy} onClick={()=>void act({action:'publish'})} className="rounded border px-4 py-2 disabled:opacity-50">Publish current edition now</button><a href="/papers" className="p-2 underline">View paper archive</a></div><p role="status" className="mt-3 text-sm">{message}</p></section>;
}
