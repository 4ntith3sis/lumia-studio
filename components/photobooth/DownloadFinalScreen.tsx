'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import { boomerangOrder, loadImage, renderFinalCanvas } from '@/lib/photobooth/composite';
import {
  downloadCanvas,
  downloadOriginals,
  downloadUrl,
  drawCover,
  pickMp4Mime,
  canEncodeMp4Fallback,
  recordBoomerang,
  recordBoomerangMp4,
} from '@/lib/photobooth/export';
import { getCapturedPhotos } from '@/lib/photobooth/capture';
import {
  getPhotoCount,
  getSelectedFilterId,
  getSelectedFrame,
  clearPhotoboothSession,
} from '@/lib/photobooth/session';
import {
  defaultAdjustments,
  getStudioConfig,
  type PhotoAdjust,
} from '@/lib/photobooth/studio';
import { getFrameById } from '@/lib/services/frame.service';
import { getActiveEffects } from '@/lib/services/effect.service';
import type { EffectSettings, ValidPhotoCount } from '@/types';
import { settingsToCssFilter } from '@/lib/photobooth/effect-utils';

/**
 * Hasil akhir (Phase 6): preview + 3 download nyata.
 * - Foto asli (JPEG per foto, tanpa frame/filter).
 * - Foto final (PNG komposit = preview Studio, via modul bersama).
 * - Boomerang (MP4 via MediaRecorder native atau WebCodecs fallback).
 * Tanpa upload server, tanpa gambar dummy.
 */
