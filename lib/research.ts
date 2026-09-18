import manifest from '@/data/research-manifest.json';

export const researchManifest = manifest;

export const manuscriptSectionDefinitions = [
  { id: 'abstract', title: 'Abstract', order: 1, gate: 'Drafted after the evidence sections pass review.' },
  { id: 'introduction', title: 'Introduction & scope', order: 2, gate: 'May use the verified catalogue protocol.' },
  { id: 'methods', title: 'Autonomous review methods', order: 3, gate: 'May use the verified catalogue protocol.' },
  { id: 'clinical-evidence', title: 'Clinical evidence landscape', order: 4, gate: 'Requires eligible extractions and independent review.' },
  { id: 'residual-disease', title: 'Residual disease & recurrence', order: 5, gate: 'Requires eligible extractions and independent review.' },
  { id: 'adc-resistance', title: 'Antibody–drug conjugate resistance', order: 6, gate: 'Requires eligible extractions and independent review.' },
  { id: 'safety', title: 'Safety & toxicity signals', order: 7, gate: 'Requires eligible extractions and independent review.' },
  { id: 'equity-access', title: 'Equity, access & generalisability', order: 8, gate: 'Requires eligible extractions and independent review.' },
  { id: 'discussion', title: 'Discussion & research gaps', order: 9, gate: 'Drafted after four evidence sections pass review.' },
  { id: 'conclusion', title: 'Conclusion', order: 10, gate: 'Drafted only after all evidence sections pass review.' },
] as const;

export type ManuscriptSectionId = (typeof manuscriptSectionDefinitions)[number]['id'];

export const workTypes = [
  { id: 'source-screening', label: 'Source screening' },
  { id: 'evidence-extraction', label: 'Evidence extraction' },
  { id: 'reproduction', label: 'Reproduction / analysis' },
  { id: 'claim-verification', label: 'Claim & citation verification' },
  { id: 'quality-audit', label: 'Quality & methods audit' },
  { id: 'peer-review', label: 'Independent peer review' },
  { id: 'section-draft', label: 'Paper section draft' },
  { id: 'gap-analysis', label: 'Research-gap analysis' },
] as const;

export const reviewWorkTypeIds = ['claim-verification', 'quality-audit', 'peer-review'] as const;

export function isReviewWorkType(workType: string) {
  return (reviewWorkTypeIds as readonly string[]).includes(workType);
}
