'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import { getCapturedPhotos } from '@/lib/photobooth/capture';
import { clearCapturedData, getPhotoCount } from '@/lib/photobooth/session';

/**
 * Review hasil foto: preview NYATA setiap foto sesuai urutan
 * pengambilan (bukan label placeholder). Tanpa frame/filter/
 * compositing — itu ranah /studio.
 */
export default function ResultsReviewScreen() {
  const router = useRouter();
  const [total, setTotal] = useState<number | null>(null);
  const [photos, setPhotos] = useState<string[] | null>(null);
  const [broken, setBroken] = useState<readonly number[]>([]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setTotal(getPhotoCount());
    setPhotos(getCapturedPhotos());
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const markBroken = (index: number) => {
    setBroken((prev) => (prev.includes(index) ? prev : [...prev, index]));
  };

  const loading = photos === null || total === null;
  const validCount = photos === null ? 0 : photos.length - broken.length;
  const complete =
    !loading && total !== null && photos !== null && photos.length === total && broken.length === 0;

  return (
    <AppLayout>
      <div className="text-center">
        <h2 className="title-primary">Hasil Foto Kamu</h2>
        <p className="subtitle">
          {loading
            ? 'Memuat foto...'
            : total === null
              ? 'Jumlah foto belum dipilih.'
              : `${validCount} dari ${total} foto berhasil diambil.`}
        </p>
      </div>

      {loading ? (
        <div className="results-gallery-grid" aria-busy="true" aria-label="Memuat foto">
          {Array.from({ length: total ?? 4 }, (_, i) => (
            <div key={i} className="result-card-item" style={{ background: 'var(--color-bg-main)' }} />
          ))}
        </div>
      ) : total === null || photos === null || photos.length === 0 ? (
        <div className="frame-state frame-state-error" role="alert">
          <div className="frame-state-title">Belum ada foto</div>
          <p className="frame-state-desc">Ambil foto terlebih dahulu di halaman kamera.</p>
          <Link href="/take-foto" className="btn-secondary">
            Ke Kamera
          </Link>
        </div>
      ) : (
        <div className="results-gallery-grid">
          {Array.from({ length: total }, (_, i) => {
            const url = photos[i];
            const failed = broken.includes(i);
            return (
              <div
                key={i}
                className="result-card-item"
                style={{ background: 'var(--color-bg-main)', alignItems: 'center', justifyContent: 'center' }}
              >
                {url && !failed ? (
                  <img
                    src={url}
                    alt={`Hasil foto ${i + 1}`}
                    draggable={false}
                    onError={() => markBroken(i)}
                  />
                ) : (
                  <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', fontWeight: 700 }}>
                    {failed ? `Foto ${i + 1} gagal dimuat` : `Foto ${i + 1}`}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => {
            // Ulang Foto = sesi capture baru: buang foto lama dulu.
            clearCapturedData();
            router.push('/take-foto');
          }}
        >
          <svg className="icon-svg" viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
          Ulang Foto
        </button>
        {complete ? (
          <Link href="/studio" className="btn-primary">
            Lanjut ke Studio
            <svg className="icon-svg" viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </Link>
        ) : (
          <button type="button" className="btn-primary" disabled style={{ opacity: 0.5, cursor: 'not-allowed' }}>
            Lanjut ke Studio
            <svg className="icon-svg" viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </button>
        )}
      </div>
    </AppLayout>
  );
}
