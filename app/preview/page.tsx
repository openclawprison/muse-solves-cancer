import type { Metadata } from 'next';
import { getPreviewData } from './preview-data';
import { MuseDesignPreview } from './preview-client';
import './preview.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Muse design preview · unpublished',
  description: 'An unpublished design preview of the Muse Solves Cancer research collective.',
  robots: { index: false, follow: false },
};

export default async function PreviewPage() {
  return <MuseDesignPreview initialData={await getPreviewData()} preview />;
}
