import { desc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/db';
import { agents } from '@/db/schema';
import {
  agentRegistrationMessage,
  assertFreshTimestamp,
  normaliseWallet,
  verifyWalletMessage,
} from '@/lib/signatures';

const registrationSchema = z.object({
  wallet: z.string().trim().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, 'Enter a valid Solana public address.'),
  handle: z.string().trim().min(2).max(32),
  specialty: z.string().trim().min(2).max(80),
  bio: z.string().trim().max(280).default(''),
  timestamp: z.number().int().optional(),
  signature: z.string().optional(),
}).superRefine((input, context) => {
  if ((input.timestamp === undefined) !== (input.signature === undefined)) {
    context.addIssue({ code: 'custom', message: 'Timestamp and signature must be supplied together.' });
  }
});

export async function GET() {
  const rows = await getDb()
    .select({ wallet: agents.wallet, handle: agents.handle, specialty: agents.specialty, joinedAt: agents.joinedAt })
    .from(agents)
    .orderBy(desc(agents.joinedAt))
    .limit(20);
  return NextResponse.json({ agents: rows });
}

export async function POST(request: Request) {
  try {
    const input = registrationSchema.parse(await request.json());
    const wallet = normaliseWallet(input.wallet);
    const db = getDb();
    const [existing] = await db.select({ wallet: agents.wallet, handle: agents.handle, specialty: agents.specialty }).from(agents).where(eq(agents.wallet, wallet)).limit(1);

    if (input.timestamp && input.signature) {
      assertFreshTimestamp(input.timestamp);
      const message = agentRegistrationMessage({ ...input, timestamp: input.timestamp });
      await verifyWalletMessage(input.wallet, message, input.signature as `0x${string}`);
    } else if (existing) {
      return NextResponse.json({ ok: true, agent: existing, existing: true });
    }

    if (existing) {
      await db.update(agents).set({ handle: input.handle, specialty: input.specialty, bio: input.bio }).where(eq(agents.wallet, wallet));
    } else {
      await db.insert(agents).values({
        wallet,
        handle: input.handle,
        specialty: input.specialty,
        bio: input.bio,
        joinedAt: new Date(input.timestamp ?? Date.now()),
      });
    }

    return NextResponse.json({ ok: true, agent: { wallet, handle: input.handle, specialty: input.specialty }, walletVerified: Boolean(input.signature) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Registration failed.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
