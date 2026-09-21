'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getSupabaseClient } from '@/lib/supabase/client';

export const dynamic = 'force-dynamic';

export default function AdminLogin() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const sb = getSupabaseClient();
    if (!sb) {
      setError('Konfigurasi Supabase belum tersedia. Hubungi administrator.');
      setLoading(false);
      return;
    }

    const { error: signInError } = await sb.auth.signInWithPassword({ email, password });

    if (signInError) {
      setError('Email atau password salah.');
      setLoading(false);
      return;
    }

    const session = await sb.auth.getSession();
    const userId = session.data.session?.user?.id;

    if (!userId) {
      setError('Gagal memverifikasi sesi.');
      setLoading(false);
      return;
    }

    const { data: profile, error: profileErr } = await sb
      .from('profiles')
      .select('is_admin')
      .eq('id', userId)
      .single();

    if (profileErr || !profile?.is_admin) {
      await sb.auth.signOut();
      setError('Akses ditolak. Hanya admin yang dapat masuk.');
      setLoading(false);
      return;
    }

    router.push('/admin');
    router.refresh();
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--color-bg-main)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'var(--font-sans)',
    }}>
      <svg className="bg-blob-top-right" viewBox="0 0 400 400" fill="none">
        <path d="M380 0H120C150 70 200 120 280 140C360 160 400 240 400 320V0H380Z" fill="#FF5232" opacity="0.85" />
        <path d="M400 0H200C240 50 280 80 340 100C400 120 400 200 400 200V0Z" fill="#FF85A1" opacity="0.9" />
        <path d="M400 0H280C310 30 350 50 400 60V0Z" fill="#FFB800" />
      </svg>
      <svg className="bg-blob-bottom-left" viewBox="0 0 400 400" fill="none">
        <path d="M0 400V120C70 150 120 200 140 280C160 360 240 400 320 400H0Z" fill="#FF5232" opacity="0.85" />
        <path d="M0 400V200C50 240 80 280 100 340C120 400 200 400 200 400H0Z" fill="#FFB800" />
      </svg>

      <div style={{
        background: '#FFFFFF',
        border: '3px solid var(--color-border-dark)',
        borderRadius: 'var(--radius-lg)',
        padding: '2.5rem',
        width: '100%',
        maxWidth: '420px',
        boxShadow: 'var(--shadow-pop-lg)',
        position: 'relative',
        zIndex: 10,
      }}>
        <div className="brand-logo" style={{ justifyContent: 'center', marginBottom: '0.5rem' }}>
          lumia<span className="logo-dot">.</span>
        </div>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 800, textAlign: 'center', marginBottom: '0.25rem' }}>
          Admin Panel
        </h2>
        <p style={{ color: 'var(--color-text-secondary)', textAlign: 'center', fontSize: '0.9rem', marginBottom: '2rem' }}>
          Masuk sebagai administrator
        </p>

        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.35rem' }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '0.7rem 1rem',
                border: '2px solid var(--color-border-dark)',
                borderRadius: 'var(--radius-md)',
                fontSize: '1rem',
                fontFamily: 'var(--font-sans)',
                background: 'var(--color-bg-main)',
                boxSizing: 'border-box',
              }}
              placeholder="admin@lumia.com"
            />
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.35rem' }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '0.7rem 1rem',
                border: '2px solid var(--color-border-dark)',
                borderRadius: 'var(--radius-md)',
                fontSize: '1rem',
                fontFamily: 'var(--font-sans)',
                background: 'var(--color-bg-main)',
                boxSizing: 'border-box',
              }}
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div style={{
              background: '#FFF5F5',
              border: '2px solid #FF5232',
              borderRadius: 'var(--radius-md)',
              padding: '0.6rem 1rem',
              fontSize: '0.85rem',
              color: '#FF5232',
              marginBottom: '1rem',
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-primary"
            style={{ width: '100%' }}
          >
            {loading ? 'Memproses...' : 'Masuk'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
          <Link href="/" style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', textDecoration: 'underline' }}>
            &larr; Kembali ke Beranda
          </Link>
        </div>
      </div>
    </div>
  );
}
