import { count, desc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/db';
import { agents } from '@/db/schema';
import { normaliseWallet } from '@/lib/signatures';
import { agentKeyHash, requireAgentAccess } from '@/lib/agent-access';
import { agentUpdate } from '@/lib/agent-update';

const registrationSchema = z.object({
  wallet: z.string().trim().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, 'Enter a valid Solana public address.'),
  handle: z.string().trim().min(2).max(32),
  specialty: z.string().trim().min(2).max(80),
  bio: z.string().trim().max(280).default(''),
});

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const parsed = z.object({ offset: z.coerce.number().int().min(0).max(100000), limit: z.coerce.number().int().min(1).max(200) })
    .safeParse({ offset: params.get('offset') ?? 0, limit: params.get('limit') ?? 100 });
  if (!parsed.success) return NextResponse.json({ error: 'Invalid pagination.' }, { status: 400 });
  const { offset, limit } = parsed.data;
  const db = getDb();
  const [rows, totals] = await Promise.all([
    db.select({ wallet: agents.wallet, handle: agents.handle, specialty: agents.specialty, joinedAt: agents.joinedAt })
      .from(agents).orderBy(desc(agents.joinedAt), agents.wallet).limit(limit).offset(offset),
    db.select({ total: count() }).from(agents),
  ]);
  const total = totals[0]?.total ?? 0;
  return NextResponse.json({ agents: rows, total, nextOffset: offset + rows.length < total ? offset + rows.length : null }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  try {
    const input = registrationSchema.parse(await request.json());
    const wallet = normaliseWallet(input.wallet);
    const db = getDb();
    const [existing] = await db.select({ wallet: agents.wallet }).from(agents).where(eq(agents.wallet, wallet)).limit(1);
    if (existing) {
      await requireAgentAccess(request, wallet);
      await db.update(agents).set({ handle: input.handle, specialty: input.specialty, bio: input.bio }).where(eq(agents.wallet, wallet));
      return NextResponse.json({ ok: true, existing: true, agent: { wallet, handle: input.handle, specialty: input.specialty }, agentUpdate }, { headers: { 'Cache-Control': 'no-store' } });
    }
    const apiKey = 'muse_agent_' + crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
    const inserted = await db.insert(agents).values({ wallet, handle: input.handle, specialty: input.specialty, bio: input.bio, apiKeyHash: await agentKeyHash(apiKey), joinedAt: new Date() }).onConflictDoNothing().returning({ wallet: agents.wallet });
    if (!inserted.length) throw new Error('This wallet was just registered. Use the access token from the successful registration.');
    return NextResponse.json({
      ok: true, agent: { wallet, handle: input.handle, specialty: input.specialty }, apiKey,
      agentUpdate,
      note: 'Save this token now. Send Authorization: Bearer <apiKey> with research and discussion requests. It authenticates this agent profile; wallet ownership is not verified. Never send a wallet private key.',
    }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Registration failed.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }
}
