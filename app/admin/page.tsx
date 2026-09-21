'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AdminLayout from '@/components/admin/AdminLayout';
import { getAllFrames } from '@/lib/services/frame.service';
import type { ValidPhotoCount } from '@/types';

const CATEGORIES: { value: ValidPhotoCount; label: string }[] = [
  { value: 2, label: 'Frame 2 Foto' },
  { value: 3, label: 'Frame 3 Foto' },
  { value: 4, label: 'Frame 4 Foto' },
  { value: 6, label: 'Frame 6 Foto' },
];

/**
 * Dashboard admin — statistik dari data frames yang tersedia
 * (tanpa data palsu). Kartu mengarah ke pengelolaan per kategori.
 */
export default function AdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [total, setTotal] = useState(0);
  const [active, setActive] = useState(0);
  const [perCount, setPerCount] = useState<Record<ValidPhotoCount, number>>({
    2: 0, 3: 0, 4: 0, 6: 0,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const frames = await getAllFrames();
        if (cancelled) return;
        setTotal(frames.length);
        setActive(frames.filter((f) => f.is_active).length);
        const counts: Record<ValidPhotoCount, number> = { 2: 0, 3: 0, 4: 0, 6: 0 };
        for (const f of frames) {
          if (f.photo_count === 2 || f.photo_count === 3 || f.photo_count === 4 || f.photo_count === 6) {
            counts[f.photo_count] += 1;
          }
        }
        setPerCount(counts);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Gagal memuat statistik.');
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
      <h1 className="admin-title">Dashboard</h1>
      <p className="admin-subtitle">Ringkasan frame photobooth LUMIA</p>

      {loading ? (
        <div className="admin-loading">Memuat statistik...</div>
      ) : error ? (
        <div className="admin-error" role="alert">{error}</div>
      ) : (
        <>
          <div className="admin-stat-grid">
            <Link href="/admin/frames" className="admin-stat-card">
              <div className="admin-stat-value">{total}</div>
              <div className="admin-stat-label">Total Frame</div>
            </Link>
            <Link href="/admin/frames" className="admin-stat-card">
              <div className="admin-stat-value">{active}</div>
              <div className="admin-stat-label">Frame Aktif</div>
            </Link>
            {CATEGORIES.map((c) => (
              <Link key={c.value} href={`/admin/frames/${c.value}`} className="admin-stat-card">
                <div className="admin-stat-value">{perCount[c.value]}</div>
                <div className="admin-stat-label">{c.label}</div>
              </Link>
            ))}
          </div>
        </>
      )}
    </AdminLayout>
  );
}
