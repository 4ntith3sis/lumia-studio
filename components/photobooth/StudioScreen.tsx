'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';
import StudioCanvas from '@/components/studio/StudioCanvas';
import { getFramesByPhotoCount } from '@/lib/services/frame.service';
import { loadImage } from '@/lib/photobooth/composite';
import {
  frameToSelection,
  getPhotoCount,
  getSelectedFilterId,
  getSelectedFrame,
  setSelectedFilterId as saveSelectedFilterId,
  setSelectedFrame,
} from '@/lib/photobooth/session';
import { getCapturedPhotos } from '@/lib/photobooth/capture';
import {
  defaultAdjustments,
  getStudioConfig,
  setStudioConfig,
  MIN_ZOOM,
  MAX_ZOOM,
  type PhotoAdjust,
} from '@/lib/photobooth/studio';
import { getActiveEffects } from '@/lib/services/effect.service';
import type { Effect, Frame, ValidPhotoCount } from '@/types';
import { settingsToCssFilter, DEFAULT_EFFECT_SETTINGS } from '@/lib/photobooth/effect-utils';
import EffectThumbnail from '@/components/studio/EffectThumbnail';

/**
 * Studio Editor (Phase 5): SATU-SATUNYA tempat memilih frame overlay
 * (Supabase, difilter photo_count + aktif) dan filter efek (database).
 * Canvas compositing real-time: foto → filter → frame PNG di atas.
 * Geser (drag), zoom (wheel/tombol), reset. Konfigurasi disimpan
 * ke session untuk phase export. Foto tidak pernah dihapus di sini.
 */
