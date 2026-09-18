import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';

export async function GET() {
  const configuredRelease = Number(env.MUSE_HOURLY_RELEASE_BPS || 100);
  const hourlyReleaseBps = Number.isInteger(configuredRelease)
    ? Math.min(Math.max(configuredRelease, 1), 2_500)
    : 100;
  const tokenAddress = env.MUSE_TOKEN_ADDRESS || null;
  return NextResponse.json({
    mainnet: Boolean(env.MUSE_TREASURY_ADDRESS && tokenAddress),
    walletRegistry: true,
    hourlyLedger: true,
    aiScoring: Boolean(env.OPENAI_API_KEY),
    pushPayments: Boolean(env.MUSE_TREASURY_ADDRESS && env.MUSE_OPERATOR_ADDRESS && env.MUSE_REWARD_PROGRAM_ID),
    maxEpochTreasuryShareBps: 2_500,
    hourlyReleaseBps,
    keeperConfigured: Boolean(env.MUSE_OPERATOR_ADDRESS && env.MUSE_REWARD_PROGRAM_ID),
    operatorAddress: env.MUSE_OPERATOR_ADDRESS || null,
    operatorDashboard: '/operator',
    treasuryAddress: env.MUSE_TREASURY_ADDRESS || null,
    tokenAddress,
    tokenLaunched: Boolean(tokenAddress),
  });
}
