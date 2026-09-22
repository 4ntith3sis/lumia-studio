import type { ValidPhotoCount } from '@/types';
import { computeSlots, type SlotRect } from '@/lib/photobooth/studio';

export type { SlotRect };

/**
 * Deteksi slot foto dari PNG frame aktual (bukan asumsi photo_count).
 *
 * Latar belakang: `computeSlots()` menghitung grid statis dari photo_count
 * (2→1×2, 3→1×3, 4→2×2, 6→2×3). Frame admin-upload bisa memiliki layout
 * berbeda (mis. frame 3 foto horizontal 3×1), sehingga foto tumpang tindih
 * atau masuk slot yang salah. Modul ini mendeteksi jendela foto dari
 * kanal alpha PNG: setiap region transparan yang terpisah = satu slot.
 *
 * Aturan keamanan:
 * - Region kecil (debu anti-alias, sudut dekoratif) disaring via ambang luas.
 * - Jumlah region harus SAMA dengan photo_count, jika tidak → gagal validasi.
 * - Bounding box tidak boleh tumpang tindih (toleransi tepi 3px).
 * - TIDAK ADA fallback diam-diam ke grid bila frame terdeteksi bermasalah;
 *   penelepon wajib menampilkan error state.
 * - Pengecualian satu-satunya: TIDAK ADA frame sama sekali → grid standar
 *   dipakai karena tidak ada overlay yang bisa mismatch.
 */

export type SlotSource = 'detected' | 'grid';

export type SlotErrorReason =
  | 'count-mismatch'
  | 'ambiguous-regions'
  | 'overlapping-slots'
  | 'tainted-canvas'
  | 'invalid-image';

export interface SlotSuccess {
  ok: true;
  slots: SlotRect[];
  source: SlotSource;
}

export interface SlotFailure {
  ok: false;
  reason: SlotErrorReason;
  message: string;
}

export type SlotResolution = SlotSuccess | SlotFailure;

export interface DetectedBox {
  x: number;
  y: number;
  w: number;
  h: number;
  area: number;
}

/** Piksel dianggap "lubang foto" bila alpha di bawah ambang ini. */
export const ALPHA_THRESHOLD = 128;
/** Region di bawah fraksi luas ini dianggap debu/dekorasi, bukan slot foto. */
export const MIN_AREA_FRACTION = 0.015;
/** Sisi terpanjang maksimum saat analisis (presisi ±4px natural, cukup untuk cover+overlay). */
export const ANALYSIS_MAX_SIDE = 640;
/** Toleransi sentuhan tepi antar bounding box (px natural). */
const OVERLAP_TOLERANCE_PX = 3;
/** Toleransi pengelompokan baris (fraksi tinggi frame). */
const ROW_TOLERANCE_FRACTION = 0.04;

/**
 * Flood fill 4-connectivity pada mask biner → bounding box tiap region.
 * Murni (tanpa DOM) agar dapat di-unit-test di Node.
 */
export function findSlotsInMask(
  mask: Uint8Array,
  W: number,
  H: number,
  minArea: number,
): DetectedBox[] {
  const visited = new Uint8Array(W * H);
  const boxes: DetectedBox[] = [];
  const stack: number[] = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const start = y * W + x;
      if (!mask[start] || visited[start]) continue;
      let minx = x;
      let maxx = x;
      let miny = y;
      let maxy = y;
      let area = 0;
      stack.length = 0;
      stack.push(start);
      visited[start] = 1;
      while (stack.length > 0) {
        const cur = stack.pop() as number;
        const cx = cur % W;
        const cy = (cur / W) | 0;
        area++;
        if (cx < minx) minx = cx;
        if (cx > maxx) maxx = cx;
        if (cy < miny) miny = cy;
        if (cy > maxy) maxy = cy;
        // 4 tetangga (tanpa diagonal agar region diagonal-terpisah tetap pisah).
        if (cx + 1 < W) {
          const n = cur + 1;
          if (mask[n] && !visited[n]) {
            visited[n] = 1;
            stack.push(n);
          }
        }
        if (cx - 1 >= 0) {
          const n = cur - 1;
          if (mask[n] && !visited[n]) {
            visited[n] = 1;
            stack.push(n);
          }
        }
        if (cy + 1 < H) {
          const n = cur + W;
          if (mask[n] && !visited[n]) {
            visited[n] = 1;
            stack.push(n);
          }
        }
        if (cy - 1 >= 0) {
          const n = cur - W;
          if (mask[n] && !visited[n]) {
            visited[n] = 1;
            stack.push(n);
          }
        }
      }
      if (area >= minArea) {
        boxes.push({ x: minx, y: miny, w: maxx - minx + 1, h: maxy - miny + 1, area });
      }
    }
  }
  return boxes;
}