export default function StudioScreen() {
  const [activeTab, setActiveTab] = useState<'frames' | 'filters'>('frames');
  const [count, setCount] = useState<ValidPhotoCount | null>(null);
  const [countInvalid, setCountInvalid] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);
  const [photosEmpty, setPhotosEmpty] = useState(false);
  const [frames, setFrames] = useState<Frame[]>([]);
  const [framesLoading, setFramesLoading] = useState(true);
  const [framesError, setFramesError] = useState('');
  const [selectedFrameId, setSelectedFrameId] = useState<string | null>(null);
  const [frameImageUrl, setFrameImageUrl] = useState<string | null>(null);
  // Frame yang SUDAH tampil di preview (ter-commit setelah preload).
  // Preview tidak pernah memakai URL yang belum lolos Image.onload.
  const [committedFrameId, setCommittedFrameId] = useState<string | null>(null);
  const committedRef = useRef<string | null>(null);
  const switchSeqRef = useRef(0);
  const [frameSwitchError, setFrameSwitchError] = useState('');
  // Error deteksi slot frame (satu foto per slot). Null = slot valid.
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [selectedFilterId, setSelectedFilterId] = useState<string>('');
  // Settings efek yang dipilih (dari database effects).
  const [selectedEffectSettings, setSelectedEffectSettings] = useState<Effect['settings']>(DEFAULT_EFFECT_SETTINGS);
  const [adjustments, setAdjustments] = useState<PhotoAdjust[]>([]);
  const [selectedSlot, setSelectedSlot] = useState(0);
  // true setelah bacaan session sinkron selesai (anti flash konten awal).
  const [booted, setBooted] = useState(false);
  const [effects, setEffects] = useState<Effect[]>([]);
  const [filtersLoading, setFiltersLoading] = useState(true);

  const loadFrames = useCallback(async (c: ValidPhotoCount): Promise<Frame[]> => {
    setFramesLoading(true);
    setFramesError('');
    try {
      const data = await getFramesByPhotoCount(c);
      // Pengaman defensif: query sudah memfilter kategori + aktif.
      const list = data.filter((f) => f.photo_count === c && f.is_active);
      setFrames(list);
      return list;
    } catch (err) {
      setFrames([]);
      setFramesError(err instanceof Error ? err.message : 'Gagal memuat frame.');
      return [];
    } finally {
      setFramesLoading(false);
    }
  }, []);

  /** Frame terbaru (created_at DESC) dari daftar aktif kategori ini. */
  const pickLatestFrame = (list: Frame[]): Frame | null => {
    let latest: Frame | null = null;
    for (const f of list) {
      if (!latest || f.created_at > latest.created_at) latest = f;
    }
    return latest;
  };

  // Pertahankan pilihan tersimpan yang masih valid; bila belum ada,
  // otomatis pakai frame terbaru agar preview langsung berframe.
  // Commit HANYA setelah gambar lolos preload — frame lama tetap
  // tampil selama frame baru dimuat (tanpa flash cream).
  const commitFrame = useCallback(async (frame: Frame): Promise<boolean> => {
    const seq = ++switchSeqRef.current;
    try {
      await loadImage(frame.image_url);
    } catch {
      if (switchSeqRef.current !== seq) return false;
      setSelectedFrameId(committedRef.current);
      setFrameSwitchError(`Frame "${frame.name}" gagal dimuat, frame sebelumnya dipertahankan.`);
      return false;
    }
    if (switchSeqRef.current !== seq) return false;
    committedRef.current = frame.id;
    setCommittedFrameId(frame.id);
    setSelectedFrameId(frame.id);
    setFrameImageUrl(frame.image_url);
    setSelectedFrame(frameToSelection(frame));
    setFrameSwitchError('');
    return true;
  }, []);

  const applyAutoPick = useCallback(async (list: Frame[], c: ValidPhotoCount): Promise<void> => {
    const saved = getSelectedFrame();
    const validSaved =
      saved && saved.photo_count === c
        ? list.find((f) => f.id === saved.frame_id && f.is_active)
        : undefined;
    const pick = validSaved ?? pickLatestFrame(list);
    if (pick) {
      await commitFrame(pick);
    }
  }, [commitFrame]);

  const refreshFrames = useCallback(async () => {
    if (count === null) return;
    const list = await loadFrames(count);
    await applyAutoPick(list, count);
  }, [count, loadFrames, applyAutoPick]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    let cancelled = false;
    const c = getPhotoCount();
    if (c === null) {
      setCountInvalid(true);
      setFramesLoading(false);
      setBooted(true);
      return;
    }
    setCount(c);
    const captured = getCapturedPhotos().slice(0, c);
    setPhotos(captured);
    if (captured.length === 0) {
      setPhotosEmpty(true);
      setFramesLoading(false);
      setBooted(true);
      return;
    }
    const savedConfig = getStudioConfig(c);
    setAdjustments(savedConfig?.adjustments ?? defaultAdjustments(c));
    const savedFilter = getSelectedFilterId();
    (async () => {
      const list = await loadFrames(c);
      if (cancelled) return;
      applyAutoPick(list, c);
      // Muat daftar efek aktif dari database.
      try {
        const dbEffects = await getActiveEffects();
        if (!cancelled) {
          setEffects(dbEffects);
          // Sinkronkan filter terpilih dari session dengan effects yang dimuat.
          if (dbEffects.length > 0) {
            const matched = dbEffects.find((e) => e.id === savedFilter || e.slug === savedFilter);
            if (matched) {
              setSelectedFilterId(matched.id);
              setSelectedEffectSettings(matched.settings);
            } else if (!getSelectedFilterId()) {
              setSelectedFilterId(dbEffects[0].id);
              setSelectedEffectSettings(dbEffects[0].settings);
            }
          }
        }
      } catch {
        // abaikan — filter tetap pakai default.
      } finally {
        if (!cancelled) setFiltersLoading(false);
      }
      if (!cancelled) setBooted(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadFrames, applyAutoPick]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Simpan konfigurasi setiap berubah (siap dipakai phase export).
  // memakai frame ter-commit (yang tampil), bukan highlight sementara.
  useEffect(() => {
    if (count === null) return;
    setStudioConfig({
      version: 1,
      photo_count: count,
      frame_id: committedFrameId,
      filter_id: selectedFilterId,
      adjustments,
    });
  }, [count, committedFrameId, selectedFilterId, adjustments]);

  const handleSelectFrame = (frame: Frame) => {
    if (count === null || frame.photo_count !== count || !frame.is_active) return;
    // Highlight langsung untuk respons UI; preview + session di-commit
    // setelah preload berhasil (frame lama tetap tampil meanwhile).
    setSelectedFrameId(frame.id);
    void commitFrame(frame);
  };

  const handleSelectFilter = (effectId: string) => {
    const effect = effects.find((e) => e.id === effectId);
    if (!effect) return;
    setSelectedFilterId(effect.id);
    setSelectedEffectSettings(effect.settings);
    saveSelectedFilterId(effect.id);
  };

  const handleAdjust = (index: number, adj: PhotoAdjust) => {
    setAdjustments((prev) => {
      if (index < 0 || index >= prev.length) return prev;
      const next = [...prev];
      next[index] = {
        dx: adj.dx,
        dy: adj.dy,
        zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, adj.zoom)),
      };
      return next;
    });
  };

  const handleZoomStep = (delta: number) => {
    if (selectedSlot < 0 || selectedSlot >= adjustments.length) return;
    const adj = adjustments[selectedSlot];
    handleAdjust(selectedSlot, {
      ...adj,
      zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, adj.zoom + delta)),
    });
  };

  const handleResetSlot = () => {
    if (selectedSlot < 0) return;
    handleAdjust(selectedSlot, { dx: 0, dy: 0, zoom: 1 });
  };

  const handleResetAll = () => {
    if (count === null) return;
    setAdjustments(defaultAdjustments(count));
  };

  const selectedFrame = frames.find((f) => f.id === selectedFrameId) ?? null;
  // URL frame untuk canvas: data live bila ada, fallback session tersimpan.
  const frameUrl = selectedFrame?.image_url ?? frameImageUrl;
  // Gunakan settings efek yang dipilih (bukan filter_id hardcoded).
  const filterCss = settingsToCssFilter(selectedEffectSettings);

  return (
    <AppLayout>
      <div className="studio-layout">
        <div className="studio-preview-wrapper">
          <div className="studio-preview-col">
            {/* Loader dulu (tanpa cream/canvas), error final, lalu canvas
                berframe — tanpa flash di antaranya. */}
            {!booted || framesLoading ? (
              <div className="studio-loader" role="status" aria-busy="true" aria-label="Menyiapkan preview">
                <div className="studio-loader-box">
                  <span>Menyiapkan preview...</span>
                </div>
              </div>
            ) : count === null || photosEmpty ? (
              <div className="frame-state frame-state-error" role="alert">
                <div className="frame-state-title">
                  {count === null ? 'Pilih jumlah foto dulu' : 'Belum ada foto'}
                </div>
                <p className="frame-state-desc">
                  {count === null
                    ? 'Sesi tidak menemukan pilihan yang valid.'
                    : 'Ambil foto terlebih dahulu di halaman kamera.'}
                </p>
                <Link
                  href={count === null ? '/jumlah-foto' : '/take-foto'}
                  className="btn-secondary"
                >
                  {count === null ? 'Ke Pilih Jumlah Foto' : 'Ke Kamera'}
                </Link>
              </div>
            ) : (
              <>
                <div className="studio-frame-stage">
                  <StudioCanvas
                    photos={photos}
                    frameUrl={frameUrl}
                    filterCss={filterCss}
                    effectSettings={selectedEffectSettings}
                    count={count}
                    adjustments={adjustments}
                    selectedSlot={selectedSlot}
                    onSelectSlot={setSelectedSlot}
                    onAdjust={handleAdjust}
                    onSlotsError={setSlotsError}
                  />
                </div>
                {slotsError && (
                  <div className="frame-state frame-state-error" role="alert" style={{ width: '100%' }}>
                    <div className="frame-state-title">Frame tidak dapat dipakai</div>
                    <p className="frame-state-desc">{slotsError}</p>
                  </div>
                )}
                <div className="slot-controls" role="toolbar" aria-label="Kontrol posisi foto">
                  <div className="slot-dots">
                    {photos.map((_, i) => (
                      <button
                        key={i}
                        type="button"
                        className={`slot-dot${selectedSlot === i ? ' active' : ''}`}
                        onClick={() => setSelectedSlot(i)}
                        aria-label={`Pilih foto ${i + 1}`}
                        aria-pressed={selectedSlot === i}
                      >
                        {i + 1}
                      </button>
                    ))}
                  </div>
                  <div className="slot-zoom">
                    <button type="button" className="btn-secondary slot-btn" onClick={() => handleZoomStep(-0.25)} aria-label="Zoom out">
                      −
                    </button>
                    <button type="button" className="btn-secondary slot-btn" onClick={() => handleZoomStep(0.25)} aria-label="Zoom in">
                      +
                    </button>
                    <button type="button" className="btn-secondary slot-btn wide" onClick={handleResetSlot}>
                      Reset
                    </button>
                    <button type="button" className="btn-secondary slot-btn wide" onClick={handleResetAll}>
                      Reset Semua
                    </button>
                  </div>
                </div>
                <p className="slot-hint">Seret foto di preview untuk menggeser · roda mouse / tombol untuk zoom</p>
              </>
            )}
          </div>
        </div>

        <div className="studio-controls-panel">
          <div className="studio-tabs-nav">
            <button
              className={`studio-tab-btn${activeTab === 'frames' ? ' active' : ''}`}
              onClick={() => setActiveTab('frames')}
            >
              <svg className="icon-svg" viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
              Frame Overlay
            </button>
            <button
              className={`studio-tab-btn${activeTab === 'filters' ? ' active' : ''}`}
              onClick={() => setActiveTab('filters')}
            >
              <svg className="icon-svg" viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3z" />
              </svg>
              Filter Efek
            </button>
          </div>

          <div className={`studio-tab-content${activeTab === 'frames' ? ' active' : ''}`}>
            {countInvalid ? (
              <div className="frame-state frame-state-error" role="alert">
                <div className="frame-state-title">Pilih jumlah foto dulu</div>
                <p className="frame-state-desc">Sesi tidak menemukan pilihan yang valid.</p>
                <Link href="/jumlah-foto" className="btn-secondary">
                  Ke Pilih Jumlah Foto
                </Link>
              </div>
            ) : framesLoading ? (
              <div className="frame-state" role="status" aria-busy="true">
                <div className="frame-state-title">Memuat frame...</div>
              </div>
            ) : framesError ? (
              <div className="frame-state frame-state-error" role="alert">
                <div className="frame-state-title">Gagal memuat frame</div>
                <p className="frame-state-desc">{framesError}</p>
                {count !== null && (
                  <button type="button" className="btn-secondary" onClick={() => void refreshFrames()}>
                    Coba Lagi
                  </button>
                )}
              </div>
            ) : frames.length === 0 && count !== null ? (
              <div className="frame-state" role="status">
                <div className="frame-state-title">Belum ada frame {count} foto</div>
                <p className="frame-state-desc">Minta admin menambahkan frame kategori ini.</p>
              </div>
            ) : (
              <div className="options-grid">
                {frames.map((frame) => (
                  <div
                    key={frame.id}
                    className={`option-card${selectedFrameId === frame.id ? ' selected' : ''}`}
                    onClick={() => handleSelectFrame(frame)}
                    role="option"
                    aria-selected={selectedFrameId === frame.id}
                  >
                    <div className="option-preview-box" style={{ background: '#FFF5E4', padding: 0, overflow: 'hidden' }}>
                      <img
                        src={frame.image_url}
                        alt={`Frame ${frame.name}`}
                        loading="lazy"
                        draggable={false}
                        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                      />
                    </div>
                    <div className="option-title">{frame.name}</div>
                  </div>
                ))}
              </div>
            )}
            <p className="frame-switch-error" role={frameSwitchError ? 'alert' : undefined}>
              {frameSwitchError}
            </p>
          </div>

          <div className={`studio-tab-content${activeTab === 'filters' ? ' active' : ''}`}>
            {filtersLoading ? (
              <div className="admin-loading" style={{ padding: '2rem 0' }}>Memuat filter...</div>
            ) : effects.length === 0 ? (
              <div className="frame-state" role="status">
                <div className="frame-state-title">Belum ada filter aktif</div>
                <p className="frame-state-desc">Minta admin menambahkan efek filter.</p>
              </div>
            ) : (
              <div className="options-grid">
                {effects.map((ef) => (
                  <EffectThumbnail
                    key={ef.id}
                    photoUrl={photos[0] ?? null}
                    settings={ef.settings}
                    isSelected={selectedFilterId === ef.id}
                    onClick={() => handleSelectFilter(ef.id)}
                    name={ef.name}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="studio-actions-footer">
            <Link href="/hasil-foto" className="btn-secondary">
              <svg className="icon-svg" viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                <line x1="19" y1="12" x2="5" y2="12" />
                <polyline points="12 19 5 12 12 5" />
              </svg>
              Kembali
            </Link>
            <Link href="/hasil-akhir" className="btn-primary">
              Simpan & Lihat Hasil
              <svg className="icon-svg" viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </Link>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
