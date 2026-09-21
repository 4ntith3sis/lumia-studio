import { redirect } from 'next/navigation';

/**
 * Route lama — dialihkan ke struktur kategori baru.
 * Dipertahankan agar bookmark/link lama tidak rusak.
 */
export default function LegacyFrameworksRedirect() {
  redirect('/admin/frames');
}