/**
 * Urutkan konsisten: atas-ke-bawah, kiri-ke-kanan.
 * Baris dikelompokkan dengan toleransi agar layout sedikit-mencong tetap stabil.
 */
export function sortBoxesRowMajor<T extends { x: number; y: number }>(boxes: T[], frameH: number): T[] {
  const tol = Math.max(1, frameH * ROW_TOLERANCE_FRACTION);
  const sorted = [...boxes].sort((a, b) => a.y - b.y || a.x - b.x);
  const rows: T[][] = [];
  for (const b of sorted) {
    const row = rows.find((r) => Math.abs(r[0].y - b.y) <= tol);
    if (row) row.push(b);
    else rows.push([b]);
  }
  rows.sort((a, b) => a[0].y - b[0].y);
  return rows.flatMap((r) => r.sort((a, b) => a.x - b.x));
}

/** True bila dua box tumpang tindih melebihi toleransi tepi. */
export function boxesOverlap(a: DetectedBox, b: DetectedBox, tol = OVERLAP_TOLERANCE_PX): boolean {
  const interW = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const interH = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return interW > tol && interH > tol;
}

interface CachedDetection {
  boxes: DetectedBox[];
  frameW: number;
  frameH: number;
}

const detectionCache = new Map<string, CachedDetection>();

/** Hapus cache deteksi (berguna untuk test / ganti frame paksa). */
export function clearSlotCache(): void {
  detectionCache.clear();
}

/**
 * Deteksi slot dari HTMLImageElement yang SUDAH termuat.
 * Mengembalikan box ternormalisasi tidak di sini — penelepon memakai
 * resolveFrameSlots() untuk hasil siap pakai. Fungsi ini melempar
 * Error deskriptif bila deteksi/validasi gagal (ditangkap penelepon).
 */
function detectNormalizedBoxes(img: HTMLImageElement, expectedCount: number): CachedDetection {
  if (typeof document === 'undefined') {
    throw new Error('Deteksi slot hanya dapat berjalan di browser.');
  }
  const frameW = img.naturalWidth;
  const frameH = img.naturalHeight;
  if (!frameW || !frameH) {
    throw new Error('Dimensi frame tidak valid.');
  }

  const scale = Math.min(1, ANALYSIS_MAX_SIDE / Math.max(frameW, frameH));
  const aw = Math.max(1, Math.round(frameW * scale));
  const ah = Math.max(1, Math.round(frameH * scale));
  const tmp = document.createElement('canvas');
  tmp.width = aw;
  tmp.height = ah;
  const tctx = tmp.getContext('2d', { willReadFrequently: true });
  if (!tctx) {
    throw new Error('Canvas analisis tidak didukung browser ini.');
  }
  tctx.drawImage(img, 0, 0, aw, ah);
  let pixels: Uint8ClampedArray;
  try {
    pixels = tctx.getImageData(0, 0, aw, ah).data;
  } catch {
    throw new Error(
      'Frame tidak dapat dianalisis karena kebijakan CORS (tainted canvas). ' +
        'Pastikan frame dimuat dengan crossOrigin anonymous dari storage yang mengizinkan CORS.',
    );
  }

  const mask = new Uint8Array(aw * ah);
  for (let i = 0; i < aw * ah; i++) {
    if (pixels[i * 4 + 3] < ALPHA_THRESHOLD) mask[i] = 1;
  }
  const minArea = Math.max(200, aw * ah * MIN_AREA_FRACTION);
  const boxes = sortBoxesRowMajor(findSlotsInMask(mask, aw, ah, minArea), ah);

  if (boxes.length !== expectedCount) {
    throw new Error(
      `Frame terdeteksi memiliki ${boxes.length} area foto, tetapi sesi membutuhkan ${expectedCount}. ` +
        'Periksa desain frame atau pilih frame lain.',
    );
  }
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      // Skalakan toleransi ke resolusi analisis.
      const tol = Math.max(1, Math.round(OVERLAP_TOLERANCE_PX * scale));
      const interW = Math.min(boxes[i].x + boxes[i].w, boxes[j].x + boxes[j].w) - Math.max(boxes[i].x, boxes[j].x);
      const interH = Math.min(boxes[i].y + boxes[i].h, boxes[j].y + boxes[j].h) - Math.max(boxes[i].y, boxes[j].y);
      if (interW > tol && interH > tol) {
        throw new Error(
          `Area foto #${i + 1} dan #${j + 1} pada frame saling tumpang tindih. ` +
            'Periksa desain frame atau pilih frame lain.',
        );
      }
    }
  }

  // Kembalikan ke koordinat natural frame.
  const natural: DetectedBox[] = boxes.map((b) => ({
    x: b.x / scale,
    y: b.y / scale,
    w: b.w / scale,
    h: b.h / scale,
    area: b.area / (scale * scale),
  }));
  return { boxes: natural, frameW, frameH };
}

