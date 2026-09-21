import { notFound } from 'next/navigation';
import AdminLayout from '@/components/admin/AdminLayout';
import FrameManager from '@/components/admin/FrameManager';
import type { ValidPhotoCount } from '@/types';

export const dynamic = 'force-dynamic';

const VALID_COUNTS: readonly number[] = [2, 3, 4, 6];

interface CategoryPageProps {
  params: { photoCount: string };
}

/**
 * Pengelolaan frame per kategori — photoCount URL divalidasi ketat
 * (hanya 2/3/4/6), selebihnya 404. Query difilter di database
 * via getFramesByPhotoCount, bukan di browser.
 */
export default function AdminFrameCategoryPage({ params }: CategoryPageProps) {
  const parsed = Number.parseInt(params.photoCount, 10);
  if (!VALID_COUNTS.includes(parsed)) {
    notFound();
  }
  const category = parsed as ValidPhotoCount;

  return (
    <AdminLayout>
      <FrameManager category={category} />
    </AdminLayout>
  );
}
