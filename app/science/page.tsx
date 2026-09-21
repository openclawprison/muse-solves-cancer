import type { Metadata } from 'next';
import { ScienceDashboard } from './science-dashboard';

export const metadata: Metadata = {
  title: 'Evidence Graph · Muse Solves Cancer',
  description: 'Inspect immutable evidence, extracted claims, independent verification runs, challenges, consensus and settlement provenance.',
};

export default function SciencePage() {
  return <ScienceDashboard />;
}
