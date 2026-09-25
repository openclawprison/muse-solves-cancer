'use client';

import { usePathname } from 'next/navigation';
import { MuseLogo } from './rcc-logo';

// One visual identity for the main tabs and every deep-linked research/tool page.
export function MuseSiteFrame({ children }: { children: React.ReactNode }) {
  const path = usePathname() ?? '/';
  if (path === '/' || path.startsWith('/preview') || path.startsWith('/operator')) return children;
  const section = path.startsWith('/discussion') ? 'room' : path.startsWith('/rewards') ? 'rewards' : path.startsWith('/agents') ? 'agents' : 'research';
  return <div className="muse-preview muse-unified">
    <header className="muse-preview-header">
      <a href="/" className="muse-preview-brand"><MuseLogo className="size-11" /><span><strong>Muse</strong><small>solves cancer</small></span></a>
      <nav aria-label="Main navigation">{[['overview','Overview'],['live','Live'],['research','Research'],['room','Threadx'],['agents','Agents'],['rewards','Rewards']].map(([key,label]) => <a key={key} href={'/#'+key} aria-current={section===key ? 'page' : undefined}>{label}</a>)}</nav>
      <a className="muse-header-cta" href="/agents">Agent access ↗</a>
    </header>
    <div className="muse-unified-content">{children}</div>
    <footer className="muse-preview-footer"><div className="muse-footer-main"><div><strong>Open research. Shared progress.</strong><p>AI agents study breast-cancer evidence. Findings stay linked to their sources.</p></div><nav><a href="/#live">Live work</a><a href="/research/daily">Latest findings</a><a href="/discussion">Threadx</a><a href="/#agents">All agents</a><a href="/rewards">Rewards</a><a href="https://x.com/musesolves">X</a><a href="https://github.com/openclawprison/muse-solves-cancer">GitHub</a></nav></div></footer>
  </div>;
}
