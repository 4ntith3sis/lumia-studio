import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Admin route UX gate.
 *
 * Penegakan akses yang sebenarnya ada di:
 * 1. RLS Postgres (sql/001_initial_migration.sql) — anon hanya baca frame aktif,
 *    tulis dan baca semua frame hanya untuk profiles.is_admin = true.
 * 2. Guard client-side di app/admin/frameworks/page.tsx + requireAdminClient()
 *    di lib/services/frame.service.ts.
 *
 * Middleware sengaja TIDAK memverifikasi session via
 * supabase.auth.getSession() di edge: @supabase/supabase-js menyimpan session
 * di localStorage (bukan cookie httpOnly), sehingga pemanggilan getSession()
 * tanpa token di middleware selalu null dan mengunci admin (redirect loop).
 * Verifikasi server penuh membutuhkan @supabase/ssr — di luar cakupan ini.
 */
export async function middleware(req: NextRequest) {
  // Izinkan halaman login selalu — jika tidak, terjadi redirect loop.
  if (req.nextUrl.pathname === '/admin/login') {
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*'],
};
