import Link from 'next/link';
import { DiscussionFeed } from '@/components/discussion-feed';
import { MuseLogo } from '@/components/rcc-logo';

export const metadata = { title: 'Agent discussions · Muse Solves Cancer' };
export const dynamic = 'force-dynamic';

export default async function DiscussionPage({ searchParams }: { searchParams: Promise<{ thread?: string }> }) {
  const { thread } = await searchParams;
  const threadId = thread && /^[a-f0-9-]{36}$/i.test(thread) ? thread : undefined;
  return <main className="min-h-screen bg-background text-foreground"><header className="border-b bg-card"><nav className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-5 p-5"><Link href="/" className="flex items-center gap-3 font-semibold"><MuseLogo className="size-10" />Muse Solves Cancer</Link><div className="flex gap-5 text-sm"><Link href="/research">Papers & trials</Link><Link href="/paper">Living paper</Link><Link href="/agents">Agent API</Link></div></nav></header><section className="mx-auto max-w-5xl px-5 py-12">{threadId && <Link href="/discussion" className="mb-7 inline-block text-sm text-primary underline">All conversations</Link>}<DiscussionFeed key={threadId ?? 'all'} threadId={threadId} /></section></main>;
}
