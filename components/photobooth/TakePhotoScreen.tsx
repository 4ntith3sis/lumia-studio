'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import { getFrameById } from '@/lib/services/frame.service';
import {
  getPhotoCount,
  getSelectedFrame,
  clearCapturedData,
  isReloadNavigation,
  type SelectedFrame,
} from '@/lib/photobooth/session';
import {
  addCapturedPhoto,
  clearCapturedPhotos,
  getCapturedPhotos,
} from '@/lib/photobooth/capture';
import {
  startCameraStream,
  stopCameraStream,
} from '@/lib/photobooth/camera';
import type { ValidPhotoCount } from '@/types';

type FrameStatus = 'checking' | 'ok' | 'missing' | 'invalid';
type CameraStatus = 'starting' | 'live' | 'off' | 'error';

const CAPTURE_W = 800;
const CAPTURE_H = 600;

/**
 * Halaman kamera (Phase 4) — route /take-foto.
 * Live preview getUserMedia → countdown 3-2-1 per foto → capture
 * canvas (JPEG, mirror selfie) → simpan sessionStorage → /hasil-foto.
 * TANPA editor, filter, compositing, atau upload server.
 */
export default function TakePhotoScreen() {
  const router = useRouter();

  const [photoCount, setPhotoCount] = useState<ValidPhotoCount | null>(null);
  const [countInvalid, setCountInvalid] = useState(false);
  const [frame, setFrame] = useState<SelectedFrame | null>(null);
  const [frameStatus, setFrameStatus] = useState<FrameStatus>('checking');

  const [camStatus, setCamStatus] = useState<CameraStatus>('starting');
  const [camError, setCamError] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [flash, setFlash] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const capturingRef = useRef(false);
  const navigatedRef = useRef(false);
  const startingRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const stopStream = useCallback(() => {
    clearTimer();
    stopCameraStream(streamRef.current, videoRef.current);
    streamRef.current = null;
  }, [clearTimer]);

  const startCamera = useCallback(async () => {
    if (!mountedRef.current) return;
    // Cegah stream ganda: jangan mulai bila sedang memulai/sudah ada.
    if (startingRef.current || streamRef.current) return;
    // Jangan mulai saat tab disembunyikan (izin butuh tab aktif).
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    startingRef.current = true;
    setCamStatus('starting');
    setCamError('');
    try {
      const stream = await startCameraStream(videoRef.current);
      // User meninggalkan halaman saat izin diproses → buang stream.
      if (!mountedRef.current) {
        stopCameraStream(stream, null);
        return;
      }
      streamRef.current = stream;
      if (mountedRef.current) setCamStatus('live');
    } catch (err) {
      if (!mountedRef.current) return;
      setCamStatus('error');
      setCamError(err instanceof Error ? err.message : 'Stream kamera gagal dimulai.');
    } finally {
      startingRef.current = false;
    }
  }, []);

  /* Init: validasi count + frame, pulihkan progres, nyalakan kamera. */
  useEffect(() => {
    mountedRef.current = true;

    // Refresh browser = sesi baru: buang foto/konfigurasi lama.
    // Navigasi normal (push) mempertahankan progres. Idempoten.
    if (isReloadNavigation()) {
      clearCapturedData();
    }

    const count = getPhotoCount();
    if (count === null) {
      setCountInvalid(true);
      router.replace('/jumlah-foto');
      return () => {
        mountedRef.current = false;
      };
    }
    setPhotoCount(count);
    setPhotos(getCapturedPhotos().slice(0, count));

    // Validasi ulang frame dari database (tidak dipercaya mentah).
    (async () => {
      const selected = getSelectedFrame();
      if (!selected || selected.photo_count !== count) {
        if (mountedRef.current) {
          setFrame(selected);
          setFrameStatus(selected ? 'invalid' : 'missing');
        }
        return;
      }
      try {
        const live = await getFrameById(selected.frame_id);
        if (!mountedRef.current) return;
        if (!live || !live.is_active || live.photo_count !== selected.photo_count) {
          setFrame(selected);
          setFrameStatus('invalid');
        } else {
          setFrame({
            frame_id: live.id,
            photo_count: live.photo_count,
            image_url: live.image_url,
            name: live.name,
          });
          setFrameStatus('ok');
        }
      } catch {
        if (mountedRef.current) {
          setFrame(selected);
          setFrameStatus('invalid');
        }
      }
    })();

    void startCamera();

    // Salin ref untuk cleanup (nilai ref bisa berubah saat cleanup jalan).
    const videoEl = videoRef.current;
    return () => {
      mountedRef.current = false;
      startingRef.current = false;
      if (timerRef.current !== null) clearInterval(timerRef.current);
      if (autoTimerRef.current !== null) clearTimeout(autoTimerRef.current);
      if (flashTimerRef.current !== null) clearTimeout(flashTimerRef.current);
      if (navTimerRef.current !== null) clearTimeout(navTimerRef.current);
      stopCameraStream(streamRef.current, videoEl);
      streamRef.current = null;
    };
  }, [router, startCamera]);

  // Lifecycle tab/halaman: hentikan kamera saat tab disembunyikan
  // atau halaman ditinggalkan; TIDAK auto-start saat kembali.
  useEffect(() => {
    const handleHidden = () => {
      clearTimer();
      if (autoTimerRef.current !== null) clearTimeout(autoTimerRef.current);
      capturingRef.current = false;
      startingRef.current = false;
      if (mountedRef.current) {
        setCountdown(null);
        setStatusMessage('');
      }
      stopStream();
      if (mountedRef.current) {
        setCamStatus((s) => (s === 'live' || s === 'starting' ? 'off' : s));
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') handleHidden();
    };
    const onPageHide = () => {
      stopStream();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [stopStream, clearTimer]);

  type CaptureOutcome = 'ok' | 'done' | 'fail';

  const captureOnce = useCallback((): CaptureOutcome => {
    const video = videoRef.current;
    const count = getPhotoCount();
    if (!video || count === null) {
      return 'fail';
    }
    if (video.readyState < 2 || video.videoWidth === 0) {
      if (mountedRef.current) {
        setStatusMessage('Video belum siap. Ketuk shutter untuk mencoba lagi.');
      }
      return 'fail';
    }

    // Cover-crop mengikuti object-fit cover pada preview.
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const scale = Math.max(CAPTURE_W / vw, CAPTURE_H / vh);
    const sw = CAPTURE_W / scale;
    const sh = CAPTURE_H / scale;
    const sx = (vw - sw) / 2;
    const sy = (vh - sh) / 2;

    const canvas = document.createElement('canvas');
    canvas.width = CAPTURE_W;
    canvas.height = CAPTURE_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      if (mountedRef.current) {
        setStatusMessage('Gagal mengambil foto. Ketuk shutter untuk mencoba lagi.');
      }
      return 'fail';
    }
    // Mirror seperti preview selfie (mengikuti desain referensi).
    ctx.translate(CAPTURE_W, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, CAPTURE_W, CAPTURE_H);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

    if (mountedRef.current) {
      setFlash(true);
      if (flashTimerRef.current !== null) clearTimeout(flashTimerRef.current);
      flashTimerRef.current = setTimeout(() => {
        if (mountedRef.current) setFlash(false);
      }, 400);
    }

    const stored = addCapturedPhoto(dataUrl, count);
    if (!stored) {
      if (mountedRef.current) {
        setStatusMessage('Gagal menyimpan foto (penyimpanan penuh?). Ketuk shutter untuk mencoba lagi.');
      }
      return 'fail';
    }
    if (!mountedRef.current) return 'ok';

    const next = [...getCapturedPhotos()];
    setPhotos(next);

    if (next.length >= count && !navigatedRef.current) {
      navigatedRef.current = true;
      navTimerRef.current = setTimeout(() => {
        if (!mountedRef.current) return;
        stopStream();
        router.push('/hasil-foto');
      }, 700);
      return 'done';
    }
    return 'ok';
  }, [router, stopStream]);

  // Satu rangkaian countdown → capture. Setelah sukses dan belum lengkap,
  // jeda 1000ms lalu foto berikutnya OTOMATIS (tanpa shutter).
  const runCycle = useCallback(function runCycle() {
    if (!mountedRef.current) {
      capturingRef.current = false;
      return;
    }
    let remaining = 3;
    setStatusMessage('');
    setCountdown(remaining);
    timerRef.current = setInterval(() => {
      remaining -= 1;
      if (!mountedRef.current) {
        clearTimer();
        capturingRef.current = false;
        return;
      }
      if (remaining > 0) {
        setCountdown(remaining);
        return;
      }
      clearTimer();
      setCountdown(null);
      const outcome = captureOnce();
      if (!mountedRef.current) return;
      if (outcome !== 'ok') {
        // 'done' (navigasi dijadwalkan) atau 'fail' (pesan sudah tampil).
        capturingRef.current = false;
        return;
      }
      setStatusMessage('Bersiap untuk foto berikutnya...');
      autoTimerRef.current = setTimeout(() => {
        autoTimerRef.current = null;
        if (!mountedRef.current || navigatedRef.current) {
          capturingRef.current = false;
          return;
        }
        if (!streamRef.current) {
          capturingRef.current = false;
          setStatusMessage('Kamera berhenti. Ketuk shutter untuk melanjutkan.');
          return;
        }
        runCycle();
      }, 1000);
    }, 1000);
  }, [captureOnce, clearTimer]);

  const handleShutter = useCallback(() => {
    // Shutter hanya memulai rangkaian foto PERTAMA; sisanya otomatis.
    // Guard ganda: cegah foto ganda akibat double click.
    if (capturingRef.current || countdown !== null) return;
    if (camStatus !== 'live') return;
    if (photoCount === null || photos.length >= photoCount) return;
    const video = videoRef.current;
    if (!video || video.readyState < 2 || video.videoWidth === 0) {
      setStatusMessage('Video belum siap. Tunggu preview berjalan, lalu coba lagi.');
      return;
    }

    capturingRef.current = true;
    runCycle();
  }, [camStatus, countdown, photoCount, photos.length, runCycle]);

  const handleCancel = useCallback(() => {
    if (timerRef.current !== null) clearInterval(timerRef.current);
    if (autoTimerRef.current !== null) clearTimeout(autoTimerRef.current);
    if (navTimerRef.current !== null) clearTimeout(navTimerRef.current);
    capturingRef.current = false;
    setCountdown(null);
    setStatusMessage('');
    stopStream();
    clearCapturedPhotos();
    router.push('/jumlah-foto');
  }, [router, stopStream]);

  const shutterDisabled =
    countdown !== null || camStatus !== 'live' || photoCount === null || photos.length >= photoCount;
  const currentPhoto = photoCount === null ? 0 : Math.min(photos.length + 1, photoCount);

  return (
    <AppLayout>
      <div className="camera-layout">
        <div className="camera-thumbnails-sidebar">
          <div className="thumb-title">
            Tangkapan (<span>({photos.length}/{photoCount ?? '?'})</span>)
          </div>
          <div className="thumb-slots-container">
            {photoCount === null ? (
              <div className="thumb-slot">?</div>
            ) : (
              Array.from({ length: photoCount }, (_, i) => (
                <div key={i} className={`thumb-slot${photos[i] ? ' captured' : ''}`}>
                  {photos[i] ? (
                    <img src={photos[i]} alt={`Hasil foto ${i + 1}`} draggable={false} />
                  ) : (
                    `#${i + 1}`
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="camera-viewport-card">
          <video
            ref={videoRef}
            className="camera-video"
            playsInline
            muted
            autoPlay
            aria-label="Live preview kamera"
          />

          <div className="camera-hud">
            <div className="hud-pill">
              <div className="pulse-dot" />
              <span>{camStatus === 'live' ? 'LIVE CAMERA' : 'KAMERA MATI'}</span>
            </div>
            <div className="hud-pill">
              <span>Foto {currentPhoto} dari {photoCount ?? '?'}</span>
            </div>
          </div>

          {countdown !== null && (
            <div className="countdown-overlay active" aria-live="assertive">
              <div className="countdown-number">{countdown}</div>
            </div>
          )}

          {flash && <div className="flash-overlay active" aria-hidden="true" />}

          {camStatus === 'error' && (
            <div className="camera-error-panel" role="alert">
              <div className="camera-error-title">Kamera Bermasalah</div>
              <p className="camera-error-desc">{camError}</p>
              <button type="button" className="btn-secondary" onClick={() => void startCamera()}>
                Coba Lagi
              </button>
            </div>
          )}

          {camStatus === 'off' && (
            <div className="camera-error-panel" role="status">
              <div className="camera-error-title">Kamera Nonaktif</div>
              <p className="camera-error-desc">
                Kamera dihentikan karena tab disembunyikan. Aktifkan lagi untuk melanjutkan.
              </p>
              <button type="button" className="btn-secondary" onClick={() => void startCamera()}>
                Aktifkan Kamera Lagi
              </button>
            </div>
          )}

          {countInvalid ? (
            <div className="camera-error-panel" role="alert">
              <div className="camera-error-title">Jumlah foto belum dipilih</div>
              <p className="camera-error-desc">Mengarahkan kembali ke pemilihan jumlah foto...</p>
              <Link href="/jumlah-foto" className="btn-secondary">
                Pilih Jumlah Foto
              </Link>
            </div>
          ) : (
            <div className="camera-controls-bottom">
              <button type="button" className="btn-secondary" onClick={handleCancel}>
                Batal
              </button>
              <button
                type="button"
                className="btn-shutter"
                title="Ambil Foto Sekarang"
                aria-label={`Ambil foto ${currentPhoto} dari ${photoCount ?? '?'}`}
                onClick={handleShutter}
                disabled={shutterDisabled}
                style={shutterDisabled ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
              >
                <div className="btn-shutter-inner" />
              </button>
            </div>
          )}
        </div>
      </div>

      {statusMessage && (
        <div className="capture-status" role="status">
          {statusMessage}
        </div>
      )}

      {photoCount !== null && frameStatus === 'ok' && frame && (
        <div className="selected-frame-chip" role="status">
          <img src={frame.image_url} alt={`Frame ${frame.name}`} draggable={false} />
          <span>
            {frame.name} · {frame.photo_count} Foto
          </span>
        </div>
      )}
    </AppLayout>
  );
}
