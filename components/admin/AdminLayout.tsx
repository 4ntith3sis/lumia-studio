'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { getSupabaseClient } from '@/lib/supabase/client';
import { isAdmin } from '@/lib/services/frame.service';

interface AdminLayoutProps {
  children: React.ReactNode;
}

const NAV_ITEMS = [
  {
    href: '/admin',
    label: 'Dashboard',
    match: (path: string) => path === '/admin',
    icon: (
      <svg className="icon-svg" viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    href: '/admin/frames',
    label: 'Frames',
    match: (path: string) => path.startsWith('/admin/frames') || path.startsWith('/admin/frameworks'),
    icon: (
      <svg className="icon-svg" viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <polyline points="21 15 16 10 5 21" />
      </svg>
    ),
  },
  {
    href: '/admin/effects',
    label: 'Effects',
    match: (path: string) => path.startsWith('/admin/effects'),
    icon: (
      <svg className="icon-svg" viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3z" />
      </svg>
    ),
  },
];

/**
 * Layout utama admin: sidebar navigasi + guard is_admin.
 * - Desktop: sidebar tetap. Mobile: off-canvas + hamburger + overlay.
 * - Guard client-side; penegakan nyata tetap di RLS + requireAdminClient.
 */
export default function AdminLayout({ children }: AdminLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const allowed = await isAdmin();
        if (!cancelled) {
          if (!allowed) {
            router.replace('/admin/login');
            return;
          }
          setAuthChecked(true);
        }
      } catch {
        if (!cancelled) router.replace('/admin/login');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  // Tutup sidebar mobile setiap pindah halaman.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const signOut = async () => {
    const sb = getSupabaseClient();
    if (sb) await sb.auth.signOut();
    router.push('/');
    router.refresh();
  };

  if (!authChecked) {
    return (
      <div className="admin-shell">
        <div className="admin-main">
          <div className="admin-content">
            <div className="admin-loading">Memeriksa akses admin...</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-shell">
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Tutup menu"
          className="admin-overlay"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside className={`admin-sidebar${sidebarOpen ? ' open' : ''}`}>
        <div className="admin-brand">
          <Link href="/admin" className="brand-logo" style={{ fontSize: '1.6rem' }}>
            lumia<span className="logo-dot">.</span>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)', marginLeft: '0.6rem', borderLeft: '2px solid var(--color-border-dark)', paddingLeft: '0.6rem' }}>
              ADMIN
            </span>
          </Link>
        </div>

        <nav className="admin-nav" aria-label="Navigasi admin">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`admin-nav-link${item.match(pathname) ? ' active' : ''}`}
              aria-current={item.match(pathname) ? 'page' : undefined}
            >
              {item.icon}
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="admin-sidebar-footer">
          <button type="button" onClick={signOut} className="btn-secondary" style={{ width: '100%' }}>
            Keluar
          </button>
        </div>
      </aside>

      <div className="admin-main">
        <div className="admin-topbar">
          <button
            type="button"
            className="admin-menu-btn"
            aria-label="Buka menu"
            onClick={() => setSidebarOpen(true)}
          >
            <svg className="icon-svg" viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <span className="brand-logo" style={{ fontSize: '1.4rem' }}>
            lumia<span className="logo-dot">.</span>
          </span>
        </div>

        <div className="admin-content">
          <div className="admin-page">{children}</div>
        </div>
      </div>
    </div>
  );
}
