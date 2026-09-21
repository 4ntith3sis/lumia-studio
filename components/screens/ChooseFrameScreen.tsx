'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import FrameGallery from '@/components/photobooth/FrameGallery';
import { getFramesByPhotoCount } from '@/lib/services/frame.service';
import {
  frameToSelection,
  getPhotoCount,
  setSelectedFrame,
} from '@/lib/photobooth/session';
import type { Frame, ValidPhotoCount } from '@/types';

/**
 * Layar pilih frame (Phase 3, langkah 3).
 * - photo_count dibaca dari session & divalidasi (2/3/4/6).
 * - Frame diambil via getFramesByPhotoCount → filter + hanya aktif
 *   terjadi di query database/RLS, bukan filter kategori di browser.
 * - Pilihan disimpan (frame_id, photo_count, image_url, name) lalu
 *   lanjut ke /take-foto. Kamera TIDAK diimplementasikan di sini.
 */
export default function ChooseFrameScreen() {
  const router = useRouter();
  const [count, setCount] = useState<ValidPhotoCount | null>(null);
  const [countReady, setCountReady] = useState(false);
  const [frames, setFrames] = useState<Frame[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  /* Sinkronisasi session client-only (sessionStorage tidak ada saat SSR). */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setCount(getPhotoCount());
    setCountReady(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const loadFrames = useCallback(async (c: ValidPhotoCount) => {
    setLoading(true);
    setError('');
    setSelectedId(null);
    try {
      const data = await getFramesByPhotoCount(c);
      // Pengaman defensif: query sudah memfilter, ini hanya validasi akhir.
      setFrames(data.filter((f) => f.photo_count === c && f.is_active));
    } catch (err) {
      setFrames([]);
      setError(err instanceof Error ? err.message : 'Gagal memuat frame.');
    } finally {
      setLoading(false);
    }
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!countReady) return;
    if (count === null) {
      setLoading(false);
      return;
    }
    void loadFrames(count);
  }, [countReady, count, loadFrames]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleContinue = () => {
    const frame = frames.find((f) => f.id === selectedId);
    if (!frame || count === null) return;
    // Validasi akhir sebelum diteruskan — jangan percaya pilihan mentah.
    if (frame.photo_count !== count || !frame.is_active) {
      setError('Frame yang dipilih tidak lagi tersedia. Pilih frame lain.');
      return;
    }
    setSelectedFrame(frameToSelection(frame));
    router.push('/studio');
  };

  return (
    <AppLayout>
      <div className="frame-step-layout">
        <div className="text-center">
          <h2 className="title-primary">Pilih Frame Favoritmu</h2>
          <p className="subtitle" style={{ marginTop: '0.4rem' }}>
            {count !== null
              ? `Menampilkan frame khusus ${count} foto yang sedang aktif.`
              : 'Jumlah foto belum dipilih.'}
          </p>
        </div>

        {countReady && count === null ? (
          <div className="frame-state frame-state-error" role="alert">
            <div className="frame-state-title">Pilih jumlah foto dulu</div>
            <p className="frame-state-desc">
              Sesi tidak menemukan pilihan 2, 3, 4, atau 6 foto yang valid.
            </p>
            <Link href="/jumlah-foto" className="btn-secondary">
              Ke Pilih Jumlah Foto
            </Link>
          </div>
        ) : (
          count !== null && (
            <FrameGallery
              frames={frames}
              selectedId={selectedId}
              onSelect={setSelectedId}
              photoCount={count}
              loading={loading}
              error={error}
              onRetry={() => void loadFrames(count)}
            />
          )
        )}

        <div className="frame-actions">
          <Link href="/hasil-foto" className="btn-secondary">
            <svg className="icon-svg" viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            Kembali
          </Link>
          <button
            type="button"
            className="btn-primary"
            onClick={handleContinue}
            disabled={selectedId === null}
            style={{ flex: 1 }}
          >
            Lanjut ke Studio
            <svg className="icon-svg" viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </button>
        </div>
      </div>
    </AppLayout>
  );
}
