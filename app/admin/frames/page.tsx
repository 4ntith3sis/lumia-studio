'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AdminLayout from '@/components/admin/AdminLayout';
import { getAllFrames } from '@/lib/services/frame.service';
import type { ValidPhotoCount } from '@/types';

const CATEGORIES: { value: ValidPhotoCount; label: string; desc: string }[] = [
  { value: 2, label: 'Frame 2 Foto', desc: 'Duo Photostrip' },
  { value: 3, label: 'Frame 3 Foto', desc: 'Triple Photostrip' },
  { value: 4, label: 'Frame 4 Foto', desc: 'Quad Grid Collage' },
  { value: 6, label: 'Frame 6 Foto', desc: 'Six Grid Deluxe' },
];

/**
 * Indeks kategori frame — setiap card menampilkan jumlah frame
 * kategori tersebut dan membuka pengelolaan khusus kategorinya.
 */
export default function AdminFramesIndex() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [counts, setCounts] = useState<Record<ValidPhotoCount, number>>({
    2: 0, 3: 0, 4: 0, 6: 0,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const frames = await getAllFrames();
        if (cancelled) return;
        const next: Record<ValidPhotoCount, number> = { 2: 0, 3: 0, 4: 0, 6: 0 };
        for (const f of frames) {
          if (f.photo_count === 2 || f.photo_count === 3 || f.photo_count === 4 || f.photo_count === 6) {
            next[f.photo_count] += 1;
          }
        }
        setCounts(next);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Gagal memuat frame.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AdminLayout>
      <h1 className="admin-title">Frames</h1>
      <p className="admin-subtitle">Pilih kategori untuk mengelola frame</p>

      {loading ? (
        <div className="admin-loading">Memuat kategori...</div>
      ) : error ? (
        <div className="admin-error" role="alert">{error}</div>
      ) : (
        <div className="admin-cat-grid">
          {CATEGORIES.map((c) => (
            <Link key={c.value} href={`/admin/frames/${c.value}`} className="admin-cat-card">
              <div className="admin-cat-count">{counts[c.value]}</div>
              <div className="admin-cat-name">{c.label}</div>
              <div className="admin-cat-desc">
                {c.desc} · {counts[c.value] === 0 ? 'Belum ada frame' : `${counts[c.value]} frame tersedia`}
              </div>
              <span className="btn-secondary" style={{ marginTop: '0.5rem' }}>
                Kelola →
              </span>
            </Link>
          ))}
        </div>
      )}
    </AdminLayout>
  );
}
