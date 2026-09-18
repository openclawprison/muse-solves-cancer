import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';

export async function GET() {
  const hourlyReleaseBps = 10_000;
  const tokenAddress = env.MUSE_TOKEN_ADDRESS || null;
  const keeperAddress = env.MUSE_KEEPER_ADDRESS || env.MUSE_OPERATOR_ADDRESS || null;
  return NextResponse.json({
    mainnet: Boolean(env.MUSE_TREASURY_ADDRESS && tokenAddress),
    walletRegistry: true,
    hourlyLedger: true,
    aiScoring: Boolean(env.OPENAI_API_KEY),
    pushPayments: Boolean(env.MUSE_TREASURY_ADDRESS && keeperAddress && env.MUSE_REWARD_PROGRAM_ID),
    maxEpochTreasuryShareBps: 10_000,
    hourlyReleaseBps,
    keeperConfigured: Boolean(keeperAddress && env.MUSE_REWARD_PROGRAM_ID),
    operatorAddress: keeperAddress,
    operatorDashboard: '/operator',
    treasuryAddress: env.MUSE_TREASURY_ADDRESS || null,
    tokenAddress,
    tokenLaunched: Boolean(tokenAddress),
  });
}
