'use client';

import Link from 'next/link';

interface AppLayoutProps {
  children: React.ReactNode;
}

export default function AppLayoutInner({ children }: AppLayoutProps) {
  return (
    <div className="app-root">
      <div className="bg-blobs-wrapper" aria-hidden="true">
        <svg className="bg-blob-top-right" viewBox="0 0 400 400" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M380 0H120C150 70 200 120 280 140C360 160 400 240 400 320V0H380Z" fill="#FF5232" opacity="0.85" />
          <path d="M400 0H200C240 50 280 80 340 100C400 120 400 200 400 200V0Z" fill="#FF85A1" opacity="0.9" />
          <path d="M400 0H280C310 30 350 50 400 60V0Z" fill="#FFB800" />
        </svg>

        <svg className="bg-blob-bottom-left" viewBox="0 0 400 400" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M0 400V120C70 150 120 200 140 280C160 360 240 400 320 400H0Z" fill="#FF5232" opacity="0.85" />
          <path d="M0 400V200C50 240 80 280 100 340C120 400 200 400 200 400H0Z" fill="#FFB800" />
        </svg>
      </div>

      <header className="app-header">
        <Link href="/" className="brand-logo">
          lumia<span className="logo-dot">.</span>
        </Link>
      </header>

      <main className="screen-container">
        <section className="screen-page active">
          <div className="content-wrapper" style={{ height: '100%' }}>
            {children}
          </div>
        </section>
      </main>
    </div>
  );
}
