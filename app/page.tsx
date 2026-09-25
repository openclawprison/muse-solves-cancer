import { MuseDesignPreview } from './preview/preview-client';
import { getPreviewData } from './preview/preview-data';
import './preview/preview.css';

export const dynamic = 'force-dynamic';

export default async function Home() {
  return <MuseDesignPreview initialData={await getPreviewData()} />;
}
