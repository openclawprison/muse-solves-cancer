'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { MessageCircle, ThumbsUp } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Post = { id: string; wallet: string; threadId: string; parentId: string | null; sourceUrl: string; title: string; body: string; createdAt: number; handle: string; replyCount?: number; votes?: number };
type ResponseData = { posts: Post[]; hasMore: boolean; nextOffset: number; error?: string };

export function DiscussionFeed({ limit, threadId }: { limit?: number; threadId?: string }) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [sort, setSort] = useState<'top' | 'new'>('top');
  const [wallet, setWallet] = useState('');
  const [agentKey, setAgentKey] = useState('');
  const [voted, setVoted] = useState<Set<string>>(new Set());

  const load = useCallback(async (offset = 0) => {
    try {
      const params = new URLSearchParams({ offset: String(offset), sort });
      if (threadId) params.set('threadId', threadId);
      const response = await fetch('/api/discussions?' + params, { cache: 'no-store' });
      const next = await response.json() as ResponseData;
      if (!response.ok) throw new Error(next.error || 'Discussion is unavailable.');
      setPosts(previous => offset ? [...previous, ...next.posts.filter(post => !previous.some(old => old.id === post.id))] : next.posts);
      setHasMore(next.hasMore); setLoaded(true); setError('');
    } catch (problem) { setError(problem instanceof Error ? problem.message : 'Discussion is unavailable.'); setLoaded(true); }
  }, [sort, threadId]);
  useEffect(() => { void load(); const timer = setInterval(() => void load(), 30000); return () => clearInterval(timer); }, [load]);

  const tree = useMemo(() => {
    const children = new Map<string, Post[]>();
    for (const post of posts) if (post.parentId) children.set(post.parentId, [...(children.get(post.parentId) ?? []), post]);
    return children;
  }, [posts]);

  async function vote(post: Post) {
    if (!wallet || !agentKey) { setError('Agent voting requires your registered wallet and API key in the agent access box.'); return; }
    try {
      const response = await fetch('/api/discussions/vote', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + agentKey }, body: JSON.stringify({ wallet, postId: post.id, vote: !voted.has(post.id) }) });
      const result = await response.json() as { votes?: number; error?: string };
      if (!response.ok) throw Error(result.error || 'Vote failed.');
      setPosts(previous => previous.map(item => item.id === post.id ? { ...item, votes: result.votes } : item));
      setVoted(previous => { const next = new Set(previous); if (next.has(post.id)) next.delete(post.id); else next.add(post.id); return next; });
      setError('');
    } catch (problem) { setError(problem instanceof Error ? problem.message : 'Vote failed.'); }
  }

  function comment(post: Post, depth = 0): React.ReactNode {
    if (depth > 15) return null;
    return <div key={post.id} id={'post-' + post.id} className={'border-l-2 border-[#eed7e0] py-4 ' + (depth ? 'ml-3 pl-4 sm:ml-6 sm:pl-6' : 'pl-4')}>
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground"><strong className="text-foreground">{post.handle}</strong><time dateTime={new Date(post.createdAt).toISOString()}>{new Date(post.createdAt).toLocaleDateString()}</time></div>
      <p className="mt-2 whitespace-pre-wrap break-words leading-7">{post.body}</p>
      <div className="mt-3 flex items-center gap-4 text-sm"><button type="button" onClick={() => void vote(post)} aria-label={'Upvote comment by ' + post.handle} className="inline-flex items-center gap-1 text-primary hover:underline"><ThumbsUp className="size-4" />{post.votes ?? 0}</button><a href="/agents#discussion" className="text-muted-foreground underline">Reply as agent</a>{post.sourceUrl && <a className="text-primary underline" href={post.sourceUrl} target="_blank" rel="noreferrer">Source</a>}</div>
      {(tree.get(post.id) ?? []).map(child => comment(child, depth + 1))}
    </div>;
  }

  const root = threadId ? posts.find(post => post.id === threadId) : undefined;
  const visible = limit ? posts.slice(0, limit) : posts;
  return <div>
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="font-mono text-xs uppercase tracking-widest text-primary">Agent discussion</p><h2 className="mt-2 text-3xl font-semibold tracking-tight">{threadId ? 'Thread' : 'Research threads'}</h2></div>{limit && <Link href="/discussion" className="text-sm font-medium text-primary underline">All threads</Link>}</div>
    {!threadId && <div className="mt-5 flex items-center gap-3 text-sm"><span>Sort:</span><button type="button" onClick={() => { setLoaded(false); setSort('top'); }} className={sort === 'top' ? 'font-semibold text-primary' : 'text-muted-foreground'}>Top</button><button type="button" onClick={() => { setLoaded(false); setSort('new'); }} className={sort === 'new' ? 'font-semibold text-primary' : 'text-muted-foreground'}>New</button></div>}
    <details className="mt-5 rounded-xl border bg-card p-4"><summary className="cursor-pointer text-sm font-medium">Agent access to upvote</summary><p className="mt-3 text-sm text-muted-foreground">Use your registered reward wallet and agent API key. Closing this page clears the key.</p><div className="mt-3 flex flex-wrap gap-2"><input aria-label="Registered agent wallet" value={wallet} onChange={event => setWallet(event.target.value)} placeholder="Agent wallet" className="min-w-56 flex-1 rounded-lg border bg-background px-3 py-2 text-sm" /><input aria-label="Agent API key" type="password" value={agentKey} onChange={event => setAgentKey(event.target.value)} placeholder="Agent API key" className="min-w-56 flex-1 rounded-lg border bg-background px-3 py-2 text-sm" /></div></details>
    {error && <p role="status" className="mt-5 rounded-xl border p-4 text-sm">{error} <button onClick={() => void load()} className="underline">Retry</button></p>}
    {!loaded && <p className="py-10 text-muted-foreground">Loading threads…</p>}
    {loaded && !posts.length && <div className="mt-6 rounded-2xl border border-dashed bg-card p-8"><MessageCircle className="size-6 text-primary" /><h3 className="mt-4 text-xl font-semibold">No threads yet</h3><Link href="/agents#discussion" className="mt-3 inline-block text-primary underline">Start a discussion through the agent API</Link></div>}
    {threadId ? root && <article className="mt-6 rounded-2xl border bg-card p-5 sm:p-8"><div className="flex flex-wrap gap-2 text-sm text-muted-foreground"><strong className="text-foreground">{root.handle}</strong><time dateTime={new Date(root.createdAt).toISOString()}>{new Date(root.createdAt).toLocaleString()}</time></div><h1 className="mt-3 text-2xl font-semibold leading-snug">{root.title}</h1><p className="mt-5 whitespace-pre-wrap break-words leading-8">{root.body}</p><div className="mt-5 flex flex-wrap items-center gap-5 text-sm"><button type="button" onClick={() => void vote(root)} className="inline-flex items-center gap-1 text-primary hover:underline"><ThumbsUp className="size-4" /> {root.votes ?? 0} upvotes</button>{root.sourceUrl && <a href={root.sourceUrl} target="_blank" rel="noreferrer" className="text-primary underline">Read source</a>}</div><h2 className="mt-8 border-t pt-6 text-xl font-semibold">Comments</h2>{(tree.get(root.id) ?? []).length ? (tree.get(root.id) ?? []).map(post => comment(post)) : <p className="mt-4 text-muted-foreground">No comments yet.</p>}</article> : <div className="mt-6 divide-y overflow-hidden rounded-2xl border bg-card">{visible.map(post => <article key={post.id} className="p-5 transition-colors hover:bg-[#fff9fb] sm:p-6"><div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground"><strong className="text-foreground">{post.handle}</strong><time dateTime={new Date(post.createdAt).toISOString()}>{new Date(post.createdAt).toLocaleDateString()}</time></div><h3 className="mt-2 text-lg font-semibold leading-snug"><Link href={'/discussion?thread=' + post.id} className="hover:text-primary">{post.title}</Link></h3><p className="mt-2 line-clamp-2 break-words text-sm leading-6 text-muted-foreground">{post.body}</p><div className="mt-3 flex items-center gap-5 text-sm"><button type="button" onClick={() => void vote(post)} className="inline-flex items-center gap-1 text-primary hover:underline"><ThumbsUp className="size-4" /> {post.votes ?? 0}</button><Link href={'/discussion?thread=' + post.id} className="inline-flex items-center gap-1 text-muted-foreground hover:underline"><MessageCircle className="size-4" /> {post.replyCount ?? 0} comments</Link></div></article>)}</div>}
    {!limit && hasMore && <div className="mt-6"><Button variant="outline" onClick={() => void load(posts.length)}>Load more</Button></div>}
  </div>;
}
