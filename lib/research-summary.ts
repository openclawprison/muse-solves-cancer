import type { getManuscriptState } from '@/lib/manuscript';

type Manuscript = Awaited<ReturnType<typeof getManuscriptState>>;

export function summarizeResearch(paper: Manuscript) {
  const reviewed = paper.sections.filter((section) => ['reviewed', 'final'].includes(section.status) && section.content.trim());
  const findings = reviewed.filter((section) => !['abstract', 'introduction', 'methods', 'discussion', 'conclusion'].includes(section.id));
  const direction = reviewed.find((section) => section.id === 'discussion') ?? reviewed.find((section) => section.id === 'conclusion');
  const excerpt = (text: string) => text.trim().length > 650 ? text.trim().slice(0, 650).replace(/\s+\S*$/, '') + '…' : text.trim();
  return {
    title: paper.title, version: paper.version, status: paper.status,
    tldr: paper.counts.eligibleContributions === 0
      ? `${paper.counts.papers.toLocaleString()} papers and ${paper.counts.trials.toLocaleString()} trials are catalogued. No agent contribution has passed scoring yet, so there are no research findings or proposed solutions to report.`
      : `${paper.counts.eligibleContributions} contributions have passed scoring. ${paper.counts.draftedSections} manuscript sections are drafted and ${paper.counts.reviewedSections} have passed an independent agent audit. Scoring alone does not validate a scientific conclusion.`,
    findings: findings.slice(0, 3).map((section) => ({ id: section.id, title: section.title, excerpt: excerpt(section.content), sources: section.citations.length })),
    proposedDirections: direction ? { id: direction.id, excerpt: excerpt(direction.content) } : null,
    nextStep: paper.nextGate,
    conclusionStatus: 'The project has not established a validated cancer treatment. Any proposed directions remain research hypotheses.',
    updatedAt: new Date().toISOString(),
  };
}

export function manuscriptMarkdown(paper: Manuscript) {
  const summary = summarizeResearch(paper);
  const parts = [
    '# ' + paper.title, '',
    'Muse Solves Cancer · Living research manuscript', '',
    'Version: ' + paper.version + ' | Status: ' + paper.status,
    'Exported: ' + summary.updatedAt, '',
    '## TL;DR', '', summary.tldr, '', summary.conclusionStatus, '',
    '## Next research step', '', summary.nextStep, '',
  ];
  for (const section of paper.sections) {
    parts.push('## ' + section.title, '', 'Status: ' + section.status + ' | Section version: ' + section.version, '',
      section.content.trim() || '_Not drafted. Awaiting evidence and independent review._', '');
    if (section.citations.length) {
      parts.push('### Sources', '');
      for (const citation of section.citations) parts.push('- ' + citation.title + ' — ' + citation.url);
      parts.push('');
    }
    if (section.auditNotes) parts.push('Audit notes: ' + section.auditNotes, '');
  }
  parts.push('---', '', paper.safety, '', 'Live manuscript: https://musesolvescancer.com/paper', 'Source code: https://github.com/openclawprison/muse-solves-cancer', '');
  return parts.join('\n');
}
