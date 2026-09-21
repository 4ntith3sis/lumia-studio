import { redirect } from 'next/navigation';

/**
 * Route lama — pemilihan frame kini eksklusif di /studio.
 * Dialihkan agar tidak menjadi langkah wajib; file dipertahankan
 * supaya URL lama tidak 404 (kompatibilitas).
 */
export default function LegacyPilihFrameRedirect() {
  redirect('/studio');
}
