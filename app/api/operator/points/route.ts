import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { isOperatorUser } from '@/lib/operator-auth';
import { roundClock } from '@/lib/round-clock';
import { calculateEpochRewardWeights } from '@/lib/evidence-graph';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store',Vary:'Cookie'};
export async function GET(request:Request){
  if(!(await isOperatorUser())) return NextResponse.json({error:'Operator access required.'},{status:401,headers});
  const url=new URL(request.url),clock=await roundClock();
  const epochId=url.searchParams.has('epochId')?Number(url.searchParams.get('epochId')):clock.id;
  const offset=Number(url.searchParams.get('offset') ?? 0);
  if(!Number.isSafeInteger(epochId)||epochId<0||epochId>clock.id||!Number.isSafeInteger(offset)||offset<0)
    return NextResponse.json({error:'Invalid round or page.'},{status:400,headers});
  try{
    const weights=await calculateEpochRewardWeights(epochId);
    const rows=await env.DB.prepare(`SELECT a.wallet,a.handle,a.specialty,a.bio,a.joined_at AS joinedAt,
      COALESCE(r.points,0) AS roundPoints,COALESCE(t.points,0) AS allTimePoints,
      COALESCE(s.count,0) AS submissions,COALESCE(s.score,0) AS submissionScore FROM agents a
      LEFT JOIN (SELECT wallet,SUM(points) AS points FROM reward_events WHERE epoch_id=? GROUP BY wallet) r ON r.wallet=a.wallet
      LEFT JOIN (SELECT wallet,SUM(points) AS points FROM reward_events GROUP BY wallet) t ON t.wallet=a.wallet
      LEFT JOIN (SELECT wallet,COUNT(*) AS count,SUM(COALESCE(score,0)) AS score FROM submissions WHERE epoch_id=? GROUP BY wallet) s ON s.wallet=a.wallet
      ORDER BY roundPoints DESC,a.wallet LIMIT 51 OFFSET ?`).bind(epochId,epochId,offset).all();
    const agents=(rows.results ?? []).slice(0,50).map(row=>({...row,allocationPpm:weights.allocations.find(x=>x.wallet===row.wallet)?.allocationPpm ?? 0}));
    const wallet=url.searchParams.get('wallet');
    const events=wallet?await env.DB.prepare(`SELECT event_type AS eventType,object_id AS objectId,points,calculation_hash AS calculationHash
      FROM reward_events WHERE epoch_id=? AND wallet=? ORDER BY created_at DESC,id LIMIT 100`).bind(epochId,wallet).all():null;
    return NextResponse.json({epochId,provisional:epochId>clock.latestClosedEpoch,ruleVersion:weights.ruleVersion,totalPoints:weights.totalPoints,
      agents,events:events?.results ?? [],hasMore:(rows.results?.length ?? 0)>50}, {headers});
  }catch{return NextResponse.json({error:'Points ledger temporarily unavailable.'},{status:503,headers});}
}
