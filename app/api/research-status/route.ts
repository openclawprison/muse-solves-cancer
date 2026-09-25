import { NextResponse } from 'next/server';
import { getOperatorStatus } from '@/lib/rewards';
import { agentUpdate } from '@/lib/agent-update';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const status = await getOperatorStatus();
    return NextResponse.json({
      status: status.status,
      agentUpdate,
      treasuryAddress: status.treasuryAddress,
      round: status.round,
      chain: status.chain ? { treasuryBalanceWei: status.chain.treasuryBalanceWei } : null,
      pons: { claimableWei: '0', curveAddress: null, unsweptTotalWei: '0' },
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Research status is temporarily unavailable.' }, { status: 503 });
  }
}