function toSlotRects(cached: CachedDetection, W: number, H: number): SlotRect[] {
  return cached.boxes.map((b) => ({
    x: (b.x / cached.frameW) * W,
    y: (b.y / cached.frameH) * H,
    w: (b.w / cached.frameW) * W,
    h: (b.h / cached.frameH) * H,
  }));
}

export interface ResolveSlotsArgs {
  /** Gambar frame yang SUDAH termuat (null = belum ada frame). */
  frameImg: HTMLImageElement | null;
  /** Kunci cache (URL frame). Kosong bila tidak ada frame. */
  frameKey: string;
  count: ValidPhotoCount;
  /** Dimensi canvas target (logis). */
  W: number;
  H: number;
}

/**
 * Selesaikan slot untuk render pada dimensi W×H.
 *
 * - Tanpa frame (frameKey kosong): grid standar — aman karena tidak ada
 *   overlay yang bisa mismatch.
 * - Frame termuat: deteksi dari alpha PNG (cache per URL). Gagal →
 *   { ok:false } dan penelepon WAJIB menampilkan error, bukan grid.
 */
export function resolveFrameSlots(args: ResolveSlotsArgs): SlotResolution {
  const { frameImg, frameKey, count, W, H } = args;
  if (!frameKey || !frameImg) {
    return { ok: true, slots: computeSlots(count, W, H), source: 'grid' };
  }
  if (!frameImg.naturalWidth || !frameImg.naturalHeight) {
    return {
      ok: false,
      reason: 'invalid-image',
      message: 'Gambar frame belum siap. Tunggu sebentar lalu coba lagi.',
    };
  }
  try {
    let cached = detectionCache.get(frameKey);
    if (!cached || cached.frameW !== frameImg.naturalWidth || cached.frameH !== frameImg.naturalHeight) {
      const fresh = detectNormalizedBoxes(frameImg, count);
      cached = fresh;
      detectionCache.set(frameKey, cached);
    } else if (cached.boxes.length !== count) {
      return {
        ok: false,
        reason: 'count-mismatch',
        message:
          `Frame ini memiliki ${cached.boxes.length} area foto, tetapi sesi membutuhkan ${count}. ` +
          'Pilih frame lain yang sesuai.',
      };
    }
    if (cached.boxes.length !== count) {
      return {
        ok: false,
        reason: 'count-mismatch',
        message:
          `Frame terdeteksi memiliki ${cached.boxes.length} area foto, tetapi sesi membutuhkan ${count}. ` +
          'Pilih frame lain yang sesuai.',
      };
    }
    return { ok: true, slots: toSlotRects(cached, W, H), source: 'detected' };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Deteksi slot frame gagal.';
    const reason: SlotErrorReason = message.includes('CORS') || message.includes('tainted')
      ? 'tainted-canvas'
      : message.includes('tumpang tindih')
        ? 'overlapping-slots'
        : message.includes('area foto')
          ? 'count-mismatch'
          : 'ambiguous-regions';
    return { ok: false, reason, message };
  }
}
