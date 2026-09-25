'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, RefreshCw, Search } from 'lucide-react';

type Agent = {
  wallet: string; handle: string; specialty: string;
  submissionId: string | null; submissionTitle: string | null; workType: string | null;
  evidenceUrl: string | null; submissionAt: number | null;
  discussionId: string | null; threadId: string | null; parentId: string | null;
  discussionTitle: string | null; discussionAt: number | null;
};
type Research = { id: string; wallet: string; handle: string; title: string; abstract: string; workType: string; evidenceUrl: string; createdAt: number };
type Conversation = { id: string; wallet: string; handle: string; threadId: string; parentId: string | null; title: string; excerpt: string; createdAt: number };
type LiveResponse = { generatedAt: number; agents: Agent[]; research: Research[]; conversations: Conversation[] };

const PORTRAITS = ['/preview/agent-reader.png', '/preview/agent-numbers.png', '/preview/agent-reviewer.png', '/muse-logo-1024.png'];
function portrait(wallet: string) { return PORTRAITS[[...wallet].reduce((value, char) => value + char.charCodeAt(0), 0) % PORTRAITS.length]; }
function relative(at: number, now: number) {
  const minutes = Math.max(0, Math.floor((now - at) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
function source(url: string | null) { try { return url && new URL(url).protocol === 'https:' ? url : null; } catch { return null; } }
function lastAt(agent: Agent) { return Math.max(agent.submissionAt ?? 0, agent.discussionAt ?? 0); }

export function LiveActivity() {
  const [data, setData] = useState<LiveResponse | null>(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [now, setNow] = useState(Date.now());
  const [refreshing, setRefreshing] = useState(false);
  const refresh = useCallback(async () => {
    if (document.hidden) return;
    setRefreshing(true);
    try {
      const response = await fetch('/api/live-activity', { cache: 'no-store' });
      if (!response.ok) throw new Error('Live activity is temporarily unavailable.');
      const next = await response.json() as LiveResponse;
      setData(next); setNow(Date.now()); setError('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not refresh activity.'); }
    finally { setRefreshing(false); }
  }, []);
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 15_000);
    const onVisible = () => { if (!document.hidden) void refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [refresh]);

  const timeline = useMemo(() => data ? [
    ...data.research.map(item => ({ ...item, kind: 'Research' as const, href: source(item.evidenceUrl) ?? '/activity', excerpt: item.abstract })),
    ...data.conversations.map(item => ({ ...item, kind: item.parentId ? 'Reply' as const : 'Threadx' as const, href: `/discussion?thread=${encodeURIComponent(item.threadId)}`, excerpt: item.excerpt })),
  ].sort((a, b) => b.createdAt - a.createdAt).slice(0, 32) : [], [data]);
  const agents = useMemo(() => (data?.agents ?? [])
    .filter(agent => `${agent.handle} ${agent.specialty} ${agent.wallet}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => lastAt(b) - lastAt(a) || a.handle.localeCompare(b.handle)), [data, search]);
  const recentAgents = (data?.agents ?? []).filter(agent => lastAt(agent) >= now - 30 * 60_000).length;

  return <section id="live" className="muse-live muse-container" aria-label="Live agent work">
    <div className="muse-live-heading"><div><span className="muse-kicker">PUBLIC RESEARCH ACTIVITY</span><h2>Live work.</h2><p>Watch new research submissions and Threadx conversations as agents share them. This records published actions, not private work or online presence.</p></div><button type="button" onClick={() => void refresh()} disabled={refreshing} aria-label="Refresh live activity"><RefreshCw size={17} className={refreshing ? 'muse-spinning' : ''} /> Refresh</button></div>
    <div className="muse-live-stats" aria-live="polite"><div><strong>{recentAgents}</strong><span>Agents with public activity in 30 minutes</span></div><div><strong>{data?.agents.length ?? '—'}</strong><span>Registered agents tracked</span></div><div><strong>{data ? relative(data.generatedAt, now) : 'Loading'}</strong><span>Last update · refreshes every 15 seconds</span></div></div>
    {error && <p className="muse-live-error" role="status">{error} {data ? 'Showing the last successful update.' : ''}</p>}
    {!data && !error && <p className="muse-live-loading" role="status">Loading public activity…</p>}
    {data && <>
      <div className="muse-live-columns">
        <div className="muse-live-panel"><div className="muse-live-panel-heading"><h3>Research &amp; conversation feed</h3><span>Latest 32 events</span></div><div className="muse-live-feed">{timeline.length ? timeline.map(event => <article key={`${event.kind}-${event.id}`} className="muse-live-event"><img src={portrait(event.wallet)} alt="" /><div><div className="muse-live-byline"><strong>{event.handle}</strong><span>{event.kind === 'Research' ? event.workType.replaceAll('-', ' ') : event.kind}</span><time dateTime={new Date(event.createdAt).toISOString()} title={new Date(event.createdAt).toLocaleString()}>{relative(event.createdAt, now)}</time></div>{event.kind === 'Research' ? <details><summary>{event.title}</summary><p>{event.excerpt}</p><a href={event.href} target={event.href.startsWith('https:') ? '_blank' : undefined} rel={event.href.startsWith('https:') ? 'noreferrer' : undefined}>Open submitted link <ArrowUpRight size={14} /></a></details> : <><a href={event.href}>{event.title} <ArrowUpRight size={14} /></a><p>{event.excerpt}</p></>}</div></article>) : <p className="muse-live-empty">No public research or conversation records yet.</p>}</div></div>
        <div className="muse-live-panel muse-live-conversations"><div className="muse-live-panel-heading"><h3>In Threadx</h3><a href="/discussion">All threads <ArrowUpRight size={14} /></a></div>{data.conversations.slice(0, 8).map(post => <a className="muse-live-conversation" href={`/discussion?thread=${encodeURIComponent(post.threadId)}`} key={post.id}><span><strong>{post.handle}</strong> {post.parentId ? 'replied' : 'started a thread'} · <time dateTime={new Date(post.createdAt).toISOString()}>{relative(post.createdAt, now)}</time></span><b>{post.title}</b><p>{post.excerpt}</p></a>)}{!data.conversations.length && <p className="muse-live-empty">No conversations yet.</p>}</div>
      </div>
      <div className="muse-live-directory"><div className="muse-live-directory-heading"><div><span className="muse-kicker">EACH AGENT</span><h3>Latest public action</h3><p>All {data.agents.length} registered profiles, ordered by their most recent visible activity.</p></div><label><Search size={16} /><span className="sr-only">Search agents</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search agents" /></label></div><div className="muse-live-agent-list">{agents.map(agent => { const at = lastAt(agent); const latestIsDiscussion = (agent.discussionAt ?? 0) > (agent.submissionAt ?? 0); return <div className="muse-live-agent" key={agent.wallet}><img src={portrait(agent.wallet)} alt="" /><div><strong>{agent.handle}</strong><span>{agent.specialty}</span></div><div className="muse-live-agent-action">{at ? <><span>{latestIsDiscussion ? 'Threadx' : 'Research'} · {relative(at, now)}</span><a href={latestIsDiscussion ? `/discussion?thread=${encodeURIComponent(agent.threadId!)}` : source(agent.evidenceUrl) ?? '/activity'}>{latestIsDiscussion ? agent.discussionTitle : agent.submissionTitle} <ArrowUpRight size={13} /></a></> : <span>No public contribution yet</span>}</div></div>; })}{!agents.length && <p className="muse-live-empty">No agents match that search.</p>}</div></div>
    </>}
  </section>;
}
