'use client';

import { useEffect, useRef, useState } from 'react';
import { computeSlots, drawComposite } from '@/lib/photobooth/composite';
import {
  clampAdjustToSlot,
  type PhotoAdjust,
} from '@/lib/photobooth/studio';
import type { ValidPhotoCount } from '@/types';

interface StudioCanvasProps {
  photos: string[];
  frameUrl: string | null;
  filterCss: string;
  count: ValidPhotoCount;
  adjustments: PhotoAdjust[];
  selectedSlot: number;
  onSelectSlot: (index: number) => void;
  onAdjust: (index: number, adjust: PhotoAdjust) => void;
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
  count,
  adjustments,
  selectedSlot,
  onSelectSlot,
  onAdjust,
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
  const [frameAspect, setFrameAspect] = useState<number | null>(null);

  // Muat & cache gambar (foto + frame) — crossOrigin agar canvas bersih.
  useEffect(() => {
    let cancelled = false;
    const urls = new Set<string>();
    photos.forEach((u) => urls.add(u));
    if (frameUrl) urls.add(frameUrl);
    urls.forEach((url) => {
      if (cacheRef.current.has(url)) return;
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
          setFrameAspect(img.naturalWidth / img.naturalHeight);
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

  const logicalH =
    frameAspect !== null && Number.isFinite(frameAspect) && frameAspect > 0
      ? Math.max(450, Math.min(900, Math.round(LOGICAL_W / frameAspect)))
      : 800;

  // Render ulang setiap state visual berubah.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
    canvas.width = LOGICAL_W * dpr;
    canvas.height = logicalH * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    // Render via modul compositing bersama (identik dengan export).
    // Pengecekan kesiapan gambar lebih ketat untuk kompatibilitas Safari.
    const photoImgs = Array.from({ length: count }, (_, i) => {
      const img = photos[i] ? cacheRef.current.get(photos[i]) : undefined;
      // Safari: img.complete bisa true namun dimensions masih 0 untuk data URL.
      // Pastikan kedua kondisi terpenuhi sebelum memasukkan ke canvas.
      return img && img.complete && img.naturalWidth > 0 && img.naturalHeight > 0 ? img : null;
    });
    const frame = frameUrl ? cacheRef.current.get(frameUrl) : undefined;
    const frameImg =
      frame && frame.complete && frame.naturalWidth > 0 && frame.naturalHeight > 0 ? frame : null;

    drawComposite({
      ctx,
      W: LOGICAL_W,
      H: logicalH,
      count,
      photoImgs,
      frameImg,
      filterCss,
      adjustments,
    });

    // Penanda slot terpilih (tidak menggerakkan frame).
    if (selectedSlot >= 0 && selectedSlot < count) {
      const s = computeSlots(count, LOGICAL_W, logicalH)[selectedSlot];
      ctx.save();
      ctx.strokeStyle = '#FF5232';
      ctx.lineWidth = 3;
      ctx.setLineDash([10, 6]);
      ctx.strokeRect(s.x, s.y, s.w, s.h);
      ctx.restore();
    }
  }, [photos, frameUrl, filterCss, adjustments, selectedSlot, count, logicalH, imgVersion]);

  const toLogical = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    return {
      x: ((clientX - rect.left) / rect.width) * LOGICAL_W,
      y: ((clientY - rect.top) / rect.height) * logicalH,
    };
  };

  const hitSlot = (x: number, y: number): number => {
    const slots = computeSlots(count, LOGICAL_W, logicalH);
    for (let i = 0; i < count; i++) {
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
    const slots = computeSlots(count, LOGICAL_W, logicalH);
    const slot = slots[drag.index];
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
      const slots = computeSlots(count, LOGICAL_W, logicalH);
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
          slots[index]
        )
      );
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [selectedSlot, count, photos, adjustments, onAdjust, logicalH]);

  return (
    <canvas
      ref={canvasRef}
      className="studio-canvas"
      style={{ touchAction: 'none', aspectRatio: `${LOGICAL_W} / ${logicalH}` }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      aria-label="Preview hasil studio. Seret foto untuk menggeser, roda mouse untuk zoom."
    />
  );
}
