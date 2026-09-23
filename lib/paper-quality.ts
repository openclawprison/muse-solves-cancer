export type ResearchNote = {
  id: string; title: string; abstract: string; evidence_url: string; work_type: string;
  paper_section: string | null; wallet: string; handle: string; score: number;
  review_target_id: string | null; scored_at: number;
};

export type PaperNote = {
  id: string; title: string; abstract: string; evidence_url: string; submitted_url: string | null;
  work_type: string; paper_section: string | null; wallet: string; handle: string;
  review_target_id: string | null; source_match: boolean;
};

const primaryHosts = new Set(['pubmed.ncbi.nlm.nih.gov', 'doi.org', 'clinicaltrials.gov']);
const reviewTypes = new Set(['claim-verification', 'quality-audit', 'peer-review']);
const workOrder = ['reproduction', 'quality-audit', 'claim-verification', 'peer-review',
  'evidence-extraction', 'gap-analysis', 'source-screening', 'section-draft'];

export function sourceKey(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return '';
    const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    return `${hostname}${url.pathname.replace(/\/+$/, '').toLowerCase()}`;
  } catch { return ''; }
}

function primaryUrl(value: string): string | null {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    if (url.protocol !== 'https:' || !primaryHosts.has(host)) return null;
    if (host === 'pubmed.ncbi.nlm.nih.gov' && !/^\/\d+\/?$/.test(url.pathname)) return null;
    if (host === 'doi.org' && !/^\/10\.\d{4,9}\/.+/.test(url.pathname)) return null;
    if (host === 'clinicaltrials.gov' && !/^\/(?:study\/|ct2\/show\/)NCT\d{8}\/?$/i.test(url.pathname)) return null;
    return url.href;
  } catch { return null; }
}

export function selectPaperNotes(contributions: ResearchNote[], limit = 100): PaperNote[] {
  const byId = new Map(contributions.map(note => [note.id, note]));
  const candidates = contributions.flatMap(note => {
    const direct = primaryUrl(note.evidence_url);
    const target = note.review_target_id ? byId.get(note.review_target_id) : undefined;
    const inherited = reviewTypes.has(note.work_type) && target ? primaryUrl(target.evidence_url) : null;
    const source = inherited ?? direct;
    if (!source) return [];
    const submittedUrl = note.evidence_url.startsWith('https://') && sourceKey(note.evidence_url) !== sourceKey(source)
      ? note.evidence_url : null;
    const sourceMatch = Boolean(reviewTypes.has(note.work_type) && inherited && direct &&
      sourceKey(inherited) === sourceKey(direct));
    return [{
      id: note.id, title: note.title, abstract: note.abstract.slice(0, 1200),
      evidence_url: source, submitted_url: submittedUrl,
      work_type: note.work_type, paper_section: note.paper_section, wallet: note.wallet,
      handle: note.handle, review_target_id: note.review_target_id, source_match: sourceMatch,
      score: note.score, scored_at: note.scored_at,
    }];
  });
  const buckets = workOrder.map(type => candidates.filter(note => note.work_type === type)
    .sort((a, b) => b.scored_at - a.scored_at || b.score - a.score || a.id.localeCompare(b.id)));
  const selected: PaperNote[] = [];
  const seen = new Set<string>();
  const sourceCounts = new Map<string, number>();
  const walletCounts = new Map<string, number>();
  const add = (note: (typeof candidates)[number], walletCap: number) => {
    const key = sourceKey(note.evidence_url);
    if (seen.has(note.id) || !key || (sourceCounts.get(key) ?? 0) >= 4 ||
      (walletCounts.get(note.wallet) ?? 0) >= walletCap || selected.length >= limit) return false;
    seen.add(note.id);
    selected.push({ id: note.id, title: note.title, abstract: note.abstract, evidence_url: note.evidence_url,
      submitted_url: note.submitted_url, work_type: note.work_type, paper_section: note.paper_section,
      wallet: note.wallet, handle: note.handle, review_target_id: note.review_target_id,
      source_match: note.source_match });
    sourceCounts.set(key, (sourceCounts.get(key) ?? 0) + 1);
    walletCounts.set(note.wallet, (walletCounts.get(note.wallet) ?? 0) + 1);
    return true;
  };
  for (const walletCap of [12, Number.POSITIVE_INFINITY]) {
    let progressed = true;
    while (progressed && selected.length < limit) {
      progressed = false;
      for (const bucket of buckets) {
        const candidate = bucket.find(note => !seen.has(note.id) &&
          (sourceCounts.get(sourceKey(note.evidence_url)) ?? 0) < 4 &&
          (walletCounts.get(note.wallet) ?? 0) < walletCap);
        if (!candidate) continue;
        // Keep an audit's underlying extraction visible when it is available.
        const target = candidate.review_target_id ? candidates.find(note => note.id === candidate.review_target_id) : undefined;
        if (target && selected.length < limit - 1) add(target, walletCap);
        if (add(candidate, walletCap)) progressed = true;
      }
    }
  }
  return selected;
}

export function findingHasGroundedSource(input: {
  sourceUrls: string[]; contributionIds: string[]; status: string;
}, notes: PaperNote[]): { grounded: boolean; independentlyReviewed: boolean } {
  const cited = new Set(input.sourceUrls.map(sourceKey).filter(Boolean));
  const byId = new Map(notes.map(note => [note.id, note]));
  const linked = input.contributionIds.map(id => byId.get(id)).filter((note): note is PaperNote => Boolean(note));
  const grounded = cited.size > 0 && [...cited].every(key => linked.some(note => sourceKey(note.evidence_url) === key));
  const independentlyReviewed = grounded && [...cited].every(key => linked.some(note => {
    if (!reviewTypes.has(note.work_type) || !note.review_target_id || !note.source_match) return false;
    const target = byId.get(note.review_target_id);
    return Boolean(target && target.wallet !== note.wallet && key === sourceKey(note.evidence_url) &&
      sourceKey(target!.evidence_url) === sourceKey(note.evidence_url));
  }));
  return { grounded, independentlyReviewed };
}
