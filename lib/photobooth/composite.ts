import { computeSlots, clampAdjustToSlot, type PhotoAdjust } from '@/lib/photobooth/studio';
import type { ValidPhotoCount } from '@/types';

export { computeSlots };

/**
 * Deteksi apakah browser mendukung CanvasRenderingContext2D.filter.
 * Safari versi lama (< 14) tidak mendukung properti ini.
 */
let _canvasFilterSupported: boolean | null = null;
export function isCanvasFilterSupported(): boolean {
  if (_canvasFilterSupported !== null) return _canvasFilterSupported;
  try {
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d');
    if (!ctx) { _canvasFilterSupported = false; return false; }
    (ctx as CanvasRenderingContext2D & { filter?: string }).filter = 'brightness(1)';
    _canvasFilterSupported = true;
    return true;
  } catch {
    _canvasFilterSupported = false;
    return false;
  }
}

/**
 * Phase 6 — SATU-SATUNYA sumber logika compositing.
 * Dipakai oleh StudioCanvas (preview) dan export final, sehingga
 * hasil download dijamin identik dengan preview: posisi, skala,
 * crop, filter, ukuran frame, rasio, dan urutan layer sama.
 *
 * Urutan layer: 1. background → 2. foto user → 3. filter →
 * 4. frame PNG overlay (paling atas).
 */

export interface CompositeInput {
  ctx: CanvasRenderingContext2D;
  W: number;
  H: number;
  count: ValidPhotoCount;
  /** Gambar foto per slot (null = slot kosong). */
  photoImgs: (HTMLImageElement | null)[];
  frameImg: HTMLImageElement | null;
  filterCss: string;
  adjustments: PhotoAdjust[];
}

export function drawComposite(input: CompositeInput): void {
  const { ctx, W, H, count, photoImgs, frameImg, filterCss, adjustments } = input;

  // 1. Background.
  ctx.fillStyle = '#FDF5E6';
  ctx.fillRect(0, 0, W, H);

  const slots = computeSlots(count, W, H);

  // 2–3. Foto + filter (di bawah frame).
  // Safari compatibility: ctx.filter didukung Safari 14+. Pada versi lebih lama,
  // properti ini tidak ada dan penyetelan akan gagal diam-diam.
  // Kita cek dukungan sekali di awal, lalu terapkan filter yang aman per-slot.
  const filterSupported = isCanvasFilterSupported();
  const safeFilter = filterSupported && filterCss !== 'none' ? filterCss : 'none';

  for (let i = 0; i < count; i++) {
    const slot = slots[i];
    const img = photoImgs[i];
    const raw = adjustments[i] ?? { dx: 0, dy: 0, zoom: 1 };

    if (!img) {
      ctx.fillStyle = 'rgba(30,30,30,0.06)';
      ctx.fillRect(slot.x, slot.y, slot.w, slot.h);
      ctx.fillStyle = '#6B7280';
      ctx.font = `800 ${Math.round(slot.h / 8)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1), slot.x + slot.w / 2, slot.y + slot.h / 2);
      ctx.textBaseline = 'alphabetic';
      continue;
    }

    // Cover + zoom + offset; dijepit dinamis agar slot selalu penuh.
    const adj = clampAdjustToSlot(raw, img.naturalWidth, img.naturalHeight, slot);
    const base = Math.max(slot.w / img.naturalWidth, slot.h / img.naturalHeight);
    const scale = base * adj.zoom;
    const dw = img.naturalWidth * scale;
    const dh = img.naturalHeight * scale;
    const cx = slot.x + slot.w / 2 + adj.dx;
    const cy = slot.y + slot.h / 2 + adj.dy;

    ctx.save();
    ctx.beginPath();
    ctx.rect(slot.x, slot.y, slot.w, slot.h);
    ctx.clip();
    ctx.filter = safeFilter;
    ctx.drawImage(img, cx - dw / 2, cy - dh / 2, dw, dh);
    ctx.restore();
  }
  ctx.filter = 'none';

  // 4. Frame PNG overlay paling atas (tidak digeser/di-zoom).
  if (frameImg) {
    ctx.drawImage(frameImg, 0, 0, W, H);
  }
}

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (img.naturalWidth > 0 && img.naturalHeight > 0) resolve(img);
      else reject(new Error('Gambar tidak valid.'));
    };
    img.onerror = () => reject(new Error('Gambar gagal dimuat.'));
    img.src = url;
  });
}

export interface FinalRenderOptions {
  photos: string[];
  frameUrl: string | null;
  filterCss: string;
  adjustments: PhotoAdjust[];
  count: ValidPhotoCount;
  /** Lebar output; tinggi mengikuti rasio frame (default 1200). */
  width?: number;
}

/** Render komposit final pada resolusi export (bukan preview). */
export async function renderFinalCanvas(options: FinalRenderOptions): Promise<HTMLCanvasElement> {
  const { photos, frameUrl, filterCss, adjustments, count, width = 1200 } = options;

  const photoImgs = await Promise.all(
    Array.from({ length: count }, (_, i) => (photos[i] ? loadImage(photos[i]) : Promise.resolve(null)))
  );

  let frameImg: HTMLImageElement | null = null;
  let aspect = 3 / 4;
  if (frameUrl) {
    try {
      frameImg = await loadImage(frameUrl);
      aspect = frameImg.naturalWidth / frameImg.naturalHeight;
    } catch {
      frameImg = null;
    }
  }

  const W = width;
  const H = Math.max(450, Math.min(1800, Math.round(width / aspect)));

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas tidak didukung browser ini.');

  drawComposite({ ctx, W, H, count, photoImgs, frameImg, filterCss, adjustments });
  return canvas;
}

/** Urutan frame boomerang: maju 1..N lalu mundur N-1..2 (tanpa duplikat ujung). */
export function boomerangOrder(count: number): number[] {
  const order: number[] = [];
  for (let i = 0; i < count; i++) order.push(i);
  for (let i = count - 2; i >= 1; i--) order.push(i);
  return order;
}
