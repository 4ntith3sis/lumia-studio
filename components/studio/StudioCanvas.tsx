'use client';

import { useEffect, useRef, useState } from 'react';
import { computeSlots, drawComposite } from '@/lib/photobooth/composite';
import {
  resolveFrameSlots,
  type SlotRect,
} from '@/lib/photobooth/frame-slots';
import {
  clampAdjustToSlot,
  type PhotoAdjust,
} from '@/lib/photobooth/studio';
import type { EffectSettings, ValidPhotoCount } from '@/types';

interface StudioCanvasProps {
  photos: string[];
  frameUrl: string | null;
  filterCss: string;
  /** Settings mentah untuk pixel fallback Safari (opsional). */
  effectSettings?: EffectSettings | null;
  count: ValidPhotoCount;
  adjustments: PhotoAdjust[];
  selectedSlot: number;
  onSelectSlot: (index: number) => void;
  onAdjust: (index: number, adjust: PhotoAdjust) => void;
  /** Dipanggil saat status slot berubah (error deteksi / pulih). */
  onSlotsError?: (message: string | null) => void;
}

const LOGICAL_W = 600;

/**
 * Canvas compositing Studio: background → foto (cover + offset/zoom +
 * filter) → frame PNG di paling atas. Drag untuk geser, wheel untuk
 * zoom pada slot terpilih. Mendukung mouse + touch via Pointer Events.
 */