export default function DownloadFinalScreen() {
  const router = useRouter();

  const [count, setCount] = useState<ValidPhotoCount | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [frameUrl, setFrameUrl] = useState<string | null>(null);
  const [hasFrame, setHasFrame] = useState(false);
  const [filterCss, setFilterCss] = useState('none');
  // Settings mentah untuk pixel fallback Safari (diteruskan ke renderFinalCanvas).
  const [effectSettings, setEffectSettings] = useState<EffectSettings | null>(null);
  const [adjustments, setAdjustments] = useState<PhotoAdjust[]>([]);
  const [invalid, setInvalid] = useState(false);
  const [finalReady, setFinalReady] = useState(false);
  const [finalError, setFinalError] = useState('');
  const [busy, setBusy] = useState<'originals' | 'final' | 'boomerang' | null>(null);
  const [boomProgress, setBoomProgress] = useState('');
  const [cardError, setCardError] = useState('');

  const finalCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const boomCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const boomTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* Init: validasi session + render preview final + animasi boomerang. */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const c = getPhotoCount();
      const captured = c === null ? [] : getCapturedPhotos().slice(0, c);
      if (c === null || captured.length === 0) {
        if (!cancelled) setInvalid(true);
        return;
      }
      if (!cancelled) {
        setCount(c);
        setPhotos(captured);
      }

      const config = getStudioConfig(c);
      const adj = config?.adjustments ?? defaultAdjustments(c);
      if (!cancelled) setAdjustments(adj);

      // Filter: cari dari database effects, fallback ke 'none'.
      const savedFilter = getSelectedFilterId();
      let css = 'none';
      let matchedSettings: EffectSettings | null = null;
      if (savedFilter && savedFilter !== 'filter-normal') {
        try {
          const dbEffects = await getActiveEffects();
          const matched = dbEffects.find((e) => e.id === savedFilter || e.slug === savedFilter);
          if (matched) {
            css = settingsToCssFilter(matched.settings);
            matchedSettings = matched.settings;
          }
        } catch {
          /* abaikan — tetap gunakan 'none' */
        }
      }
      if (!cancelled) {
        setFilterCss(css);
        setEffectSettings(matchedSettings);
      }

      // Frame: samakan dengan Studio (live → fallback session).
      let url: string | null = null;
      const saved = getSelectedFrame();
      if (saved && saved.photo_count === c) url = saved.image_url;
      try {
        const id = saved && saved.photo_count === c ? saved.frame_id : config?.frame_id;
        if (id) {
          const live = await getFrameById(id);
          if (live && live.is_active && live.photo_count === c) url = live.image_url;
        }
      } catch {
        /* fallback session di atas */
      }
      if (cancelled) return;
      setFrameUrl(url);
      setHasFrame(url !== null);

      // Render preview final (resolusi preview, algoritma sama dgn export).
      try {
        const preview = await renderFinalCanvas({
          photos: captured,
          frameUrl: url,
          filterCss: css,
          effectSettings: matchedSettings,
          adjustments: adj,
          count: c,
          width: 600,
        });
        if (cancelled) return;
        const target = finalCanvasRef.current;
        if (target) {
          target.width = preview.width;
          target.height = preview.height;
          target.getContext('2d')?.drawImage(preview, 0, 0);
        }
        setFinalReady(true);
      } catch (err) {
        if (!cancelled) {
          setFinalError(err instanceof Error ? err.message : 'Preview final gagal dibuat.');
        }
      }
    })();

    return () => {
      cancelled = true;
      if (boomTimerRef.current !== null) clearInterval(boomTimerRef.current);
    };
  }, []);

  // Animasi preview boomerang (foto asli, maju-mundur).
  useEffect(() => {
    if (photos.length === 0) return;
    let cancelled = false;
    let order = boomerangOrder(photos.length);
    let step = 0;
    const cache = new Map<string, HTMLImageElement>();

    const drawStep = async () => {
      const canvas = boomCanvasRef.current;
      if (!canvas || cancelled) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const url = photos[order[step % order.length]];
      let img = cache.get(url);
      if (!img) {
        try {
          img = await loadImage(url);
        } catch {
          return;
        }
        if (cancelled) return;
        cache.set(url, img);
      }
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      drawCover(ctx, img, canvas.width, canvas.height);
      step += 1;
    };

    order = boomerangOrder(photos.length);
    void drawStep();
    boomTimerRef.current = setInterval(() => void drawStep(), 500);
    return () => {
      cancelled = true;
      if (boomTimerRef.current !== null) clearInterval(boomTimerRef.current);
    };
  }, [photos]);

  const handleOriginals = async () => {
    if (busy !== null || photos.length === 0) return;
    // Jangan download jika jumlah foto capture tidak sesuai dengan yang dipilih di awal sesi.
    if (count !== null && photos.length !== count) {
      setCardError(`Jumlah foto belum lengkap (${photos.length} dari ${count}). Selesaikan pengambilan foto dulu.`);
      return;
    }
    setBusy('originals');
    setCardError('');
    try {
      await downloadOriginals(photos, count ?? undefined);
    } catch (err) {
      setCardError(err instanceof Error ? err.message : 'Download foto asli gagal.');
    } finally {
      setBusy(null);
    }
  };

  const handleFinal = async () => {
    if (busy !== null || count === null || photos.length === 0) return;
    setBusy('final');
    setCardError('');
    try {
      // Render ulang resolusi export dari konfigurasi terakhir.
      const canvas = await renderFinalCanvas({
        photos,
        frameUrl,
        filterCss,
        effectSettings,
        adjustments,
        count,
        width: 1200,
      });
      downloadCanvas(canvas, 'lumia-final-result.png');
    } catch (err) {
      setCardError(err instanceof Error ? err.message : 'Export foto final gagal.');
    } finally {
      setBusy(null);
    }
  };

  const handleBoomerang = async () => {
    if (busy !== null || photos.length === 0) return;
    setBusy('boomerang');
    setCardError('');
    try {
      let blob: Blob;
      const mp4 = pickMp4Mime();
      if (mp4) {
        // Jalur 1: rekam MP4 langsung (Safari / Chrome modern).
        setBoomProgress('Merekam...');
        const result = await recordBoomerang(photos, (done, total) => {
          setBoomProgress(`Merekam ${done}/${total}...`);
        }, mp4);
        blob = result.blob;
      } else if (await canEncodeMp4Fallback()) {
        // Jalur 2: encode langsung via WebCodecs + muxer (tanpa WebM).
        setBoomProgress('Menyiapkan MP4...');
        blob = await recordBoomerangMp4(photos, (done, total) => {
          setBoomProgress(`Mengonversi ${done}/${total}...`);
        });
      } else {
        throw new Error('Browser ini tidak mendukung pembuatan video MP4. Coba gunakan Chrome atau Safari terbaru.');
      }
      // Verifikasi: jangan pernah mengunduh file palsu.
      if (!blob.type.startsWith('video/mp4') || blob.size === 0) {
        throw new Error('Hasil MP4 tidak valid.');
      }
      const url = URL.createObjectURL(blob);
      try {
        downloadUrl(url, 'lumia-boomerang.mp4');
      } finally {
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
      }
    } catch (err) {
      setCardError(err instanceof Error ? err.message : 'Boomerang gagal dibuat.');
    } finally {
      setBusy(null);
      setBoomProgress('');
    }
  };

  const handleRestart = () => {
    // Mulai Sesi Baru: hapus SELURUH data sesi photobooth (terpusat,
    // hanya key LUMIA — tidak menyentuh storage lain).
    clearPhotoboothSession();
    router.push('/');
  };

  if (invalid) {
    return (
      <AppLayout>
        <div className="frame-state frame-state-error" role="alert">
          <div className="frame-state-title">Belum ada hasil</div>
          <p className="frame-state-desc">Sesi tidak memiliki foto yang valid untuk diunduh.</p>
          <Link href="/jumlah-foto" className="btn-secondary">
            Mulai dari Awal
          </Link>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="text-center download-heading">
        <div className="brand-logo" style={{ justifyContent: 'center', fontSize: '1.5rem', marginBottom: '0.25rem' }}>
          lumia<span className="logo-dot">.</span>
        </div>
        <h2 className="title-primary">Momen Terbaikmu Siap Diunduh!</h2>
        <p className="subtitle" style={{ marginTop: '0.2rem' }}>
          {count === null
            ? 'Pilih format hasil foto yang ingin kamu simpan ke perangkatmu.'
            : `${photos.length} dari ${count} foto siap diunduh.`}
        </p>
      </div>

      {cardError && (
        <div className="admin-error" role="alert" style={{ maxWidth: '900px' }}>
          {cardError}
        </div>
      )}

      <div className="download-cards-grid">
        <div className="download-card">
          <div className="download-preview-box">
            {photos.length === 0 ? (
              <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>Raw Photos</span>
            ) : (
              <div className="raw-photos-row">
                {photos.map((url, i) => (
                  <img key={i} src={url} alt={`Foto asli ${i + 1}`} className="raw-thumb-item" draggable={false} />
                ))}
              </div>
            )}
          </div>
          <div className="download-card-title">Raw photos</div>
          <div className="download-card-desc">Download your original photos</div>
          <button className="btn-card-download" onClick={() => void handleOriginals()} disabled={busy !== null || photos.length === 0}>
            {busy === 'originals' ? 'Mengunduh...' : 'Download originals'}
          </button>
        </div>

        <div className="download-card">
          <div className="download-preview-box">
            <canvas ref={boomCanvasRef} width={400} height={300} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '4px' }} />
          </div>
          <div className="download-card-title">Boomerang</div>
          <div className="download-card-desc">Download your photo boomerang (MP4)</div>
          <button className="btn-card-download" onClick={() => void handleBoomerang()} disabled={busy !== null || photos.length === 0}>
            {busy === 'boomerang' ? boomProgress || 'Merekam...' : 'Download boomerang'}
          </button>
        </div>

        <div className="download-card">
          <div className="download-preview-box">
            {finalError ? (
              <span style={{ fontSize: '0.8rem', color: '#FF5232', fontWeight: 600 }}>{finalError}</span>
            ) : (
              // Wrapper mengikuti rasio asli frame (bukan 3/4 kaku).
              // Padding 10% di kiri/kanan agar tidak menempel border container.
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '100%',
                  height: '100%',
                  boxSizing: 'border-box',
                  padding: '0 10%',
                }}
              >
                <canvas
                  ref={finalCanvasRef}
                  style={{
                    maxWidth: '100%',
                    maxHeight: '100%',
                    width: 'auto',
                    height: 'auto',
                    display: 'block',
                  }}
                />
              </div>
            )}
          </div>
          <div className="download-card-title">Framed photo</div>
          <div className="download-card-desc">Download your final photo</div>
          <button
            className="btn-card-download"
            onClick={() => void handleFinal()}
            disabled={busy !== null || !finalReady}
            style={{ background: 'var(--color-accent-primary)', color: '#FFF' }}
          >
            {busy === 'final' ? 'Mengekspor...' : 'Download final photo'}
          </button>
        </div>
      </div>

      <div className="download-bottom-actions">
        <button className="btn-primary" onClick={handleRestart}>
          <svg className="icon-svg" viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
          Mulai Sesi Baru
        </button>
        <Link href="/studio" className="btn-secondary" style={{ background: 'transparent', borderColor: 'transparent', boxShadow: 'none' }}>
          <svg className="icon-svg" viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          Kembali ke Studio
        </Link>
      </div>
    </AppLayout>
  );
}