export default function StudioCanvas({
  photos,
  frameUrl,
  filterCss,
  effectSettings,
  count,
  adjustments,
  selectedSlot,
  onSelectSlot,
  onAdjust,
  onSlotsError,
}: StudioCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cacheRef = useRef(new Map<string, HTMLImageElement>());
  const dragRef = useRef<{
    index: number;
    startX: number;
    startY: number;
    origDx: number;
    origDy: number;
  } | null>(null);
  const [imgVersion, setImgVersion] = useState(0);
  // Dimensi asli frame (naturalWidth/naturalHeight) — SATU-SATUNYA sumber
  // ukuran canvas agar semua frame (portrait, landscape, square, custom)
  // tampil tanpa distorsi dengan uniform scaling.
  // `url` menandai frame pemilik dimensi agar dimensi basi (stale) dari
  // frame sebelumnya tidak pernah dipakai untuk frame saat ini.
  const [frameSize, setFrameSize] = useState<{ w: number; h: number; url: string } | null>(null);
  // Slot terpecahkan untuk render saat ini (diisi ulang setiap render effect).
  // Handler pointer/wheel membaca ref ini agar selalu memakai geometri
  // yang sama dengan yang digambar (anti geser antar slot).
  const slotsRef = useRef<SlotRect[]>([]);
  // Kunci status terakhir yang dilaporkan ke parent (anti loop setState).
  const slotsReportRef = useRef<string>('');

  // Muat & cache gambar (foto + frame) — crossOrigin agar canvas bersih.
  useEffect(() => {
    let cancelled = false;
    const urls = new Set<string>();
    photos.forEach((u) => urls.add(u));
    if (frameUrl) urls.add(frameUrl);
    urls.forEach((url) => {
      if (cacheRef.current.has(url)) {
        // Cache hit: onload TIDAK akan menyala lagi, jadi sinkronkan dimensi
        // di sini. Tanpa ini, kembali ke frame sebelumnya memakai dimensi
        // basi frame lain → frame ter-stretch dan slot salah posisi.
        // Guard kesetaraan mencegah loop setState (React bail-out bila sama).
        if (frameUrl && url === frameUrl) {
          const cached = cacheRef.current.get(url);
          if (cached && cached.complete && cached.naturalWidth > 0 && cached.naturalHeight > 0) {
            const w = cached.naturalWidth;
            const h = cached.naturalHeight;
            setFrameSize((prev) => (prev && prev.url === url && prev.w === w && prev.h === h ? prev : { w, h, url }));
          }
        }
        return;
      }
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        if (cancelled) return;
        // Safari: pastikan gambar benar-benar siap sebelum memicu re-render.
        // Beberapa versi Safari melaporkan complete=true namun naturalWidth=0
        // saat gambar data URL baru pertama kali dimuat. Tunda setImgVersion
        // hingga dimensi valid tersedia.
        if (img.naturalWidth === 0 || img.naturalHeight === 0) return;
        if (frameUrl && url === frameUrl) {
          const w = img.naturalWidth;
          const h = img.naturalHeight;
          setFrameSize((prev) => (prev && prev.url === url && prev.w === w && prev.h === h ? prev : { w, h, url }));
        }
        setImgVersion((v) => v + 1);
      };
      img.onerror = () => {
        if (cancelled) return;
        // Hapus dari cache agar tidak dianggap siap.
        cacheRef.current.delete(url);
      };
      img.src = url;
      cacheRef.current.set(url, img);
    });
    return () => {
      cancelled = true;
    };
  }, [photos, frameUrl]);

  // Koordinat internal canvas = dimensi asli frame (TANPA clamp),
  // sehingga rasio exakt terjaga untuk frame apa pun. Display scaling
  // (CSS max-width/max-height + aspect-ratio) bersifat uniform.
  // Tanpa frame: default 600×800 seperti sebelumnya.
  // Dimensi hanya berlaku bila URL-nya cocok dengan frame aktif —
  // mencegah dimensi basi dipakai setelah ganti frame.
  const sizeForUrl = frameSize && frameSize.url === frameUrl ? frameSize : null;
  const canvasW = sizeForUrl && sizeForUrl.w > 0 ? sizeForUrl.w : LOGICAL_W;
  const canvasH = sizeForUrl && sizeForUrl.h > 0 ? sizeForUrl.h : 800;

  // Selesaikan slot foto dari PNG frame aktual (cache, murah setelah pertama).
  // - Tanpa frame            → grid standar (tidak ada overlay → aman).
  // - Frame masih dimuat     → grid sementara (overlay belum tampil).
  // - Deteksi gagal          → error, foto TIDAK digambar (anti tumpang tindih).
  // Diselesaikan di dalam render effect (bukan useMemo) karena membaca
  // cache gambar tidak aman dilakukan saat render.

  // Render ulang setiap state visual berubah.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
    canvas.width = canvasW * dpr;
    canvas.height = canvasH * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const frame = frameUrl ? cacheRef.current.get(frameUrl) : undefined;
    const frameImg =
      frame && frame.complete && frame.naturalWidth > 0 && frame.naturalHeight > 0 ? frame : null;

    let slots: SlotRect[];
    let slotsError: string | null = null;
    if (!frameUrl || !frameImg) {
      slots = computeSlots(count, canvasW, canvasH);
    } else {
      const res = resolveFrameSlots({ frameImg, frameKey: frameUrl, count, W: canvasW, H: canvasH });
      if (res.ok) {
        slots = res.slots;
      } else {
        slots = [];
        slotsError = res.message;
      }
    }
    slotsRef.current = slots;

    // Laporkan status ke parent hanya saat berubah (anti loop setState).
    const reportKey = `${frameUrl ?? ''}|${slotsError ?? ''}`;
    if (slotsReportRef.current !== reportKey) {
      slotsReportRef.current = reportKey;
      onSlotsError?.(slotsError);
    }

    if (slotsError) {
      // Slot tidak valid: JANGAN gambar foto (mencegah tumpang tindih).
      // Gambar background + overlay frame (bila ada) + panel error.
      ctx.fillStyle = '#FDF5E6';
      ctx.fillRect(0, 0, canvasW, canvasH);
      if (frameImg) {
        ctx.drawImage(frameImg, 0, 0, canvasW, canvasH);
      }
      ctx.save();
      ctx.fillStyle = 'rgba(253, 245, 230, 0.92)';
      const bw = canvasW * 0.86;
      const bh = 96;
      const bx = (canvasW - bw) / 2;
      const by = (canvasH - bh) / 2;
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = '#FF5232';
      ctx.lineWidth = 3;
      ctx.strokeRect(bx, by, bw, bh);
      ctx.fillStyle = '#FF5232';
      ctx.font = '800 15px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Frame tidak dapat dipakai', canvasW / 2, canvasH / 2 - 14);
      ctx.fillStyle = '#1E1E1E';
      ctx.font = '600 12px sans-serif';
      ctx.fillText('Pilih frame lain yang sesuai.', canvasW / 2, canvasH / 2 + 14);
      ctx.restore();
      return;
    }

    // Render via modul compositing bersama (identik dengan export).
    // Pengecekan kesiapan gambar lebih ketat untuk kompatibilitas Safari.
    // frame/frameImg dari atas dipakai ulang (sudah tervalidasi siap).
    const photoImgs = Array.from({ length: count }, (_, i) => {
      const img = photos[i] ? cacheRef.current.get(photos[i]) : undefined;
      // Safari: img.complete bisa true namun dimensions masih 0 untuk data URL.
      // Pastikan kedua kondisi terpenuhi sebelum memasukkan ke canvas.
      return img && img.complete && img.naturalWidth > 0 && img.naturalHeight > 0 ? img : null;
    });

    drawComposite({
      ctx,
      W: canvasW,
      H: canvasH,
      count,
      photoImgs,
      frameImg,
      filterCss,
      effectSettings,
      adjustments,
      slots,
    });

    // Penanda slot terpilih (tidak menggerakkan frame).
    if (selectedSlot >= 0 && selectedSlot < slots.length) {
      const s = slots[selectedSlot];
      ctx.save();
      ctx.strokeStyle = '#FF5232';
      ctx.lineWidth = 3;
      ctx.setLineDash([10, 6]);
      ctx.strokeRect(s.x, s.y, s.w, s.h);
      ctx.restore();
    }
  }, [photos, frameUrl, filterCss, effectSettings, adjustments, selectedSlot, count, canvasW, canvasH, imgVersion, onSlotsError]);

  const toLogical = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    // Pemetaan ruang display → ruang canvas asli memakai skala uniform
    // yang sama (rect vs canvasW/canvasH), sehingga drag/zoom akurat
    // pada frame berukuran apa pun.
    return {
      x: ((clientX - rect.left) / rect.width) * canvasW,
      y: ((clientY - rect.top) / rect.height) * canvasH,
    };
  };

  const hitSlot = (x: number, y: number): number => {
    const slots = slotsRef.current;
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      if (x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h) return i;
    }
    return -1;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = toLogical(e.clientX, e.clientY);
    if (!p) return;
    const index = hitSlot(p.x, p.y);
    if (index === -1 || !photos[index]) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    onSelectSlot(index);
    const adj = adjustments[index] ?? { dx: 0, dy: 0, zoom: 1 };
    dragRef.current = { index, startX: p.x, startY: p.y, origDx: adj.dx, origDy: adj.dy };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const p = toLogical(e.clientX, e.clientY);
    if (!p) return;
    const slot = slotsRef.current[drag.index];
    if (!slot) return;
    const img = photos[drag.index] ? cacheRef.current.get(photos[drag.index]) : undefined;
    if (!img || img.naturalWidth === 0) return;
    const adj = adjustments[drag.index] ?? { dx: 0, dy: 0, zoom: 1 };
    // Jepit dinamis dari ukuran foto aktual vs slot (anti celah).
    onAdjust(
      drag.index,
      clampAdjustToSlot(
        {
          ...adj,
          dx: drag.origDx + (p.x - drag.startX),
          dy: drag.origDy + (p.y - drag.startY),
        },
        img.naturalWidth,
        img.naturalHeight,
        slot
      )
    );
  };

  const endDrag = () => {
    dragRef.current = null;
  };

  // Wheel zoom non-passive agar preventDefault berfungsi.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const index = selectedSlot;
      if (index < 0 || index >= count || !photos[index]) return;
      const slot = slotsRef.current[index];
      if (!slot) return;
      const img = cacheRef.current.get(photos[index]);
      if (!img || img.naturalWidth === 0) return;
      const adj = adjustments[index] ?? { dx: 0, dy: 0, zoom: 1 };
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      // Jepit ulang setelah zoom berubah (menciut = batas menyempit).
      onAdjust(
        index,
        clampAdjustToSlot(
          { ...adj, zoom: adj.zoom * factor },
          img.naturalWidth,
          img.naturalHeight,
          slot
        )
      );
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [selectedSlot, count, photos, adjustments, onAdjust, canvasW, canvasH]);

  return (
    <canvas
      ref={canvasRef}
      className="studio-canvas"
      style={{ touchAction: 'none', aspectRatio: `${canvasW} / ${canvasH}` }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      aria-label="Preview hasil studio. Seret foto untuk menggeser, roda mouse untuk zoom."
    />
  );
}
